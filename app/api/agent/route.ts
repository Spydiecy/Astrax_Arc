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
import {
  saveAddress,
  resolveName,
  listAddresses,
  addAsset,
  listAssets,
  addSchedule,
  updateSchedule,
  listSchedules,
  type ScheduledTransfer,
} from "@/lib/store"

export const runtime = "nodejs"
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// ── Model selection: Mistral first (like FlarePay), Google Gemini as fallback ───
function getModel() {
  if (process.env.MISTRAL_API_KEY) {
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
    return mistral(process.env.ASTRAX_MODEL || "mistral-large-latest")
  }
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY
  if (key) {
    const google = createGoogleGenerativeAI({ apiKey: key })
    return google(process.env.ASTRAX_MODEL || "gemini-2.0-flash")
  }
  return null
}

const publicClient = getPublicClient()

// ── Credential-scoped wallet helper ────────────────────────────────────────────
function makeWallet(privateKey?: string) {
  if (!privateKey) return null
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex
  const account = privateKeyToAccount(pk)
  const client = createWalletClient({ account, chain: sonicTestnet, transport: http(RPC_URL) })
  return { account, client }
}

// ── Natural-language time parsing for scheduled transfers ───────────────────────
function parseWhen(when: string): Date | null {
  const now = new Date()
  const s = when.trim().toLowerCase()

  // "in N minutes/hours/days/weeks"
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

  // "tomorrow [at HH[:MM]] [am/pm]"
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

  // Absolute date (ISO or Date-parsable)
  const parsed = new Date(when)
  if (!isNaN(parsed.getTime())) return parsed
  return null
}

// ── Resolve a recipient: raw 0x address or an address-book name ──────────────────
async function resolveRecipient(to: string): Promise<string | null> {
  if (isAddress(to)) return to
  const name = to.startsWith("@") ? to.slice(1) : to
  return await resolveName(name)
}

async function sonicUsdPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=sonic-3&vs_currencies=usd",
      { headers: { accept: "application/json" } },
    )
    if (!res.ok) return null
    const j = await res.json()
    return j?.["sonic-3"]?.usd ?? null
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `You are **Astrax**, the AI agent built into the Astrax dApp — a natural-language command center for the **Sonic Testnet** (EVM, Chain ID ${sonicTestnet.id}, native gas token **${NATIVE_SYMBOL}**, explorer ${EXPLORER_URL}).

## Personality
You talk only about Astrax, the Sonic blockchain, and crypto operations. If asked about anything unrelated (weather, sports, general trivia), give a short warm redirect back to what Astrax can do. Never be preachy.

## CRITICAL BEHAVIOR — act, don't explain
When the user asks you to do something on-chain (check a balance, send ${NATIVE_SYMBOL} or a token, look up a transaction, deploy a token or contract, schedule a payment, make a payment link, show blocks/market data, save a contact), you MUST call the matching tool immediately. Do not describe the steps — call the tool, then summarize the result in one or two short sentences. The UI renders a rich card from the tool result, so keep your text brief and don't repeat every field.

Guidance:
- "what's my balance" / "balance of 0x..." → getBalance
- "send 1 ${NATIVE_SYMBOL} to 0x.. / to alice" → sendPayment (token defaults to native ${NATIVE_SYMBOL})
- "send 5 USDT to bob" → sendPayment with token "USDT"
- "look up tx 0x..." → getTransaction
- "latest blocks" → getLatestBlocks ; "block 123" → getBlock
- "list tokens" / "supported tokens" → listTokens
- "price of ${NATIVE_SYMBOL}" / "market" → getMarketData
- "activity for 0x.." → getAddressActivity
- "create a token MoonCoin MOON supply 1000000" → deployToken
- "deploy this bytecode 0x.." → deployContract
- "schedule 2 ${NATIVE_SYMBOL} to alice tomorrow at 5pm" → scheduleTransfer
- "payment link for 0.5 ${NATIVE_SYMBOL}" → createPaymentLink
- "save alice as 0x.." → saveContact ; "who is alice" → resolveContact
- "store this asset <link>" → storeAsset ; "my assets" → listAssets

## Signing
Write actions (send, deploy, schedule, store) are signed server-side using the user's connected credentials. If a write tool reports that no credentials are configured, tell the user to open **Wallet Credentials** in the sidebar and enter their public + private key, then confirm.

## Formatting
- Use **bold** for key terms, backticks for addresses/hashes.
- Keep responses short; the cards carry the detail.
- Never invent transaction hashes, addresses, or balances — only report what a tool returns.`

