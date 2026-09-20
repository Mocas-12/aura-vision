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

export async function recognizeNearestCenterObject(opts: {
  imageDataUrl: string
  prompt?: string
  signal?: AbortSignal
}): Promise<Recognition | null> {
  const url = `${WORKER_BASE}?t=${Date.now()}`
  const cleanImageUrl = opts.imageDataUrl.replace(/\s/g, '').replace(/^data:[^;]+;base64,/i, '')
  const requestBody = {
    imageDataUrl: cleanImageUrl,
    prompt: opts.prompt ?? '请用中文总结图片内容或说明文大意，最多30字。',
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    })
    const responseText = await res.text()
    if (!res.ok) {
      console.error('Worker response error', res.status, responseText)
      throw new Error(`服务器响应异常 (${res.status}): ${responseText}`)
    }
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
  } catch (e) {
    console.error('NVIDIA API network error', e)
    const name = (e as { name?: string })?.name
    let intro = (e as { message?: string })?.message || String(e)
    if (name === 'TypeError' && typeof intro === 'string' && intro.includes('Load failed')) {
      intro = '识别受阻：请检查手机是否开启了“内容拦截器”或“私密转送”，或尝试更换网络。'
    }
    return {
      name: '识别失败',
      intro: `${name ? name + ': ' : ''}${intro}`,
      facts: diagText(),
    }
  }
}
