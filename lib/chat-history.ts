// Client-side chat history (localStorage). ChatGPT-style: an index of chats plus
// per-chat message lists. No server involvement.
"use client"

export interface ChatMeta {
  id: string
  title: string
  updatedAt: number
}

export interface StoredMessage {
  id: string
  role: "user" | "assistant" | "system" | "data"
  content: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolInvocations?: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental_attachments?: any[]
}

const INDEX_KEY = "astrax_chats"
const CURRENT_KEY = "astrax_current_chat"
const msgsKey = (id: string) => `astrax_chat_${id}`
/** localStorage key holding a chat's messages (used for cross-tab sync). */
export const chatStorageKey = msgsKey

// localStorage is ~5 MB per site. Generated images are stored as base64 inside
// tool results; keep small ones (diagrams) and drop big ones so a single image
// can't make every later save fail.
const MAX_INLINE_IMAGE_CHARS = 400_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slimInvocations(invs: any[] | undefined, dropAllImages: boolean): any[] | undefined {
  if (!invs) return invs
  return invs.map((inv) => {
    const r = inv?.result
    if (r && typeof r.imageBase64 === "string" && (dropAllImages || r.imageBase64.length > MAX_INLINE_IMAGE_CHARS)) {
      const { imageBase64: _drop, ...rest } = r
      return { ...inv, result: { ...rest, imageOmitted: true } }
    }
    return inv
  })
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("astrax:chats"))
}

export function getChats(): ChatMeta[] {
  if (typeof window === "undefined") return []
  try {
    return (JSON.parse(localStorage.getItem(INDEX_KEY) || "[]") as ChatMeta[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function writeIndex(list: ChatMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn("[astrax] Couldn't update the chat list:", e)
  }
  emit()
}

export function getCurrentId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(CURRENT_KEY)
}

export function setCurrentId(id: string) {
  localStorage.setItem(CURRENT_KEY, id)
}

export function newChat(): string {
  const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  setCurrentId(id)
  return id
}

export function getMessages(id: string): StoredMessage[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(msgsKey(id)) || "[]")
  } catch {
    return []
  }
}

export function saveMessages(id: string, messages: StoredMessage[]) {
  if (typeof window === "undefined") return
  // Don't persist an empty/welcome-only conversation.
  const hasUser = messages.some((m) => m.role === "user")
  if (!hasUser) return

  const serialize = (dropAllImages: boolean) =>
    JSON.stringify(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolInvocations: slimInvocations((m as any).toolInvocations, dropAllImages),
        // Inline (data:) previews are too big to keep; IPFS URLs are fine.
        experimental_attachments: (m as any).experimental_attachments?.filter((a: any) => !String(a?.url || "").startsWith("data:")),
      })),
    )
  const raw = serialize(false)
  // Skip the write (and the index bump) when nothing changed.
  if (localStorage.getItem(msgsKey(id)) === raw) return
  try {
    localStorage.setItem(msgsKey(id), raw)
  } catch (e) {
    if (!isQuotaError(e)) throw e
    try {
      localStorage.setItem(msgsKey(id), serialize(true))
      console.warn("[astrax] Browser storage is nearly full — saved this chat without its generated images.")
    } catch {
      console.warn("[astrax] Browser storage is full — this chat couldn't be saved. Delete some old chats.")
      return
    }
  }

  const firstUser = messages.find((m) => m.role === "user")
  const title = (firstUser?.content || "New chat").replace(/\s+/g, " ").trim().slice(0, 48) || "New chat"
  const list = getChats().filter((c) => c.id !== id)
  list.unshift({ id, title, updatedAt: Date.now() })
  writeIndex(list)
}

export function deleteChat(id: string) {
  localStorage.removeItem(msgsKey(id))
  writeIndex(getChats().filter((c) => c.id !== id))
  if (getCurrentId() === id) localStorage.removeItem(CURRENT_KEY)
}

export function openChat(id: string) {
  setCurrentId(id)
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("astrax:chat-open", { detail: { id } }))
}
