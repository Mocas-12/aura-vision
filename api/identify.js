const https = require('https')
const { applyCors, checkRateLimit, sendJson, readJsonBody } = require('./_util.js')

const NVIDIA_HOST = 'integrate.api.nvidia.com'
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8000

const DEFAULT_PROMPT =
  '你是一个专业的视觉分析专家。请识别图中的物品，并按以下格式用中文回复：\n\n' +
  '【名称】：（如果是日文/英文，请翻译成中文名称）\n\n' +
  '【介绍】：（简述该物品的用途、主要特点。如果包装上有日语或英语说明，请提取核心信息并转化为中文介绍）\n' +
  '要求：语言专业且亲切，介绍字数控制在 80 字以内。\n' +
  '特别注意包装上的细小文字，优先识别品牌名和商品类别。'

// Both are real vision models on NVIDIA NIM; the 90B variant is the 404 fallback.
const MODEL_CHAIN = [
  process.env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-11b-vision-instruct',
  'meta/llama-3.2-90b-vision-instruct',
]

// Client prompts are honored but sanitized: plain text, bounded length.
function sanitizePrompt(input) {
  const text = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : ''
  if (text.length < 5 || text.length > 500) return DEFAULT_PROMPT
  return text
}

function callNvidia(model, base64, prompt) {
  const payload = {
    model,
    max_tokens: 1024,
    stream: false,
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
  }
  const body = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: NVIDIA_HOST,
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer ' + process.env.NVIDIA_API_KEY,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let parsed
          try {
            parsed = JSON.parse(text)
          } catch (e) {
            parsed = { raw: text }
          }
          resolve({ status: res.statusCode || 500, parsed })
        })
      }
    )
    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('upstream timeout')))
    req.on('error', reject)
    req.end(body)
  })
}

function extractContent(parsed) {
  const choices = parsed && Array.isArray(parsed.choices) ? parsed.choices : []
  for (const choice of choices) {
    const content = choice && choice.message && choice.message.content
    if (typeof content === 'string' && content.trim()) return content
    if (Array.isArray(content) && content.some((p) => p && p.text)) return content
  }
  return null
}

module.exports = async function (req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end('')
    return
  }
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, method: 'GET' })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    sendJson(res, 500, { error: 'Missing NVIDIA_API_KEY' })
    return
  }

  const limit = checkRateLimit(req, { max: 10, windowMs: 60 * 1000 })
  if (limit.limited) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    sendJson(res, 429, { error: 'Too many requests, please retry later' })
    return
  }

  let input
  try {
    input = await readJsonBody(req)
  } catch (e) {
    sendJson(res, e.status || 400, { error: e.message })
    return
  }

  const raw = String(input.imageDataUrl || input.base64 || input.image || '')
  const base64 = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '')
  if (!base64) {
    sendJson(res, 400, { error: 'Missing image base64' })
    return
  }
  const approxBytes = Math.floor(base64.length * 3 / 4)
  if (approxBytes > MAX_IMAGE_BYTES) {
    sendJson(res, 413, { error: 'Image too large, please compress before upload', approxBytes })
    return
  }

  const prompt = sanitizePrompt(input.prompt)

  let lastStatus = 502
  for (const model of MODEL_CHAIN) {
    let result
    try {
      result = await callNvidia(model, base64, prompt)
    } catch (e) {
      sendJson(res, 502, { error: 'NVIDIA request failed', message: String((e && e.message) || e) })
      return
    }
    if (result.status === 404) {
      lastStatus = 404
      continue // try next model in the chain
    }
    if (result.status >= 400) {
      sendJson(res, result.status, { error: 'NVIDIA request failed', status: result.status })
      return
    }
    if (!extractContent(result.parsed)) {
      sendJson(res, 502, { error: 'AI 返回内容为空', model_used: model })
      return
    }
    sendJson(res, 200, result.parsed)
    return
  }
  sendJson(res, lastStatus === 404 ? 404 : 502, { error: 'No available vision model' })
}
