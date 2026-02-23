export type Recognition = {
  name: string
  intro: string
  facts: string
}

export async function recognizeNearestCenterObject(opts: {
  apiKey: string
  imageDataUrl: string
  prompt?: string
  signal?: AbortSignal
}): Promise<Recognition | null> {
  const url = 'https://square-bread-b238.a18577y.workers.dev/'
  const cleanImageUrl = opts.imageDataUrl.replace(/\s/g, '').replace(/^data:[^;]+;base64,/i, '')
  const requestBody = {
    imageDataUrl: cleanImageUrl,
    prompt: opts.prompt ?? '请用中文总结图片内容或说明文大意，最多30字。',
  }
  try {
    const headersUsed = { 'Content-Type': 'application/json' }
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: headersUsed,
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    })
    const responseText = await res.text()
    console.log('Worker Raw Response:', responseText)
    if (res.status === 404) {
      const debugHeaders = { ...headersUsed, Origin: window.location.origin, UserAgent: navigator.userAgent }
      console.log('Request Headers (debug):', debugHeaders)
      try {
        const alt = 'https://aura-vision-beige.vercel.app/api/identify'
        const res2 = await fetch(alt, {
          method: 'POST',
          mode: 'cors',
          headers: headersUsed,
          body: JSON.stringify(requestBody),
          signal: opts.signal,
        })
        if (res2.ok) {
          const t2 = await res2.text()
          console.log('Fallback Raw Response:', t2)
          return JSON.parse(t2)
        }
      } catch { /* ignore */ }
    }
    if (!res.ok) {
      console.error('Worker response error', res.status, responseText)
      throw new Error(responseText || `${res.status} ${res.statusText}`)
    }
    let json: unknown
    try {
      json = JSON.parse(responseText)
    } catch (err) {
      console.error('服务器返回原文:', responseText)
      if (err instanceof SyntaxError) {
        return {
          name: '识别失败',
          intro: '服务器返回格式异常',
          facts: '',
        }
      }
      throw err
    }
    const rawChoiceJson = (json as { raw_choice_json?: string | null }).raw_choice_json ?? null
    const choices = (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices ?? []
    const contentAny = choices?.[0]?.message?.content
    let text = ''
    if (typeof contentAny === 'string') {
      text = contentAny
    } else if (Array.isArray(contentAny)) {
      text = (contentAny as Array<{ type?: string; text?: string }>).map((p) => p?.text ?? '').filter(Boolean).join('\n')
    } else {
      text = ''
    }
    if (!text) {
      if (choices?.[0]) {
        try {
          text = JSON.stringify(choices[0])
        } catch {
          text = ''
        }
      }
      if (!text && rawChoiceJson) {
        text = rawChoiceJson
      }
    }
    if (!text) {
      throw new Error('AI 返回内容为空')
    }
    console.log('NVIDIA fullText:', text)
    {
      const onlyEnglish = text.replace(/[^a-zA-Z]/g, '')
      const englishChars = onlyEnglish.length
      const total = text.length
      if (total > 0 && englishChars / total > 0.5) {
        text = '【自动翻译总结】：' + text.slice(0, 30) + '...'
      }
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
      return {
        name: '识别结果',
        intro: text,
        facts: '',
      }
    }
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
      facts: `Build Time: ${new Date().toISOString()} -proxy-try`,
    }
  }
  return null
}
