# Astrax — Feature Notes

An AI agent for **Solana** (default cluster: devnet, native token **SOL**, 9 decimals) that
turns natural-language chat into on-chain actions. One Next.js app; the agent is a Vercel AI
SDK route at `/api/agent` (`streamText` + `tool` + `zod`) streamed to the browser via `useChat`.

## Network config
- `NEXT_PUBLIC_CLUSTER`: `devnet` (default) | `testnet` | `mainnet-beta`
- RPC: `SOLANA_RPC_URL` (server) / `NEXT_PUBLIC_RPC_URL` (browser), else the public cluster RPC
- Explorer: `https://explorer.solana.com` (cluster query param added automatically)
- Known tokens (`lib/solana.ts`): SOL, plus Circle's USDC mint for the active cluster

## Frontend
- Landing page, dashboard chat (`/ai-chat`) with collapsible sidebar, theme toggle, chat history.
- **Wallet**: Solana Wallet Adapter; any Wallet Standard wallet (Phantom, Solflare, Backpack…)
  is detected automatically.
- **Signing modes**:
  - *Wallet* — the agent returns a prepared transaction; the user confirms it in-wallet via a
    button in the chat. Token/NFT creation is built in the browser so the new mint keypair can
    co-sign locally.
  - *Autonomous* — the user pastes a base58 (or JSON byte array) secret key; the server signs.
- **Rich chat cards** for balances, transactions, slots, token lists, candlestick charts,
  token/NFT creation, schedules, payment links, contacts, assets and the explain view.
- **Payment links**: `/payment-link/<address>/<amount>` with a Solana Pay QR code and a
  one-click SOL transfer.
- IPFS uploads via Pinata, Mermaid diagrams, optional Gemini image generation, voice input.

## Agent tools
Read: `getBalance`, `getTokenBalance`, `getTransaction`, `getLatestBlocks`, `getBlock`,
`listTokens`, `getMarketData`, `getAddressActivity`, `explain`, `getPriceChart`.

Write: `sendPayment` (SOL or any SPL / Token-2022 token), `deployToken` (Token-2022 mint with
on-chain name/symbol metadata), `deployNFT` (1-of-1, 0 decimals, mint authority revoked,
optional IPFS metadata), `mintTokens`, `scheduleTransfer` / `listSchedules` /
`cancelSchedule`, `createPaymentLink`.

Utility: address book (`saveContact`, `resolveContact`, `listContacts`), assets
(`storeAsset`, `listAssets`), `generateDiagram`, `generateImage`, `swap` (stub until a DEX is
configured via `SOLANA_DEX`).

Not supported: deploying arbitrary on-chain programs from chat.

## Scheduled payments
Autonomous mode only. The secret key is AES-256-GCM encrypted (`SCHEDULER_ENC_KEY`) and stored
in SQLite (`.data/astrax.db`); `/api/cron/execute` (Vercel Cron, guarded by `CRON_SECRET` in
production) signs due jobs and wipes the key once a job finishes or is cancelled.

## Security note
Letting the agent hold a raw secret key is inherently risky. It's opt-in, kept out of prompts
and logs, and intended for devnet. On mainnet, use wallet signing.
