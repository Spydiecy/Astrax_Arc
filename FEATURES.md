# Astrax — Features

An AI agent for **Arc**, Circle's EVM-compatible Layer-1 where **USDC is the native gas
token**, that turns chat into on-chain actions on **Arc Mainnet** and **Arc Testnet**.

## Networks
- **Arc Mainnet** (chain id `5042`, RPC `https://rpc.mainnet.arc.io`, explorer
  `explorer.arc.io`) and **Arc Testnet** (chain id `5042002`, RPC
  `https://rpc.testnet.arc.io`, explorer `explorer.testnet.arc.io`).
- **Network switcher** in the top bar. Switching re-points the agent, balances, payment
  links, schedules and explorer links, and asks the wallet to switch chains. Changing
  chains inside the wallet moves the app too, and a banner offers a one-click fix if they
  ever disagree. The choice is remembered per browser.
- `NEXT_PUBLIC_DEFAULT_NETWORK` (`mainnet` | `testnet`, default testnet) sets where
  first-time visitors land. `NEXT_PUBLIC_ARC_MAINNET_RPC_URL` /
  `NEXT_PUBLIC_ARC_TESTNET_RPC_URL` add your own RPC endpoints in front of the public ones.
- USDC has two views of one balance: native (18 decimals, used for gas and plain
  transfers) and an ERC-20 at `0x3600…0000` (6 decimals). Astrax reads and sends the
  native balance and keeps amounts to 6 decimals.
- Every transaction sets `maxFeePerGas` above Arc's 20 gwei mempool floor, so nothing is
  silently dropped.
- Known tokens (`lib/arc.ts`): USDC, EURC, USYC, cirBTC and WETH on each network. Any other
  ERC-20 works by contract address.

## Chat
- Streaming replies from Mistral `ministral-8b-latest` (Gemini fallback). Each tool
  result renders as a card under the reply, and remembers the network it ran on.
- **Copy** any message, **edit** your own (it reruns from there), **regenerate** the
  latest reply. If the run being replaced already moved funds, you're warned first.
- **Chat history** with rename (pencil icon, double-click, or F2) and delete.
- **Stored only in your browser** (localStorage), for privacy. Nothing about your chats
  is kept on the server. Clearing site data or using a private window deletes them, and
  they don't sync to other devices. Large generated images aren't kept in history.
- Saves while a reply streams and syncs between open tabs. A failed request keeps your
  message and shows **Retry**.
- Replies render markdown (links, lists, tables, code). Raw HTML is never rendered.
- Image attachments (PNG, JPG, GIF, WebP, up to 10 MB, 4 per message) upload to IPFS
  through the server (`/api/upload`) as soon as you pick them. Each shows a thumbnail
  and "Uploaded to IPFS" (or why it was rejected). The server checks the file's real
  bytes, so a renamed non-image is refused. Voice input via the browser's speech API.

## Wallet and signing
- **Wallet mode:** RainbowKit with MetaMask, Rabby, Coinbase Wallet, Rainbow, Trust and
  WalletConnect (set `NEXT_PUBLIC_WC_PROJECT_ID`), or any injected EVM wallet. The agent
  prepares each transaction and a confirm button appears under its reply; it switches the
  wallet to the right Arc network first. Confirmed transactions are remembered, so a
  reload never offers to pay twice.
- **Autonomous mode:** paste a private key (64 hex characters, with or without `0x`).
  The server signs immediately. There are no buttons. Use a dedicated wallet; on Mainnet
  it moves real USDC.
- The agent is told only the active mode and network, so replies match them.

## Agent tools
- **Read:** `getBalance`, `getTokenBalance`, `getTransaction`, `getLatestBlocks`,
  `getBlock`, `listTokens`, `getMarketData`, `getAddressActivity`, `explain`,
  `getPriceChart`.
