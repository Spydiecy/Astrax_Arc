# Astrax 🚀

**AI agent for Solana.** Chat in plain English and Astrax turns it into on-chain
actions — check balances, send SOL and SPL tokens, create tokens and NFTs, schedule
payments, create payment links, and explore the chain.

Astrax runs on a single Next.js app with a streaming agent route built on the
**[Vercel AI SDK](https://sdk.vercel.ai)** — typed tools backed by `@solana/web3.js`
and `@solana/spl-token`.

---

## Architecture

```
Browser (useChat)  ──POST──▶  /api/agent  (Vercel AI SDK: streamText + tool + zod)
                                   │
                                   ├─ read tools  → Solana RPC (web3.js) / Coinbase / CoinGecko
                                   └─ write tools → either sign server-side with the user's
                                                     key (autonomous) or return a prepared
                                                     transaction the user signs in-wallet
```

- **One Next.js app.** No separate backend server.
- **Streaming chat** via `@ai-sdk/react` `useChat`, hitting `/api/agent`.
- **Typed tools** in `app/api/agent/route.ts`; each returns structured data that the chat
  renders as a card (balance, transaction, blocks, market, token/NFT creation, payment
  link, …).
- **Model:** Mistral (`MISTRAL_API_KEY`) by default, Google Gemini
  (`GOOGLE_GENERATIVE_AI_API_KEY`) as a fallback.

### Agent tools
`getBalance`, `getTokenBalance`, `getTransaction`, `getLatestBlocks`, `getBlock`,
`listTokens`, `getMarketData`, `getAddressActivity`, `resolveContact`, `saveContact`,
`listContacts`, `sendPayment`, `deployToken`, `deployNFT`, `mintNFT`, `scheduleTransfer`,
`listSchedules`, `cancelSchedule`, `createPaymentLink`, `storeAsset`, `listAssets`,
`getPriceChart`, `generateDiagram`, `generateImage`, `explain`, `swap`.

`deployToken` creates a real SPL mint and mints the supply to the creator. `deployNFT`
creates an SPL mint with supply 1 (optional IPFS metadata via Pinata).

---

## Network
- Cluster: `devnet` (configurable via `NEXT_PUBLIC_CLUSTER`)
- Native token: `SOL` (9 decimals)
- RPC: public cluster RPC by default (override with `SOLANA_RPC_URL` / `NEXT_PUBLIC_RPC_URL`)
- Explorer: `https://explorer.solana.com`

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in MISTRAL_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
npm run dev
```

Open http://localhost:3000, launch the AI assistant, connect your wallet, and (optionally)
add a base58 secret key in **Signing** so the agent can sign transactions for you.

---

## Security notes
- Write tools can sign **server-side** with the base58 secret key you enter in the Signing
  panel. This powers Astrax's "one command → done" and scheduling features. Keys are sent in
  the request body (never in the prompt), are never logged, and this targets **devnet**.
  For mainnet, prefer wallet-based signing (approve each transaction in your wallet).
- No secrets are hardcoded; everything is read from env.
