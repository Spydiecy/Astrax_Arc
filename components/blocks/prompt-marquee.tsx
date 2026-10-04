import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Prompt {
  icon: LucideIcon
  text: string
}

// Each half of the track repeats the row this many times so it's always wider
// than the screen (5 cards × ~22rem × 3 ≈ 330rem). The track holds two identical
// halves and slides exactly one half, then restarts: a seamless, endless loop.
const REPEAT = 3

function Card({ icon: Icon, text }: Prompt) {
  return (
    // Spacing is margin (not flex gap) so both halves are exactly equal width.
    <li className="mr-4 flex w-72 shrink-0 items-start gap-3 rounded-xl border bg-card/40 p-4 text-left sm:w-80">
      <Icon className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-mono text-sm leading-relaxed">“{text}”</span>
    </li>
  )
}

function Row({ items, reverse, duration }: { items: Prompt[]; reverse?: boolean; duration: number }) {
  const half = Array.from({ length: REPEAT }, () => items).flat()
  return (
    <div className="group/row flex w-full overflow-hidden py-2">
      <ul
        className="flex w-max animate-marquee-loop group-hover/row:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        {half.map((p, i) => <Card key={`a${i}`} {...p} />)}
        {/* second, identical half — decorative only */}
        {half.map((p, i) => (
          <Card key={`b${i}`} {...p} />
        ))}
      </ul>
    </div>
  )
}

export function PromptMarquee({ prompts, className }: { prompts: Prompt[]; className?: string }) {
  const mid = Math.ceil(prompts.length / 2)
  const rows = [prompts.slice(0, mid), prompts.slice(mid)]
  return (
    <div className={cn("relative w-full", className)}>
      {/* Animated version */}
      <div className="motion-reduce:hidden" aria-hidden>
        <Row items={rows[0]} duration={60} />
        <Row items={rows[1]} duration={70} reverse />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background sm:w-1/4" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background sm:w-1/4" />
      </div>
      {/* Static list: for reduced-motion users and screen readers */}
      <ul className="sr-only motion-reduce:not-sr-only motion-reduce:mx-auto motion-reduce:flex motion-reduce:max-w-5xl motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-3 motion-reduce:px-6">
        {prompts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex w-72 items-start gap-3 rounded-xl border p-4 text-left">
            <Icon className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-mono text-sm leading-relaxed">“{text}”</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
