import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"

// Astrax runs a self-contained agent (/api/agent) — there is no external session
// server anymore. This endpoint just mints a local session id so the existing
// "New Session" modal keeps working as a client-side conversation key.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { appName, userId } = body
    if (!appName || !userId) {
      return NextResponse.json({ error: "appName and userId are required" }, { status: 400 })
    }
    return NextResponse.json({
      id: randomUUID(),
      appName,
      userId,
      createdAt: Date.now(),
    })
  } catch {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 })
  }
}
