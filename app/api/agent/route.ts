import { streamText, tool } from "ai"
import { createMistral } from "@ai-sdk/mistral"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { z } from "zod"
import { PublicKey, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { getMint, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token"
import {
  getConnection,
  RPC_URL,
  NATIVE_SYMBOL,
  NATIVE_DECIMALS,
  EXPLORER_URL,
  explorerTx,
  explorerAddress,
  SOLANA_TOKENS,
  NATIVE_SENTINEL,
  findToken,
  isNativeToken,
  isValidAddress,
} from "@/lib/solana"
import {
  keypairFromSecret,
  buildSolTransfer,
  buildTokenTransfer,
  buildCreateToken,
  buildMintTo,
  serializeTx,
} from "@/lib/spl"
import { spotPriceUSD, dailyCandles, indicativeCandles } from "@/lib/prices"
import { uploadJSONToIPFS, isPinataConfigured } from "@/lib/pinata"
import { explainTarget } from "@/lib/explain"
import { saveAddress, resolveName, listAddresses, addAsset, listAssets } from "@/lib/store"
import { insertSchedule, listSchedulesByOwner, cancelSchedule as dbCancelSchedule } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// ── Model selection: Mistral first, Google Gemini as fallback ───────────────────
function getModel() {
  if (process.env.MISTRAL_API_KEY) {
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
    return mistral(process.env.ASTRAX_MODEL || "mistral-large-latest")
  }
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (key) {
    const google = createGoogleGenerativeAI({ apiKey: key })
    return google(process.env.ASTRAX_MODEL || "gemini-2.0-flash")
  }
  return null
}

const connection = getConnection()

function makeWallet(secretKey?: string) {
  if (!secretKey) return null
  try {
    const keypair = keypairFromSecret(secretKey)
    return { keypair, publicKey: keypair.publicKey.toBase58() }
  } catch {
    return null
  }
}

// Map a recurrence word/phrase to an interval in seconds (0 = one-shot).
function parseEvery(every?: string): number {
  if (!every) return 0
  const s = every.trim().toLowerCase()
  if (/(^|\b)(once|one[-\s]?time|no)\b/.test(s)) return 0
  if (s.includes("hour")) return 3600
  if (s.includes("day") || s.includes("daily")) return 86400
  if (s.includes("week")) return 604800
  if (s.includes("month")) return 2592000 // ~30 days
  if (s.includes("year")) return 31536000
  const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month)/)
  if (m) {
    const n = parseInt(m[1], 10)
    const unit = m[2]
    const base = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : unit === "day" ? 86400 : unit === "week" ? 604800 : 2592000
    return n * base
  }
  return 0
}

function parseWhen(when: string): Date | null {
  const now = new Date()
  const s = when.trim().toLowerCase()
  const rel = s.match(/in\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs|day|days|week|weeks)/)
  if (rel) {
    const n = parseInt(rel[1], 10)
    const unit = rel[2]
    const d = new Date(now)
    if (unit.startsWith("min")) d.setMinutes(d.getMinutes() + n)
    else if (unit.startsWith("h")) d.setHours(d.getHours() + n)
    else if (unit.startsWith("day")) d.setDate(d.getDate() + n)
    else if (unit.startsWith("week")) d.setDate(d.getDate() + n * 7)
    return d
  }
  if (s.includes("tomorrow") || s.includes("today")) {
    const d = new Date(now)
    if (s.includes("tomorrow")) d.setDate(d.getDate() + 1)
    const t = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    if (t) {
      let h = parseInt(t[1], 10)
      const m = t[2] ? parseInt(t[2], 10) : 0
      if (t[3] === "pm" && h < 12) h += 12
      if (t[3] === "am" && h === 12) h = 0
      d.setHours(h, m, 0, 0)
    }
    return d
  }
  const parsed = new Date(when)
  return isNaN(parsed.getTime()) ? null : parsed
}

