// Server-only Pinata (IPFS) helpers. Never import from a client component:
// PINATA_JWT must stay on the server. The browser uploads through /api/upload.
//
// Uses Pinata's v3 Files API directly with network=public, so content is pinned to
// public IPFS and resolvable by wallets/explorers (needed for NFT metadata).
import "server-only"

const UPLOAD_URL = "https://uploads.pinata.cloud/v3/files"

export interface IpfsUpload {
  cid: string
  /** Gateway URL (dedicated gateway if PINATA_GATEWAY is set, else ipfs.io). */
  ipfsUrl: string
  /** Pinata file id (used to manage/delete the file). */
  id: string
  size: number
}

export function isPinataConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT)
}

function gatewayHost(): string | null {
  const raw = process.env.PINATA_GATEWAY?.trim()
  if (!raw) return null
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

export function gatewayUrl(cid: string): string {
  const host = gatewayHost()
  return host ? `https://${host}/ipfs/${cid}` : `https://ipfs.io/ipfs/${cid}`
}

async function uploadBlob(blob: Blob, name: string): Promise<IpfsUpload> {
  const jwt = process.env.PINATA_JWT
  if (!jwt) throw new Error("IPFS uploads aren't configured (PINATA_JWT is missing).")

  const form = new FormData()
  form.append("file", blob, name)
  form.append("network", "public")
  form.append("name", name)

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  })
  const text = await res.text()
  if (!res.ok) {
    // Pinata error bodies don't contain the JWT; keep them short for logs/UI.
    throw new Error(`Pinata upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = JSON.parse(text)?.data
  if (!data?.cid) throw new Error("Pinata upload returned no CID")
  return { cid: data.cid, id: data.id, size: data.size, ipfsUrl: gatewayUrl(data.cid) }
}

/** Upload a JSON object (e.g. NFT metadata) to public IPFS. */
export async function uploadJSONToIPFS(json: unknown, name = "metadata.json"): Promise<IpfsUpload> {
  const blob = new Blob([JSON.stringify(json)], { type: "application/json" })
  return uploadBlob(blob, name)
}

/** Upload a file (from a multipart request) to public IPFS. */
export async function uploadFileToIPFS(file: File): Promise<IpfsUpload> {
  return uploadBlob(file, file.name || "upload")
}
