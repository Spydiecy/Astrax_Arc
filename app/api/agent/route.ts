import { streamText, tool } from "ai"
import { createMistral } from "@ai-sdk/mistral"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { z } from "zod"
import { randomBytes } from "crypto"
import { encodeDeployData, encodeFunctionData, keccak256, type Abi } from "viem"
import {
  NATIVE_SYMBOL,
  USDC_ADDRESS,
  explorerTx,
  explorerAddress,
  explorerToken,
  findToken,
  getPublicClient,
  isNativeToken,
  isSendableAddress,
  isTxHash,
  isValidAddress,
  normalizeAddress,
  addrKey,
  resolveNetwork,
} from "@/lib/arc"
import {
  ERC20_ABI,
  MAX_DECIMALS,
  accountFromSecret,
  buildDeployNFT,
  buildDeployToken,
  buildMint,
  buildNativeTransfer,
  buildTokenTransfer,
  deployPrepared,
  deployData,
  formatAmount,
  formatFixed,
  friendlyError,
  makeWalletClient,
  resolveToken,
  sendPrepared,
  toBaseUnits,
  type PreparedTx,
  type ResolvedToken,
} from "@/lib/evm"
import { spotPriceUSD, priceCandles, COINGECKO_IDS } from "@/lib/prices"
import { uploadJSONToIPFS, isPinataConfigured, ipfsCid, gatewayUrl } from "@/lib/pinata"
import { IMAGE_FORMATS_LABEL } from "@/lib/images"
import { explainTarget } from "@/lib/explain"
import { compileSolidity } from "@/lib/solc"
import { sanitizeMermaid } from "@/lib/mermaid"
import { abiFunctions, coerceArgs, describeFunction, isReadOnly, pickFunction, stringifyResult } from "@/lib/abi-args"
import { recentActivity } from "@/lib/activity"
import {
  insertSchedule,
  listSchedulesByOwner,
  cancelSchedule as dbCancelSchedule,
  listPaymentLinksByOwner,
  getContact,
  saveContact,
  listContacts,
  deleteContact,
  cleanContactName,
  addAsset,
  listAssets,
  insertContract,
  getContractByAddress,
  findContractByName,
  listContractsByOwner,
  rateLimited,
} from "@/lib/db"
import { createPaymentLink as createPaymentLinkRecord, paymentLinkPath, paymentLinkUrl, verifyPaymentLink } from "@/lib/payment-links"
import { requestOrigin } from "@/lib/origin"
import { isOwner, NOT_OWNER } from "@/lib/auth"
import { NextRequest, after } from "next/server"
import { maybeRunDueSchedules } from "@/lib/scheduler"
import { POST as generateImage } from "@/app/api/generate-image/route"
import { encryptSecret } from "@/lib/crypto"

type AbiConstructor = Extract<Abi[number], { type: "constructor" }>

export const runtime = "nodejs"
export const maxDuration = 60

// ── Model selection: Mistral first, Google Gemini as fallback ───────────────────
function getModel() {
  if (process.env.MISTRAL_API_KEY) {
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
    return mistral(process.env.ASTRAX_MODEL || "ministral-8b-latest")
  }
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (key) {
    const google = createGoogleGenerativeAI({ apiKey: key })
    return google(process.env.ASTRAX_MODEL || "gemini-2.0-flash")
  }
  return null
}

function makeWallet(secretKey?: string) {
  if (!secretKey) return null
  try {
    const account = accountFromSecret(secretKey)
    return { account, address: account.address }
  } catch {
    return null
  }
}

// Map a recurrence word/phrase to an interval in seconds (0 = one-shot).
function parseEvery(every?: string): number {
  if (!every) return 0
  const s = every.trim().toLowerCase()
  if (/(^|\b)(once|one[-\s]?time|no)\b/.test(s)) return 0
  const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month)/)
  if (m) {
    const n = parseInt(m[1], 10)
    const unit = m[2]
    const base = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : unit === "day" ? 86400 : unit === "week" ? 604800 : 2592000
    return n * base
  }
  if (s.includes("hour")) return 3600
  if (s.includes("day") || s.includes("daily")) return 86400
  if (s.includes("week")) return 604800
  if (s.includes("month")) return 2592000 // ~30 days
  if (s.includes("year")) return 31536000
  return 0
}

function parseWhen(when: string): Date | null {
  const now = new Date()
  const s = when.trim().toLowerCase()
  if (/^(now|right now|immediately|asap)$/.test(s)) return new Date(now.getTime() + 30_000)
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

async function usdPrice(symbol: string): Promise<number | null> {
  const spot = await spotPriceUSD(symbol)
  if (spot != null) return spot
  const id = COINGECKO_IDS[symbol.toUpperCase()]
  if (!id) return null
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, { headers: { accept: "application/json" } })
    if (!res.ok) return null
    const j = await res.json()
    return j?.[id]?.usd ?? null
  } catch {
    return null
  }
}

const amountRe = /^\d+(\.\d+)?$/

