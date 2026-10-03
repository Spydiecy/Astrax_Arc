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
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
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

  const slim = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolInvocations: (m as any).toolInvocations,
    experimental_attachments: (m as any).experimental_attachments,
  }))
  localStorage.setItem(msgsKey(id), JSON.stringify(slim))

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
