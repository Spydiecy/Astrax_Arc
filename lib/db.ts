// Server-only database (libSQL — SQLite-compatible).
//
//   • Local dev / any server with a disk: a file at .data/astrax.db (no setup).
//   • Vercel / serverless: a hosted Turso database (free tier is plenty), set via
//     TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Same schema, same code.
//
// Everything here is scoped per wallet ("owner"): each person only ever sees
// their own contacts, scheduled payments, payment links and assets. Callers must
// pass a VERIFIED owner (see lib/auth.ts), never an address the browser claimed.
import "server-only"
import fs from "fs"
import path from "path"
import { createClient, type Client, type InArgs } from "@libsql/client"

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount TEXT NOT NULL,
    token TEXT NOT NULL DEFAULT '',
    next_run INTEGER NOT NULL,
    interval_secs INTEGER NOT NULL DEFAULT 0,
    remaining INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    enc_key TEXT NOT NULL,
    last_tx TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS schedules_owner ON schedules(owner, created_at)`,
  `CREATE INDEX IF NOT EXISTS schedules_due ON schedules(status, next_run)`,
  `CREATE TABLE IF NOT EXISTS payment_links (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount TEXT NOT NULL,
    token TEXT NOT NULL DEFAULT 'SOL',
    description TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'open',
    paid_signature TEXT,
    payer TEXT,
    paid_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS payment_links_owner ON payment_links(owner, created_at)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    owner TEXT NOT NULL,
    name_key TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner, name_key)
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    link TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS assets_owner ON assets(owner, created_at)`,
  // Single-use sign-in challenges (shared across server instances).
  `CREATE TABLE IF NOT EXISTS auth_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  // Fixed-window rate limits (shared across server instances).
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)`,
]

// Columns added after a table first shipped. ALTER TABLE fails harmlessly if the
// column already exists, so these are safe to run on every start.
const MIGRATIONS = [
  // When a run claims a scheduled payment, so two runs can never send it twice.
  `ALTER TABLE schedules ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0`,
]

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined })
  if (process.env.VERCEL) {
    // Vercel functions have a read-only, temporary filesystem: a local file would
    // fail or silently lose data. Refuse loudly instead.
    throw new Error("No database configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (Vercel has no persistent disk).")
  }
  const dir = path.join(process.cwd(), ".data")
  fs.mkdirSync(dir, { recursive: true })
  return createClient({ url: `file:${path.join(dir, "astrax.db")}` })
}

let ready: Promise<Client> | null = null
function db(): Promise<Client> {
  if (!ready) {
    ready = (async () => {
      const c = makeClient()
      await c.batch(SCHEMA, "write")
      for (const sql of MIGRATIONS) {
        try {
          await c.execute(sql)
        } catch (e: any) {
          if (!/duplicate column/i.test(String(e?.message))) throw e
        }
      }
      return c
    })()
    ready.catch(() => { ready = null }) // retry on the next call if setup failed
  }
  return ready
}

type Row = Record<string, unknown>
async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await (await db()).execute({ sql, args })
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]]))) as T[]
}
async function first<T = Row>(sql: string, args: InArgs = []): Promise<T | null> {
  return (await all<T>(sql, args))[0] ?? null
}
async function run(sql: string, args: InArgs = []): Promise<number> {
  return (await (await db()).execute({ sql, args })).rowsAffected
}

// ── Payment links ────────────────────────────────────────────────────────────
export interface PaymentLinkRow {
  id: string
  owner: string
  recipient: string
  amount: string
  token: string
  description: string
  /** Solana Pay reference key: a random public key included in the payment tx so it can be found on-chain. */
  reference: string
  status: "open" | "paid" | "cancelled"
  paid_signature: string | null
  payer: string | null
  paid_at: number | null
  created_at: number
}

export async function insertPaymentLink(l: Pick<PaymentLinkRow, "id" | "owner" | "recipient" | "amount" | "token" | "description" | "reference">): Promise<void> {
  await run(
    `INSERT INTO payment_links (id, owner, recipient, amount, token, description, reference, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    [l.id, l.owner, l.recipient, l.amount, l.token, l.description, l.reference, Date.now()],
  )
}

export function getPaymentLink(id: string): Promise<PaymentLinkRow | null> {
  return first<PaymentLinkRow>(`SELECT * FROM payment_links WHERE id = ?`, [id])
}