function systemPrompt(networkName: string, isTestnet: boolean, explorer: string): string {
  return `You are **Astrax**, the AI agent built into the Astrax dApp: a natural-language command center for **Arc**, Circle's EVM-compatible Layer-1 where **USDC is the native gas token**. Current network: **${networkName}** (${isTestnet ? "testnet, free test USDC" : "MAINNET, real funds"}), explorer ${explorer}.

## Personality
You talk only about Astrax, the Arc blockchain, and crypto operations. If asked about something unrelated, give a short warm redirect back to what Astrax can do.

## CRITICAL BEHAVIOR: act, don't explain
When the user asks for an on-chain action, call the matching tool immediately, then summarise the result in one or two short sentences. The UI renders a rich card (and, in wallet mode, a one-click confirm button) from the tool result, so keep your text brief.

Guidance:
- balance → getBalance ; token balance (EURC, WETH, any 0x token) → getTokenBalance
- "send 1 USDC to <address>/alice" → sendPayment (token defaults to native ${NATIVE_SYMBOL})
- "look up tx <hash>" → getTransaction ; "latest blocks" → getLatestBlocks ; "block 123" → getBlock
- "list tokens" → listTokens ; "price/market for X" → getMarketData ; "activity for <address>" → getAddressActivity
- "what is this <address/hash> / is this safe / what does this contract do / explain this tx" → explain
- "price chart / candlestick for ETH, BTC, EURC" → getPriceChart
- "diagram / workflow / flowchart / visualize this" → generateDiagram (YOU write the Mermaid code)
- "generate an image of … / draw …" → generateImage
- Users can attach images (PNG, JPG, GIF, WebP); you'll see a note with their IPFS links. For an NFT, call deployNFT and leave "image" empty: the attached image is used automatically. Never invent an image URL or placeholder. If there's no image, deployNFT tells the user to attach one. To keep an image without minting, use storeAsset.
- If the user attaches an image and asks for an NFT but gives no name, ask for a name (and symbol) first.
- "create token MoonCoin MOON supply 1000000" → deployToken (deploys an ERC-20 contract; the creator owns it and can mint more)
- "create an NFT / mint an NFT" → deployNFT (deploys a 1-of-1 ERC-721)
- "mint 500 more <token address>" → mintTokens (only works for Astrax tokens the user owns)
- "create/deploy a counter / voting / escrow / any smart contract" → deployContract. YOU write the complete Solidity source: start with "// SPDX-License-Identifier: MIT" and "pragma solidity ^0.8.20;", keep it small and self-contained (only @openzeppelin/contracts imports work), no placeholders. If it fails to compile, read the error, fix the source and call deployContract again. For a plain "counter" just use the simple Counter pattern with no imports. For plain ERC-20 tokens or NFTs prefer deployToken / deployNFT.
- "increment the counter / call <fn> on <address> / read <value> from <contract>" → callContract. Pass the contract's address, or just its name ("Counter") when the user says "the counter"; Astrax finds it among their deployed contracts. "my contracts / what have I deployed" → listContracts (the sidebar also has a Smart contracts tab).
- Arc specifics for contracts: the native currency is USDC (msg.value is USDC with 18 decimals), block.prevrandao is always 0 (no on-chain randomness), sending value to address(0) reverts.
- "schedule 2 USDC to alice tomorrow at 5pm" → scheduleTransfer (one-time)
- "pay alice 500 USDC every month for a year / salary" → scheduleTransfer with every:"monthly", occurrences:12
- "show my scheduled payments" → listSchedules ; "cancel schedule <id>" → cancelSchedule
- "payment link for 5 USDC" → createPaymentLink ; "my payment links / has my link been paid" → listPaymentLinks
- "save alice as <address>" → saveContact ; "who is alice" → resolveContact ; "my contacts" → listContacts ; "remove alice" → deleteContact
- Recipients can be a contact name ("send 1 USDC to alice"): pass the name itself as the recipient.
- "store asset <link>" → storeAsset ; "my assets" → listAssets
- Network fees on Arc are paid in USDC (a fraction of a cent). The user switches between Arc Mainnet and Arc Testnet with the network switcher in the top bar; you can't switch it for them.

## Formatting
- **bold** for key terms, backticks for addresses/hashes. Keep it to one or two sentences. Never invent hashes, addresses, or balances: only report tool output.
- Do NOT add notes, footnotes, caveats, unit conversions or mentions of pages/features that aren't in the tool result.
- If a tool returns an error, repeat its reason in your own short sentence. Never guess at other causes, amounts or commands.
- Never retype full addresses, contract addresses, hashes or URLs/links in your text: the card below shows them exactly. Say "the recipient", "the link below", a contact name, or the token symbol instead.
- Don't restate what the card already lists (each item's amount, status, date, link). Give a one-sentence summary instead, e.g. "You have 1 payment link and it's been paid."
- Plain markdown only: never output HTML or JSX-style tags.`
}

// Only the ACTIVE signing mode is described, so the model never hedges between modes.
function signingSection(mode: "auto" | "wallet", hasSigner: boolean): string {
  if (mode === "wallet") {
    return `## Signing (current mode: WALLET)
The user approves every transaction in their own wallet. Write tools (sendPayment, deployToken, deployNFT, mintTokens) only PREPARE a transaction; the chat then shows a confirm button under your reply.
- ONLY when one of those write tools just returned a prepared transaction: say what is ready (amount, recipient, token) and tell them to click the button below to confirm in their wallet.
- For every other reply (balances, prices, blocks, explain, contacts, links, errors…) never mention buttons, confirming, wallets or connecting.
- The app renders the button itself. Never write a button, tag, placeholder or any markup for it (no "<ConfirmButton>", no "[Confirm]").
- Nothing is on-chain yet: never say it was sent, created or minted.
- Do not mention autonomous mode, private keys or signing setup unless a tool returned an error about it.
${hasSigner ? "" : "- No wallet is connected. Only if a write tool returns a no-wallet error, tell them to connect their wallet in the top bar."}`
  }
  return `## Signing (current mode: AUTONOMOUS)
Astrax signs and submits transactions immediately with the user's private key. There is NO confirm button and no wallet popup.
- After a write tool succeeds, report that it was done; the card shows the transaction hash.
- Never tell the user to click a button or confirm in a wallet. Do not mention wallet mode.
${hasSigner ? "" : "- No private key is loaded. Only if a write tool returns a no-key error, tell them to paste one in the sidebar **Signing** panel."}`
}

