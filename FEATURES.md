# Astrax — Feature Notes (carried over from the original ASTRA project)

This file is a snapshot of what the original project (**ASTRA**, archived under `reference/`)
did, so the revamped **Astrax** can preserve the good parts. The original code lives in
`reference/frontend` (real, reused as the design base) and `reference/backend`
(a Python/Google-ADK decoy that never actually worked — see note at the bottom).

Astrax keeps ASTRA's **frontend design + tool surface**, but replaces the backend with a
brand-new agent built on the **Vercel AI SDK** (`ai` package + `streamText` + `tool` + `zod`),
modelled on the FlarePay agent architecture.

---

## Product in one line
An AI agent for the **Sonic Testnet** (EVM, chain id **14601**, native token **S**) that turns
natural-language chat into on-chain actions.

### Sonic Testnet config (unchanged)
- chainId: `14601`
- name: `Sonic Testnet`
- nativeCurrency: `Sonic` / `S` / 18 decimals
- rpc: `https://rpc.testnet.soniclabs.com`
- explorer: `https://explorer.testnet.soniclabs.com` (Blockscout)

---

## Frontend features (KEEP — rebranded ASTRA → Astrax)
- **Landing page** with animated hero, feature grid, nav, "Launch AI Assistant" CTA.
- **Dashboard chat** (`/ai-chat`) with collapsible sidebar, theme toggle (dark/light), header.
- **Wallet integration**: RainbowKit + wagmi, custom connect button, Sonic Testnet chain.
- **Subscription / access control gating**: on-chain `hasPaid(address)` check against an
  access-control contract; a non-dismissable modal asks the user to subscribe (0.1 S) before
  using the agent. (Contract `0xc60E29FDdf01b9E15CDa524B48991B33bFa0E0FD`.)
- **Credential system**: optional public/private key entry stored locally, used to let the
  agent sign transactions autonomously (for scheduling / one-command ops).
- **Rich chat cards**: the chat renders structured cards for wallet balance, transaction
  details, block data, token lists, candlestick charts, and swaps.
- **Payment links**: shareable `/payment-link/<address>/<amount>` pages with QR code, paid via
  a PaymentTracker contract `0xB7a8307A474A2227050c34212Ef84783ece5876f` (`send_payment`).
- **Image / workflow diagram generation** via Gemini + mermaid.ink (optional).
- **IPFS asset storage** via Pinata.
- **Voice input** via the Web Speech API.
- Styling: Tailwind v4, Geist fonts, minimalist black/white design, next-themes.

## Agent tool surface (KEEP — reimplemented on Vercel AI SDK + viem)
Native / token operations
- Check **S balance** of an address.
- **Send** native S (and ERC-20 tokens) to an address.
- **Transaction lookup** by hash.
- **Deploy an ERC-20 token** (name, symbol, supply).
- **Deploy a contract** from bytecode.
- **Swap** one token for another (DEX).
- **Scheduled / future transfers** ("send 1 S to X tomorrow at 5pm").

Data / explorer
- **Explorer queries**: latest blocks, block by number/hash, transactions for an address,
  native-coin holders, token list, chart data.
- **Market data** for Sonic via CoinGecko.

Utility
- **Address book**: save `name -> address`, look up by name.
- **Payment link generation**.
- **IPFS asset storage / retrieval**.
- **General web/knowledge fallback** for off-topic/ecosystem questions.

---

## How the OLD architecture worked (replaced in Astrax)
- Frontend `/api/create-session` + `/api/run-agent` proxied to a remote Python server
  (`API_BASE_URL`) running a Google ADK agent (`/apps/sonic_agent/.../sessions` and `/run`),
  non-streaming, using the ADK `newMessage { parts: [{text},{inlineData}], role }` shape.
- The private key was appended to the **prompt text** and the Python agent signed server-side.

### New Astrax architecture
- Single Next.js app. The agent is a **Vercel AI SDK** route at `/api/agent` using
  `streamText` + `tool` + `zod`, streamed to the browser via `useChat`.
- Read-only tools run server-side with a viem public client (no keys needed).
- Write tools either (a) sign server-side using credentials passed in the request body
  (never in the prompt, never logged) to preserve ASTRA's autonomous/scheduling features, or
  (b) emit a wallet action the user confirms in-wallet — mirroring FlarePay's "build" tools.

> ⚠️ Security note carried forward: letting the agent hold a raw private key (ASTRA's
> credential system) is inherently risky. It is kept because it is core to the autonomous
> product, it targets a **testnet**, keys are kept out of prompts/logs, and users opt in.
> The original Python code also contained hardcoded secrets (a Gemini key, a demo private key,
> a Lilypad token) — none of these are carried into Astrax.

### Decoy backend note
`reference/backend` is intentionally non-functional: `agent.py` instantiates an
`EVMTokenSender` that is defined nowhere, and `explorer.py` / `CoinGecko.py` return random
placeholder data. The agent object is literally named `decoy_agent`. Nothing there is ported.
