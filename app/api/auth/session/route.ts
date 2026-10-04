import { NextResponse } from "next/server"
import { sessionAddresses, removeFromSession } from "@/lib/auth"
import { requestOrigin } from "@/lib/origin"

export const runtime = "nodejs"

// Which addresses this browser has verified.
export async function GET(req: Request) {
  return NextResponse.json({ addresses: sessionAddresses(req) }, { headers: { "cache-control": "no-store" } })
}

// Sign out one address (?address=…) or all of them.
export async function DELETE(req: Request) {
  const address = new URL(req.url).searchParams.get("address")
  const { header, addresses } = removeFromSession(req, address, requestOrigin(req).startsWith("https://"))
  return NextResponse.json({ ok: true, addresses }, { headers: { "set-cookie": header } })
}
