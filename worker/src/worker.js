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
const UPSTREAM_TIMEOUT_MS = 8000

const DEFAULT_PROMPT =
  '你是一个专业的视觉分析专家。请识别图中的物品，并按以下格式用中文回复：\n\n' +
  '【名称】：（如果是日文/英文，请翻译成中文名称）\n\n' +
  '【介绍】：（简述该物品的用途、主要特点。如果包装上有日语或英语说明，请提取核心信息并转化为中文介绍）\n' +
  '要求：语言专业且亲切，介绍字数控制在 80 字以内。\n' +
  '特别注意包装上的细小文字，优先识别品牌名和商品类别。'

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
  let input
  try {
    input = await request.json()
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

async function statsInc(env, cors) {
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
    if (pathname === '/stats' && request.method === 'POST') return statsInc(env, cors)

    return json({ error: 'Not Found' }, 404, cors)
  },
}
