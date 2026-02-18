export type Recognition = {
  name: string
  intro: string
  facts: string
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? ''
}

export async function recognizeNearestCenterObject(opts: {
  apiKey: string
  imageDataUrl: string
  prompt?: string
}): Promise<Recognition | null> {
  const base64 = dataUrlToBase64(opts.imageDataUrl)
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
  const sysPrompt =
    '你是一个视觉识别助手。请分析图片，找到距离画面中心最近的单个物体，给出中文：名称(name)、简介(intro)、趣味科普(facts)。只返回一个JSON对象，例如：{"name":"xx","intro":"xx","facts":"xx"}。避免多余内容。'
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: opts.prompt ?? sysPrompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.6,
    },
  }
  try {
    const res = await fetch(`${url}?key=${encodeURIComponent(opts.apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    if (!res.ok) {
      return null
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
  } catch {
    return null
  }
  return null
}
