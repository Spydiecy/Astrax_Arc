// Global type declarations for Astrax

// Node's built-in SQLite (experimental in Node 24; no @types yet).
declare module "node:sqlite" {
  interface StatementResult {
    changes: number
    lastInsertRowid: number | bigint
  }
  export class DatabaseSync {
    constructor(path: string, options?: unknown)
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): StatementResult
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
    close(): void
  }
}
