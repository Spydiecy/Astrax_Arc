import { NextResponse } from "next/server"
import { verifyChallenge, addToSession } from "@/lib/auth"
import { requestOrigin } from "@/lib/origin"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const origin = requestOrigin(req)
  let result
  try {
    result = await verifyChallenge(body, origin)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Sign-in unavailable." }, { status: 500 })
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 })
  const { header, addresses } = addToSession(req, result.address, origin.startsWith("https://"))
  return NextResponse.json({ ok: true, addresses }, { headers: { "set-cookie": header } })
}
