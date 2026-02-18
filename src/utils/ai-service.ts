export type Recognition = {
  name: string
  intro: string
  facts: string
}

function maskBearer(token: string): string {
  const len = token.length
  const head = token.slice(0, Math.min(6, len))
  const tail = token.slice(Math.max(0, len - 4))
  return `${head}${'*'.repeat(Math.max(0, len - head.length - tail.length))}${tail}`
}

export async function recognizeNearestCenterObject(opts: {
  apiKey: string
  imageDataUrl: string
  prompt?: string
}): Promise<Recognition | null> {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions'
  const requestBody = {
    model: 'moonshotai/kimi-k2.5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: opts.prompt ?? '识别图中物体并简要介绍' },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
  }
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    window.clearTimeout(timeout)
    if (!res.ok) {
      const errText = await res.text()
      console.error('NVIDIA API HTTP error', res.status, errText)
      return {
        name: '识别失败',
        intro: `${res.status} ${res.statusText || ''} | ${url} | ${maskBearer(opts.apiKey)}`.trim(),
        facts: `${errText.slice(0, 400)}\nBuild Time: ${new Date().toISOString()}`,
      }
    }
    const json: unknown = await res.json()
    const choices = (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? []
    const contentAny = choices[0]?.message?.content
    let text = ''
    if (typeof contentAny === 'string') {
      text = contentAny
    } else if (Array.isArray(contentAny)) {
      text = (contentAny as Array<{ type?: string; text?: string }>).map((p) => p?.text ?? '').filter(Boolean).join('\n')
    }
    if (!text) return null
    try {
      const parsed = JSON.parse(text) as { name?: unknown; intro?: unknown; facts?: unknown } | null
      if (parsed && typeof parsed === 'object') {
        const name = parsed.name != null ? String(parsed.name) : '未知物体'
        const intro = parsed.intro != null ? String(parsed.intro) : '无简介'
        const facts = parsed.facts != null ? String(parsed.facts) : ''
        return { name, intro, facts }
      }
    } catch {
      return {
        name: '识别结果',
        intro: text,
        facts: '',
      }
    }
  } catch (e) {
    console.error('NVIDIA API network error', e)
    const name = (e as { name?: string })?.name
    const intro = (e as { message?: string })?.message || String(e)
    return {
      name: '识别失败',
      intro: `${name ? name + ': ' : ''}${intro} | ${url} | ${maskBearer(opts.apiKey)}`,
      facts: `Build Time: ${new Date().toISOString()}`,
    }
  }
  return null
}
