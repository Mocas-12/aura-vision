import { WORKER_BASE } from './config'

export type Recognition = {
  name: string
  intro: string
  facts: string
}

// Marker embedded in `facts` for client-side diagnostics (timestamp etc.);
// the result panel shows facts only when it contains this marker.
export const DIAG_MARK = '诊断时间'

export function diagText(): string {
  return `${DIAG_MARK}: ${new Date().toISOString()}`
}

/** Pull the assistant text out of an NVIDIA-shaped chat completion response. */
export function extractModelText(json: unknown): string {
  if (json == null || typeof json !== 'object') return ''
  const choices = (json as { choices?: Array<Record<string, unknown>> }).choices ?? []
  for (const choice of choices) {
    const message = choice?.message as { content?: unknown } | undefined
    const delta = choice?.delta as { content?: unknown } | undefined
    const content = message?.content ?? delta?.content
    if (typeof content === 'string' && content.trim()) {
      return content
    }
    if (Array.isArray(content)) {
      const text = (content as Array<{ type?: string; text?: string }>)
        .map((p) => p?.text ?? '')
        .filter(Boolean)
        .join('\n')
      if (text.trim()) return text
    }
  }
  return ''
}

/** Clean raw model output and shape it into a Recognition. */
export function buildRecognition(rawText: string): Recognition {
  const text = String(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  if (!text) {
    return { name: '识别结果', intro: 'AI 返回内容为空', facts: '' }
  }
  try {
    const parsed = JSON.parse(text) as { name?: unknown; intro?: unknown; facts?: unknown } | null
    if (parsed && typeof parsed === 'object') {
      const name = parsed.name != null ? String(parsed.name) : '未知物体'
      const intro = parsed.intro != null ? String(parsed.intro) : '无简介'
      const facts = parsed.facts != null ? String(parsed.facts) : ''
      return { name, intro, facts }
    }
  } catch {
    // not JSON — show the text as-is
  }
  return { name: '识别结果', intro: text, facts: '' }
}

/** Map a thrown fetch/abort error into the failure Recognition shape. */
function failureRecognition(e: unknown): Recognition {
  const name = (e as { name?: string })?.name
  let intro = (e as { message?: string })?.message || String(e)
  if (name === 'TypeError' && typeof intro === 'string' && intro.includes('Load failed')) {
    intro = '识别受阻：请检查手机是否开启了“内容拦截器”或“私密转送”，或尝试更换网络。'
  }
  // Upstream auth failure — the operator-facing root cause, in plain words.
  if (typeof intro === 'string' && intro.includes('服务器响应异常 (401)')) {
    intro = '服务端识别密钥未配置或已失效（401）'
  }
  return {
    name: '识别失败',
    intro: `${name ? name + ': ' : ''}${intro}`,
    facts: diagText(),
  }
}

/** Parse a buffered chat-completion response body into a Recognition. */
function recognitionFromJsonText(responseText: string): Recognition {
  let json: unknown
  try {
    json = JSON.parse(responseText)
  } catch (err) {
    console.error('服务器返回原文:', responseText)
    if (err instanceof SyntaxError) {
      return { name: '识别失败', intro: '服务器返回格式异常', facts: '' }
    }
    throw err
  }
  const text = extractModelText(json)
  if (!text) {
    throw new Error('AI 返回内容为空')
  }
  return buildRecognition(text)
}

const DEFAULT_USER_PROMPT = '请用简体中文总结图片内容或说明文大意，最多30字，不要输出英文句子。'

export async function recognizeNearestCenterObject(opts: {
  imageDataUrl: string
  prompt?: string
  signal?: AbortSignal
}): Promise<Recognition | null> {
  const url = `${WORKER_BASE}?t=${Date.now()}`
  const cleanImageUrl = opts.imageDataUrl.replace(/\s/g, '').replace(/^data:[^;]+;base64,/i, '')
  const requestBody = {
    imageDataUrl: cleanImageUrl,
    prompt: opts.prompt ?? DEFAULT_USER_PROMPT,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    })
    const responseText = await res.text()
    if (!res.ok) {
      console.error('Worker response error', res.status, responseText)
      throw new Error(`服务器响应异常 (${res.status}): ${responseText}`)
    }
    return recognitionFromJsonText(responseText)
  } catch (e) {
    console.error('NVIDIA API network error', e)
    return failureRecognition(e)
  }
}

/**
 * Streaming twin of recognizeNearestCenterObject. Sends `stream: true` and
 * forwards each SSE content delta to onDelta as it arrives; resolves with the
 * final Recognition. Graceful degradation: if the backend does not answer
 * with an SSE stream (old Worker without stream support), the JSON body is
 * parsed whole and onDelta never fires — callers must handle both cases.
 */
export async function recognizeNearestCenterObjectStream(opts: {
  imageDataUrl: string
  prompt?: string
  signal?: AbortSignal
  onDelta?: (delta: string, accumulated: string) => void
}): Promise<Recognition | null> {
  const url = `${WORKER_BASE}?t=${Date.now()}`
  const cleanImageUrl = opts.imageDataUrl.replace(/\s/g, '').replace(/^data:[^;]+;base64,/i, '')
  const requestBody = {
    imageDataUrl: cleanImageUrl,
    prompt: opts.prompt ?? DEFAULT_USER_PROMPT,
    stream: true,
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    })
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok) {
      const responseText = await res.text()
      console.error('Worker response error', res.status, responseText)
      throw new Error(`服务器响应异常 (${res.status}): ${responseText}`)
    }
    if (!contentType.includes('text/event-stream')) {
      // Backend predates stream support — one buffered JSON payload.
      return recognitionFromJsonText(await res.text())
    }
    const reader = res.body?.getReader()
    if (!reader) {
      throw new Error('响应流不可读')
    }
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let accumulated = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const delta = extractModelText(JSON.parse(payload))
          if (delta) {
            accumulated += delta
            opts.onDelta?.(delta, accumulated)
          }
        } catch {
          // skip malformed SSE lines instead of failing the whole stream
        }
      }
    }
    return buildRecognition(accumulated)
  } catch (e) {
    console.error('NVIDIA API stream error', e)
    return failureRecognition(e)
  }
}