export async function POST(req: Request) {
  const body = await req.json()
  const messages = body.messages ?? []
  const credentials = body.credentials ?? {}
  const publicKey: string | undefined = credentials.publicKey || body.publicKey || undefined
  const privateKey: string | undefined = credentials.privateKey || undefined

  const model = getModel()
  if (!model) {
    return new Response(
      JSON.stringify({ error: "No AI model configured. Set MISTRAL_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY." }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
  }

  const requireWallet = () => {
    const w = makeWallet(privateKey)
    if (!w) {
      return {
        error:
          "No wallet credentials configured. Open **Wallet Credentials** in the sidebar, enter your public + private key, and confirm.",
      }
    }
    return w
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
        parameters: z.object({ address: z.string().optional().describe("0x address; optional") }),
        execute: async ({ address }) => {
          try {
            const target = address && isAddress(address) ? address : publicKey
            if (!target || !isAddress(target)) return { error: "No valid address available." }
            const bal = await publicClient.getBalance({ address: target as Hex })
            const balance = formatEther(bal)
            const price = await sonicUsdPrice()
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
        description: "Get an ERC-20 token balance for an address. Accepts a token symbol (e.g. USDT) or token contract address.",
        parameters: z.object({
          token: z.string().describe("Token symbol or 0x contract address"),
          address: z.string().optional(),
        }),
        execute: async ({ token, address }) => {
          try {
            const target = address && isAddress(address) ? address : publicKey
            if (!target || !isAddress(target)) return { error: "No valid address available." }
            const info = findToken(token)
            const tokenAddr = info?.address && isAddress(info.address) ? info.address : token
            if (!isAddress(tokenAddr)) return { error: `Unknown token: ${token}` }
            const [raw, decimals, symbol] = await Promise.all([
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "balanceOf", args: [target as Hex] }),
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "decimals" }),
              publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "symbol" }),
            ])
            return {
              kind: "balance",
              address: target,
              balance: parseFloat(formatUnits(raw as bigint, Number(decimals))).toFixed(4),
              symbol: symbol as string,
            }
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
              if (bn < 0n) break
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

      getMarketData: tool({
        description: `Get market data (price, market cap, volume) for Sonic / ${NATIVE_SYMBOL}.`,
        parameters: z.object({}),
        execute: async () => {
          try {
            const res = await fetch(
              "https://api.coingecko.com/api/v3/coins/sonic-3?localization=false&tickers=false&community_data=false&developer_data=false",
              { headers: { accept: "application/json" } },
            )
            if (!res.ok) return { error: "Market data unavailable right now." }
            const j = await res.json()
            const md = j.market_data
            return {
              kind: "market",
              name: j.name,
              symbol: (j.symbol || NATIVE_SYMBOL).toUpperCase(),
              price: md?.current_price?.usd ?? null,
              marketCap: md?.market_cap?.usd ?? null,
              volume24h: md?.total_volume?.usd ?? null,
              change24h: md?.price_change_percentage_24h ?? null,
            }
          } catch {
            return { error: "Market data unavailable right now." }
          }
        },
      }),

      getAddressActivity: tool({
        description: "Get recent transactions for an address from the Sonic explorer.",
        parameters: z.object({ address: z.string().optional() }),
        execute: async ({ address }) => {
          try {
            const target = address && isAddress(address) ? address : publicKey
            if (!target || !isAddress(target)) return { error: "No valid address available." }
            const res = await fetch(`${BLOCKSCOUT_API}/addresses/${target}/transactions?filter=to%20%7C%20from`, {
              headers: { accept: "application/json" },
            })
            if (!res.ok) return { error: "Could not load activity." }
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
          } catch {
            return { error: "Could not load activity." }
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

      // ── WRITE (server-side signing via credentials) ─────────────────────────
      sendPayment: tool({
        description: `Send ${NATIVE_SYMBOL} (native) or an ERC-20 token to an address or a saved contact name. Signs and broadcasts the transaction.`,
        parameters: z.object({
          to: z.string().describe("0x address or saved contact name"),
          amount: z.string().describe("Human amount, e.g. 1.5"),
          token: z.string().optional().describe(`Token symbol/address; omit for native ${NATIVE_SYMBOL}`),
        }),
        execute: async ({ to, amount, token }) => {
          const w = requireWallet()
          if ("error" in w) return w
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}". Provide a 0x address or save them as a contact first.` }
          try {
            const isNative = !token || token.toUpperCase() === NATIVE_SYMBOL
            if (isNative) {
              const hash = await w.client.sendTransaction({ to: recipient as Hex, value: parseEther(amount) })
              return { kind: "transaction", status: "Submitted", action: "send", hash, from: w.account.address, to: recipient, value: `${amount} ${NATIVE_SYMBOL}`, explorerUrl: explorerTx(hash) }
            }
            const info = findToken(token!)
            const tokenAddr = info?.address && isAddress(info.address) ? info.address : token!
            if (!isAddress(tokenAddr)) return { error: `Unknown token: ${token}` }
            const decimals = info?.decimals ?? Number(await publicClient.readContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "decimals" }))
            const hash = await w.client.writeContract({ address: tokenAddr as Hex, abi: ERC20_ABI, functionName: "transfer", args: [recipient as Hex, parseUnits(amount, decimals)] })
            return { kind: "transaction", status: "Submitted", action: "send", hash, from: w.account.address, to: recipient, value: `${amount} ${info?.symbol ?? token}`, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Transaction failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployToken: tool({
        description: "Deploy a new ERC-20 token on Sonic Testnet. Mints the full supply to the deployer.",
        parameters: z.object({
          name: z.string(),
          symbol: z.string(),
          supply: z.string().describe("Initial supply in whole tokens, e.g. 1000000"),
        }),
        execute: async ({ name, symbol, supply }) => {
          const w = requireWallet()
          if ("error" in w) return w
          try {
            const hash = await w.client.deployContract({
              abi: ASTRAX_TOKEN_ABI,
              bytecode: ASTRAX_TOKEN_BYTECODE,
              args: [name, symbol, BigInt(supply)],
            })
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            return { kind: "deploy", what: "token", name, symbol, supply, contractAddress: receipt.contractAddress, hash, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Deploy failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      deployContract: tool({
        description: "Deploy a contract from raw compiled creation bytecode (0x...).",
        parameters: z.object({ bytecode: z.string().describe("0x-prefixed creation bytecode") }),
        execute: async ({ bytecode }) => {
          const w = requireWallet()
          if ("error" in w) return w
          try {
            const bc = (bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`) as Hex
            const hash = await w.client.deployContract({ abi: [], bytecode: bc })
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            return { kind: "deploy", what: "contract", contractAddress: receipt.contractAddress, hash, explorerUrl: explorerTx(hash) }
          } catch (e: any) {
            return { error: `Deploy failed: ${(e?.shortMessage || e?.message || "unknown error").slice(0, 160)}` }
          }
        },
      }),

      scheduleTransfer: tool({
        description: `Schedule a future transfer of ${NATIVE_SYMBOL} or a token. Accepts natural times like "in 10 minutes", "tomorrow at 5pm", or an ISO date.`,
        parameters: z.object({
          to: z.string(),
          amount: z.string(),
          when: z.string(),
          token: z.string().optional(),
        }),
        execute: async ({ to, amount, when, token }) => {
          const w = requireWallet()
          if ("error" in w) return w
          const runAt = parseWhen(when)
          if (!runAt) return { error: `Could not understand the time "${when}". Try "in 10 minutes" or "2026-01-01 17:00".` }
          const recipient = await resolveRecipient(to)
          if (!recipient) return { error: `Could not resolve recipient "${to}".` }
          const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          const schedule: ScheduledTransfer = {
            id, to: recipient, amount, token, owner: w.account.address, runAt: runAt.toISOString(), status: "pending",
          }
          await addSchedule(schedule)

          // Best-effort in-process execution (works while the dev server runs).
          const delay = runAt.getTime() - Date.now()
          if (delay > 0 && delay < 1000 * 60 * 60 * 24) {
            setTimeout(async () => {
              try {
                const isNative = !token || token.toUpperCase() === NATIVE_SYMBOL
                let hash: Hex
                if (isNative) {
                  hash = await w.client.sendTransaction({ to: recipient as Hex, value: parseEther(amount) })
                } else {
                  const info = findToken(token!)
                  const tokenAddr = (info?.address && isAddress(info.address) ? info.address : token!) as Hex
                  const decimals = info?.decimals ?? Number(await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "decimals" }))
                  hash = await w.client.writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "transfer", args: [recipient as Hex, parseUnits(amount, decimals)] })
                }
                await updateSchedule(id, { status: "sent", txHash: hash })
              } catch (e: any) {
                await updateSchedule(id, { status: "failed", note: e?.shortMessage || e?.message })
              }
            }, delay)
          }

          return { kind: "schedule", id, to: recipient, amount: `${amount} ${token || NATIVE_SYMBOL}`, runAt: runAt.toLocaleString(), note: delay >= 1000 * 60 * 60 * 24 ? "Scheduled far in the future — ensure the server is running at execution time (or wire a cron/queue for production)." : undefined }
        },
      }),

      listSchedules: tool({
        description: "List the user's scheduled transfers.",
        parameters: z.object({}),
        execute: async () => {
          if (!publicKey) return { error: "No wallet address available." }
          const w = makeWallet(privateKey)
          const owner = w?.account.address ?? publicKey
          return { kind: "scheduleList", schedules: await listSchedules(owner) }
        },
      }),

      createPaymentLink: tool({
        description: `Create a shareable payment link requesting ${NATIVE_SYMBOL} to the user's address.`,
        parameters: z.object({ amount: z.string(), description: z.string().optional() }),
        execute: async ({ amount, description }) => {
          const w = makeWallet(privateKey)
          const addr = w?.account.address ?? publicKey
          if (!addr || !isAddress(addr)) return { error: "No wallet address available to receive the payment. Add your public key in Wallet Credentials." }
          const url = `${APP_URL}/payment-link/${addr}/${amount}`
          return { kind: "paymentLink", url, address: addr, amount: `${amount} ${NATIVE_SYMBOL}`, description }
        },
      }),

      storeAsset: tool({
        description: "Store a reference to an asset (e.g. an IPFS link) with a description, owned by the user.",
        parameters: z.object({ link: z.string(), description: z.string() }),
        execute: async ({ link, description }) => {
          const w = makeWallet(privateKey)
          const owner = w?.account.address ?? publicKey
          if (!owner) return { error: "No wallet address available." }
          await addAsset({ link, description, owner, createdAt: new Date().toISOString() })
          return { kind: "asset", link, description, owner, saved: true }
        },
      }),

      listAssets: tool({
        description: "List the user's stored assets.",
        parameters: z.object({}),
        execute: async () => {
          const w = makeWallet(privateKey)
          const owner = w?.account.address ?? publicKey
          if (!owner) return { error: "No wallet address available." }
          return { kind: "assetList", assets: await listAssets(owner) }
        },
      }),

      swap: tool({
        description: "Swap one token for another on a Sonic DEX. Requires a configured DEX router.",
        parameters: z.object({ fromToken: z.string(), toToken: z.string(), amount: z.string() }),
        execute: async ({ fromToken, toToken, amount }) => {
          const router = process.env.SONIC_DEX_ROUTER
          if (!router) {
            return {
              kind: "swap",
              fromCurrency: fromToken,
              toCurrency: toToken,
              amount,
              status: "unavailable",
              note: "No DEX router is configured for Sonic Testnet yet. Set SONIC_DEX_ROUTER to enable on-chain swaps.",
            }
          }
          return { kind: "swap", fromCurrency: fromToken, toCurrency: toToken, amount, status: "router-configured", note: "Router configured — swap execution wiring is a next step." }
        },
      }),
    },
  })

  return result.toDataStreamResponse()
}