export async function POST(req: Request) {
  // Chat traffic doubles as a scheduler heartbeat (runs after the response).
  after(() => maybeRunDueSchedules())
  // The domain this request came in on (localhost, preview, production…).
  const origin = requestOrigin(req)
  const body = await req.json()
  const messages = body.messages ?? []
  const network = resolveNetwork(body.network)
  const client = getPublicClient(network)
  const signingMode: "auto" | "wallet" = body.signingMode === "auto" ? "auto" : "wallet"
  const credentials = body.credentials ?? {}
  const privateKey: string | undefined = credentials.privateKey || undefined
  const walletAddress: `0x${string}` | undefined =
    typeof body.walletAddress === "string" && isValidAddress(body.walletAddress) ? normalizeAddress(body.walletAddress) : undefined

  const model = getModel()
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No AI model configured. Set MISTRAL_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY." }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
  }

  const wallet = signingMode === "auto" ? makeWallet(privateKey) : null
  const signer = wallet ? makeWalletClient(network, wallet.account) : null
  const ownerAddress: `0x${string}` | undefined = signingMode === "auto" ? wallet?.address : walletAddress
  // `walletAddress` is only a claim from the browser. Owner-only data (schedules,
  // payment links, contacts, assets) needs proof: the private key itself
  // (autonomous), or a verified wallet session cookie (wallet mode).
  const verifiedAddress = signingMode === "auto" ? wallet?.address : isOwner(req, walletAddress) ? walletAddress : undefined
  /** Lower-cased owner key used for every database row. */
  const verifiedOwner = verifiedAddress ? addrKey(verifiedAddress) : undefined
  const needOwner = () => (ownerAddress ? NOT_OWNER : { error: "No wallet address available." })

  // Guard for write tools: either a server signer (auto) or a connected address (wallet).
  const noSigner = () =>
    signingMode === "auto"
      ? { error: "No private key configured. Open the sidebar **Signing** panel, switch to **Autonomous**, and paste your private key." }
      : { error: "No wallet connected. Connect your wallet in the top bar (wallet signing mode) and try again." }

  const fail = (prefix: string, e: unknown) => ({ error: `${prefix}: ${friendlyError(e, network)}` })

  // Resolve a recipient (address, or a name from THIS user's contacts) to an address.
  // Contact lookup needs a verified owner, so nobody can read someone else's contacts.
  const resolveRecipient = async (to: string): Promise<{ address: `0x${string}` } | { error: string; needsAuth?: boolean }> => {
    const t = to.trim()
    if (isValidAddress(t)) {
      if (!isSendableAddress(t)) return { error: "Arc doesn't allow sending to the zero address." }
      return { address: normalizeAddress(t) }
    }
    if (!verifiedOwner) return ownerAddress ? NOT_OWNER : { error: `"${to}" isn't an address. Connect a wallet to use saved contacts.` }
    const c = await getContact(verifiedOwner, t)
    if (c && isSendableAddress(c.address)) return { address: normalizeAddress(c.address) }
    return { error: `No contact named "${cleanContactName(to)}". Give an address or save them as a contact first.` }
  }

  // ── NFT images ───────────────────────────────────────────────────────────────
  // The chat UI sends which images each user message carried. Only IPFS links (from
  // our uploader) count, so the NFT gets the real upload, never a URL or placeholder
  // the model made up.
  type Attached = { url: string; contentType?: string }
  const rawAttachments: Record<string, unknown> =
    body.attachments && typeof body.attachments === "object" && !Array.isArray(body.attachments) ? body.attachments : {}
  const attachedFor = (id: string): Attached[] => {
    const list = rawAttachments[id]
    if (!Array.isArray(list)) return []
    return list.slice(0, 8).flatMap((a: any) => {
      const cid = typeof a?.url === "string" ? ipfsCid(a.url) : null
      if (!cid) return []
      const ct = typeof a.contentType === "string" && /^image\/(png|jpeg|gif|webp)$/.test(a.contentType) ? a.contentType : undefined
      return [{ url: gatewayUrl(cid), contentType: ct }]
    })
  }
  const allAttached: Attached[] = []
  // Images attached since the last NFT was created, so a new NFT doesn't reuse an old image.
  let freshAttached: Attached[] = []
  for (const m of messages) {
    if (m?.role === "user") {
      const a = attachedFor(String(m.id))
      allAttached.push(...a)
      freshAttached.push(...a)
    } else if (
      m?.role === "assistant" &&
      Array.isArray(m.toolInvocations) &&
      m.toolInvocations.some((t: any) => t?.toolName === "deployNFT" && t?.state === "result" && !t?.result?.error)
    ) {
      freshAttached = []
    }
  }
  const userText = messages.filter((m: any) => m?.role === "user").map((m: any) => String(m.content || "")).join("\n")
  const resolveNftImage = (arg?: string): Attached | null => {
    const cid = arg ? ipfsCid(arg) : null
    if (cid) {
      // One of the attached images (e.g. the user picked between several)…
      const known = allAttached.find((x) => ipfsCid(x.url) === cid)
      if (known) return known
      // …or an IPFS link the user pasted themselves.
      if (userText.includes(cid)) return { url: gatewayUrl(cid) }
    }
    return freshAttached.length > 0 ? freshAttached[freshAttached.length - 1] : null
  }

  /**
   * Remember a contract Astrax deploys (token, NFT or custom) with its ABI, so it shows
   * in the Smart contracts tab and the agent can call it later. Wallet-mode records stay
   * pending (no address) until the browser reports the transaction and the server
   * confirms it on-chain (see app/api/contracts/[id]).
   */
  const rememberDeploy = async (
    req: { abi: Abi; bytecode: `0x${string}`; args: readonly unknown[] },
    name: string,
    deployer: `0x${string}`,
    done?: { address: `0x${string}`; hash: `0x${string}` },
  ): Promise<string | null> => {
    try {
      const id = `ct_${randomBytes(8).toString("hex")}`
      await insertContract({
        id,
        owner: addrKey(deployer),
        network: network.key,
        name,
        abi: JSON.stringify(req.abi),
        deploy_hash: keccak256(encodeDeployData({ abi: req.abi, bytecode: req.bytecode, args: req.args })),
        deploy_data: null, // the browser rebuilds token/NFT deployments itself
        address: done?.address ?? null,
        tx_hash: done?.hash ?? null,
      })
      return id
    } catch (e) {
      console.error("[rememberDeploy]", (e as Error)?.message)
      return null // never block the deployment itself on bookkeeping
    }
  }

  /** A transaction prepared for the browser wallet (wallet mode). */
  const walletAction = (fields: Record<string, unknown>) => ({ kind: "action", network: network.key, chainId: network.id, ...fields })

  // The user's own deployed contracts, so "increment the counter" goes to callContract
  // with the right contract instead of the model guessing a tool.
  let contractsSection = ""
  if (verifiedOwner) {
    try {
      const mine = await listContractsByOwner(verifiedOwner, network.key, 8)
      if (mine.length > 0) {
        const lines = mine.map((r) => {
          const fns = abiFunctions(JSON.parse(r.abi) as Abi).map(describeFunction).join("; ")
          return `- ${r.name} at ${r.address}: ${fns}`.slice(0, 420)
        })
        contractsSection = `\n\n## The user's deployed contracts on ${network.name} (newest first)
${lines.join("\n")}
Any request to read from, call, run or use one of these (including "the counter", "increment", "what's the count") MUST use callContract with address set to the contract's name or address and function set to the function name. Never use getTokenBalance, explain or getTransaction for that. The address is the contract being called, never a recipient or an argument; arguments go in args.`
      }
    } catch {
      /* the list is a convenience; the tools still work without it */
    }
  }

  const result = await streamText({
    model,
    system: `${systemPrompt(network.name, network.isTestnet, network.explorerUrl)}\n\n${signingSection(signingMode, Boolean(ownerAddress))}${contractsSection}`,
    messages,
    maxSteps: 6,
    tools: {
      // ── READ ──────────────────────────────────────────────────────────────
      getBalance: tool({
        description: `Get the native ${NATIVE_SYMBOL} (gas token) balance of an address on ${network.name}. If no address is given, uses the user's own address.`,
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          try {
            const target = address && isValidAddress(address) ? normalizeAddress(address) : ownerAddress
            if (!target) return { error: "No valid address available." }
            const wei = await client.getBalance({ address: target })
            const price = await usdPrice(NATIVE_SYMBOL)
            const amount = Number(formatAmount(wei, 18, 6))
            return {
              kind: "balance",
              address: target,
              network: network.name,
              balance: formatFixed(wei, 18, 4),
              symbol: NATIVE_SYMBOL,
              usdValue: price ? (amount * price).toFixed(2) : undefined,
            }
          } catch {
            return { error: "Failed to fetch balance." }
          }
        },
      }),

      getTokenBalance: tool({
        description: "Get an ERC-20 token balance for an address. Accepts a token symbol (e.g. EURC, WETH, cirBTC, USYC) or a contract address.",
        parameters: z.object({ token: z.string(), address: z.string().optional() }),
        execute: async ({ token, address }) => {
          try {
            const target = address && isValidAddress(address) ? normalizeAddress(address) : ownerAddress
            if (!target) return { error: "No valid address available." }
            if (isNativeToken(token)) {
              // USDC's ERC-20 view truncates below 6 decimals; the native balance is exact.
              const wei = await client.getBalance({ address: target })
              return { kind: "balance", address: target, network: network.name, balance: formatFixed(wei, 18, 4), symbol: NATIVE_SYMBOL }
            }
            const resolved = await resolveToken(network, client, token)
            if ("error" in resolved) return resolved
            const units = await client.readContract({ address: resolved.address, abi: ERC20_ABI, functionName: "balanceOf", args: [target] })
            return { kind: "balance", address: target, network: network.name, balance: formatFixed(units, resolved.decimals, 4), symbol: resolved.symbol }
          } catch {
            return { error: "Failed to fetch token balance." }
          }
        },
      }),

      getTransaction: tool({
        description: "Look up details of a transaction by its hash (0x + 64 hex characters).",
        parameters: z.object({ hash: z.string() }),
        execute: async ({ hash }) => {
          if (!isTxHash(hash.trim())) return { error: "That isn't a transaction hash (0x + 64 hex characters)." }
          const h = hash.trim() as `0x${string}`
          try {
            const [tx, receipt] = await Promise.all([client.getTransaction({ hash: h }), client.getTransactionReceipt({ hash: h }).catch(() => null)])
            return {
              kind: "transaction",
              hash: h,
              from: tx.from,
              to: tx.to ?? receipt?.contractAddress ?? "",
              value: `${formatAmount(tx.value, 18, 6)} ${NATIVE_SYMBOL}`,
              blockNumber: tx.blockNumber?.toString() ?? "pending",
              status: receipt ? (receipt.status === "success" ? "Success" : "Failed") : "Pending",
              fee: receipt ? `${formatAmount(receipt.gasUsed * receipt.effectiveGasPrice, 18, 6)} ${NATIVE_SYMBOL}` : undefined,
              explorerUrl: explorerTx(network, h),
            }
          } catch {
            return { error: `Transaction not found on ${network.name}.` }
          }
        },
      }),

      getLatestBlocks: tool({
        description: `Get the most recent blocks on ${network.name}.`,
        parameters: z.object({ count: z.number().int().min(1).max(5).optional() }),
        execute: async ({ count }) => {
          try {
            const n = count ?? 3
            const latest = await client.getBlockNumber()
            const nums = Array.from({ length: n }, (_, i) => latest - BigInt(i)).filter((b) => b >= 0n)
            const blocks = await Promise.all(nums.map((blockNumber) => client.getBlock({ blockNumber })))
            return {
              kind: "blocks",
              network: network.name,
              blocks: blocks.map((b) => ({
                blockNumber: b.number.toString(),
                hash: b.hash,
                timestamp: new Date(Number(b.timestamp) * 1000).toLocaleString(),
                transactionCount: b.transactions.length,
              })),
            }
          } catch {
            return { error: "Failed to fetch blocks." }
          }
        },
      }),

      getBlock: tool({
        description: "Get a block by its number.",
        parameters: z.object({ block: z.string() }),
        execute: async ({ block }) => {
          if (!/^\d+$/.test(block.trim())) return { error: "Give a numeric block number." }
          try {
            const b = await client.getBlock({ blockNumber: BigInt(block.trim()) })
            return {
              kind: "block",
              blockNumber: b.number.toString(),
              hash: b.hash,
              timestamp: new Date(Number(b.timestamp) * 1000).toLocaleString(),
              transactionCount: b.transactions.length,
              gasUsed: b.gasUsed.toString(),
              explorerUrl: `${network.explorerUrl}/block/${b.number}`,
            }
          } catch {
            return { error: `Block ${block} not found on ${network.name}.` }
          }
        },
      }),

      listTokens: tool({
        description: `List the tokens Astrax knows on ${network.name} (USDC, EURC, USYC, cirBTC, WETH).`,
        parameters: z.object({}),
        execute: async () => ({ kind: "tokenList", network: network.key, tokens: network.tokens }),
      }),

      explain: tool({
        description:
          "Explain / audit a transaction hash OR an address/contract: decode what it does, label the account type, and flag risks. Use whenever the user pastes a hash or address, or asks 'what is this', 'is this safe', 'what does this do'.",
        parameters: z.object({ target: z.string().describe("A transaction hash or an address") }),
        execute: async ({ target }) => explainTarget(network, target),
      }),

      getMarketData: tool({
        description: "Get market data (price, market cap, volume, 24h change) for an asset. Defaults to USDC; also EURC, ETH (WETH) and BTC (cirBTC).",
        parameters: z.object({ symbol: z.string().optional() }),
        execute: async ({ symbol }) => {
          const sym = (symbol || NATIVE_SYMBOL).trim().toUpperCase()
          const id = COINGECKO_IDS[sym]
          const price = await usdPrice(sym)
          let marketCap: number | null = null
          let volume24h: number | null = null
          let change24h: number | null = null
          let name = sym
          if (id) {
            try {
              const res = await fetch(
                `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`,
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
          }
          if (price == null && marketCap == null) return { error: `Market data for ${sym} is unavailable right now.` }
          return { kind: "market", name, symbol: sym, price, marketCap, volume24h, change24h }
        },
      }),

      getAddressActivity: tool({
        description: `Get recent transactions for an address on ${network.name}.`,
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          const target = address && isValidAddress(address) ? normalizeAddress(address) : ownerAddress
          if (!target) return { error: "No valid address available." }
          try {
            const { transactions, source } = await recentActivity(network, target, 8)
            return {
              kind: "activity",
              network: network.key,
              address: target,
              transactions,
              note: transactions.length === 0 ? (source === "logs" ? "No USDC transfers in the last few hours." : "No transactions yet.") : undefined,
              explorerUrl: explorerAddress(network, target),
            }
          } catch {
            return { kind: "activity", network: network.key, address: target, transactions: [], note: "Could not load activity.", explorerUrl: explorerAddress(network, target) }
          }
        },
      }),

      resolveContact: tool({
        description: "Look up one of the user's saved contacts by name.",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          if (!verifiedOwner) return needOwner()
          const c = await getContact(verifiedOwner, name)
          return c ? { kind: "contact", name: c.name, address: c.address } : { error: `No contact named "${cleanContactName(name)}".` }
        },
      }),

      saveContact: tool({
        description: "Save (or update) a contact name → address in the user's own address book.",
        parameters: z.object({ name: z.string(), address: z.string() }),
        execute: async ({ name, address }) => {
          if (!verifiedOwner) return needOwner()
          if (!isSendableAddress(address)) return { error: "That is not a valid Arc address (0x followed by 40 hex characters)." }
          if (!cleanContactName(name)) return { error: "Give the contact a name." }
          const c = await saveContact(verifiedOwner, name, normalizeAddress(address))
          return { kind: "contact", name: c.name, address: c.address, saved: true }
        },
      }),

      listContacts: tool({
        description: "List the user's saved contacts.",
        parameters: z.object({}),
        execute: async () => {
          if (!verifiedOwner) return needOwner()
          return { kind: "contactList", contacts: await listContacts(verifiedOwner) }
        },
      }),

      deleteContact: tool({
        description: "Remove a contact from the user's address book by name.",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          if (!verifiedOwner) return needOwner()
          const ok = await deleteContact(verifiedOwner, name)
          return ok ? { kind: "contactDeleted", name: cleanContactName(name) } : { error: `No contact named "${cleanContactName(name)}".` }
        },
      }),

      // ── WRITE (auto = sign now; wallet = return a prepared transaction) ───────
      sendPayment: tool({
        description: `Send ${NATIVE_SYMBOL} (native gas token) or an ERC-20 token (EURC, WETH, any 0x token) to an address or saved contact on ${network.name}.`,
        parameters: z.object({
          to: z.string(),
          amount: z.string(),
          token: z.string().optional(),
        }),
        execute: async ({ to, amount, token }) => {
          if (!amountRe.test(amount) || Number(amount) <= 0) return { error: `Invalid amount "${amount}".` }
          const resolved = await resolveRecipient(to)
          if ("error" in resolved) return resolved
          const recipient = resolved.address
          const native = isNativeToken(token)
          let erc20: ResolvedToken | undefined
          if (!native) {
            const r = await resolveToken(network, client, token!)
            if ("error" in r) return r
            erc20 = r
          }
          const symbol = erc20?.symbol ?? NATIVE_SYMBOL
          let tx: PreparedTx
          try {
            tx = erc20 ? buildTokenTransfer(erc20, recipient, amount) : buildNativeTransfer(recipient, amount)
          } catch (e) {
            return fail("Could not prepare transfer", e)
          }

          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            return walletAction({ action: native ? "sendNative" : "sendToken", to: recipient, amount, symbol, tx, label: `Send ${amount} ${symbol}` })
          }

          if (!wallet || !signer) return noSigner()
          try {
            const { hash } = await sendPrepared(signer, client, tx)
            return { kind: "transaction", status: "Success", action: "send", hash, from: wallet.address, to: recipient, value: `${amount} ${symbol}`, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail("Payment not sent", e)
          }
        },
      }),

      deployToken: tool({
        description: `Create a new ERC-20 token on ${network.name} by deploying a contract. Mints the full supply to the creator, who stays the owner and can mint more later.`,
        parameters: z.object({
          name: z.string(),
          symbol: z.string(),
          supply: z.string().describe("Whole-token supply, e.g. 1000000"),
          decimals: z.number().int().min(0).max(MAX_DECIMALS).optional().describe("Defaults to 18"),
        }),
        execute: async ({ name, symbol, supply, decimals }) => {
          const clean = supply.replace(/[,_\s]/g, "")
          if (!/^\d+$/.test(clean) || BigInt(clean) <= 0n) return { error: `Invalid supply "${supply}". Use a whole number of tokens.` }
          const params = { name: name.trim().slice(0, 64), symbol: symbol.trim().slice(0, 16), decimals: decimals ?? 18, supply: clean }
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const contractId = await rememberDeploy(buildDeployToken(params), params.name, ownerAddress)
            return walletAction({ action: "deployToken", contractId: contractId ?? undefined, deploy: { type: "token", ...params }, ...params, label: `Create token ${params.name} (${params.symbol})` })
          }
          if (!wallet || !signer) return noSigner()
          try {
            const req = buildDeployToken(params)
            const { hash, address } = await deployPrepared(signer, client, req)
            await rememberDeploy(req, params.name, wallet.address, { address, hash })
            return { kind: "deploy", what: "token", name: params.name, symbol: params.symbol, supply: clean, contractAddress: address, contractUrl: explorerToken(network, address), hash, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail("Create failed", e)
          }
        },
      }),

      deployNFT: tool({
        description: `Create a 1-of-1 NFT on ${network.name} by deploying an ERC-721 contract whose single token is minted to the creator, with standard metadata JSON on IPFS. An NFT needs an image the user attached with the paperclip; the attached image is used automatically, so leave \`image\` empty. Never make up an image URL or placeholder. Use for 'create an NFT' / 'mint an NFT'.`,
        parameters: z.object({
          name: z.string(),
          symbol: z.string(),
          image: z.string().optional().describe("Leave empty: the user's attached image is used. Only set it to an IPFS URL from the conversation when the user picks one of several images."),
          description: z.string().optional(),
        }),
        execute: async ({ name, symbol, image, description }) => {
          const picked = resolveNftImage(image)
          if (!picked) {
            return {
              error: `An NFT needs an image. Attach one with the paperclip button (${IMAGE_FORMATS_LABEL}, up to 10 MB), wait until it shows "Uploaded to IPFS", then ask again.`,
            }
          }
          if (!isPinataConfigured()) return { error: "NFT metadata can't be stored because IPFS isn't configured on this server." }

          const cleanName = name.trim().slice(0, 64)
          const cleanSymbol = symbol.trim().slice(0, 16)
          // Standard ERC-721 metadata JSON (the format wallets, marketplaces and explorers read).
          let metadataUri: string
          try {
            const meta = {
              name: cleanName,
              symbol: cleanSymbol,
              description: description || cleanName,
              image: picked.url,
              properties: { category: "image", files: [{ uri: picked.url, ...(picked.contentType ? { type: picked.contentType } : {}) }] },
            }
            metadataUri = (await uploadJSONToIPFS(meta, `${cleanSymbol || "nft"}-metadata.json`)).ipfsUrl
          } catch {
            return { error: "Couldn't save the NFT metadata to IPFS, so nothing was created. Try again." }
          }
          const imageUsed = picked.url

          const params = { name: cleanName, symbol: cleanSymbol, uri: metadataUri }
          if (signingMode === "wallet") {
            if (!ownerAddress) return noSigner()
            const contractId = await rememberDeploy(buildDeployNFT(params), params.name, ownerAddress)
            return walletAction({ action: "deployNFT", contractId: contractId ?? undefined, deploy: { type: "nft", ...params }, ...params, image: imageUsed, metadataUri, label: `Create NFT ${params.name} (${params.symbol})` })
          }
          if (!wallet || !signer) return noSigner()
          try {
            const req = buildDeployNFT(params)
            const { hash, address } = await deployPrepared(signer, client, req)
            await rememberDeploy(req, params.name, wallet.address, { address, hash })
            return { kind: "deploy", what: "nft", name: params.name, symbol: params.symbol, image: imageUsed, metadataUri, contractAddress: address, contractUrl: explorerToken(network, address), hash, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail("Create failed", e)
          }
        },
      }),

      deployContract: tool({
        description: `Compile and deploy a custom Solidity smart contract on ${network.name}, e.g. a counter, voting, escrow or registry. You write the full source. Returns the address and the contract's functions. Compile errors come back with the failing line and a hint: fix the source and call again. Keep contracts SIMPLE and avoid imports unless needed (OpenZeppelin v5 only: Ownable needs \`Ownable(msg.sender)\`, there is no Counters.sol). A correct simple counter, for reference:
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Counter {
    uint256 public count;
    event Incremented(address indexed by, uint256 newCount);
    function increment() external { count += 1; emit Incremented(msg.sender, count); }
    function decrement() external { require(count > 0, "Already zero"); count -= 1; }
    function reset() external { count = 0; }
}`,
        parameters: z.object({
          source: z.string().describe("Complete Solidity source with an SPDX line and `pragma solidity ^0.8.20;`. Self-contained; only @openzeppelin/contracts imports are available."),
          contractName: z.string().optional().describe("Which contract in the source to deploy. Defaults to the last one."),
          constructorArgs: z.array(z.string()).optional().describe("Constructor arguments in order, each as a string (numbers as integers in base units, arrays as JSON)."),
        }),
        execute: async ({ source, contractName, constructorArgs }) => {
          if (signingMode === "wallet" ? !ownerAddress : !wallet || !signer) return noSigner()
          const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
          if (await rateLimited(`compile:${ip}`, 60_000, 10)) return { error: "Too many compiles in a minute. Wait a moment and try again." }

          const compiled = await compileSolidity(source, contractName?.trim() || undefined)
          if (!compiled.ok) return { error: compiled.error }
          const c = compiled.result

          const ctor = c.abi.find((x): x is AbiConstructor => x.type === "constructor")
          let data: `0x${string}`
          try {
            const args = coerceArgs(ctor?.inputs ?? [], constructorArgs ?? [])
            data = encodeDeployData({ abi: c.abi, bytecode: c.bytecode, args })
          } catch (e: any) {
            return { error: `Constructor arguments: ${String(e?.shortMessage || e?.message || e).slice(0, 200)}` }
          }

          const deployer = (signingMode === "wallet" ? ownerAddress : wallet!.address) as `0x${string}`
          // Dry run first: catches constructor reverts and shows the gas before anything is signed.
          let gas: bigint
          try {
            gas = await client.estimateGas({ account: deployer, data })
          } catch (e) {
            return fail(`${c.contractName} would fail to deploy`, e)
          }

          const functions = abiFunctions(c.abi).map(describeFunction)
          const id = `ct_${randomBytes(8).toString("hex")}`
          const record = {
            id,
            owner: addrKey(deployer),
            network: network.key,
            name: c.contractName,
            abi: JSON.stringify(c.abi),
            deploy_hash: keccak256(data),
          }
          const summary = { contractName: c.contractName, functions, compiler: `solc ${c.compilerVersion}`, sizeBytes: c.runtimeBytes, gasEstimate: gas.toString(), warnings: c.warnings.length ? c.warnings : undefined }

          if (signingMode === "wallet") {
            // The bytecode stays on the server; the confirm button fetches it by id.
            try {
              await insertContract({ ...record, address: null, deploy_data: data, tx_hash: null })
            } catch (e) {
              console.error("[deployContract] couldn't save the deployment:", (e as Error)?.message)
              return { error: "Couldn't prepare the deployment (database error). Try again in a moment." }
            }
            return walletAction({ action: "deployContract", contractId: id, ...summary, label: `Deploy ${c.contractName}` })
          }
          try {
            const { hash, address } = await deployData(signer!, client, data)
            // The contract is already live; if saving its ABI fails, the deploy result still returns.
            await insertContract({ ...record, address, deploy_data: null, tx_hash: hash }).catch((e) =>
              console.error("[deployContract] deployed but couldn't save the ABI:", (e as Error)?.message),
            )
            return { kind: "deploy", what: "contract", name: c.contractName, ...summary, contractAddress: address, contractUrl: explorerAddress(network, address), hash, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail("Deploy failed", e)
          }
        },
      }),

      callContract: tool({
        description: `Call a function on a deployed contract on ${network.name}. Read-only (view/pure) functions return their result right away; other functions send a transaction. Works with contracts deployed through Astrax by function name; for any other contract give the full signature, e.g. "count() view returns (uint256)".`,
        parameters: z.object({
          address: z.string().describe('Contract address, or the NAME of a contract the user deployed through Astrax (e.g. "Counter"). If the user doesn\'t give an address, pass the name.'),
          function: z.string().describe('Function name (e.g. "increment"), or a full signature for contracts not deployed through Astrax'),
          args: z.array(z.string()).optional().describe("Arguments in order, each as a string (integers in base units, arrays as JSON)."),
          value: z.string().optional().describe("USDC to send with a payable function, e.g. 0.5"),
        }),
        execute: async ({ address, function: fnArg, args, value }) => {
          // An address, an address inside text ("Counter (0x…)"), or the name of one of the user's contracts.
          const embedded = address.match(/0x[0-9a-fA-F]{40}/)?.[0]
          let target: `0x${string}`
          if (isValidAddress(address)) target = normalizeAddress(address)
          else if (embedded) target = normalizeAddress(embedded)
          else {
            if (!verifiedOwner) return ownerAddress ? NOT_OWNER : { error: `"${address}" isn't an address. Connect a wallet to use your deployed contracts by name.` }
            const found = await findContractByName(verifiedOwner, network.key, address)
            if (!found?.address) return { error: `You haven't deployed a contract called "${address}" on ${network.name}. Ask for "my contracts" to see them, or give an address.` }
            target = normalizeAddress(found.address)
          }
          const code = await client.getCode({ address: target }).catch(() => undefined)
          if (!code || code === "0x") return { error: `There's no contract at that address on ${network.name}.` }

          const stored = await getContractByAddress(network.key, target)
          const abi = stored ? (JSON.parse(stored.abi) as Abi) : null
          const picked = pickFunction(abi, fnArg, (args ?? []).length)
          if ("error" in picked) return { error: picked.error }
          const fn = picked.fn
          let callArgs: unknown[]
          try {
            callArgs = coerceArgs(fn.inputs, args ?? [])
          } catch (e: any) {
            return { error: `${fn.name}: ${String(e?.message || e).slice(0, 200)}` }
          }
          const name = stored?.name || `${target.slice(0, 6)}…${target.slice(-4)}`

          if (isReadOnly(fn)) {
            try {
              const result = await client.readContract({ address: target, abi: [fn], functionName: fn.name, args: callArgs })
              const outputs = fn.outputs.length > 1 && Array.isArray(result) ? result : [result]
              return {
                kind: "contractRead",
                network: network.key,
                contract: name,
                address: target,
                function: describeFunction(fn),
                results: fn.outputs.map((o, i) => ({ name: o.name || (fn.outputs.length > 1 ? `#${i + 1}` : "result"), type: o.type, value: stringifyResult(outputs[i]) })),
                explorerUrl: explorerAddress(network, target),
              }
            } catch (e) {
              return fail(`${fn.name} reverted`, e)
            }
          }

          let valueWei: bigint | undefined
          if (value && Number(value) > 0) {
            if (fn.stateMutability !== "payable") return { error: `${fn.name} isn't payable, so it can't receive USDC.` }
            try {
              valueWei = toBaseUnits(value, 18)
            } catch {
              return { error: `Invalid USDC amount "${value}".` }
            }
          }
          const tx: PreparedTx = {
            to: target,
            data: encodeFunctionData({ abi: [fn], functionName: fn.name, args: callArgs }),
            value: (valueWei ?? 0n).toString(),
          }
          const caller = (signingMode === "wallet" ? ownerAddress : wallet?.address) as `0x${string}` | undefined
          if (!caller || (signingMode === "auto" && !signer)) return noSigner()
          // Simulate first so a revert is reported before anything is signed.
          try {
            await client.call({ account: caller, to: tx.to, data: tx.data, value: valueWei })
          } catch (e) {
            return fail(`${fn.name} would revert`, e)
          }
          const label = `Call ${fn.name}(${(args ?? []).join(", ")}) on ${name}`
          if (signingMode === "wallet") return walletAction({ action: "callContract", to: target, tx, label })
          try {
            const { hash } = await sendPrepared(signer!, client, tx)
            return { kind: "transaction", status: "Success", action: "call", hash, from: caller, to: target, value: `${fn.name}(${(args ?? []).join(", ")})`, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail(`${fn.name} failed`, e)
          }
        },
      }),

      listContracts: tool({
        description: `List the contracts the user deployed through Astrax on ${network.name}, with their functions.`,
        parameters: z.object({}),
        execute: async () => {
          if (!verifiedOwner) return needOwner()
          const rows = await listContractsByOwner(verifiedOwner, network.key)
          return {
            kind: "contractList",
            network: network.key,
            contracts: rows.map((r) => ({
              name: r.name,
              address: r.address,
              functions: abiFunctions(JSON.parse(r.abi) as Abi).map((f) => f.name),
              createdAt: new Date(r.created_at).toLocaleString(),
              explorerUrl: explorerAddress(network, r.address!),
            })),
          }
        },
      }),

      mintTokens: tool({
        description: "Mint additional units of a token created with Astrax (the user must be its owner). Give the token contract address; mints to the user unless another address is specified. NFTs created by Astrax are 1-of-1 and cannot be minted further.",
        parameters: z.object({ token: z.string().describe("Token contract address"), to: z.string().optional(), amount: z.string().optional() }),
        execute: async ({ token, to, amount }) => {
          if (!isValidAddress(token)) return { error: "That is not a valid token contract address." }
          const tokenAddr = normalizeAddress(token)
          if (findToken(network, tokenAddr) || tokenAddr.toLowerCase() === USDC_ADDRESS) return { error: "Only tokens you created can be minted; that one is issued by Circle." }
          if (!ownerAddress) return noSigner()
          let recipient: `0x${string}` = ownerAddress
          if (to) {
            const r = await resolveRecipient(to)
            if ("error" in r) return r
            recipient = r.address
          }
          const amt = (amount || "1").replace(/[,_\s]/g, "")
          if (!amountRe.test(amt) || Number(amt) <= 0) return { error: `Invalid amount "${amount}".` }
          let decimals: number
          let tokenSymbol = "tokens"
          try {
            const [d, owner, sym] = await Promise.all([
              client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "decimals" }),
              client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "owner" }),
              client.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "tokens"),
            ])
            decimals = Number(d)
            tokenSymbol = String(sym)
            if (owner.toLowerCase() !== ownerAddress.toLowerCase()) return { error: "You're not the owner of that token, so you can't mint more of it." }
          } catch {
            return { error: "That contract isn't a mintable Astrax token on this network." }
          }
          let tx: PreparedTx
          try {
            toBaseUnits(amt, decimals)
            tx = buildMint(tokenAddr, recipient, amt, decimals)
          } catch (e) {
            return fail("Could not prepare mint", e)
          }
          if (signingMode === "wallet") {
            return walletAction({ action: "mintTokens", token: tokenAddr, to: recipient, amount: amt, symbol: tokenSymbol, tx, label: `Mint ${amt} ${tokenSymbol} → ${recipient.slice(0, 6)}…${recipient.slice(-4)}` })
          }
          if (!signer) return noSigner()
          try {
            const { hash } = await sendPrepared(signer, client, tx)
            return { kind: "transaction", status: "Success", action: "mint", hash, to: recipient, value: `${amt} ${tokenSymbol}`, explorerUrl: explorerTx(network, hash) }
          } catch (e) {
            return fail("Mint failed", e)
          }
        },
      }),

      scheduleTransfer: tool({
        description: `Schedule a one-time or RECURRING transfer (e.g. salary) on ${network.name}. Requires Autonomous (private key) signing mode. "when" accepts "in 10 minutes", "tomorrow at 5pm", or an ISO date. "every" makes it recurring: daily/weekly/monthly or "2 weeks"; "occurrences" is how many times (default 1 for one-time, or e.g. 12 for a year of monthly).`,
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
          if (!runAt) return { error: `Could not understand the time "${when}". Try "in 10 minutes" or "2027-01-01 17:00".` }
          if (runAt.getTime() < Date.now() - 60_000) return { error: "That time is in the past." }
          const resolved = await resolveRecipient(to)
          if ("error" in resolved) return resolved
          const recipient = resolved.address
          if (!amountRe.test(amount) || Number(amount) <= 0) return { error: `Invalid amount "${amount}".` }
          let tokenSymbol = NATIVE_SYMBOL
          let tokenField = ""
          if (!isNativeToken(token)) {
            const r = await resolveToken(network, client, token!)
            if ("error" in r) return r
            tokenSymbol = r.symbol
            tokenField = r.address
          }
          const intervalSecs = parseEvery(every)
          const remaining = intervalSecs ? occurrences ?? 1 : 1
          const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          await insertSchedule({
            id,
            owner: addrKey(wallet.address),
            network: network.key,
            recipient,
            amount,
            token: tokenField,
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
            amount: `${amount} ${tokenSymbol}`,
            runAt: runAt.toLocaleString(),
            recurrence: recurrenceLabel,
            note: `Runs on ${network.name}. Sent within about a minute of the time while Astrax is open anywhere, and within the hour otherwise. Your key is stored encrypted for this.`,
          }
        },
      }),

      listSchedules: tool({
        description: `List the user's scheduled transfers on ${network.name} (upcoming and past).`,
        parameters: z.object({}),
        execute: async () => {
          if (!verifiedOwner) return needOwner()
          const rows = (await listSchedulesByOwner(verifiedOwner, network.key)).map((r) => {
            const known = r.token ? findToken(network, r.token) : undefined
            return {
              id: r.id,
              to: r.recipient,
              amount: `${r.amount} ${r.token ? known?.symbol ?? `${r.token.slice(0, 6)}…` : NATIVE_SYMBOL}`,
              runAt: new Date(r.next_run).toLocaleString(),
              recurrence: r.interval_secs ? `recurring (${r.remaining} left)` : "once",
              status: r.status,
              lastTx: r.last_tx || undefined,
            }
          })
          return { kind: "scheduleList", network: network.key, schedules: rows }
        },
      }),

      cancelSchedule: tool({
        description: "Cancel an active scheduled transfer by its id.",
        parameters: z.object({ id: z.string() }),
        execute: async ({ id }) => {
          if (!verifiedOwner) return needOwner()
          const ok = await dbCancelSchedule(id, verifiedOwner)
          return ok ? { kind: "scheduleCancelled", id } : { error: `No active schedule ${id} found for you.` }
        },
      }),

      createPaymentLink: tool({
        description: `Create a shareable payment link requesting ${NATIVE_SYMBOL} to the user's address on ${network.name}. Astrax tracks it and marks it paid automatically once someone pays.`,
        parameters: z.object({ amount: z.string(), description: z.string().optional().describe("What the payment is for (shown to the payer)") }),
        execute: async ({ amount, description }) => {
          if (!ownerAddress) return { error: "No receiving address available. Connect a wallet or add a private key." }
          if (!verifiedAddress || !verifiedOwner) return NOT_OWNER
          if (!amountRe.test(amount) || Number(amount) <= 0) return { error: `Invalid amount "${amount}".` }
          if ((amount.split(".")[1] ?? "").length > 6) return { error: "USDC supports at most 6 decimal places." }
          const link = await createPaymentLinkRecord({ owner: verifiedAddress, network, amount, description })
          return { kind: "paymentLink", id: link.id, network: network.key, path: paymentLinkPath(link.id), url: paymentLinkUrl(link.id, origin), address: verifiedAddress, amount: `${amount} ${NATIVE_SYMBOL}`, description: link.description || undefined, status: link.status }
        },
      }),

      listPaymentLinks: tool({
        description: `List the user's payment links on ${network.name} and whether each has been paid.`,
        parameters: z.object({}),
        execute: async () => {
          if (!verifiedOwner) return needOwner()
          const rows = await Promise.all(
            (await listPaymentLinksByOwner(verifiedOwner, network.key, 20)).map((r) => (r.status === "open" ? verifyPaymentLink(r) : r)),
          )
          return {
            kind: "paymentLinkList",
            network: network.key,
            links: rows.map((r) => ({
              id: r.id,
              path: paymentLinkPath(r.id),
              url: paymentLinkUrl(r.id, origin),
              amount: `${r.amount} ${r.token}`,
              description: r.description || undefined,
              status: r.status,
              createdAt: new Date(r.created_at).toLocaleString(),
            })),
          }
        },
      }),

      storeAsset: tool({
        description: "Store a reference to an asset (e.g. an IPFS link) with a description, owned by the user.",
        parameters: z.object({ link: z.string(), description: z.string() }),
        execute: async ({ link, description }) => {
          if (!verifiedOwner) return needOwner()
          await addAsset(verifiedOwner, link, description)
          return { kind: "asset", link, description, owner: verifiedAddress, saved: true }
        },
      }),

      listAssets: tool({
        description: "List the user's stored assets.",
        parameters: z.object({}),
        execute: async () => {
          if (!verifiedOwner) return needOwner()
          return { kind: "assetList", assets: await listAssets(verifiedOwner) }
        },
      }),

      // ── VISUALS / DATA ──────────────────────────────────────────────────────
      getPriceChart: tool({
        description: "Get an OHLC candlestick price chart for an asset over a number of days. Defaults to ETH (WETH on Arc). Also USDC, EURC, BTC/cirBTC. Prices come from Coinbase and CoinGecko.",
        parameters: z.object({
          symbol: z.string().optional().describe("Asset symbol, e.g. ETH, BTC, EURC, USDC. Defaults to ETH."),
          days: z.number().int().min(2).max(30).optional(),
        }),
        execute: async ({ symbol, days }) => {
          const sym = (symbol || "ETH").toUpperCase()
          const d = days ?? 7
          const data = await priceCandles(sym, d)
          if (!data || data.length === 0) return { error: `No price history is available for ${sym}. Supported: USDC, EURC, ETH (WETH) and BTC (cirBTC).` }
          return { kind: "candlestick", symbol: sym, days: d, data }
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
            const encoded = Buffer.from(sanitizeMermaid(mermaid)).toString("base64url")
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
            // Call the handler in-process: no self-HTTP request, so it doesn't
            // depend on (client-controlled) Host headers or a configured base URL.
            const res = await generateImage(new NextRequest("http://internal/api/generate-image", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt, isSmartContractWorkflow: !!isContract, type: isContract ? "workflow" : "general" }),
            }))
            const j = await res.json()
            if (!res.ok || !j.imageBase64) return { error: j.error || "Image generation failed." }
            return { kind: "image", title: "Generated image", imageBase64: j.imageBase64 }
          } catch {
            return { error: "Image generation failed." }
          }
        },
      }),

      swap: tool({
        description: "Swap one token for another on an Arc DEX. Requires a configured DEX/aggregator.",
        parameters: z.object({ fromToken: z.string(), toToken: z.string(), amount: z.string() }),
        execute: async ({ fromToken, toToken, amount }) => {
          const dex = process.env.ARC_DEX
          if (!dex) {
            return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "unavailable", note: "No DEX is configured yet. Set ARC_DEX to enable on-chain swaps." }
          }
          return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "router-configured", note: "DEX configured; swap execution wiring is a next step." }
        },
      }),
    },
  })

  return result.toDataStreamResponse()
}
