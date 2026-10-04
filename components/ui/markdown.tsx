"use client"

// Chat markdown renderer. Raw HTML is never rendered (react-markdown escapes it)
// and unsafe link protocols (javascript:, data:, …) are stripped by default.
import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks" // keep single line breaks, like a chat app
import { cn } from "@/lib/utils"

const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  a: ({ href, children }) => {
    const external = /^https?:\/\//i.test(href || "")
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-1 hover:decoration-2 break-all"
      >
        {children}
      </a>
    )
  },
  ul: ({ children }) => <ul className="my-1.5 pl-5 list-disc space-y-0.5 marker:text-gray-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 pl-5 list-decimal space-y-0.5 marker:text-gray-400">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => <h3 className="mt-3 mb-1.5 first:mt-0 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1.5 first:mt-0 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 first:mt-0 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-2 mb-1 first:mt-0 text-sm font-semibold">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-gray-300 dark:border-gray-700 pl-3 text-gray-600 dark:text-gray-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200 dark:border-gray-800" />,
  code: ({ className, children }) => {
    // Fenced blocks get a language-* class (or contain newlines); the rest are inline.
    const block = /language-/.test(className || "") || String(children).includes("\n")
    return block ? (
      <code className={cn("font-mono text-xs", className)}>{children}</code>
    ) : (
      <code className="font-mono text-[0.8em] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-800 break-all">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-gray-200/70 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 p-3 leading-relaxed">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-gray-300 dark:border-gray-700 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-gray-200 dark:border-gray-800 px-2 py-1 align-top">{children}</td>,
  img: () => null, // images come from tool cards, not inline markdown
}

const PLUGINS = [remarkGfm, remarkBreaks]

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("leading-relaxed break-words", className)}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
