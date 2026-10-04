// Server-only SQLite store (Node's built-in node:sqlite — free, zero-install).
// Holds scheduled payments, including the owner's AES-encrypted private key so the
// cron worker can sign when a job is due (Variant 2 — autonomous scheduling only).
import { DatabaseSync } from "node:sqlite"
import { promises as fs } from "fs"
import fssync from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), ".data")
const DB_FILE = path.join(DATA_DIR, "astrax.db")

let _db: DatabaseSync | null = null

function db(): DatabaseSync {
  if (_db) return _db
  if (!fssync.existsSync(DATA_DIR)) fssync.mkdirSync(DATA_DIR, { recursive: true })
  const d = new DatabaseSync(DB_FILE)
  d.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
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
    );
  `)
  _db = d
  return d
}

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

export function insertSchedule(s: NewSchedule): void {
  db()
    .prepare(
      `INSERT INTO schedules (id, owner, recipient, amount, token, next_run, interval_secs, remaining, status, enc_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(s.id, s.owner, s.recipient, s.amount, s.token, s.next_run, s.interval_secs, s.remaining, s.enc_key, Date.now())
}

/** Public rows for a user (never includes the encrypted key). */
export function listSchedulesByOwner(owner: string): ScheduleRow[] {
  return db().prepare(`SELECT ${PUBLIC_COLS} FROM schedules WHERE owner = ? ORDER BY created_at DESC`).all(owner) as any
}

/** Due active jobs (includes enc_key — cron use only). */
export function getDueSchedules(now: number): (ScheduleRow & { enc_key: string })[] {
  return db().prepare(`SELECT * FROM schedules WHERE status = 'active' AND next_run <= ? ORDER BY next_run ASC`).all(now) as any
}

export function updateAfterRun(id: string, patch: { next_run?: number; remaining?: number; status?: string; last_tx?: string; note?: string }): void {
  const fields: string[] = []
  const vals: any[] = []
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`)
    vals.push(v)
  }
  if (!fields.length) return
  vals.push(id)
  db().prepare(`UPDATE schedules SET ${fields.join(", ")} WHERE id = ?`).run(...vals)
}

/** When a job is finished/cancelled, wipe the stored key. */
export function clearKey(id: string): void {
  db().prepare(`UPDATE schedules SET enc_key = '' WHERE id = ?`).run(id)
}

export function cancelSchedule(id: string, owner: string): boolean {
  const res = db()
    .prepare(`UPDATE schedules SET status = 'cancelled', enc_key = '' WHERE id = ? AND owner = ? AND status = 'active'`)
    .run(id, owner)
  return (res.changes ?? 0) > 0
}

export async function dbFileExists(): Promise<boolean> {
  try {
    await fs.access(DB_FILE)
    return true
  } catch {
    return false
  }
}
