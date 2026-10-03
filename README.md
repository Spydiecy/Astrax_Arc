# Astrax 🚀

**AI agent for the Sonic Testnet.** Chat in plain English and Astrax turns it into
on-chain actions — check balances, send tokens, deploy contracts, schedule payments,
create payment links, and explore the chain.

Astrax keeps the frontend and tool surface of the original ASTRA project but runs on a
brand-new backend built with the **[Vercel AI SDK](https://sdk.vercel.ai)** — a single
streaming agent route with typed tools (modelled on the FlarePay agent architecture).

> The original project is archived under `reference/` (its Python/Google-ADK backend was a
> non-functional decoy; its Next.js frontend is the design base for Astrax). See
> `FEATURES.md` for a full feature carry-over note.

---

## Architecture

```
Browser (useChat)  ──POST──▶  /api/agent  (Vercel AI SDK: streamText + tool + zod)
                                   │
                                   ├─ read tools  → viem public client / Blockscout / CoinGecko
                                   └─ write tools → viem wallet client (signs with the user's
                                                     credentials, server-side, never logged)
```

- **One Next.js app.** No separate backend server.
- **Streaming chat** via `@ai-sdk/react` `useChat`, hitting `/api/agent`.
- **Typed tools** in `app/api/agent/route.ts`; each returns structured data that the chat
  renders as a card (balance, transaction, blocks, market, deploy, payment link, …).
- **Model:** Mistral (`MISTRAL_API_KEY`) by default, Google Gemini
  (`GOOGLE_GENERATIVE_AI_API_KEY`) as a fallback.

### Agent tools
`getBalance`, `getTokenBalance`, `getTransaction`, `getLatestBlocks`, `getBlock`,
`listTokens`, `getMarketData`, `getAddressActivity`, `resolveContact`, `saveContact`,
`listContacts`, `sendPayment`, `deployToken`, `deployContract`, `scheduleTransfer`,
`listSchedules`, `createPaymentLink`, `storeAsset`, `listAssets`, `swap`.

The `deployToken` tool deploys a real ERC-20 (source in
`reference/contracts/AstraxToken.sol`, compiled bytecode in `lib/erc20.ts`).

---

## Sonic Testnet
- Chain ID: `14601`
- Native token: `S` (18 decimals)
- RPC: `https://rpc.testnet.soniclabs.com`
- Explorer: `https://explorer.testnet.soniclabs.com`

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in MISTRAL_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
npm run dev
```

Open http://localhost:3000, launch the AI assistant, connect your wallet, and (optionally)
add your wallet keys in **Wallet Credentials** so the agent can sign transactions for you.

---

## Security notes
- Write tools sign **server-side** with the private key you enter in Wallet Credentials.
  This powers Astrax's "one command → done" and scheduling features. Keys are sent in the
  request body (never in the prompt), are never logged, and this targets a **testnet**.
  For mainnet, prefer wallet-based signing.
- No secrets are hardcoded; everything is read from env. The old project's leaked keys are
  **not** carried over.
