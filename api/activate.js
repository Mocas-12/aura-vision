const { applyCors, checkRateLimit, sendJson, readJsonBody } = require('./_util.js')

// Legacy demo format; only used when ACTIVATION_CODES is not configured.
const LEGACY_CODE_RE = /^CY[A-Z0-9]{3}S1X$/

// Valid codes come from the ACTIVATION_CODES env var (separated by comma, semicolon or newline).
function loadValidCodes() {
  return new Set(
    String(process.env.ACTIVATION_CODES || '')
      .split(/[,;\n\r]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  )
}

function validateCode(code) {
  const validCodes = loadValidCodes()
  if (validCodes.size > 0) return validCodes.has(code)
  // Demo mode: no code list configured, fall back to the legacy format check.
  return LEGACY_CODE_RE.test(code)
}

module.exports = async function (req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end('')
    return
  }
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'activate' })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  const limit = checkRateLimit(req, { max: 10, windowMs: 60 * 1000 })
  if (limit.limited) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    sendJson(res, 429, { error: 'Too many attempts, please retry later' })
    return
  }

  let input
  try {
    input = await readJsonBody(req, { maxBytes: 16 * 1024 })
  } catch (e) {
    sendJson(res, e.status || 400, { error: e.message })
    return
  }

  const code = String(input.code || '').trim().toUpperCase()
  if (!code) {
    sendJson(res, 400, { ok: false, error: 'Missing code' })
    return
  }
  if (validateCode(code)) {
    sendJson(res, 200, { ok: true })
  } else {
    sendJson(res, 403, { ok: false, error: 'Invalid activation code' })
  }
}