export function listPaymentLinksByOwner(owner: string, limit = 100): Promise<PaymentLinkRow[]> {
  return all<PaymentLinkRow>(`SELECT * FROM payment_links WHERE owner = ? ORDER BY created_at DESC LIMIT ?`, [owner, limit])
}

/** Marks an open link paid. Returns false if it was already paid/cancelled. */
export async function markPaymentLinkPaid(id: string, signature: string, payer: string, paidAt: number): Promise<boolean> {
  return (await run(
    `UPDATE payment_links SET status = 'paid', paid_signature = ?, payer = ?, paid_at = ? WHERE id = ? AND status = 'open'`,
    [signature, payer, paidAt, id],
  )) > 0
}

export async function cancelPaymentLink(id: string, owner: string): Promise<boolean> {
  return (await run(`UPDATE payment_links SET status = 'cancelled' WHERE id = ? AND owner = ? AND status = 'open'`, [id, owner])) > 0
}

// ── Scheduled payments ───────────────────────────────────────────────────────
export interface ScheduleRow {
  id: string
  owner: string
  recipient: string
  amount: string
  token: string
  next_run: number
  interval_secs: number
  remaining: number
  status: "active" | "done" | "cancelled" | "failed"
  last_tx: string | null
  note: string | null
  created_at: number
}

export interface NewSchedule {
  id: string
  owner: string
  recipient: string
  amount: string
  token: string
  next_run: number
  interval_secs: number
  remaining: number
  enc_key: string
}

const PUBLIC_COLS = "id, owner, recipient, amount, token, next_run, interval_secs, remaining, status, last_tx, note, created_at"

