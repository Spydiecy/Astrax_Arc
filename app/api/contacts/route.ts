import { NextResponse } from "next/server"
import { listContacts, saveContact, deleteContact, cleanContactName, MAX_CONTACT_NAME } from "@/lib/db"
import { addrKey, isSendableAddress, isValidAddress, normalizeAddress } from "@/lib/arc"
import { isOwner, NOT_OWNER } from "@/lib/auth"

export const runtime = "nodejs"

// Each wallet's own address book (shared across Arc Mainnet and Testnet, since an
// address is the same on both). Only for an address this browser has verified it
// owns (see lib/auth.ts).
const MAX_CONTACTS = 500

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner") || ""
  if (!isValidAddress(owner)) return NextResponse.json({ contacts: [] })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  return NextResponse.json({ contacts: await listContacts(addrKey(owner)) }, { headers: { "cache-control": "no-store" } })
}

// Add or update a contact. JSON only (also blocks simple cross-site form posts).
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 })
  }
  const { owner, name, address, previousName } = await req.json().catch(() => ({}))
  if (!isValidAddress(owner)) return NextResponse.json({ error: "Invalid owner." }, { status: 400 })
  if (!isOwner(req, owner)) return NextResponse.json(NOT_OWNER, { status: 401 })
  const clean = typeof name === "string" ? cleanContactName(name) : ""
  if (!clean) return NextResponse.json({ error: `Give the contact a name (up to ${MAX_CONTACT_NAME} characters).` }, { status: 400 })
  if (typeof address !== "string" || !isSendableAddress(address.trim())) {
    return NextResponse.json({ error: "That isn't a valid Arc (EVM) address. It should look like 0x followed by 40 hex characters." }, { status: 400 })
  }
  const key = addrKey(owner)
  const existing = await listContacts(key)
  const isNew = !existing.some((c) => c.name.toLowerCase() === clean.toLowerCase())
  if (isNew && existing.length >= MAX_CONTACTS) {
    return NextResponse.json({ error: `You can save up to ${MAX_CONTACTS} contacts.` }, { status: 400 })
  }
  const contact = await saveContact(key, clean, normalizeAddress(address))
  // Renamed while editing → remove the old entry.
  if (typeof previousName === "string" && cleanContactName(previousName).toLowerCase() !== clean.toLowerCase()) {
    await deleteContact(key, previousName)
  }
  return NextResponse.json({ contact })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get("owner") || ""
  const name = url.searchParams.get("name") || ""
  if (!isValidAddress(owner) || !name) return NextResponse.json({ ok: false }, { status: 400 })
  if (!isOwner(req, owner)) return NextResponse.json({ ok: false, ...NOT_OWNER }, { status: 401 })
  return NextResponse.json({ ok: await deleteContact(addrKey(owner), name) })
}
