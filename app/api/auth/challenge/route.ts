import { NextResponse } from "next/server"
import { createChallenge } from "@/lib/auth"
import { requestOrigin } from "@/lib/origin"
import { isValidAddress } from "@/lib/arc"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const { address } = await req.json().catch(() => ({}))
  if (!isValidAddress(address)) return NextResponse.json({ error: "Invalid address." }, { status: 400 })
  try {
    return NextResponse.json(createChallenge(address, requestOrigin(req)))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Sign-in unavailable." }, { status: 500 })
  }
}
