import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import https from 'node:https'

// The api function does `require('https')`, which resolves to the same
// built-in module singleton an ESM import sees — so spying on it intercepts
// the upstream call (vi.mock cannot reach a native require).
import identify from '../identify.js'
import { jsonReq, jsonRes } from './helpers'

const SMALL_IMAGE = 'data:image/jpeg;base64,' + Buffer.from('tiny-frame').toString('base64')

// Per-test captured upstream calls.
let captured: { opts: Record<string, unknown>; body: string }[]
let ipSeq: number
let requestMock: ReturnType<typeof vi.spyOn>

// Queue of canned upstream responses; each https.request call consumes one.
function enqueueUpstream(responses: { status: number; body?: unknown }[]) {
  requestMock.mockImplementation((opts: Record<string, unknown>, cb: (r: unknown) => void) => {
    const next = responses.shift() ?? { status: 500, body: {} }
    return {
      setTimeout() {},
      on() {},
      end(body?: Buffer) {
        captured.push({ opts, body: String(body ?? '') })
        setImmediate(() => {
          cb({
            statusCode: next.status,
            on(event: string, handler: (c?: Buffer) => void) {
              if (event === 'data') handler(Buffer.from(JSON.stringify(next.body ?? {})))
              if (event === 'end') handler()
            },
          })
        })
      },
    }
  })
}

// Makes the upstream transport itself fail (network error path). callNvidia
// rejects via req.on('error'), which fires on a later tick so the handler is
// already attached.
function enqueueUpstreamFailure() {
  requestMock.mockImplementation((opts: Record<string, unknown>) => {
    let onError: ((e: Error) => void) | null = null
    return {
      setTimeout() {},
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'error') onError = cb as (e: Error) => void
      },
      end(body?: Buffer) {
        captured.push({ opts, body: String(body ?? '') })
        setImmediate(() => onError?.(new Error('ECONNRESET')))
      },
    }
  })
}

beforeEach(() => {
  vi.stubEnv('NVIDIA_API_KEY', 'test-key')
  captured = []
  ipSeq = 0
  requestMock = vi.spyOn(https, 'request').mockImplementation(() => null as unknown as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function freshHeaders() {
  return { 'x-forwarded-for': `10.4.0.${++ipSeq}` }
}

function upstreamPrompt(callIndex: number) {
  return JSON.parse(captured[callIndex].body).messages[0].content[1].text as string
}

describe('identify handler', () => {
  it('OPTIONS 预检返回 204；GET 健康检查返回 200', async () => {
    const options = jsonRes()
    await identify(jsonReq('OPTIONS'), options.res)
    expect(options.res.statusCode).toBe(204)

    const get = jsonRes()
    await identify(jsonReq('GET'), get.res)
    expect(get.res.statusCode).toBe(200)
    expect(get.json()).toEqual({ ok: true, method: 'GET' })
  })

  it('不支持的返回 405', async () => {
    const { res } = jsonRes()
    await identify(jsonReq('PUT'), res)
    expect(res.statusCode).toBe(405)
  })

  it('缺少 NVIDIA_API_KEY 返回 500', async () => {
    vi.stubEnv('NVIDIA_API_KEY', '')
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(500)
    expect(json().error).toMatch(/Missing NVIDIA_API_KEY/)
  })

  it('缺少图片返回 400', async () => {
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', {}, freshHeaders()), res)
    expect(res.statusCode).toBe(400)
    expect(json().error).toMatch(/Missing image/)
  })

  it('图片解码后超过 4.5MB 返回 413 并提示压缩', async () => {
    // ~4.6MB decoded → ~6.4MB base64 text, still under the 8MB body cap.
    const huge = 'A'.repeat(Math.ceil(4.6 * 1024 * 1024 * 4) / 3)
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: huge }, freshHeaders()), res)
    expect(res.statusCode).toBe(413)
    expect(json().error).toMatch(/compress/)
  })

  it('同一 IP 超过 10 次后被 429 限流', async () => {
    const headers = { 'x-forwarded-for': '10.5.0.1' }
    for (let i = 0; i < 10; i++) {
      const { res } = jsonRes()
      // Missing image → 400, but each POST still consumes one bucket slot.
      await identify(jsonReq('POST', {}, headers), res)
      expect(res.statusCode).toBe(400)
    }
    const { res } = jsonRes()
    await identify(jsonReq('POST', {}, headers), res)
    expect(res.statusCode).toBe(429)
  })

  it('成功路径：转发模型/密钥/剥离前缀的 base64，透传上游响应', async () => {
    enqueueUpstream([
      { status: 200, body: { choices: [{ message: { content: '【名称】：测试物品' } }] } },
    ])
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(200)
    expect(json().choices[0].message.content).toBe('【名称】：测试物品')

    expect(captured).toHaveLength(1)
    const { opts, body } = captured[0]
    expect(opts.hostname).toBe('integrate.api.nvidia.com')
    expect(opts.path).toBe('/v1/chat/completions')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const payload = JSON.parse(body)
    expect(payload.model).toBe('meta/llama-3.2-11b-vision-instruct')
    const parts = payload.messages[0].content
    expect(parts[0].image_url.url).toBe(SMALL_IMAGE)
    expect(parts[1].text).toMatch(/专业的视觉分析专家/) // default prompt
  })

  it('客户端 prompt 被清洗：过短/过长回退默认，合法的压缩空白后透传', async () => {
    enqueueUpstream([
      { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
      { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
      { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
    ])
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE, prompt: 'ab' }, freshHeaders()), jsonRes().res)
    await identify(
      jsonReq('POST', { imageDataUrl: SMALL_IMAGE, prompt: 'x'.repeat(501) }, freshHeaders()),
      jsonRes().res,
    )
    await identify(
      jsonReq('POST', { imageDataUrl: SMALL_IMAGE, prompt: '  识别图中   的商品  ' }, freshHeaders()),
      jsonRes().res,
    )

    // Both invalid prompts fall back to the same default…
    expect(upstreamPrompt(0)).toBe(upstreamPrompt(1))
    expect(upstreamPrompt(0)).toMatch(/专业的视觉分析专家/)
    // …while the valid one passes through with whitespace collapsed.
    expect(upstreamPrompt(2)).toBe('识别图中 的商品')
  })

  it('首个模型 404 时回退到链中下一个模型', async () => {
    enqueueUpstream([
      { status: 404, body: { error: 'model not found' } },
      { status: 200, body: { choices: [{ message: { content: 'fallback ok' } }] } },
    ])
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(200)
    expect(json().choices[0].message.content).toBe('fallback ok')
    expect(captured.map((c) => JSON.parse(c.body).model)).toEqual([
      'meta/llama-3.2-11b-vision-instruct',
      'meta/llama-3.2-90b-vision-instruct',
    ])
  })

  it('上游非 404 错误透传状态码', async () => {
    enqueueUpstream([{ status: 429, body: { error: 'rate limited upstream' } }])
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(429)
    expect(json().error).toMatch(/NVIDIA request failed/)
  })

  it('上游响应无内容返回 502', async () => {
    enqueueUpstream([{ status: 200, body: { choices: [] } }])
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(502)
    expect(json().error).toMatch(/返回内容为空/)
  })

  it('上游网络错误返回 502', async () => {
    enqueueUpstreamFailure()
    const { res, json } = jsonRes()
    await identify(jsonReq('POST', { imageDataUrl: SMALL_IMAGE }, freshHeaders()), res)
    expect(res.statusCode).toBe(502)
    expect(json().error).toMatch(/NVIDIA request failed/)
    expect(json().message).toMatch(/ECONNRESET/)
  })
})
