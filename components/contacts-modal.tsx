"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BookUser, X, Loader2, Trash2, Pencil, Copy, Check, Plus, ArrowUpRight, Search } from "lucide-react"
import { useCredentials } from "@/contexts/CredentialsContext"
import { useOwnerSession } from "@/contexts/OwnerSessionContext"
import { VerifyWalletPrompt } from "@/components/verify-wallet"
import { explorerAddress, isSendableAddress } from "@/lib/arc"
import { useNetwork } from "@/contexts/NetworkContext"

interface Contact {
  name: string
  address: string
  updatedAt: number
}

const MAX_NAME = 40
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`

function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy address"}
      title="Copy address"
      onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 rounded text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function ContactsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeAddress } = useCredentials()
  const { network } = useNetwork()
  const { isVerified } = useOwnerSession()
  const [items, setItems] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState("")
  // Form state: `editing` is the original name when editing, "" when adding, null when closed.
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!activeAddress || !isVerified) {
      setItems([])
      setLoaded(true)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts?owner=${activeAddress}`, { cache: "no-store" })
      const j = await res.json()
      setItems(res.ok ? j.contacts || [] : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [activeAddress, isVerified])

  useEffect(() => {
    if (isOpen) load()
    else {
      setLoaded(false)
      setEditing(null)
      setQuery("")
    }
  }, [isOpen, load])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (editing !== null) setEditing(null)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, editing])

  useEffect(() => {
    if (editing !== null) nameRef.current?.focus()
  }, [editing])

  const openForm = (c?: Contact) => {
    setEditing(c ? c.name : "")
    setName(c?.name ?? "")
    setAddress(c?.address ?? "")
    setFormError("")
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAddress) return
    const n = name.replace(/^@+/, "").trim()
    const a = address.trim()
    if (!n) return setFormError("Give the contact a name.")
    if (!isSendableAddress(a)) return setFormError("That isn't a valid Arc address (0x followed by 40 hex characters).")
    const clash = items.find((c) => c.name.toLowerCase() === n.toLowerCase() && c.name !== editing)
    if (clash && !window.confirm(`You already have a contact called "${clash.name}". Replace its address?`)) return
    setSaving(true)
    setFormError("")
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: activeAddress, name: n, address: a, previousName: editing || undefined }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Couldn't save the contact.")
      setEditing(null)
      await load()
    } catch (err: any) {
      setFormError(err?.message || "Couldn't save the contact.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c: Contact) => {
    if (!activeAddress || !window.confirm(`Delete "${c.name}" from your contacts?`)) return
    await fetch(`/api/contacts?owner=${activeAddress}&name=${encodeURIComponent(c.name)}`, { method: "DELETE" })
    load()
  }

  if (!isOpen) return null

  const q = query.trim().toLowerCase()
  const shown = q ? items.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)) : items
  const inputCls =
    "w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="contacts-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-black dark:text-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 id="contacts-title" className="flex items-center gap-2 font-semibold">
            <BookUser className="w-5 h-5" /> Contacts
          </h2>
          <div className="flex items-center gap-2">
            {activeAddress && isVerified && editing === null && (
              <button
                type="button"
                onClick={() => openForm()}
                className="inline-flex items-center gap-1 rounded-md bg-gray-900 dark:bg-white text-white dark:text-black px-2.5 py-1.5 text-xs font-semibold hover:bg-gray-800 dark:hover:bg-gray-200"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {!activeAddress && <p className="text-sm text-gray-500">Connect a wallet or load a private key to see your contacts.</p>}
          {activeAddress && !isVerified && <VerifyWalletPrompt />}

          {activeAddress && isVerified && editing !== null && (
            <form onSubmit={save} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2" aria-label={editing ? "Edit contact" : "Add contact"}>
              <div>
                <label htmlFor="contact-name" className="block text-xs text-gray-500 mb-1">Name</label>
                <input id="contact-name" ref={nameRef} value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="alice" className={inputCls} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="contact-address" className="block text-xs text-gray-500 mb-1">Arc address</label>
                <input id="contact-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className={`${inputCls} font-mono text-xs`} autoComplete="off" spellCheck={false} />
              </div>
              {formError && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-gray-900 dark:bg-white text-white dark:text-black font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-60">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editing ? "Save" : "Add contact"}
                </button>
              </div>
            </form>
          )}

          {activeAddress && isVerified && items.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden />
              <label htmlFor="contact-search" className="sr-only">Search contacts</label>
              <input id="contact-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className={`${inputCls} pl-8`} />
            </div>
          )}

          {activeAddress && isVerified && (loading || !loaded) && items.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          )}
          {activeAddress && isVerified && loaded && !loading && items.length === 0 && editing === null && (
            <p className="text-sm text-gray-500">No contacts yet. Add one here, or say “save alice as &lt;address&gt;” — then just “send 1 USDC to alice”.</p>
          )}
          {q && shown.length === 0 && <p className="text-sm text-gray-500">No contacts match “{query}”.</p>}

          {activeAddress && isVerified && shown.map((c) => (
            <div key={c.name} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{c.name}</div>
                <div className="font-mono text-xs text-gray-500 dark:text-gray-400" title={c.address}>{short(c.address)}</div>
              </div>
              <CopyAddress value={c.address} />
              <a href={explorerAddress(network, c.address)} target="_blank" rel="noreferrer" aria-label={`View ${c.name} on the explorer`} title="View on explorer" className="p-1 rounded text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <button type="button" onClick={() => openForm(c)} aria-label={`Edit ${c.name}`} title="Edit" className="p-1 rounded text-gray-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(c)} aria-label={`Delete ${c.name}`} title="Delete" className="p-1 rounded text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-900">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
