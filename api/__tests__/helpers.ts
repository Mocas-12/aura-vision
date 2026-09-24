// Minimal req/res doubles matching the Node/Vercel serverless surface used by
// the api/ functions: enough for applyCors, sendJson, readJsonBody and the
// rate limiter — no HTTP server involved.

export interface MockRes {
  statusCode: number
  body: string
  headers: Record<string, string>
  /** Chunks written via write() when the handler streams instead of sendJson. */
  written: string[]
  setHeader(name: string, value: string): void
  write(chunk: unknown): void
  end(chunk?: string): void
  on(event: string, cb: () => void): void
}

export function mockRes(): MockRes {
  const res = {
    statusCode: 0,
    body: '',
    headers: {},
    written: [],
    closeHandlers: [] as Array<() => void>,
    setHeader(name: string, value: string) {
      res.headers[name] = value
    },
    write(chunk: unknown) {
      res.written.push(String(chunk))
    },
    end(chunk?: string) {
      if (chunk) res.body += chunk
    },
    on(event: string, cb: () => void) {
      if (event === 'close') res.closeHandlers.push(cb)
    },
  } as MockRes & { closeHandlers: Array<() => void> }
  return res
}

export function jsonRes() {
  const res = mockRes()
  return {
    res,
    json() {
      return JSON.parse(res.body)
    },
  }
}

// Buffers the whole JSON body and emits it synchronously, like a small
// already-buffered request would.
export function jsonReq(method: string, body?: unknown, headers: Record<string, string> = {}) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const chunks = text ? [Buffer.from(text)] : []
  return {
    method,
    headers: { 'content-length': String(Buffer.byteLength(text)), ...headers },
    on(event: string, cb: (c?: Buffer) => void) {
      if (event === 'data') chunks.forEach((c) => cb(c))
      if (event === 'end') cb()
    },
    destroy() {},
  }
}

// Streams raw chunks without a trustworthy content-length, to exercise the
// size-cap path inside readJsonBody.
export function streamReq(chunks: Buffer[], headers: Record<string, string> = {}) {
  let destroyed = false
  return {
    method: 'POST',
    headers,
    get destroyed() {
      return destroyed
    },
    on(event: string, cb: (c?: Buffer) => void) {
      if (event === 'data') chunks.forEach((c) => cb(c))
      if (event === 'end') cb()
    },
    destroy() {
      destroyed = true
    },
  }
}
