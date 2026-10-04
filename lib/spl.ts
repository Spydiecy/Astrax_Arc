// Server-only helpers for building Solana transactions (native + SPL token).
// Transactions are returned unsigned (feePayer + recent blockhash set) so they can
// either be signed server-side (autonomous mode) or serialized and signed in the
// user's wallet (wallet mode).
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"
import bs58 from "bs58"

/** Build a Keypair from a base58 secret key or a JSON byte array. */
export function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim()
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)))
  return Keypair.fromSecretKey(bs58.decode(s))
}

export function toLamports(amount: string | number): number {
  return Math.round(Number(amount) * LAMPORTS_PER_SOL)
}

function toBaseUnits(amount: string | number, decimals: number): bigint {
  // Avoid float drift for large decimals by working on the string.
  const [whole, frac = ""] = String(amount).split(".")
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")
}

async function prep(connection: Connection, tx: Transaction, feePayer: PublicKey) {
  const { blockhash } = await connection.getLatestBlockhash("finalized")
  tx.recentBlockhash = blockhash
  tx.feePayer = feePayer
  return tx
}

/** Native SOL transfer. */
export async function buildSolTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  amount: string | number,
): Promise<Transaction> {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: toLamports(amount) }),
  )
  return prep(connection, tx, from)
}

/** SPL token transfer (creates the recipient's token account if needed). */
export async function buildTokenTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  mint: PublicKey,
  amount: string | number,
  decimals: number,
): Promise<Transaction> {
  const fromAta = getAssociatedTokenAddressSync(mint, from)
  const toAta = getAssociatedTokenAddressSync(mint, to)
  const tx = new Transaction()
  const toInfo = await connection.getAccountInfo(toAta)
  if (!toInfo) tx.add(createAssociatedTokenAccountInstruction(from, toAta, to, mint))
  tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, from, toBaseUnits(amount, decimals), decimals))
  return prep(connection, tx, from)
}

/**
 * Create a new SPL token: mint account + the owner's token account, minting the
 * full supply to the owner. The returned `mint` keypair must also sign the tx.
 */
export async function buildCreateToken(
  connection: Connection,
  owner: PublicKey,
  decimals: number,
  supply: string | number,
): Promise<{ tx: Transaction; mint: Keypair }> {
  const mint = Keypair.generate()
  const rent = await getMinimumBalanceForRentExemptMint(connection)
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner)
  const amount = toBaseUnits(supply, decimals)
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint.publicKey, decimals, owner, owner),
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint.publicKey),
  )
  if (amount > 0n) tx.add(createMintToInstruction(mint.publicKey, ata, owner, amount))
  await prep(connection, tx, owner)
  return { tx, mint }
}

/** Mint more units of an existing mint to a recipient (owner must be mint authority). */
export async function buildMintTo(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  to: PublicKey,
  amount: string | number,
  decimals: number,
): Promise<Transaction> {
  const ata = getAssociatedTokenAddressSync(mint, to)
  const tx = new Transaction()
  const info = await connection.getAccountInfo(ata)
  if (!info) tx.add(createAssociatedTokenAccountInstruction(owner, ata, to, mint))
  tx.add(createMintToInstruction(mint, ata, owner, toBaseUnits(amount, decimals)))
  return prep(connection, tx, owner)
}

/** Serialize an unsigned/partially-signed tx to base64 for the client to sign. */
export function serializeTx(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")
}