- **Write:**
  - `sendPayment`: native USDC, or any ERC-20 (EURC, WETH, cirBTC, a contract address).
  - `deployToken`: deploys `AstraxToken` (ERC-20, custom decimals, full supply to you,
    you stay the owner).
  - `deployNFT`: deploys `AstraxNFT`, a 1-of-1 ERC-721. Needs an attached image; the
    server uses the real upload (never a URL the model typed) and pins standard metadata
    JSON (`name`, `symbol`, `description`, `image`, `properties.files`) to IPFS, which
    becomes the token's `tokenURI`.
  - `mintTokens`: mint more of an Astrax token you own.
  - `deployContract`: write, compile and deploy a custom Solidity contract (see below).
  - `callContract`: call any function on a deployed contract.
  - `scheduleTransfer` / `listSchedules` / `cancelSchedule`.
  - `createPaymentLink` / `listPaymentLinks`.
- **Contracts:** `listContracts` shows what you've deployed.
- **Utility:** contacts (`saveContact`, `resolveContact`, `listContacts`,
  `deleteContact`), assets (`storeAsset`, `listAssets`), `generateDiagram` (Mermaid),
  `generateImage` (Gemini, optional), and `swap` (a stub until a DEX is configured via
  `ARC_DEX`).
- `getPriceChart` uses Coinbase candles when a market exists and CoinGecko OHLC otherwise
  (this covers USDC and EURC). If neither has data it says so rather than inventing a
  series. The chart scales its axis to the real range, so a stablecoin around $1 shows
  readable prices like $0.9998 instead of a flat line.
- `getAddressActivity` uses the network's Blockscout API when reachable and otherwise
  scans recent USDC Transfer logs (the last few hours).

## Custom contracts
- Ask for a contract in plain English ("create and deploy a simple counter"). The agent
  writes the Solidity, and `deployContract` compiles it on the server with `solc` 0.8.28
  (optimizer on, `cancun` EVM target). Self-contained sources work, as do OpenZeppelin v5
  imports (`@openzeppelin/contracts/...`); no other imports are available.
- Compile errors come back with the failing line and a hint for common OpenZeppelin v5
  mistakes (no `Counters.sol`, `Ownable(msg.sender)`), so the agent can fix and retry.
- Before anything is signed, the deployment is dry-run against the chain (constructor
  reverts show up as an error, and the gas estimate is shown). Sources are capped at
  40,000 characters, contracts at the 24,576-byte limit, and compiles are rate-limited.
- **Wallet mode:** the confirm button shows the contract name, its functions and the gas
  estimate, switches the wallet to the right network and deploys. The bytecode stays on the
  server (fetched by id), and the address is stored only after the server re-reads the
  deployment from the chain and checks it matches what was compiled, from your wallet.
- **Autonomous mode:** compiled and deployed straight away.
- The ABI is saved per network, so afterwards `callContract` works by function name
  ("increment the counter", "what's the count?"): view/pure functions return their value
  immediately, others are simulated first and then sent (payable ones can carry USDC).
  For a contract Astrax didn't deploy, give a full signature such as
  `balanceOf(address) view returns (uint256)`.
