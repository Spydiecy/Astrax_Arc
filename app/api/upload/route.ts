import { NextResponse } from "next/server"
import { uploadFileToIPFS, isPinataConfigured } from "@/lib/pinata"
import { rateLimited } from "@/lib/db"

export const runtime = "nodejs"

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXT = /\.(png|jpe?g|gif|webp|svg|pdf|json|txt|doc|docx)$/i

// Per-IP rate limit so the endpoint can't be used to drain the Pinata quota.
// Stored in the database, so it holds across server instances.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

// Uploads one file to public IPFS via Pinata. The JWT never leaves the server.
export async function POST(req: Request) {
  if (!isPinataConfigured()) {
    return NextResponse.json({ error: "IPFS uploads aren't configured on this server." }, { status: 503 })
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (await rateLimited(`upload:${ip}`, WINDOW_MS, MAX_PER_WINDOW)) {
    return NextResponse.json({ error: "Too many uploads. Try again in a minute." }, { status: 429 })
  }

  let file: FormDataEntryValue | null
  try {
    file = (await req.formData()).get("file")
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with a `file` field." }, { status: 400 })
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 10 MB." }, { status: 413 })
  if (!ALLOWED_EXT.test(file.name)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 415 })
  }

  try {
    const { cid, ipfsUrl, size } = await uploadFileToIPFS(file)
    return NextResponse.json({ cid, ipfsUrl, size, name: file.name })
  } catch (e: any) {
    console.error("[upload]", e?.message)
    return NextResponse.json({ error: "IPFS upload failed." }, { status: 502 })
  }
}
