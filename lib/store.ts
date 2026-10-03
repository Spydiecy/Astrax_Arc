// Tiny JSON-file-backed store for the agent's stateful tools (address book,
// stored assets, scheduled transfers). Server-only — never import from a client
// component. In a serverless deployment this resets between cold starts; for
// production, swap this for a real DB (Mongo/Postgres/KV). Kept simple on purpose.
import { promises as fs } from "fs"
import path from "path"

const DATA_DIR = path.join(process.cwd(), ".data")
const DB_FILE = path.join(DATA_DIR, "astrax.json")

export interface AddressBookEntry {
  name: string
  address: string
}

export interface StoredAsset {
  description: string
  link: string
  owner: string
  createdAt: string
}

export interface ScheduledTransfer {
  id: string
  to: string
  amount: string
  token?: string
  owner: string
  runAt: string
  status: "pending" | "sent" | "failed"
  txHash?: string
  note?: string
}

interface DB {
  addressBook: AddressBookEntry[]
  assets: StoredAsset[]
  schedules: ScheduledTransfer[]
}

const empty: DB = { addressBook: [], assets: [], schedules: [] }

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8")
    return { ...empty, ...JSON.parse(raw) }
  } catch {
    return { ...empty }
  }
}

async function write(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8")
}

// ── Address book ───────────────────────────────────────────────────────────────
export async function saveAddress(name: string, address: string): Promise<void> {
  const db = await read()
  const existing = db.addressBook.find((e) => e.name.toLowerCase() === name.toLowerCase())
  if (existing) existing.address = address
  else db.addressBook.push({ name, address })
  await write(db)
}

export async function resolveName(name: string): Promise<string | null> {
  const db = await read()
  const e = db.addressBook.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return e?.address ?? null
}

export async function listAddresses(): Promise<AddressBookEntry[]> {
  return (await read()).addressBook
}

// ── Assets ───────────────────────────────────────────────────────────────────
export async function addAsset(a: StoredAsset): Promise<void> {
  const db = await read()
  db.assets.push(a)
  await write(db)
}

export async function listAssets(owner: string): Promise<StoredAsset[]> {
  const db = await read()
  return db.assets.filter((a) => a.owner.toLowerCase() === owner.toLowerCase())
}

// ── Scheduled transfers ──────────────────────────────────────────────────────
export async function addSchedule(s: ScheduledTransfer): Promise<void> {
  const db = await read()
  db.schedules.push(s)
  await write(db)
}

export async function updateSchedule(id: string, patch: Partial<ScheduledTransfer>): Promise<void> {
  const db = await read()
  const s = db.schedules.find((x) => x.id === id)
  if (s) Object.assign(s, patch)
  await write(db)
}

export async function listSchedules(owner: string): Promise<ScheduledTransfer[]> {
  const db = await read()
  return db.schedules.filter((s) => s.owner.toLowerCase() === owner.toLowerCase())
}
