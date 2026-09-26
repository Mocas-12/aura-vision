import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './worker.js'

const ENV = {
  NVIDIA_API_KEY: 'test-key',
  STATS: { get: vi.fn(), put: vi.fn() },
  ALLOWED_ORIGINS: '',
}

const ORIGIN = 'https://mocas-12.github.io'
const IMAGE = Buffer.from('tiny-frame').toString('base64')

function identifyRequest(body: unknown, ip?: string) {
  return new Request('https://worker.test/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      // Unique per request by default so the in-memory rate-limit buckets
      // never leak between tests; the dedicated 429 test pins one IP.
      'cf-connecting-ip': ip ?? `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: JSON.stringify(body),
  })
}

function sseResponse(events: unknown[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker identify (stream mode)', () => {
  it('POST stream:true 以 text/event-stream 原样透传上游 SSE', async () => {
    const upstreamEvent = { choices: [{ delta: { content: '流式' } }] }
    fetchMock.mockResolvedValueOnce(sseResponse([upstreamEvent]))

    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${IMAGE}`, stream: true }),
      ENV,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(await res.text()).toBe(`data: ${JSON.stringify(upstreamEvent)}\n\ndata: [DONE]\n\n`)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions')
    const payload = JSON.parse(init.body)
    expect(payload.stream).toBe(true)
    expect(payload.model).toBe('meta/llama-3.2-11b-vision-instruct')
    expect(payload.messages[0]).toEqual({ role: 'system', content: expect.stringContaining('简体中文') })
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.headers.Accept).toBe('text/event-stream')
  })

  it('stream:true 下首个模型 404 时回退到备选模型', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(sseResponse([{ choices: [{ delta: { content: 'ok' } }] }]))

    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${IMAGE}`, stream: true }),
      ENV,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      'meta/llama-3.2-11b-vision-instruct',
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
      'meta/llama-3.2-90b-vision-instruct',
    )
  })

  it('不带 stream 标志时保持原 JSON 契约不变', async () => {
    const payload = { choices: [{ message: { content: '整包返回' } }] }
    fetchMock.mockResolvedValueOnce(Response.json(payload))

    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${IMAGE}` }),
      ENV,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toEqual(payload)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(false)
  })

  it('stream:true 下上游非 404 错误仍返回 JSON 错误', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: 'rate limited' }, { status: 429 }),
    )
    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${IMAGE}`, stream: true }),
      ENV,
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toMatchObject({ error: 'NVIDIA request failed' })
  })

  it('声明体积超过 8MB 的请求体直接 413，不做上游调用', async () => {
    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${'x'.repeat(9 * 1024 * 1024)}` }),
      ENV,
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: 'Request body too large' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('同一 IP 第 11 次 POST 被 429 并带 Retry-After', async () => {
    const pinnedIp = '203.0.113.7'
    for (let i = 0; i < 10; i++) {
      const res = await worker.fetch(identifyRequest({}, pinnedIp), ENV)
      expect(res.status).toBe(400) // 缺图片 → 400，但占满限流桶
    }
    const res = await worker.fetch(
      identifyRequest({ imageDataUrl: `data:image/jpeg;base64,${IMAGE}` }, pinnedIp),
      ENV,
    )
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
  })

  it('POST /stats 超 30 次/分后同样 429', async () => {
    const pinnedIp = '203.0.113.8'
    let last!: Response
    for (let i = 0; i <= 30; i++) {
      last = await worker.fetch(
        new Request('https://worker.test/stats', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'cf-connecting-ip': pinnedIp },
        }),
        ENV,
      )
    }
    expect(last.status).toBe(429)
  })
})
