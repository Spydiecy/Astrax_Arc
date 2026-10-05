"use client"

import { useEffect } from "react"

// Heartbeat: while any Astrax page is open, nudge the scheduler about once a
// minute so due payments go out on time. The server throttles this to one run
// per 30s across everyone, so many open tabs cost almost nothing. Vercel Cron
// (hourly) covers the times when nobody has the app open.
const EVERY_MS = 60_000

export function SchedulePoller() {
  useEffect(() => {
    const tick = () => {
      fetch("/api/scheduler/tick", { method: "POST", keepalive: true }).catch(() => {})
    }
    // Spread tabs out a little instead of all firing on the same second.
    const first = setTimeout(tick, 2_000 + Math.random() * 8_000)
    const t = setInterval(tick, EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])
  return null
}
