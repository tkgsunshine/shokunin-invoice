/**
 * libsql Client を D1-like な prepare().bind().run() / .first() / .all() インターフェースで
 * ラップするアダプター。既存ルートのコードをほぼ無修正で動かすために使用する。
 */
import { createClient, type Client } from '@libsql/client'

export function createDbClient(): Client {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is required')
  }

  return createClient({ url, authToken })
}

type Row = Record<string, unknown>

class PreparedStatement {
  private client: Client
  private sql: string
  private args: unknown[]

  constructor(client: Client, sql: string) {
    this.client = client
    this.sql = sql
    this.args = []
  }

  bind(...args: unknown[]): this {
    this.args = args
    return this
  }

  async run(): Promise<{ meta: { last_row_id: number } }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    return { meta: { last_row_id: Number(result.lastInsertRowid ?? 0) } }
  }

  async first<T = Row>(): Promise<T | null> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    if (result.rows.length === 0) return null
    return rowToObject(result.rows[0], result.columns) as T
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args })
    const results = result.rows.map((row) => rowToObject(row, result.columns)) as T[]
    return { results }
  }
}

function rowToObject(row: unknown[], columns: string[]): Row {
  const obj: Row = {}
  columns.forEach((col, i) => {
    obj[col] = row[i]
  })
  return obj
}

/**
 * D1Database-like ラッパー。既存コードの c.env.DB.prepare(...).bind(...).run/first/all() を
 * そのまま使えるようにする。
 */
export class D1LikeClient {
  constructor(private client: Client) {}

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.client, sql)
  }

  async execute(sql: string, args?: unknown[]): Promise<{ rows: Row[] }> {
    const result = await this.client.execute({ sql, args: args ?? [] })
    const rows = result.rows.map((row) => rowToObject(row, result.columns))
    return { rows }
  }
}