async function nativeUsdPrice(): Promise<number | null> {
  const spot = await spotPriceUSD("SOL")
  if (spot != null) return spot
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null
    const j = await res.json()
    return j?.solana?.usd ?? null
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `You are **Astrax**, the AI agent built into the Astrax dApp — a natural-language command center for **Solana** (cluster: devnet, native token **${NATIVE_SYMBOL}**, explorer ${EXPLORER_URL}).

## Personality
You talk only about Astrax, the Solana blockchain, and crypto operations. If asked about something unrelated, give a short warm redirect back to what Astrax can do.

## CRITICAL BEHAVIOR — act, don't explain
When the user asks for an on-chain action, call the matching tool immediately, then summarise the result in one or two short sentences. The UI renders a rich card (and, in wallet mode, a one-click confirm button) from the tool result, so keep your text brief.

Guidance:
- balance → getBalance ; token balance → getTokenBalance
- "send 1 ${NATIVE_SYMBOL} to <address>/alice" → sendPayment (token defaults to native ${NATIVE_SYMBOL})
- "look up tx <signature>" → getTransaction ; "latest blocks" → getLatestBlocks ; "block 123" → getBlock
- "list tokens" → listTokens ; "price/market" → getMarketData ; "activity for <address>" → getAddressActivity
- "what is this <address/signature> / is this safe / what does this program do / explain this tx" → explain
- "price chart / candlestick / chart for ${NATIVE_SYMBOL}" → getPriceChart
- "diagram / workflow / flowchart / visualize this" → generateDiagram (YOU write the Mermaid code)
- "generate an image of … / draw …" → generateImage
- When the user attaches a file you'll see its IPFS URL in the message. If they're creating an NFT, pass that URL as the deployNFT "image" argument; otherwise save it with storeAsset. NFT images are optional.
- "create token MoonCoin MOON supply 1000000" → deployToken (creates an SPL mint)
- "create an NFT / launch an NFT" → deployNFT (SPL mint, supply 1)
- "mint more of <mint>" → mintNFT
- "schedule 2 ${NATIVE_SYMBOL} to alice tomorrow at 5pm" → scheduleTransfer (one-time)
- "pay alice 500 ${NATIVE_SYMBOL} every month for a year / salary" → scheduleTransfer with every:"monthly", occurrences:12
- "show my scheduled payments" → listSchedules ; "cancel schedule <id>" → cancelSchedule
- "payment link for 0.5 ${NATIVE_SYMBOL}" → createPaymentLink
- "save alice as <address>" → saveContact ; "who is alice" → resolveContact
- "store asset <link>" → storeAsset ; "my assets" → listAssets

## Signing modes
There are two modes. In **wallet mode**, write tools return a prepared transaction and the user confirms it in their wallet via a button in the chat — tell them to click the button. In **autonomous mode**, write tools sign server-side with the user's key and return the transaction signature directly. If a write tool reports no signer is available, tell the user to either connect their wallet (wallet mode) or add a secret key in the sidebar **Signing** panel (autonomous mode).

## Formatting
- **bold** for key terms, backticks for addresses/signatures. Keep it short. Never invent signatures, addresses, or balances — only report tool output.`

export async function POST(req: Request) {
  const body = await req.json()
  const messages = body.messages ?? []
  const signingMode: "auto" | "wallet" = body.signingMode === "auto" ? "auto" : "wallet"
  const credentials = body.credentials ?? {}
  const privateKey: string | undefined = credentials.privateKey || undefined
  const walletAddress: string | undefined =
    body.walletAddress && isValidAddress(body.walletAddress) ? body.walletAddress : undefined

  const model = getModel()
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No AI model configured. Set MISTRAL_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY." }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
  }

  const wallet = signingMode === "auto" ? makeWallet(privateKey) : null
  const ownerAddress = signingMode === "auto" ? wallet?.publicKey : walletAddress

  // Guard for write tools: either a server wallet (auto) or a connected address (wallet).
  const noSigner = () =>
    signingMode === "auto"
      ? { error: "No secret key configured. Open the sidebar **Signing** panel, switch to **Autonomous**, and paste your secret key." }
      : { error: "No wallet connected. Connect your wallet in the top bar (wallet signing mode) and try again." }

  // Resolve a recipient string (address or saved contact name) to a base58 address.
  const resolveRecipient = async (to: string): Promise<string | null> => {
    if (isValidAddress(to)) return to
    const name = to.startsWith("@") ? to.slice(1) : to
    const addr = await resolveName(name)
    return addr && isValidAddress(addr) ? addr : null
  }

  // Resolve a token argument to { mint, decimals, symbol }.
  const resolveToken = async (token: string): Promise<{ mint: PublicKey; decimals: number; symbol: string } | { error: string }> => {
    const info = findToken(token)
    const mintStr = info?.address && info.address !== NATIVE_SENTINEL ? info.address : token
    if (!isValidAddress(mintStr)) return { error: `Unknown token: ${token}` }
    const mint = new PublicKey(mintStr)
    let decimals = info?.decimals
    if (decimals == null) {
      try {
        decimals = (await getMint(connection, mint)).decimals
      } catch {
        return { error: `Could not read mint ${token}.` }
      }
    }
    return { mint, decimals, symbol: info?.symbol ?? token }
  }

  const result = await streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 6,
    tools: {
      // ── READ ──────────────────────────────────────────────────────────────
      getBalance: tool({
        description: `Get the native ${NATIVE_SYMBOL} balance of an address. If no address is given, uses the user's own address.`,
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          try {
            const target = address && isValidAddress(address) ? address : ownerAddress
            if (!target || !isValidAddress(target)) return { error: "No valid address available." }
            const lamports = await connection.getBalance(new PublicKey(target))
            const balance = lamports / LAMPORTS_PER_SOL
            const price = await nativeUsdPrice()
            return {
              kind: "balance",
              address: target,
              balance: balance.toFixed(4),
              symbol: NATIVE_SYMBOL,
              usdValue: price ? (balance * price).toFixed(2) : undefined,
            }
          } catch {
            return { error: "Failed to fetch balance." }
          }
        },
      }),

      getTokenBalance: tool({
        description: "Get an SPL token balance for an address. Accepts a token symbol (e.g. USDC) or mint address.",
        parameters: z.object({ token: z.string(), address: z.string().optional() }),
        execute: async ({ token, address }) => {
          try {
            const target = address && isValidAddress(address) ? address : ownerAddress
            if (!target || !isValidAddress(target)) return { error: "No valid address available." }
            const resolved = await resolveToken(token)
            if ("error" in resolved) return resolved
            const ata = getAssociatedTokenAddressSync(resolved.mint, new PublicKey(target))
            try {
              const acc = await getAccount(connection, ata)
              const balance = Number(acc.amount) / 10 ** resolved.decimals
              return { kind: "balance", address: target, balance: balance.toFixed(4), symbol: resolved.symbol }
            } catch {
              return { kind: "balance", address: target, balance: "0.0000", symbol: resolved.symbol }
            }
          } catch {
            return { error: "Failed to fetch token balance." }
          }
        },
      }),

      getTransaction: tool({
        description: "Look up details of a transaction by its signature.",
        parameters: z.object({ hash: z.string() }),
        execute: async ({ hash }) => {
          try {
            const tx = await connection.getParsedTransaction(hash, { maxSupportedTransactionVersion: 0 })
            if (!tx) return { error: "Transaction not found." }
            const keys = tx.transaction.message.accountKeys
            const from = keys[0]?.pubkey.toBase58()
            const to = keys[1]?.pubkey.toBase58()
            const pre = tx.meta?.preBalances?.[0] ?? 0
            const post = tx.meta?.postBalances?.[0] ?? 0
            const moved = Math.abs(pre - post) / LAMPORTS_PER_SOL
            return {
              kind: "transaction",
              hash,
              from,
              to,
              value: `${moved.toFixed(6)} ${NATIVE_SYMBOL}`,
              blockNumber: tx.slot?.toString() ?? "pending",
              status: tx.meta?.err ? "Failed" : "Success",
              gasUsed: tx.meta?.fee != null ? `${(tx.meta.fee / LAMPORTS_PER_SOL).toFixed(6)} ${NATIVE_SYMBOL}` : undefined,
              explorerUrl: explorerTx(hash),
            }
          } catch {
            return { error: "Transaction not found." }
          }
        },
      }),

      getLatestBlocks: tool({
        description: "Get the most recent blocks (slots) on Solana.",
        parameters: z.object({ count: z.number().int().min(1).max(5).optional() }),
        execute: async ({ count }) => {
          try {
            const n = count ?? 3
            const slot = await connection.getSlot()
            const blocks: any[] = []
            let s = slot
            while (blocks.length < n && s > slot - 20 && s >= 0) {
              try {
                const b = await connection.getBlock(s, {
                  maxSupportedTransactionVersion: 0,
                  transactionDetails: "signatures",
                  rewards: false,
                })
                if (b) {
                  blocks.push({
                    blockNumber: s.toString(),
                    hash: b.blockhash,
                    timestamp: b.blockTime ? new Date(b.blockTime * 1000).toLocaleString() : "",
                    transactionCount: (b as any).signatures?.length ?? 0,
                  })
                }
              } catch {
                /* skipped slot — ignore */
              }
              s--
            }
            return { kind: "blocks", blocks }
          } catch {
            return { error: "Failed to fetch blocks." }
          }
        },
      }),

      getBlock: tool({
        description: "Get a block by slot number.",
        parameters: z.object({ block: z.string() }),
        execute: async ({ block }) => {
          try {
            const slot = parseInt(block, 10)
            if (isNaN(slot)) return { error: "Give a numeric slot." }
            const b = await connection.getBlock(slot, {
              maxSupportedTransactionVersion: 0,
              transactionDetails: "signatures",
              rewards: false,
            })
            if (!b) return { error: "Block not found." }
            return {
              kind: "block",
              blockNumber: slot.toString(),
              hash: b.blockhash,
              timestamp: b.blockTime ? new Date(b.blockTime * 1000).toLocaleString() : "",
              transactionCount: (b as any).signatures?.length ?? 0,
              gasUsed: b.parentSlot?.toString() ?? "",
            }
          } catch {
            return { error: "Block not found." }
          }
        },
      }),

      listTokens: tool({
        description: "List the tokens supported/known on Solana.",
        parameters: z.object({}),
        execute: async () => ({ kind: "tokenList", tokens: SOLANA_TOKENS }),
      }),

      explain: tool({
        description:
          "Explain / audit a transaction signature OR an address/program: decode what it does, label the account type, and flag risks. Use whenever the user pastes a signature or address, or asks 'what is this', 'is this safe', 'what does this do'.",
        parameters: z.object({ target: z.string().describe("A transaction signature or an account address") }),
        execute: async ({ target }) => {
          return await explainTarget(target)
        },
      }),

      getMarketData: tool({
        description: `Get market data (price, market cap, volume) for Solana / ${NATIVE_SYMBOL}.`,
        parameters: z.object({}),
        execute: async () => {
          const price = await nativeUsdPrice()
          let marketCap: number | null = null
          let volume24h: number | null = null
          let change24h: number | null = null
          let name = "Solana"
          try {
            const res = await fetch(
              "https://api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&community_data=false&developer_data=false",
              { headers: { accept: "application/json" } },
            )
            if (res.ok) {
              const j = await res.json()
              name = j.name || name
              marketCap = j.market_data?.market_cap?.usd ?? null
              volume24h = j.market_data?.total_volume?.usd ?? null
              change24h = j.market_data?.price_change_percentage_24h ?? null
            }
          } catch {
            /* best-effort */
          }
          if (price == null && marketCap == null) return { error: "Market data unavailable right now." }
          return { kind: "market", name, symbol: NATIVE_SYMBOL, price, marketCap, volume24h, change24h }
        },
      }),

      getAddressActivity: tool({
        description: "Get recent transactions for an address on Solana.",
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          const target = address && isValidAddress(address) ? address : ownerAddress
          if (!target || !isValidAddress(target)) return { error: "No valid address available." }
          try {
            const sigs = await connection.getSignaturesForAddress(new PublicKey(target), { limit: 8 })
            const transactions = sigs.map((s) => ({
              hash: s.signature,
              from: target,
              to: "",
              value: "",
              status: s.err ? "Failed" : "Success",
              timestamp: s.blockTime ? new Date(s.blockTime * 1000).toLocaleString() : "",
            }))
            return {
              kind: "activity",
              address: target,
              transactions,
              explorerUrl: explorerAddress(target),
            }
          } catch {
            return { kind: "activity", address: target, transactions: [], note: "Could not load activity.", explorerUrl: explorerAddress(target) }
          }
        },
      }),

      resolveContact: tool({
        description: "Resolve a saved contact name to its address (address book).",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          const addr = await resolveName(name.startsWith("@") ? name.slice(1) : name)
          return addr ? { kind: "contact", name, address: addr } : { error: `No contact named "${name}".` }
        },
      }),

      saveContact: tool({
        description: "Save a contact (name -> address) to the address book.",
        parameters: z.object({ name: z.string(), address: z.string() }),
        execute: async ({ name, address }) => {
          if (!isValidAddress(address)) return { error: "That is not a valid Solana address." }
          await saveAddress(name.startsWith("@") ? name.slice(1) : name, address)
          return { kind: "contact", name, address, saved: true }
        },
      }),

      listContacts: tool({
        description: "List all saved contacts in the address book.",
        parameters: z.object({}),
        execute: async () => ({ kind: "contactList", contacts: await listAddresses() }),
      }),

      // ── WRITE (auto = sign now; wallet = return a prepared transaction) ───────
      sendPayment: tool({
        description: `Send ${NATIVE_SYMBOL} (native) or an SPL token to an address or saved contact.`,
        parameters: z.object({
          to: z.string(),
          amount: z.string(),
          token: z.string().optional(),
        }),
        execute: async ({ to, amount, token }) => {
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}". Give an address or save them as a contact first.` }
          const native = isNativeToken(token)
          let mint: PublicKey | undefined
          let decimals = NATIVE_DECIMALS
          let symbol = NATIVE_SYMBOL
          if (!native) {
            const resolved = await resolveToken(token!)
            if ("error" in resolved) return resolved
            mint = resolved.mint
            decimals = resolved.decimals
            symbol = resolved.symbol
          }

          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const owner = new PublicKey(ownerAddress)
            const tx = native
              ? await buildSolTransfer(connection, owner, new PublicKey(recipient), amount)
              : await buildTokenTransfer(connection, owner, new PublicKey(recipient), mint!, amount, decimals)
            return {
              kind: "action",
              action: native ? "sendNative" : "sendToken",
              to: recipient,
              amount,
              symbol,
              txBase64: serializeTx(tx),
              label: `Send ${amount} ${symbol}`,
            }
          }

          // autonomous
          if (!wallet) return noSigner()
          try {
            const owner = wallet.keypair.publicKey
            const tx = native
              ? await buildSolTransfer(connection, owner, new PublicKey(recipient), amount)
              : await buildTokenTransfer(connection, owner, new PublicKey(recipient), mint!, amount, decimals)
            const sig = await sendAndConfirmTransaction(connection, tx, [wallet.keypair])
            return { kind: "transaction", status: "Submitted", action: "send", hash: sig, from: owner.toBase58(), to: recipient, value: `${amount} ${symbol}`, explorerUrl: explorerTx(sig) }
          } catch (e: any) {
            return { error: `Transaction failed: ${(e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployToken: tool({
        description: "Create a new SPL token on Solana. Mints the full supply to the creator.",
        parameters: z.object({ name: z.string(), symbol: z.string(), supply: z.string() }),
        execute: async ({ name, symbol, supply }) => {
          const decimals = 9
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const owner = new PublicKey(ownerAddress)
            const { tx, mint } = await buildCreateToken(connection, owner, decimals, supply)
            tx.partialSign(mint)
            return { kind: "action", action: "deployToken", name, symbol, supply, mint: mint.publicKey.toBase58(), txBase64: serializeTx(tx), label: `Create token ${name} (${symbol})` }
          }
          if (!wallet) return noSigner()
          try {
            const { tx, mint } = await buildCreateToken(connection, wallet.keypair.publicKey, decimals, supply)
            const sig = await sendAndConfirmTransaction(connection, tx, [wallet.keypair, mint])
            return { kind: "deploy", what: "token", name, symbol, supply, contractAddress: mint.publicKey.toBase58(), hash: sig, explorerUrl: explorerTx(sig) }
          } catch (e: any) {
            return { error: `Create failed: ${(e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployNFT: tool({
        description:
          "Create a new NFT on Solana (an SPL mint with supply 1). The image is OPTIONAL — if the user attached an image (you'll see an IPFS URL in the message), pass it as `image`. Use for 'create an NFT' / 'mint an NFT'.",
        parameters: z.object({
          name: z.string(),
          symbol: z.string(),
          image: z.string().optional().describe("IPFS/HTTP URL of the NFT image (from an uploaded file). Optional."),
          description: z.string().optional(),
        }),
        execute: async ({ name, symbol, image, description }) => {
          let metadataUri: string | undefined
          let imageUsed: string | undefined
          if (image) {
            imageUsed = image
            if (isPinataConfigured()) {
              try {
                const { ipfsUrl } = await uploadJSONToIPFS({ name, description: description || name, image })
                metadataUri = ipfsUrl
              } catch {
                metadataUri = image
              }
            } else {
              metadataUri = image
            }
          }

          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const owner = new PublicKey(ownerAddress)
            const { tx, mint } = await buildCreateToken(connection, owner, 0, "1")
            tx.partialSign(mint)
            return { kind: "action", action: "deployNFT", name, symbol, image: imageUsed, metadataUri, mint: mint.publicKey.toBase58(), txBase64: serializeTx(tx), label: `Create NFT ${name} (${symbol})` }
          }
          if (!wallet) return noSigner()
          try {
            const { tx, mint } = await buildCreateToken(connection, wallet.keypair.publicKey, 0, "1")
            const sig = await sendAndConfirmTransaction(connection, tx, [wallet.keypair, mint])
            return { kind: "deploy", what: "nft", name, symbol, image: imageUsed, metadataUri, contractAddress: mint.publicKey.toBase58(), hash: sig, explorerUrl: explorerTx(sig) }
          } catch (e: any) {
            return { error: `Create failed: ${(e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      mintNFT: tool({
        description: "Mint additional units of an existing SPL mint to a recipient. Give the mint address; mints to the user unless another address is specified. The user must be the mint authority.",
        parameters: z.object({ contract: z.string().describe("Mint address"), to: z.string().optional(), amount: z.string().optional() }),
        execute: async ({ contract, to, amount }) => {
          if (!isValidAddress(contract)) return { error: "That is not a valid mint address." }
          const recipient = to && isValidAddress(to) ? to : ownerAddress
          if (!recipient || !isValidAddress(recipient)) return { error: "No recipient address available." }
          const mint = new PublicKey(contract)
          let decimals = 0
          try {
            decimals = (await getMint(connection, mint)).decimals
          } catch {
            return { error: "Could not read that mint." }
          }
          const amt = amount || "1"
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const owner = new PublicKey(ownerAddress)
            const tx = await buildMintTo(connection, owner, mint, new PublicKey(recipient), amt, decimals)
            return { kind: "action", action: "mintNFT", contract, to: recipient, amount: amt, txBase64: serializeTx(tx), label: `Mint → ${recipient.slice(0, 4)}…${recipient.slice(-4)}` }
          }
          if (!wallet) return noSigner()
          try {
            const tx = await buildMintTo(connection, wallet.keypair.publicKey, mint, new PublicKey(recipient), amt, decimals)
            const sig = await sendAndConfirmTransaction(connection, tx, [wallet.keypair])
            return { kind: "transaction", status: "Submitted", action: "mint", hash: sig, to: recipient, value: `${amt} token(s)`, explorerUrl: explorerTx(sig) }
          } catch (e: any) {
            return { error: `Mint failed: ${(e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      scheduleTransfer: tool({
        description: `Schedule a one-time or RECURRING transfer (e.g. salary). Requires Autonomous (secret key) signing mode. "when" accepts "in 10 minutes", "tomorrow at 5pm", or an ISO date. "every" makes it recurring: daily/weekly/monthly or "2 weeks"; "occurrences" is how many times (default 1 for one-time, or e.g. 12 for a year of monthly).`,
        parameters: z.object({
          to: z.string(),
          amount: z.string(),
          when: z.string().describe('First run time, e.g. "tomorrow 9am"'),
          token: z.string().optional(),
          every: z.string().optional().describe('Recurrence: daily / weekly / monthly / "2 weeks". Omit for one-time.'),
          occurrences: z.number().int().min(1).max(120).optional().describe("Number of runs (default 1)"),
        }),
        execute: async ({ to, amount, when, token, every, occurrences }) => {
          if (signingMode !== "auto" || !wallet) {
            return { error: "Scheduling needs **Autonomous** signing (a secret key) so Astrax can send it later without you present. Switch to Autonomous in the sidebar **Signing** panel." }
          }
          const runAt = parseWhen(when)
          if (!runAt) return { error: `Could not understand the time "${when}". Try "in 10 minutes" or "2026-01-01 17:00".` }
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}".` }
          const intervalSecs = parseEvery(every)
          const remaining = occurrences ?? 1
          const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          insertSchedule({
            id,
            owner: wallet.publicKey,
            recipient,
            amount,
            token: token || "",
            next_run: runAt.getTime(),
            interval_secs: intervalSecs,
            remaining,
            enc_key: encryptSecret(privateKey as string),
          })
          const recurrenceLabel = intervalSecs ? `every ${every} × ${remaining}` : "once"
          return {
            kind: "schedule",
            id,
            to: recipient,
            amount: `${amount} ${token || NATIVE_SYMBOL}`,
            runAt: runAt.toLocaleString(),
            recurrence: recurrenceLabel,
            note: "Astrax stores your key encrypted so it can send this on time, even if you close the app (devnet).",
          }
        },
      }),

      listSchedules: tool({
        description: "List the user's scheduled transfers (upcoming and past).",
        parameters: z.object({}),
        execute: async () => {
          const owner = ownerAddress
          if (!owner) return { error: "No wallet address available." }
          const rows = listSchedulesByOwner(owner).map((r) => ({
            id: r.id,
            to: r.recipient,
            amount: `${r.amount} ${r.token || NATIVE_SYMBOL}`,
            runAt: new Date(r.next_run).toLocaleString(),
            recurrence: r.interval_secs ? `recurring (${r.remaining} left)` : "once",
            status: r.status,
            lastTx: r.last_tx || undefined,
          }))
          return { kind: "scheduleList", schedules: rows }
        },
      }),

      cancelSchedule: tool({
        description: "Cancel an active scheduled transfer by its id.",
        parameters: z.object({ id: z.string() }),
        execute: async ({ id }) => {
          const owner = ownerAddress
          if (!owner) return { error: "No wallet address available." }
          const ok = dbCancelSchedule(id, owner)
          return ok ? { kind: "scheduleCancelled", id } : { error: `No active schedule ${id} found for you.` }
        },
      }),

      createPaymentLink: tool({
        description: `Create a shareable payment link requesting ${NATIVE_SYMBOL} to the user's address.`,
        parameters: z.object({ amount: z.string(), description: z.string().optional() }),
        execute: async ({ amount, description }) => {
          if (!ownerAddress || !isValidAddress(ownerAddress)) return { error: "No receiving address available. Connect a wallet or add a secret key." }
          return { kind: "paymentLink", url: `${APP_URL}/payment-link/${ownerAddress}/${amount}`, address: ownerAddress, amount: `${amount} ${NATIVE_SYMBOL}`, description }
        },
      }),

      storeAsset: tool({
        description: "Store a reference to an asset (e.g. an IPFS link) with a description, owned by the user.",
        parameters: z.object({ link: z.string(), description: z.string() }),
        execute: async ({ link, description }) => {
          if (!ownerAddress) return { error: "No wallet address available." }
          await addAsset({ link, description, owner: ownerAddress, createdAt: new Date().toISOString() })
          return { kind: "asset", link, description, owner: ownerAddress, saved: true }
        },
      }),

      listAssets: tool({
        description: "List the user's stored assets.",
        parameters: z.object({}),
        execute: async () => {
          if (!ownerAddress) return { error: "No wallet address available." }
          return { kind: "assetList", assets: await listAssets(ownerAddress) }
        },
      }),

      // ── VISUALS / DATA ──────────────────────────────────────────────────────
      getPriceChart: tool({
        description: `Get an OHLC candlestick price chart for a token over a number of days. Defaults to ${NATIVE_SYMBOL}. Prices come from Coinbase.`,
        parameters: z.object({
          symbol: z.string().optional().describe(`Token symbol, e.g. ${NATIVE_SYMBOL}, USDC. Defaults to ${NATIVE_SYMBOL}.`),
          days: z.number().int().min(2).max(30).optional(),
        }),
        execute: async ({ symbol, days }) => {
          const sym = (symbol || NATIVE_SYMBOL).toUpperCase()
          const d = days ?? 7
          let data = await dailyCandles(sym, d)
          let indicative = false
          if (!data) {
            data = await indicativeCandles(sym, d)
            indicative = true
          }
          if (!data || data.length === 0) return { error: `No price data available for ${sym}.` }
          return { kind: "candlestick", symbol: sym, days: d, data, indicative }
        },
      }),

      generateDiagram: tool({
        description:
          "Render a flowchart / workflow diagram as an image. YOU write valid Mermaid flowchart code (start with 'flowchart TD'). Perfect for on-chain workflows, process flows, and architecture diagrams. Works without any API key.",
        parameters: z.object({
          title: z.string().optional(),
          mermaid: z.string().describe("Valid Mermaid flowchart code, e.g. 'flowchart TD\\n A[Start] --> B[End]'"),
        }),
        execute: async ({ title, mermaid }) => {
          try {
            const encoded = Buffer.from(mermaid).toString("base64url")
            const r = await fetch(`https://mermaid.ink/img/${encoded}`)
            if (!r.ok) return { error: "Could not render the diagram. Check the Mermaid syntax." }
            const imageBase64 = Buffer.from(await r.arrayBuffer()).toString("base64")
            return { kind: "image", title: title || "Diagram", imageBase64, mermaid }
          } catch {
            return { error: "Could not render the diagram." }
          }
        },
      }),

      generateImage: tool({
        description: "Generate an AI image/diagram from a text prompt using Gemini. Requires NEXT_PUBLIC_GEMINI_KEY; if unavailable, suggest generateDiagram instead.",
        parameters: z.object({ prompt: z.string(), isContract: z.boolean().optional() }),
        execute: async ({ prompt, isContract }) => {
          if (!process.env.NEXT_PUBLIC_GEMINI_KEY) {
            return { error: "Image generation needs NEXT_PUBLIC_GEMINI_KEY. Tip: the **generateDiagram** tool renders flowcharts without any key." }
          }
          try {
            const res = await fetch(`${APP_URL}/api/generate-image`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt, isSmartContractWorkflow: !!isContract, type: isContract ? "workflow" : "general" }),
            })
            const j = await res.json()
            if (!res.ok || !j.imageBase64) return { error: j.error || "Image generation failed." }
            return { kind: "image", title: "Generated image", imageBase64: j.imageBase64 }
          } catch {
            return { error: "Image generation failed." }
          }
        },
      }),

      swap: tool({
        description: "Swap one token for another on a Solana DEX. Requires a configured DEX/aggregator.",
        parameters: z.object({ fromToken: z.string(), toToken: z.string(), amount: z.string() }),
        execute: async ({ fromToken, toToken, amount }) => {
          const dex = process.env.SOLANA_DEX
          if (!dex) {
            return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "unavailable", note: "No DEX is configured yet. Set SOLANA_DEX to enable on-chain swaps." }
          }
          return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "router-configured", note: "DEX configured — swap execution wiring is a next step." }
        },
      }),
    },
  })

  return result.toDataStreamResponse()
}
