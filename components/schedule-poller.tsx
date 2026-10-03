"use client"

import { useEffect } from "react"

// Dev convenience: ping the cron executor every minute so scheduled payments fire
// locally while the app is open. In production, Vercel Cron (vercel.json) drives
// /api/cron/execute instead (and this poller stays idle).
export function SchedulePoller() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const tick = () => {
      fetch("/api/cron/execute").catch(() => {})
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])
  return null
}
