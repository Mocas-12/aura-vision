import type { IncomingMessage } from 'http'

type VercelResponseLike = {
  status: (code: number) => VercelResponseLike
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

export default async function handler(req: IncomingMessage, res: VercelResponseLike) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }
    const apiKey = process.env.NVIDIA_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'Missing NVIDIA_API_KEY' })
      return
    }
    let bodyStr = ''
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: Buffer) => {
        bodyStr += chunk.toString('utf-8')
      })
      req.on('end', () => resolve())
    })
    let input: { imageDataUrl?: string; prompt?: string } = {}
    try {
      input = JSON.parse(bodyStr || '{}')
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
    const imageUrl = (input.imageDataUrl ?? '').replace(/\s/g, '')
    if (!imageUrl) {
      res.status(400).json({ error: 'Missing imageDataUrl' })
      return
    }
    const promptText =
      (input.prompt ?? '请用中文总结图片内容或说明文大意，最多30字。').slice(0, 200)
    const payload = {
      model: 'meta/llama-3.2-11b-vision-instruct',
      temperature: 0.0,
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: '用简体中文一句话总结图片内容，不含英文，最多30字。' }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }
    const url = 'https://integrate.api.nvidia.com/v1/chat/completions'
    const nres = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await nres.text()
    try {
      const json = JSON.parse(text)
      res.status(nres.status).json(json)
    } catch {
      res.status(nres.status).json({ raw: text })
    }
  } catch (e: unknown) {
    let msg = 'Unknown error'
    if (e && typeof e === 'object' && 'message' in e) {
      const m = (e as Record<string, unknown>).message
      msg = typeof m === 'string' ? m : JSON.stringify(m)
    } else {
      msg = String(e)
    }
    res.status(500).json({ error: msg })
  }
}
