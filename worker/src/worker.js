// Aura-Vision production Cloudflare Worker:
//   POST /      → forwards {imageDataUrl, prompt} to the NVIDIA vision API
//   GET  /      → liveness probe ("Aura Online")
//   GET  /stats → {"site_pv": N} total site page views (KV-backed)
//   POST /stats → increments the site page-view counter
// Deploy with `npx wrangler deploy`; see README.md in this folder.

const ALLOW_DEFAULT = [
  'https://mocas-12.github.io',
  // local dev (5173), vite preview (4173) and the e2e preview (4174)
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024
const MAX_BODY_BYTES = 8 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8000

// In-memory per-isolate limiter (same caveat as the Vercel api): each cold
// start gets a fresh map. For hard cross-instance limits put a Cloudflare WAF
// rate-limiting rule (free plan includes one) in front of this route.
const rateBuckets = new Map()
function checkRateLimit(request, { windowMs = 60 * 1000, max = 10 } = {}) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  const now = Date.now()
  let bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    rateBuckets.set(ip, bucket)
  }
  bucket.count += 1
  if (rateBuckets.size > 5000) {
    for (const [key, b] of rateBuckets) {
      if (now > b.resetAt) rateBuckets.delete(key)
    }
  }
  return {
    limited: bucket.count > max,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

// Prompt constants live in one shared CJS module consumed by BOTH backends
// (worker + Vercel api) — structural protection against copy drift.
import { SYSTEM_PROMPT, DEFAULT_PROMPT } from '../../api/_prompts.js'

// Both are real vision models on NVIDIA NIM; the 90B variant is the 404 fallback.
const FALLBACK_MODEL = 'meta/llama-3.2-90b-vision-instruct'

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') ?? ''
  const extra = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (ALLOW_DEFAULT.concat(extra).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  return headers
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

// Stream the request body with a hard byte cap; returns null when the cap is
// exceeded (deterministic even for chunked bodies without content-length).
async function readBodyCapped(request, maxBytes) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      try { await reader.cancel() } catch { void 0 }
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

// Client prompts are honored but sanitized: plain text, bounded length.
function sanitizePrompt(input) {
  const text = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : ''
  if (text.length < 5 || text.length > 500) return DEFAULT_PROMPT
  return text
}

function extractContent(payload) {
  const choices = payload && Array.isArray(payload.choices) ? payload.choices : []
  for (const choice of choices) {
    const content = choice?.message?.content ?? choice?.delta?.content
    if (typeof content === 'string' && content.trim()) return content
    if (Array.isArray(content) && content.some((p) => p?.text)) return content
  }
  return null
}

async function identify(request, env, cors) {
  const limit = checkRateLimit(request, { max: 10, windowMs: 60 * 1000 })
  if (limit.limited) {
    return json(
      { error: 'Too many requests, please retry later' },
      429,
      { ...cors, 'Retry-After': String(limit.retryAfterSec) },
    )
  }
  // Advisory pre-parse cap on the declared size; chunked bodies without a
  // content-length are still caught by the capped reader below.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large' }, 413, cors)
  }
  const bodyText = await readBodyCapped(request, MAX_BODY_BYTES)
  if (bodyText === null) {
    return json({ error: 'Request body too large' }, 413, cors)
  }
  let input
  try {
    input = JSON.parse(bodyText)
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors)
  }
  const raw = String(input?.imageDataUrl ?? input?.base64 ?? input?.image ?? '')
  const base64 = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '')
  if (!base64) return json({ error: 'Missing image base64' }, 400, cors)
  const approxBytes = Math.floor(base64.length * 3 / 4)
  if (approxBytes > MAX_IMAGE_BYTES) {
    return json({ error: 'Image too large, please compress before upload', approxBytes }, 413, cors)
  }

  const prompt = sanitizePrompt(input?.prompt)
  // stream:true → pass NVIDIA's SSE straight through to the client; a plain
  // JSON reply (old clients / stream:false) keeps the buffered contract.
  const streamMode = input?.stream === true
  const models = [env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-11b-vision-instruct', FALLBACK_MODEL]
  for (const model of models) {
    let res
    try {
      res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: streamMode ? 'text/event-stream' : 'application/json',
          Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          stream: streamMode,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
        // Streaming answers trickle for a while; only cap the idle-free total.
        signal: AbortSignal.timeout(streamMode ? 30_000 : UPSTREAM_TIMEOUT_MS),
      })
    } catch (e) {
      return json({ error: 'NVIDIA request failed', message: String(e) }, 502, cors)
    }
    if (res.status === 404) continue // try the next model in the chain
    if (!res.ok) return json({ error: 'NVIDIA request failed', status: res.status }, res.status, cors)
    if (streamMode) {
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...cors,
        },
      })
    }
    const payload = await res.json().catch(() => null)
    if (!payload || !extractContent(payload)) {
      return json({ error: 'AI 返回内容为空', model_used: model }, 502, cors)
    }
    return json(payload, 200, cors)
  }
  return json({ error: 'No available vision model' }, 404, cors)
}

async function statsGet(env, cors) {
  if (!env.STATS) return json({ error: 'STATS KV binding not configured' }, 500, cors)
  // KV 键与线上既有数据一致为大写 SITE_PV；HTTP 响应字段仍为小写 site_pv（前端契约）
  const value = parseInt((await env.STATS.get('SITE_PV')) ?? '0', 10)
  return json({ site_pv: Number.isNaN(value) ? 0 : value }, 200, cors)
}

async function statsInc(env, cors, request) {
  // The counter is a vanity metric, but an unauthenticated write endpoint
  // should still not be floodable — a small per-IP budget is enough.
  const limit = checkRateLimit(request, { max: 30, windowMs: 60 * 1000 })
  if (limit.limited) {
    return json({ error: 'Too many requests, please retry later' }, 429, {
      ...cors,
      'Retry-After': String(limit.retryAfterSec),
    })
  }
  if (!env.STATS) return json({ error: 'STATS KV binding not configured' }, 500, cors)
  const current = parseInt((await env.STATS.get('SITE_PV')) ?? '0', 10) || 0
  // KV is eventually consistent; concurrent increments may collapse. Fine for
  // a vanity metric — use Durable Objects if exact counts ever matter.
  await env.STATS.put('SITE_PV', String(current + 1))
  return json({ ok: true }, 200, cors)
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request)
    const { pathname } = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (pathname === '/' && request.method === 'GET') {
      return new Response('Aura Online', { status: 200, headers: cors })
    }
    if (pathname === '/' && request.method === 'POST') return identify(request, env, cors)
    if (pathname === '/stats' && request.method === 'GET') return statsGet(env, cors)
    if (pathname === '/stats' && request.method === 'POST') return statsInc(env, cors, request)

    return json({ error: 'Not Found' }, 404, cors)
  },
}
