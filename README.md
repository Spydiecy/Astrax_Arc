# Astrax 🚀

**AI agent for Solana.** Chat in plain English and Astrax turns it into on-chain
actions: check balances, send SOL and SPL tokens, create tokens and NFTs, schedule
payments, share tracked payment links, and explain any transaction or address.

One Next.js app. The agent is a streaming route built on the
[Vercel AI SDK](https://sdk.vercel.ai), with typed tools backed by `@solana/web3.js`
and `@solana/spl-token`. See [`FEATURES.md`](FEATURES.md) for the full feature list and
how each part works.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev
```

Open http://localhost:3000, launch the assistant, and pick a signing mode in the
sidebar **Signing** panel: connect a wallet, or paste a devnet secret key.

### Environment

| Variable | Needed for |
|---|---|
| `MISTRAL_API_KEY` | The agent (default model `ministral-8b-latest`). Or set `GOOGLE_GENERATIVE_AI_API_KEY` for Gemini. |
| `ASTRAX_MODEL` | Optional model override. |
| `NEXT_PUBLIC_CLUSTER` | `devnet` (default), `testnet` or `mainnet-beta`. |
| `SOLANA_RPC_URL` / `NEXT_PUBLIC_RPC_URL` | Optional RPC override (server / browser). |
| `AUTH_SECRET` | Signs wallet-ownership sessions. **Required in production.** |
| `SCHEDULER_ENC_KEY` | Encrypts keys stored for scheduled payments. |
| `CRON_SECRET` | Protects `/api/cron/execute` in production. |
| `PINATA_JWT`, `PINATA_GATEWAY` | File uploads and NFT metadata on IPFS (server-only). |
| `NEXT_PUBLIC_GEMINI_KEY` | Optional AI image generation. |

Generate secrets with `openssl rand -hex 32`. Links (payment links, etc.) use the
domain the app is opened on, so no base-URL setting is needed.

---

## Architecture

```
Browser (useChat) ──POST──▶ /api/agent  (streamText + typed tools)
                               ├─ read tools  → Solana RPC, Coinbase / CoinGecko
                               └─ write tools → autonomous: sign server-side with the key
                                                wallet: return a tx the user confirms
Browser ──▶ /api/upload        → Pinata (public IPFS)
Browser ──▶ /api/auth/*        → wallet-ownership session (signed message → cookie)
Browser ──▶ /api/schedules, /api/payment-links  (owner-only)
Payers  ──▶ /pay/<id>          → Solana Pay transfer, verified on-chain
Cron    ──▶ /api/cron/execute  → runs due scheduled payments
```

**Where data lives:**
- **Chats:** only in the user's browser (localStorage), for privacy. Clearing site data
  or a private window deletes them, and they don't sync across devices.
- **Scheduled payments and payment links:** SQLite at `.data/astrax.db`.
- **Address book and stored assets:** a JSON file at `.data/astrax.json`.

---

## Deploying

The `.data/` storage is a local file, which works for `npm run dev`, `npm start` or any
server with a persistent disk. **It does not work on Vercel as-is.** Vercel functions
have a read-only, temporary filesystem, so scheduled payments, payment links and the
address book need a hosted database there. Vercel's Hobby plan also only runs cron
jobs once a day, while `vercel.json` asks for every minute.

---

## Security notes

- **Autonomous mode** signs server-side with the secret key the user pastes. The key
  is sent in the request body (never the prompt) and never logged. For scheduled
  payments it's stored AES-256-GCM encrypted and wiped when the job finishes. Intended
  for devnet; on mainnet use wallet signing.
- **Owner-only data:** payment links, schedules and stored assets are only shown to a
  browser that proved it controls the address, via a free signed message (wallet mode)
  or the loaded key (autonomous). Sessions are HttpOnly cookies.
- **Payment links** can only be paid by someone other than their creator.
- **`/api/upload` has no login.** It's rate-limited (20 uploads/min per IP), capped at
  10 MB and restricted by file type.
- **The address book is shared by everyone** using the same server. It isn't
  per-wallet.
- No secrets are hardcoded; everything comes from the environment.