- **Smart contracts tab** (sidebar): every contract you deployed through Astrax (custom
  contracts, plus tokens and NFTs created from chat) on the selected network, with its address (copy, explorer link), deploy date and the live value
  of its no-argument read functions (a counter's `count`, for example). Tap a function chip
  and Astrax fills the chat box with a ready prompt ("Call increment on Counter (0x…)"),
  so you review it and press Enter; a write never fires from a tap alone. "Remove" only
  hides a contract from the list (it stays on-chain and Astrax keeps its ABI). Needs a
  verified wallet, like the other tabs.
- **The agent works with your contracts by name.** Your deployed contracts and their
  functions are given to it on every request, so "increment the counter", "what's the
  count?" or "call setNote on Vault" go straight to `callContract`, which accepts a
  contract name or an address. Reads answer immediately; writes are simulated first and then
  sent (wallet mode shows a confirm button, autonomous mode signs).
- Constructor and call arguments are parsed into typed values: integers, addresses, bools,
  bytes, arrays and tuples (as JSON).

## Built-in contracts
- Sources in `contracts/`: `AstraxToken.sol` (ERC-20 with owner-only `mint`) and
  `AstraxNFT.sol` (1-of-1 ERC-721, token #1 minted to the deployer, no further minting).
- `npm run compile:contracts` compiles them with `solc` into `lib/contracts.ts` (ABI +
  bytecode), which the agent and the browser both use.

## Payment links
- Created in chat ("payment link for 50 USDC for logo design") on the selected network.
  Saved in the database, shared as `/pay/<id>` on whatever domain the app is opened on.
  The link always opens on the network it was created on.
- **Pay page:** amount, description, a Pay button (switches the payer's wallet to the
  right network) and a QR code that opens the page on a phone. It refreshes every
  5 seconds while open.
- **Tracking:** each link has a random 32-byte reference. The pay page sends a plain USDC
  transfer to the creator with that reference as calldata, then reports the hash. The
  server re-reads the transaction and only marks the link **paid** (with hash, payer and
  time) if it succeeded, went to the right address, carried the reference and paid at
  least the amount. Without a report, it scans recent USDC Transfer logs to the creator.
- **Only payable by others:** the creator sees no Pay button, and payments they make
  don't count.
- **Sidebar "Payment links" tab:** status, copy, open, the payment transaction, and
  cancel (owner only), for the selected network.
- `/payment-link/<address>/<amount>?network=mainnet|testnet` is a simple, untracked pay page.

## Scheduled payments
- One-time or recurring ("pay alice 100 USDC every week, 4 times"), autonomous mode only.
  Each schedule runs on the network it was created on.
- The key is AES-256-GCM encrypted (`SCHEDULER_ENC_KEY`) in the database, used by the
  runner, and wiped once the job finishes or is cancelled.
- No outside service needed. Any open Astrax tab triggers due jobs every minute, app
  traffic checks after each request, and 24 hourly Vercel crons (`CRON_SECRET`) cover
  the time nobody is online. So: within about a minute while the app is open anywhere,
  otherwise within the hour.
- Each job is claimed atomically, so it's sent once even if triggers overlap. An
  interrupted send is marked failed, never retried, so nothing is paid twice.
- **Sidebar "Scheduled" tab:** list and cancel (owner only), with the failure reason
  for failed runs.

## Contacts
- Each wallet has its own address book, shared across both Arc networks (an address is
  the same on each). Save from chat ("save alice as 0x…") or in the sidebar **Contacts**
  tab (add, edit, delete, copy, search, open in explorer).
- Then just "send 25 USDC to alice" or "schedule 10 USDC to alice every week". Names only
  ever resolve from your own contacts.
- Names are case-insensitive; saving an existing name updates its address. Addresses are
  stored checksummed; the zero address is rejected (Arc forbids sending to it).

## Proving ownership
- Viewing or changing contacts, payment links and schedules (and listing stored assets)
  requires proving you control the address, by signing a free EIP-191 sign-in message:
  - **Wallet mode:** the wallet signs it (one popup, no transaction).
  - **Autonomous mode:** the loaded key signs it silently, in the browser.
- The server verifies the signature and sets an HttpOnly session cookie for 7 days
  (`AUTH_SECRET`). Signed messages are single-use, expire after 5 minutes, and are bound
  to the site's domain. Disconnecting the wallet ends its session.
- Pay pages stay public, since payers need them.

## Storage and deployment
- **Browser:** chats, selected network and signing mode.
- **Database (libSQL):** contacts, schedules, payment links and deployed contracts (each
  tagged with its network) and assets, each row tied to its wallet. It also holds used sign-in nonces and
  rate limits, so those hold across servers.
- **Where:** locally a file at `.data/astrax.db`; on Vercel a hosted Turso database via
  `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (free tier is enough). See the README.
