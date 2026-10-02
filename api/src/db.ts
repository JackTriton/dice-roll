// Cloudflare D1 のうち、この API が使う部分だけの型。
// 本番では env.DB(D1Database)をそのまま渡し、テストでは node:sqlite で同じ形を作って渡す。

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}

export interface DB {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

/** Workers の Cache API のうち使う部分 */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}
