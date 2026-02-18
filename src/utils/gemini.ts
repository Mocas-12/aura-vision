export type Recognition = {
  name: string
  intro: string
  facts: string
}

function dataUrlToBase64(dataUrl: string): string {
  const parts = dataUrl.split(',')
  const raw = parts.length > 1 ? parts[1] : parts[0]
  return (raw ?? '').replace(/\s+/g, '')
}

function maskKeyInUrl(url: string): string {
  const m = url.match(/([?&]key=)([^&]+)/)
  if (!m) return url
  const key = m[2]
  const len = key.length
  const head = key.slice(0, Math.min(6, len))
  const tail = key.slice(Math.max(0, len - 4))
  const masked = `${head}${'*'.repeat(Math.max(0, len - head.length - tail.length))}${tail}`
  return url.replace(key, masked)
}

export async function recognizeNearestCenterObject(opts: {
  apiKey: string
  imageDataUrl: string
  prompt?: string
}): Promise<Recognition | null> {
  const base64 = dataUrlToBase64(opts.imageDataUrl)
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    encodeURIComponent(opts.apiKey)
  const requestBody = {
    contents: [
      {
        parts: [
          { text: opts.prompt ?? '识别图中物体' },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64,
            },
          },
        ],
      },
    ],
  }
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    window.clearTimeout(timeout)
    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini API HTTP error', res.status, errText)
      return {
        name: '识别失败',
        intro: `${res.status} ${res.statusText || ''} | ${maskKeyInUrl(url)}`.trim(),
        facts: `${errText.slice(0, 400)}\nBuild Time: ${new Date().toISOString()}`,
      }
    }
    const json: unknown = await res.json()
    const candidates = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates ?? []
    const parts = candidates[0]?.content?.parts ?? []
    const text = parts.map((p) => p?.text ?? '').filter(Boolean).join('\n') ?? ''
    if (!text) return null
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        return {
          name: String(parsed.name ?? '未知物体'),
          intro: String(parsed.intro ?? '无简介'),
          facts: String(parsed.facts ?? '无科普'),
        }
      }
    } catch {
      const sanitize = (s: string) => s.replace(/^[^{]*\{/, '{').replace(/\}[^}]*$/, '}')
      try {
        const parsed = JSON.parse(sanitize(text))
        return {
          name: String(parsed.name ?? '未知物体'),
          intro: String(parsed.intro ?? '无简介'),
          facts: String(parsed.facts ?? '无科普'),
        }
      } catch {
        return {
          name: '识别失败',
          intro: '模型未返回有效JSON',
          facts: text.slice(0, 400),
        }
      }
    }
  } catch (e) {
    console.error('Gemini API network error', e)
    const intro = (e as { message?: string })?.message || String(e)
    return {
      name: '识别失败',
      intro: `${intro} | ${maskKeyInUrl(url)}`,
      facts: `Build Time: ${new Date().toISOString()}`,
    }
  }
  return null
}
