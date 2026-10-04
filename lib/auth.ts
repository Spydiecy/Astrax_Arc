// Server-only wallet ownership sessions ("sign in with Solana").
//
// 1. POST /api/auth/challenge → a human-readable message for one address, plus
//    an HMAC token so the server can later check it issued that exact message.
// 2. The wallet (or the autonomous key, silently) signs the message — free, no
//    transaction.
// 3. POST /api/auth/verify checks the ed25519 signature and sets an HttpOnly
//    cookie listing the addresses this browser has proven it controls.
// Owner-scoped APIs (schedules, payment links, assets) only act for those addresses.
import "server-only"
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import bs58 from "bs58"
import { isValidAddress } from "./solana"

export const SESSION_COOKIE = "astrax_session"
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_ADDRESSES = 5

let warned = false
function secret(): Buffer {
  const s = process.env.AUTH_SECRET
  if (s) return Buffer.from(s)
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not set — refusing to issue sessions in production.")
  }
  if (!warned) {
    console.warn("[astrax] AUTH_SECRET not set — using an insecure dev fallback. Set it before deploying.")
    warned = true
  }
  return Buffer.from(`astrax-dev-auth:${process.env.SCHEDULER_ENC_KEY || "fallback"}`)
}

const mac = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url")

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// ── Challenge ────────────────────────────────────────────────────────────────
export function createChallenge(address: string, origin: string): { message: string; token: string } {
  const now = Date.now()
  const message = [
    `${new URL(origin).host} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to Astrax to view and manage your payment links and scheduled payments. This only proves you own this wallet — it doesn't send a transaction or cost anything.",
    "",
    `URI: ${origin}`,
    `Nonce: ${randomBytes(12).toString("hex")}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(now + CHALLENGE_TTL_MS).toISOString()}`,
  ].join("\n")
  return { message, token: mac(`challenge:${message}`) }
}

// Signed challenges are single-use (per server instance).
const usedNonces = new Map<string, number>()
function consumeNonce(nonce: string, expiresAt: number): boolean {
  const now = Date.now()
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n)
  if (usedNonces.has(nonce)) return false
  usedNonces.set(nonce, expiresAt)
  return true
}

export function verifyChallenge(
  input: { address?: string; message?: string; token?: string; signature?: string },
  origin: string,
): { ok: true; address: string } | { ok: false; error: string } {
  const { address, message, token, signature } = input
  if (!address || !isValidAddress(address) || !message || !token || !signature) return { ok: false, error: "Missing fields." }
  if (!safeEqual(mac(`challenge:${message}`), token)) return { ok: false, error: "Unknown or tampered challenge." }

  const lines = message.split("\n")
  const field = (k: string) => lines.find((l) => l.startsWith(`${k}: `))?.slice(k.length + 2)
  if (lines[1] !== address) return { ok: false, error: "Challenge was issued for a different address." }
  if (field("URI") !== origin) return { ok: false, error: "Challenge was issued for a different site." }
  const exp = Date.parse(field("Expiration Time") || "")
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, error: "Challenge expired. Try again." }

  let sig: Uint8Array
  try {
    sig = Uint8Array.from(Buffer.from(signature, "base64"))
  } catch {
    return { ok: false, error: "Bad signature encoding." }
  }
  let valid = false
  try {
    valid = sig.length === 64 && ed25519.verify(sig, new TextEncoder().encode(message), bs58.decode(address))
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, error: "Signature doesn't match this wallet." }
  if (!consumeNonce(field("Nonce") || "", exp)) return { ok: false, error: "This sign-in was already used." }
  return { ok: true, address }
}

// ── Session cookie ───────────────────────────────────────────────────────────
interface Entry { a: string; e: number }

function readCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || ""
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=")
    if (k === SESSION_COOKIE) return v.join("=")
  }
  return null
}

function decode(value: string | null): Entry[] {
  if (!value) return []
  const [payload, sig] = value.split(".")
  if (!payload || !sig || !safeEqual(mac(`session:${payload}`), sig)) return []
  try {
    const now = Date.now()
    return (JSON.parse(Buffer.from(payload, "base64url").toString()) as Entry[]).filter(
      (x) => x && typeof x.a === "string" && x.e > now && isValidAddress(x.a),
    )
  } catch {
    return []
  }
}

/** Addresses this request has proven it controls (via a valid session cookie). */
export function sessionAddresses(req: Request): string[] {
  try {
    return decode(readCookie(req)).map((x) => x.a)
  } catch {
    return [] // e.g. AUTH_SECRET missing in production
  }
}

export function isOwner(req: Request, address: string | null | undefined): boolean {
  return Boolean(address) && sessionAddresses(req).includes(address as string)
}

/** Set-Cookie header value with `entries` (newest first, capped). */
function cookieHeader(entries: Entry[], secure: boolean): string {
  const list = entries.slice(0, MAX_ADDRESSES)
  const attrs = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
  if (list.length === 0) return `${SESSION_COOKIE}=; ${attrs}; Max-Age=0`
  const payload = Buffer.from(JSON.stringify(list)).toString("base64url")
  return `${SESSION_COOKIE}=${payload}.${mac(`session:${payload}`)}; ${attrs}; Max-Age=${SESSION_TTL_MS / 1000}`
}

export function addToSession(req: Request, address: string, secure: boolean): { header: string; addresses: string[] } {
  const rest = decode(readCookie(req)).filter((x) => x.a !== address)
  const list = [{ a: address, e: Date.now() + SESSION_TTL_MS }, ...rest].slice(0, MAX_ADDRESSES)
  return { header: cookieHeader(list, secure), addresses: list.map((x) => x.a) }
}

export function removeFromSession(req: Request, address: string | null, secure: boolean): { header: string; addresses: string[] } {
  const list = address ? decode(readCookie(req)).filter((x) => x.a !== address) : []
  return { header: cookieHeader(list, secure), addresses: list.map((x) => x.a) }
}

/** Standard 401 body; `needsAuth` tells the UI to offer "Verify wallet". */
export const NOT_OWNER = { error: "Verify this wallet first (sign a free message) to see or change its links and schedules.", needsAuth: true }
