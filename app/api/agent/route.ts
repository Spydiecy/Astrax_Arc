import { streamText, tool } from "ai"
import { createMistral } from "@ai-sdk/mistral"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { z } from "zod"
import {
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  isAddress,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import {
  sonicTestnet,
  getPublicClient,
  RPC_URL,
  NATIVE_SYMBOL,
  EXPLORER_URL,
  BLOCKSCOUT_API,
  explorerTx,
  SONIC_TOKENS,
  findToken,
  ERC20_ABI,
} from "@/lib/sonic"
import { ASTRAX_TOKEN_ABI, ASTRAX_TOKEN_BYTECODE } from "@/lib/erc20"
import { ASTRAX_NFT_ABI, ASTRAX_NFT_BYTECODE } from "@/lib/erc721"
import { compileSolidity } from "@/lib/solc"
import { spotPriceUSD, dailyCandles, indicativeCandles } from "@/lib/prices"
import { uploadJSONToIPFS, isPinataConfigured } from "@/lib/pinata"
import { explainTarget } from "@/lib/explain"
import { saveAddress, resolveName, listAddresses, addAsset, listAssets } from "@/lib/store"
import { insertSchedule, listSchedulesByOwner, cancelSchedule as dbCancelSchedule } from "@/lib/db"
import { encryptSecret } from "@/lib/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// ── Model selection: Mistral first (like FlarePay), Google Gemini as fallback ───
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

const publicClient = getPublicClient()

function makeWallet(privateKey?: string) {
  if (!privateKey) return null
  try {
    const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex
    const account = privateKeyToAccount(pk)
    const client = createWalletClient({ account, chain: sonicTestnet, transport: http(RPC_URL) })
    return { account, client }
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

async function resolveRecipient(to: string): Promise<string | null> {
  if (isAddress(to)) return to
  const name = to.startsWith("@") ? to.slice(1) : to
  return await resolveName(name)
}

// Native S price via Coinbase spot, with a CoinGecko fallback (S has no stable
// Coinbase market on testnet).
async function nativeUsdPrice(): Promise<number | null> {
  const cb = await spotPriceUSD(NATIVE_SYMBOL)
  if (cb != null) return cb
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=sonic-3&vs_currencies=usd", {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null
    const j = await res.json()
    return j?.["sonic-3"]?.usd ?? null
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `You are **Astrax**, the AI agent built into the Astrax dApp — a natural-language command center for the **Sonic Testnet** (EVM, Chain ID ${sonicTestnet.id}, native gas token **${NATIVE_SYMBOL}**, explorer ${EXPLORER_URL}).

## Personality
You talk only about Astrax, the Sonic blockchain, and crypto operations. If asked about something unrelated, give a short warm redirect back to what Astrax can do.

## CRITICAL BEHAVIOR — act, don't explain
When the user asks for an on-chain action, call the matching tool immediately, then summarise the result in one or two short sentences. The UI renders a rich card (and, in wallet mode, a one-click confirm button) from the tool result, so keep your text brief.

Guidance:
- balance → getBalance ; token balance → getTokenBalance
- "send 1 ${NATIVE_SYMBOL} to 0x../alice" → sendPayment (token defaults to native ${NATIVE_SYMBOL})
- "look up tx 0x.." → getTransaction ; "latest blocks" → getLatestBlocks ; "block 123" → getBlock
- "list tokens" → listTokens ; "price/market" → getMarketData ; "activity for 0x.." → getAddressActivity
- "what is this 0x… / is this safe / what does this contract do / explain this tx" → explain
- "price chart / candlestick / chart for ${NATIVE_SYMBOL}" → getPriceChart
- "diagram / workflow / flowchart / visualize this contract" → generateDiagram (YOU write the Mermaid code)
- "generate an image of … / draw …" → generateImage
- When the user attaches a file you'll see its IPFS URL in the message. If they're creating an NFT, pass that URL as the deployNFT "image" argument; otherwise save it with storeAsset. NFT images are optional.
- "create token MoonCoin MOON supply 1000000" → deployToken
- "create an NFT / launch an NFT collection" → deployNFT
- "mint an NFT from <collection 0x..>" → mintNFT
- "write/generate a <X> contract and deploy it" → deployContract with Solidity. You MAY use OpenZeppelin v5 imports (e.g. import "@openzeppelin/contracts/token/ERC20/ERC20.sol";) — they are resolved on the server. Use pragma ^0.8.20 for OZ v5, and remember OZ v5 Ownable needs an initialOwner. "deploy bytecode 0x.." → deployContract with bytecode
- "schedule 2 ${NATIVE_SYMBOL} to alice tomorrow at 5pm" → scheduleTransfer (one-time)
- "pay alice 500 ${NATIVE_SYMBOL} every month for a year / salary" → scheduleTransfer with every:"monthly", occurrences:12
- "show my scheduled payments" → listSchedules ; "cancel schedule <id>" → cancelSchedule
- "payment link for 0.5 ${NATIVE_SYMBOL}" → createPaymentLink
- "save alice as 0x.." → saveContact ; "who is alice" → resolveContact
- "store asset <link>" → storeAsset ; "my assets" → listAssets

## Signing modes
There are two modes. In **wallet mode**, write tools return a prepared transaction and the user confirms it in their wallet via a button in the chat — tell them to click the button. In **autonomous mode**, write tools sign server-side with the user's key and return the transaction hash directly. If a write tool reports no signer is available, tell the user to either connect their wallet (wallet mode) or add a private key in the sidebar **Signing** panel (autonomous mode).

## Formatting
- **bold** for key terms, backticks for addresses/hashes. Keep it short. Never invent hashes, addresses, or balances — only report tool output.`

export async function POST(req: Request) {
  const body = await req.json()
  const messages = body.messages ?? []
  const signingMode: "auto" | "wallet" = body.signingMode === "auto" ? "auto" : "wallet"
  const credentials = body.credentials ?? {}
  const privateKey: string | undefined = credentials.privateKey || undefined
  const walletAddress: string | undefined =
    body.walletAddress && isAddress(body.walletAddress) ? body.walletAddress : undefined

  const model = getModel()
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No AI model configured. Set MISTRAL_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY." }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
  }

  const wallet = signingMode === "auto" ? makeWallet(privateKey) : null
  const ownerAddress = signingMode === "auto" ? wallet?.account.address : walletAddress

  // Guard for write tools: either a server wallet (auto) or a connected address (wallet).
  const noSigner = () =>
    signingMode === "auto"
      ? { error: "No private key configured. Open the sidebar **Signing** panel, switch to **Autonomous**, and paste your private key." }
      : { error: "No wallet connected. Connect your wallet in the top bar (wallet signing mode) and try again." }

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
            const target = address && isAddress(address) ? address : ownerAddress
            if (!target || !isAddress(target)) return { error: "No valid address available." }
            const bal = await publicClient.getBalance({ address: target as Hex })
            const balance = formatEther(bal)
            const price = await nativeUsdPrice()
            return {
              kind: "balance",
              address: target,
              balance: parseFloat(balance).toFixed(4),
              symbol: NATIVE_SYMBOL,
              usdValue: price ? (parseFloat(balance) * price).toFixed(2) : undefined,
            }
          } catch {
            return { error: "Failed to fetch balance." }
          }
        },
      }),

      getTokenBalance: tool({
        description: "Get an ERC-20 token balance for an address. Accepts a token symbol (e.g. USDT) or contract address.",
        parameters: z.object({ token: z.string(), address: z.string().optional() }),
        execute: async ({ token, address }) => {
          try {
            const target = address && isAddress(address) ? address : ownerAddress
            if (!target || !isAddress(target)) return { error: "No valid address available." }
            const info = findToken(token)
            const tokenAddr = info?.address && isAddress(info.address) ? info.address : token
            if (!isAddress(tokenAddr)) return { error: `Unknown token: ${token}` }
            const [raw, decimals, symbol] = await Promise.all([
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "balanceOf", args: [target as Hex] }),
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "decimals" }),
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "symbol" }),
            ])
            return { kind: "balance", address: target, balance: parseFloat(formatUnits(raw as bigint, Number(decimals))).toFixed(4), symbol: symbol as string }
          } catch {
            return { error: "Failed to fetch token balance." }
          }
        },
      }),

      getTransaction: tool({
        description: "Look up details of a transaction by its hash.",
        parameters: z.object({ hash: z.string() }),
        execute: async ({ hash }) => {
          try {
            const tx = await publicClient.getTransaction({ hash: hash as Hex })
            const receipt = await publicClient.getTransactionReceipt({ hash: hash as Hex }).catch(() => null)
            return {
              kind: "transaction",
              hash,
              from: tx.from,
              to: tx.to,
              value: `${formatEther(tx.value)} ${NATIVE_SYMBOL}`,
              blockNumber: tx.blockNumber?.toString() ?? "pending",
              nonce: tx.nonce.toString(),
              status: receipt ? (receipt.status === "success" ? "Success" : "Failed") : "Pending",
              gasUsed: receipt?.gasUsed?.toString(),
              explorerUrl: explorerTx(hash),
            }
          } catch {
            return { error: "Transaction not found." }
          }
        },
      }),

      getLatestBlocks: tool({
        description: "Get the most recent blocks on Sonic Testnet.",
        parameters: z.object({ count: z.number().int().min(1).max(5).optional() }),
        execute: async ({ count }) => {
          try {
            const n = count ?? 3
            const latest = await publicClient.getBlockNumber()
            const blocks = []
            for (let i = 0; i < n; i++) {
              const bn = latest - BigInt(i)
              if (bn < BigInt(0)) break
              const b = await publicClient.getBlock({ blockNumber: bn })
              blocks.push({
                blockNumber: b.number?.toString() ?? "",
                hash: b.hash,
                timestamp: new Date(Number(b.timestamp) * 1000).toLocaleString(),
                transactionCount: b.transactions.length,
                gasUsed: b.gasUsed.toString(),
              })
            }
            return { kind: "blocks", blocks }
          } catch {
            return { error: "Failed to fetch blocks." }
          }
        },
      }),

      getBlock: tool({
        description: "Get a block by number or hash.",
        parameters: z.object({ block: z.string() }),
        execute: async ({ block }) => {
          try {
            const b = block.startsWith("0x")
              ? await publicClient.getBlock({ blockHash: block as Hex })
              : await publicClient.getBlock({ blockNumber: BigInt(block) })
            return {
              kind: "block",
              blockNumber: b.number?.toString() ?? "",
              hash: b.hash,
              timestamp: new Date(Number(b.timestamp) * 1000).toLocaleString(),
              transactionCount: b.transactions.length,
              gasUsed: b.gasUsed.toString(),
              gasLimit: b.gasLimit.toString(),
              miner: b.miner,
            }
          } catch {
            return { error: "Block not found." }
          }
        },
      }),

      listTokens: tool({
        description: "List the tokens supported/known on Sonic Testnet.",
        parameters: z.object({}),
        execute: async () => ({ kind: "tokenList", tokens: SONIC_TOKENS }),
      }),

      explain: tool({
        description:
          "Explain / audit a transaction hash OR an address/contract: decode what it does, label the method and parameters, and flag risks (unverified code, large approvals, privileged owner functions, reverts). Use whenever the user pastes a 0x hash or 0x address, or asks 'what is this', 'is this safe', 'what does this contract do'.",
        parameters: z.object({ target: z.string().describe("A 0x transaction hash or 0x address") }),
        execute: async ({ target }) => {
          return await explainTarget(target)
        },
      }),

      getMarketData: tool({
        description: `Get market data (price, market cap, volume) for Sonic / ${NATIVE_SYMBOL}.`,
        parameters: z.object({}),
        execute: async () => {
          // Price from Coinbase spot; market cap / volume / 24h change from CoinGecko (best-effort).
          const price = await nativeUsdPrice()
          let marketCap: number | null = null
          let volume24h: number | null = null
          let change24h: number | null = null
          let name = "Sonic"
          try {
            const res = await fetch(
              "https://api.coingecko.com/api/v3/coins/sonic-3?localization=false&tickers=false&community_data=false&developer_data=false",
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
        description: "Get recent transactions for an address from the Sonic explorer.",
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          const target = address && isAddress(address) ? address : ownerAddress
          if (!target || !isAddress(target)) return { error: "No valid address available." }
          try {
            const res = await fetch(`${BLOCKSCOUT_API}/addresses/${target}/transactions?filter=to%20%7C%20from`, { headers: { accept: "application/json" } })
            const ctype = res.headers.get("content-type") || ""
            if (res.ok && ctype.includes("json")) {
              const j = await res.json()
              const items = (j.items ?? []).slice(0, 8).map((t: any) => ({
                hash: t.hash,
                from: t.from?.hash,
                to: t.to?.hash,
                value: `${formatEther(BigInt(t.value ?? "0"))} ${NATIVE_SYMBOL}`,
                status: t.status === "ok" ? "Success" : t.status,
                timestamp: t.timestamp,
              }))
              return { kind: "activity", address: target, transactions: items }
            }
          } catch {
            /* fall through to explorer link */
          }
          // No public indexer available without an API key — point to the explorer.
          return { kind: "activity", address: target, transactions: [], note: "Full history isn't available without an explorer API key — open the address on the Sonic explorer.", explorerUrl: `${EXPLORER_URL}/address/${target}` }
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
          if (!isAddress(address)) return { error: "That is not a valid 0x address." }
          await saveAddress(name.startsWith("@") ? name.slice(1) : name, address)
          return { kind: "contact", name, address, saved: true }
        },
      }),

      listContacts: tool({
        description: "List all saved contacts in the address book.",
        parameters: z.object({}),
        execute: async () => ({ kind: "contactList", contacts: await listAddresses() }),
      }),

      // ── WRITE (auto = sign now; wallet = return a prepared action) ───────────
      sendPayment: tool({
        description: `Send ${NATIVE_SYMBOL} (native) or an ERC-20 token to an address or saved contact.`,
        parameters: z.object({
          to: z.string(),
          amount: z.string(),
          token: z.string().optional(),
        }),
        execute: async ({ to, amount, token }) => {
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}". Give a 0x address or save them as a contact first.` }
          const isNative = !token || token.toUpperCase() === NATIVE_SYMBOL
          let tokenAddr: string | undefined
          let decimals = 18
          let symbol = NATIVE_SYMBOL
          if (!isNative) {
            const info = findToken(token!)
            tokenAddr = info?.address && isAddress(info.address) ? info.address : token!
            if (!isAddress(tokenAddr)) return { error: `Unknown token: ${token}` }
            decimals = info?.decimals ?? Number(await publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "decimals" }))
            symbol = info?.symbol ?? token!
          }

          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return isNative
              ? { kind: "action", action: "sendNative", to: recipient, amount, symbol: NATIVE_SYMBOL, valueWei: parseEther(amount).toString(), label: `Send ${amount} ${NATIVE_SYMBOL}` }
              : { kind: "action", action: "sendToken", to: recipient, tokenAddress: tokenAddr, amount, symbol, amountWei: parseUnits(amount, decimals).toString(), label: `Send ${amount} ${symbol}` }
          }

          // autonomous
          if (!wallet) return noSigner()
          try {
            if (isNative) {
              const hash = await wallet.client.sendTransaction({ to: recipient as Hex, value: parseEther(amount) })
              return { kind: "transaction", status: "Submitted", action: "send", hash, from: wallet.account.address, to: recipient, value: `${amount} ${NATIVE_SYMBOL}`, explorerUrl: explorerTx(hash) }
            }
            const hash = await wallet.client.writeContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "transfer", args: [recipient as Hex, parseUnits(amount, decimals)] })
            return { kind: "transaction", status: "Submitted", action: "send", hash, from: wallet.account.address, to: recipient, value: `${amount} ${symbol}`, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Transaction failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployToken: tool({
        description: "Deploy a new ERC-20 token on Sonic Testnet. Mints the full supply to the deployer.",
        parameters: z.object({ name: z.string(), symbol: z.string(), supply: z.string() }),
        execute: async ({ name, symbol, supply }) => {
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return { kind: "action", action: "deployToken", name, symbol, supply, label: `Deploy token ${name} (${symbol})` }
          }
          if (!wallet) return noSigner()
          try {
            const hash = await wallet.client.deployContract({ abi: ASTRAX_TOKEN_ABI, bytecode: ASTRAX_TOKEN_BYTECODE, args: [name, symbol, BigInt(supply)] })
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            return { kind: "deploy", what: "token", name, symbol, supply, contractAddress: receipt.contractAddress, hash, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Deploy failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployNFT: tool({
        description:
          "Deploy a new ERC-721 NFT collection on Sonic Testnet (open mintable). The image is OPTIONAL — if the user attached an image (you'll see an IPFS URL in the message), pass it as `image` and it becomes the collection's artwork. Use for 'create an NFT' / 'launch an NFT collection'.",
        parameters: z.object({
          name: z.string(),
          symbol: z.string(),
          image: z.string().optional().describe("IPFS/HTTP URL of the collection image (from an uploaded file). Optional."),
          description: z.string().optional(),
          baseURI: z.string().optional().describe("Explicit metadata URI (optional; usually leave empty and pass `image`)"),
        }),
        execute: async ({ name, symbol, image, description, baseURI }) => {
          // Build the collection metadata URI from an uploaded image if provided.
          let uri = baseURI || ""
          let imageUsed: string | undefined
          if (image) {
            imageUsed = image
            if (isPinataConfigured()) {
              try {
                const { ipfsUrl } = await uploadJSONToIPFS({ name, description: description || name, image })
                uri = ipfsUrl // tokenURI -> JSON { name, description, image }
              } catch {
                uri = image // fall back: point directly at the image
              }
            } else {
              uri = image
            }
          }

          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return { kind: "action", action: "deployNFT", name, symbol, baseURI: uri, image: imageUsed, metadataUri: uri, label: `Deploy NFT ${name} (${symbol})` }
          }
          if (!wallet) return noSigner()
          try {
            const hash = await wallet.client.deployContract({ abi: ASTRAX_NFT_ABI, bytecode: ASTRAX_NFT_BYTECODE, args: [name, symbol, uri] })
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            return { kind: "deploy", what: "nft", name, symbol, image: imageUsed, metadataUri: uri || undefined, contractAddress: receipt.contractAddress, hash, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Deploy failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployContract: tool({
        description:
          "Deploy a smart contract. Provide EITHER `solidity` source (compiled on the server) OR precompiled `bytecode`. For generated contracts, write SELF-CONTAINED Solidity (no imports / no OpenZeppelin) with `pragma solidity ^0.8.0;`. Pass constructorArgs if the constructor needs them.",
        parameters: z.object({
          solidity: z.string().optional().describe("Self-contained Solidity source"),
          bytecode: z.string().optional().describe("0x creation bytecode (if already compiled)"),
          contractName: z.string().optional(),
          constructorArgs: z.array(z.string()).optional(),
        }),
        execute: async ({ solidity, bytecode, contractName, constructorArgs }) => {
          let bc: Hex | undefined
          let abi: any[] = []
          let name = contractName
          if (solidity) {
            const compiled = await compileSolidity(solidity, contractName)
            if (!compiled.ok) return { error: `Compile error:\n${compiled.error}` }
            bc = compiled.result.bytecode as Hex
            abi = compiled.result.abi
            name = compiled.result.contractName
          } else if (bytecode) {
            bc = (bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`) as Hex
          } else {
            return { error: "Provide either `solidity` source or `bytecode`." }
          }
          const args = constructorArgs ?? []
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return { kind: "action", action: "deployContract", bytecode: bc, abi, constructorArgs: args, name: name || "Contract", label: `Deploy ${name || "contract"}` }
          }
          if (!wallet) return noSigner()
          try {
            const hash = await wallet.client.deployContract({ abi: (abi as any), bytecode: bc, args: args.length ? (args as any) : undefined })
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            return { kind: "deploy", what: "contract", name, contractAddress: receipt.contractAddress, hash, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Deploy failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      mintNFT: tool({
        description: "Mint an NFT from a deployed AstraxNFT (ERC-721) collection. Give the collection contract address; mints to the user unless another address is specified.",
        parameters: z.object({ contract: z.string().describe("NFT collection contract address"), to: z.string().optional() }),
        execute: async ({ contract, to }) => {
          if (!isAddress(contract)) return { error: "That is not a valid collection contract address." }
          const recipient = to && isAddress(to) ? to : ownerAddress
          if (!recipient || !isAddress(recipient)) return { error: "No recipient address available." }
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return { kind: "action", action: "mintNFT", contract, to: recipient, label: `Mint NFT → ${recipient.slice(0, 6)}…${recipient.slice(-4)}` }
          }
          if (!wallet) return noSigner()
          try {
            const hash = await wallet.client.writeContract({ address: contract as Hex, abi: ASTRAX_NFT_ABI, functionName: "mint", args: [recipient as Hex] })
            return { kind: "transaction", status: "Submitted", action: "mint", hash, to: recipient, value: "1 NFT", explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Mint failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      scheduleTransfer: tool({
        description: `Schedule a one-time or RECURRING transfer (e.g. salary). Requires Autonomous (private key) signing mode. "when" accepts "in 10 minutes", "tomorrow at 5pm", or an ISO date. "every" makes it recurring: daily/weekly/monthly or "2 weeks"; "occurrences" is how many times (default 1 for one-time, or e.g. 12 for a year of monthly).`,
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
            return { error: "Scheduling needs **Autonomous** signing (a private key) so Astrax can send it later without you present. Switch to Autonomous in the sidebar **Signing** panel." }
          }
          const runAt = parseWhen(when)
          if (!runAt) return { error: `Could not understand the time "${when}". Try "in 10 minutes" or "2026-01-01 17:00".` }
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}".` }
          const intervalSecs = parseEvery(every)
          const remaining = occurrences ?? 1
          const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          // Store the key encrypted so the cron worker can sign when due.
          insertSchedule({
            id,
            owner: wallet.account.address,
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
            note: "Astrax stores your key encrypted so it can send this on time, even if you close the app (testnet).",
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
          if (!ownerAddress || !isAddress(ownerAddress)) return { error: "No receiving address available. Connect a wallet or add a private key." }
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
          symbol: z.string().optional().describe(`Token symbol, e.g. ${NATIVE_SYMBOL}, USDT. Defaults to ${NATIVE_SYMBOL}.`),
          days: z.number().int().min(2).max(30).optional(),
        }),
        execute: async ({ symbol, days }) => {
          const sym = (symbol || NATIVE_SYMBOL).toUpperCase()
          const d = days ?? 7
          // Prefer a real Coinbase market; otherwise build an indicative series from spot.
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
          "Render a flowchart / workflow diagram as an image. YOU write valid Mermaid flowchart code (start with 'flowchart TD'). Perfect for smart-contract workflows, process flows, and architecture diagrams. Works without any API key.",
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
        description: "Swap one token for another on a Sonic DEX. Requires a configured DEX router.",
        parameters: z.object({ fromToken: z.string(), toToken: z.string(), amount: z.string() }),
        execute: async ({ fromToken, toToken, amount }) => {
          const router = process.env.SONIC_DEX_ROUTER
          if (!router) {
            return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "unavailable", note: "No DEX router is configured for Sonic Testnet yet. Set SONIC_DEX_ROUTER to enable on-chain swaps." }
          }
          return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "router-configured", note: "Router configured — swap execution wiring is a next step." }
        },
      }),
    },
  })

  return result.toDataStreamResponse()
}