export async function insertSchedule(s: NewSchedule): Promise<void> {
  await run(
    `INSERT INTO schedules (id, owner, recipient, amount, token, next_run, interval_secs, remaining, status, enc_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [s.id, s.owner, s.recipient, s.amount, s.token, s.next_run, s.interval_secs, s.remaining, s.enc_key, Date.now()],
  )
}

/** Public rows for a user (never includes the encrypted key). */
export function listSchedulesByOwner(owner: string): Promise<ScheduleRow[]> {
  return all<ScheduleRow>(`SELECT ${PUBLIC_COLS} FROM schedules WHERE owner = ? ORDER BY created_at DESC`, [owner])
}

/** Due active jobs (includes enc_key — scheduler use only). */
export function getDueSchedules(now: number): Promise<(ScheduleRow & { enc_key: string; locked_until: number })[]> {
  return all(`SELECT * FROM schedules WHERE status = 'active' AND next_run <= ? ORDER BY next_run ASC LIMIT 25`, [now])
}

/**
 * Atomically claim a due job for one run. Only one caller can win; everyone else
 * gets false. The claim is released by updateAfterRun (locked_until → 0).
 */
export async function claimSchedule(id: string, now: number, leaseMs: number): Promise<boolean> {
  return (await run(
    `UPDATE schedules SET locked_until = ? WHERE id = ? AND status = 'active' AND next_run <= ? AND locked_until = 0`,
    [now + leaseMs, id, now],
  )) > 0
}

/**
 * A claim that expired without being released means a run was cut off mid-send.
 * The payment may or may not have gone out, so never retry it automatically:
 * mark it failed for the owner to check. Returns how many were marked.
 */
export async function failStaleClaims(now: number): Promise<number> {
  return run(
    `UPDATE schedules SET status = 'failed', enc_key = '', locked_until = 0,
       note = 'Interrupted while sending. Check your wallet history before rescheduling.'
     WHERE status = 'active' AND locked_until > 0 AND locked_until < ?`,
    [now],
  )
}

const RUN_FIELDS = new Set(["next_run", "remaining", "status", "last_tx", "note", "locked_until"])
export async function updateAfterRun(id: string, patch: { next_run?: number; remaining?: number; status?: string; last_tx?: string; note?: string; locked_until?: number }): Promise<void> {
  const entries = Object.entries(patch).filter(([k, v]) => RUN_FIELDS.has(k) && v !== undefined)
  if (!entries.length) return
  await run(
    `UPDATE schedules SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`,
    [...entries.map(([, v]) => v as string | number), id],
  )
}

/** When a job is finished/cancelled, wipe the stored key. */
export async function clearKey(id: string): Promise<void> {
  await run(`UPDATE schedules SET enc_key = '' WHERE id = ?`, [id])
}

export async function cancelSchedule(id: string, owner: string): Promise<boolean> {
  return (await run(`UPDATE schedules SET status = 'cancelled', enc_key = '' WHERE id = ? AND owner = ? AND status = 'active'`, [id, owner])) > 0
}

// ── Contacts (per owner) ─────────────────────────────────────────────────────
export interface Contact {
  name: string
  address: string
  updatedAt: number
}
export const MAX_CONTACT_NAME = 40

/** Normalise a contact name: trim, drop a leading "@", collapse spaces. Empty → invalid. */
export function cleanContactName(name: string): string {
  return name.replace(/^@+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_CONTACT_NAME)
}

/** Add or update (same name, case-insensitive) a contact for this owner. */
export async function saveContact(owner: string, name: string, address: string): Promise<Contact> {
  const clean = cleanContactName(name)
  const now = Date.now()
  await run(
    `INSERT INTO contacts (owner, name_key, name, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner, name_key) DO UPDATE SET name = excluded.name, address = excluded.address, updated_at = excluded.updated_at`,
    [owner, clean.toLowerCase(), clean, address, now, now],
  )
  return { name: clean, address, updatedAt: now }
}

export async function getContact(owner: string, name: string): Promise<Contact | null> {
  const r = await first<{ name: string; address: string; updated_at: number }>(
    `SELECT name, address, updated_at FROM contacts WHERE owner = ? AND name_key = ?`,
    [owner, cleanContactName(name).toLowerCase()],
  )
  return r ? { name: r.name, address: r.address, updatedAt: r.updated_at } : null
}

export async function listContacts(owner: string): Promise<Contact[]> {
  const rows = await all<{ name: string; address: string; updated_at: number }>(
    `SELECT name, address, updated_at FROM contacts WHERE owner = ? ORDER BY name_key`,
    [owner],
  )
  return rows.map((r) => ({ name: r.name, address: r.address, updatedAt: r.updated_at }))
}

export async function deleteContact(owner: string, name: string): Promise<boolean> {
  return (await run(`DELETE FROM contacts WHERE owner = ? AND name_key = ?`, [owner, cleanContactName(name).toLowerCase()])) > 0
}

// ── Assets (per owner) ───────────────────────────────────────────────────────
export interface StoredAsset {
  link: string
  description: string
  owner: string
  createdAt: string
}

export async function addAsset(owner: string, link: string, description: string): Promise<void> {
  await run(`INSERT INTO assets (owner, link, description, created_at) VALUES (?, ?, ?, ?)`, [owner, link, description, Date.now()])
}

export async function listAssets(owner: string): Promise<StoredAsset[]> {
  const rows = await all<{ link: string; description: string; created_at: number }>(
    `SELECT link, description, created_at FROM assets WHERE owner = ? ORDER BY created_at DESC LIMIT 200`,
    [owner],
  )
  return rows.map((r) => ({ link: r.link, description: r.description, owner, createdAt: new Date(r.created_at).toISOString() }))
}

// ── Shared security state ────────────────────────────────────────────────────
/** Records a sign-in nonce. Returns false if it was already used (replay). */
export async function consumeNonce(nonce: string, expiresAt: number): Promise<boolean> {
  if (!nonce) return false
  const now = Date.now()
  if (Math.random() < 0.05) await run(`DELETE FROM auth_nonces WHERE expires_at < ?`, [now]) // occasional cleanup
  return (await run(`INSERT INTO auth_nonces (nonce, expires_at) VALUES (?, ?) ON CONFLICT(nonce) DO NOTHING`, [nonce, expiresAt])) > 0
}

/** Fixed-window rate limit. Returns true when `key` has exceeded `max` hits in the window. */
export async function rateLimited(key: string, windowMs: number, max: number): Promise<boolean> {
  const now = Date.now()
  const cutoff = now - windowMs
  if (Math.random() < 0.02) await run(`DELETE FROM rate_limits WHERE window_start < ?`, [cutoff])
  const r = await first<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < ? THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < ? THEN ? ELSE rate_limits.window_start END
     RETURNING count`,
    [key, now, cutoff, cutoff, now],
  )
  return (r?.count ?? 1) > max
}
