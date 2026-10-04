// Transaction builders for native SOL and SPL tokens. Isomorphic: used server-side
// (autonomous signing, and preparing wallet-mode transfers) and in the browser
// (wallet-mode token/NFT creation, where the fresh mint keypair must co-sign).
//
// New tokens are created as Token-2022 mints with the metadata extension, so the
// name / symbol / uri live on-chain and show up in wallets and explorers.
// Transfers and mint-to work with both the legacy Token program and Token-2022.
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  TYPE_SIZE,
  LENGTH_SIZE,
  AuthorityType,
  getMint,
  getMintLen,
  getAssociatedTokenAddressSync,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  createSetAuthorityInstruction,
} from "@solana/spl-token"
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata"
import bs58 from "bs58"

export const SOL_DECIMALS = 9

/** Build a Keypair from a base58 secret key or a JSON byte array (Solana CLI format). */
export function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim()
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)))
  return Keypair.fromSecretKey(bs58.decode(s))
}

/** Convert a decimal string ("1.5") into integer base units without float drift. */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const str = String(amount).trim()
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount "${amount}"`)
  const [whole, frac = ""] = str.split(".")
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")
}

async function prep(connection: Connection, tx: Transaction, feePayer: PublicKey) {
  const { blockhash } = await connection.getLatestBlockhash("finalized")
  tx.recentBlockhash = blockhash
  tx.feePayer = feePayer
  return tx
}

/** Resolve which token program owns a mint, plus its decimals. */
export async function getMintInfo(
  connection: Connection,
  mint: PublicKey,
): Promise<{ programId: PublicKey; decimals: number }> {
  const acc = await connection.getAccountInfo(mint)
  if (!acc) throw new Error("Mint account not found")
  let programId: PublicKey
  if (acc.owner.equals(TOKEN_2022_PROGRAM_ID)) programId = TOKEN_2022_PROGRAM_ID
  else if (acc.owner.equals(TOKEN_PROGRAM_ID)) programId = TOKEN_PROGRAM_ID
  else throw new Error("That address is not a token mint")
  const info = await getMint(connection, mint, "confirmed", programId)
  return { programId, decimals: info.decimals }
}

/**
 * Native SOL transfer. `references` (Solana Pay) are added as read-only,
 * non-signer keys so the payment can later be found with getSignaturesForAddress.
 */
export async function buildSolTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  amount: string | number,
  references: PublicKey[] = [],
): Promise<Transaction> {
  const lamports = toBaseUnits(amount, SOL_DECIMALS)
  if (lamports <= 0n) throw new Error("Amount must be greater than zero")
  const ix = SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
  for (const ref of references) ix.keys.push({ pubkey: ref, isSigner: false, isWritable: false })
  const tx = new Transaction().add(ix)
  return prep(connection, tx, from)
}

/** SPL token transfer (creates the recipient's token account if it doesn't exist). */
export async function buildTokenTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  mint: PublicKey,
  amount: string | number,
  decimals: number,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<Transaction> {
  const units = toBaseUnits(amount, decimals)
  if (units <= 0n) throw new Error("Amount must be greater than zero")
  const fromAta = getAssociatedTokenAddressSync(mint, from, true, programId)
  const toAta = getAssociatedTokenAddressSync(mint, to, true, programId)
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, mint, programId),
    createTransferCheckedInstruction(fromAta, mint, toAta, from, units, decimals, [], programId),
  )
  return prep(connection, tx, from)
}

export interface CreateTokenParams {
  name: string
  symbol: string
  /** Off-chain JSON metadata / image URI (optional). */
  uri?: string
  decimals: number
  supply: string | number
  /** Revoke the mint authority after minting (fixed supply — used for NFTs). */
  fixedSupply?: boolean
}

/**
 * Create a Token-2022 mint with on-chain metadata, create the owner's token
 * account and mint the full supply to it. The returned `mint` keypair MUST
 * co-sign the transaction.
 */
export async function buildCreateToken(
  connection: Connection,
  owner: PublicKey,
  params: CreateTokenParams,
): Promise<{ tx: Transaction; mint: Keypair }> {
  const programId = TOKEN_2022_PROGRAM_ID
  const mint = Keypair.generate()
  const amount = toBaseUnits(params.supply, params.decimals)

  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name: params.name.slice(0, 32),
    symbol: params.symbol.slice(0, 10),
    uri: params.uri || "",
    additionalMetadata: [],
  }
  // The mint account is allocated for the extension only; the metadata
  // initialize instruction reallocs, so fund rent for the final size up front.
  const mintLen = getMintLen([ExtensionType.MetadataPointer])
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen)
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner, false, programId)

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, owner, mint.publicKey, programId),
    createInitializeMintInstruction(mint.publicKey, params.decimals, owner, null, programId),
    createInitializeInstruction({
      programId,
      metadata: mint.publicKey,
      updateAuthority: owner,
      mint: mint.publicKey,
      mintAuthority: owner,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint.publicKey, programId),
  )
  if (amount > 0n) tx.add(createMintToInstruction(mint.publicKey, ata, owner, amount, [], programId))
  if (params.fixedSupply) {
    tx.add(createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.MintTokens, null, [], programId))
  }
  await prep(connection, tx, owner)
  return { tx, mint }
}

/** Mint more units of an existing mint to a recipient (owner must be the mint authority). */
export async function buildMintTo(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  to: PublicKey,
  amount: string | number,
  decimals: number,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): Promise<Transaction> {
  const units = toBaseUnits(amount, decimals)
  if (units <= 0n) throw new Error("Amount must be greater than zero")
  const ata = getAssociatedTokenAddressSync(mint, to, true, programId)
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, to, mint, programId),
    createMintToInstruction(mint, ata, owner, units, [], programId),
  )
  return prep(connection, tx, owner)
}

/** Serialize an unsigned tx to base64 for the client to sign. */
export function serializeTx(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")
}

/** Decode a base64 transaction (browser-safe, no global Buffer needed). */
export function deserializeTx(b64: string): Transaction {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return Transaction.from(bytes)
}
