// Work out the site's own origin (scheme + host) at runtime, so links follow
// whatever domain the app is served from: localhost:3000, a preview URL, the
// production domain… No NEXT_PUBLIC_APP_URL needed.

/**
 * Origin of an incoming request. Honors proxy headers (Vercel, nginx, …) and
 * falls back to the request URL. Only use the result in the response to this
 * same request — the headers are client-controlled.
 */
export function requestOrigin(req: Request): string {
  const h = req.headers
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()
  if (host && /^[a-z0-9.\-:[\]]+$/i.test(host)) {
    const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim() || new URL(req.url).protocol.replace(":", "")
    return `${proto === "http" ? "http" : "https"}://${host}`
  }
  return new URL(req.url).origin
}

/** Absolute URL for an app path, using the domain currently open in the browser. */
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined" || /^https?:\/\//i.test(path)) return path
  return new URL(path, window.location.origin).toString()
}
