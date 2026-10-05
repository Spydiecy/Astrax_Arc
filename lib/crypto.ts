// Server-only symmetric encryption for stored private keys (AES-256-GCM).
// The key comes from SCHEDULER_ENC_KEY; in dev we derive a deterministic fallback
// (with a warning) so scheduling still works locally without extra setup.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto"

let warned = false

function key32(): Buffer {
  const secret = process.env.SCHEDULER_ENC_KEY
  if (!secret && process.env.NODE_ENV === "production") {
    // Never encrypt real keys with the public dev fallback.
    throw new Error("SCHEDULER_ENC_KEY is not set — refusing to store or use scheduling keys in production.")
  }
  if (!secret) {
    if (!warned) {
      console.warn("[astrax] SCHEDULER_ENC_KEY not set — using an insecure dev fallback. Set it before deploying.")
      warned = true
    }
    return createHash("sha256").update("astrax-dev-fallback-key").digest()
  }
  // Accept any string; hash down to 32 bytes.
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key32(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64")
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key32(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
