// Shared helpers for the Vercel serverless functions (underscore prefix = not routable).
// NOTE: the in-memory rate limiter only throttles within a single warm lambda;
// for hard cross-instance limits use Vercel WAF or an upstash/KV-backed counter.

const allowDefault = [
  'https://mocas-12.github.io',
  // local dev (5173), vite preview (4173) and the e2e preview (4174)
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]

// Extra origins can be added via the ALLOWED_ORIGINS env var (comma-separated).
function allowedOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set(allowDefault.concat(extra))
}

// Echo the request Origin back only when it is allow-listed; never use '*'.
function resolveOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return null
  return allowedOrigins().has(origin) ? origin : null
}

function applyCors(req, res) {
  const origin = resolveOrigin(req)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  return origin
}

const buckets = new Map()

function checkRateLimit(req, { windowMs = 60 * 1000, max = 10 } = {}) {
  const ip = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() || (req.socket && req.socket.remoteAddress) || 'unknown'
  const now = Date.now()
  let bucket = buckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(ip, bucket)
  }
  bucket.count += 1
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (now > b.resetAt) buckets.delete(key)
    }
  }
  return {
    limited: bucket.count > max,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readJsonBody(req, { maxBytes = 6 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const declared = parseInt(req.headers['content-length'] || '0', 10)
    if (declared > maxBytes) {
      reject(Object.assign(new Error('Request body too large'), { status: 413 }))
      return
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf-8')
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch (e) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }))
      }
    })
    req.on('error', () => reject(Object.assign(new Error('Failed to read request body'), { status: 400 })))
  })
}

module.exports = { applyCors, resolveOrigin, checkRateLimit, sendJson, readJsonBody }
