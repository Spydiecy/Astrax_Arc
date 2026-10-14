// Turn the agent's string arguments into typed ABI values, and ABI results back
// into readable strings. Used for constructor args and contract function calls.
import { getAddress, isAddress, isHex, parseAbiItem, type Abi, type AbiFunction, type AbiParameter } from "viem"

/** Coerce one argument (given as a string, or JSON for arrays/tuples) to its ABI type. */
export function coerceArg(param: AbiParameter, raw: unknown): unknown {
  const type = param.type
  const label = param.name ? `"${param.name}"` : type

  // Arrays: T[] or T[n], given as JSON ("[1,2,3]") or comma-separated.
  const arr = type.match(/^(.*)\[(\d*)\]$/)
  if (arr) {
    let list: unknown = raw
    if (typeof raw === "string") {
      const s = raw.trim()
      try {
        list = s.startsWith("[") ? JSON.parse(s) : s === "" ? [] : s.split(",").map((x) => x.trim())
      } catch {
        throw new Error(`Argument ${label} must be a JSON array, e.g. ["a","b"].`)
      }
    }
    if (!Array.isArray(list)) throw new Error(`Argument ${label} must be an array.`)
    if (arr[2] && list.length !== Number(arr[2])) throw new Error(`Argument ${label} needs exactly ${arr[2]} items.`)
    const inner = { ...param, type: arr[1] } as AbiParameter
    return list.map((x) => coerceArg(inner, x))
  }

  if (type === "tuple") {
    const comps = (param as { components?: readonly AbiParameter[] }).components ?? []
    let v: unknown = raw
    if (typeof raw === "string") {
      try {
        v = JSON.parse(raw)
      } catch {
        throw new Error(`Argument ${label} must be JSON (an array or object).`)
      }
    }
    if (Array.isArray(v)) return comps.map((c, i) => coerceArg(c, v[i]))
    if (v && typeof v === "object") return Object.fromEntries(comps.map((c) => [c.name, coerceArg(c, (v as Record<string, unknown>)[c.name!])]))
    throw new Error(`Argument ${label} must be an array or object.`)
  }

  const s = String(raw ?? "").trim()
  if (/^u?int\d*$/.test(type)) {
    const clean = s.replace(/[,_\s]/g, "")
    if (!/^-?\d+$/.test(clean)) throw new Error(`Argument ${label} (${type}) must be a whole number, got "${s}".`)
    if (type.startsWith("uint") && clean.startsWith("-")) throw new Error(`Argument ${label} (${type}) can't be negative.`)
    return BigInt(clean)
  }
  if (type === "bool") {
    if (/^(true|yes|1)$/i.test(s)) return true
    if (/^(false|no|0)$/i.test(s)) return false
    throw new Error(`Argument ${label} must be true or false.`)
  }
  if (type === "address") {
    if (!isAddress(s, { strict: false })) throw new Error(`Argument ${label} must be an address (0x + 40 hex characters).`)
    return getAddress(s)
  }
  if (type === "string") return String(raw ?? "")
  if (/^bytes\d*$/.test(type)) {
    if (!isHex(s)) throw new Error(`Argument ${label} (${type}) must be 0x-prefixed hex.`)
    const n = type.slice(5)
    if (n && (s.length - 2) / 2 !== Number(n)) throw new Error(`Argument ${label} must be exactly ${n} bytes.`)
    return s
  }
  return raw
}

export function coerceArgs(params: readonly AbiParameter[], raw: unknown[] = []): unknown[] {
  if (raw.length !== params.length) {
    const sig = params.map((p) => `${p.type}${p.name ? ` ${p.name}` : ""}`).join(", ")
    throw new Error(`Expected ${params.length} argument${params.length === 1 ? "" : "s"} (${sig || "none"}), got ${raw.length}.`)
  }
  return params.map((p, i) => coerceArg(p, raw[i]))
}

/** JSON-safe, readable form of a decoded result (bigints become strings). */
export function stringifyResult(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString()
  if (Array.isArray(v)) return v.map(stringifyResult)
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stringifyResult(x)]))
  return v
}

/** "increment()", "setCount(uint256 value) view returns (uint256)" … */
export function describeFunction(f: AbiFunction): string {
  const ins = f.inputs.map((i) => `${i.type}${i.name ? ` ${i.name}` : ""}`).join(", ")
  const outs = f.outputs.length ? ` → ${f.outputs.map((o) => o.type).join(", ")}` : ""
  const mut = f.stateMutability === "view" || f.stateMutability === "pure" ? " (read)" : f.stateMutability === "payable" ? " (payable)" : ""
  return `${f.name}(${ins})${outs}${mut}`
}

export const abiFunctions = (abi: Abi) => abi.filter((x): x is AbiFunction => x.type === "function")

export const isReadOnly = (f: AbiFunction) => f.stateMutability === "view" || f.stateMutability === "pure"

/**
 * Find the function to call. Uses the stored ABI when there is one, otherwise a
 * signature the user/model gave, e.g. "increment()" or "function get() view returns (uint256)".
 */
export function pickFunction(
  abi: Abi | null,
  nameOrSignature: string,
  argCount: number,
): { fn: AbiFunction } | { error: string } {
  const q = nameOrSignature.trim()
  if (abi) {
    const name = q.replace(/^function\s+/, "").split("(")[0].trim()
    const matches = abiFunctions(abi).filter((f) => f.name === name)
    if (matches.length === 0) {
      return { error: `This contract has no function "${name}". Available: ${abiFunctions(abi).map((f) => f.name).join(", ") || "none"}.` }
    }
    return { fn: matches.find((f) => f.inputs.length === argCount) ?? matches[0] }
  }
  if (!q.includes("(")) {
    return { error: `I don't have this contract's ABI. Give the full function signature, e.g. "${q}()" or "${q}() view returns (uint256)".` }
  }
  try {
    const item = parseAbiItem(q.startsWith("function ") ? q : `function ${q}`)
    if (item.type !== "function") throw new Error()
    return { fn: item as AbiFunction }
  } catch {
    return { error: `"${q}" isn't a valid function signature.` }
  }
}
