// Makes model-written Mermaid safe to render. Small models often leave special
// characters unquoted in labels, e.g. `A[Send (USDC)]` or `B{Check: balance?}`, or wrap
// the code in a markdown fence, and the renderer then rejects the whole diagram.
// Quoted labels are always valid, so every label is quoted.

const clean = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, " ").trim()

export function sanitizeMermaid(source: string): string {
  let s = source.trim()
  // Drop a ```mermaid fence.
  s = s.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim()
  // The model sometimes writes literal "\n" sequences instead of newlines.
  if (!s.includes("\n") && s.includes("\\n")) s = s.replace(/\\n/g, "\n")

  return s
    .split("\n")
    .map((line) => {
      // Leave directives and comments alone.
      if (/^\s*(%%|style\b|classDef\b|class\b|linkStyle\b|flowchart\b|graph\b|subgraph\b|end\b|direction\b)/i.test(line)) return line
      return line
        // Edge labels: -->|text|
        .replace(/\|([^|"]+)\|/g, (_m, t) => `|"${clean(t)}"|`)
        // Node labels: A[text]  ([...] and [[...]] keep their shape), and A{text}
        .replace(/\[([^\[\]"]+)\]/g, (_m, t) => `["${clean(t)}"]`)
        .replace(/\{([^{}"]+)\}/g, (_m, t) => `{"${clean(t)}"}`)
    })
    .join("\n")
}
