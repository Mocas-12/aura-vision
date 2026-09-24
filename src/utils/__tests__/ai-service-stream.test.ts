import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recognizeNearestCenterObjectStream } from '../ai-service'

// btoa('tiny-frame') — a literal keeps this file free of Node-only globals.
const IMAGE = 'data:image/jpeg;base64,dGlueS1mcmFtZQ=='

function sseFetchResponse(events: unknown[]) {
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

const sseEvent = (text: string) => ({ choices: [{ delta: { content: text } }] })

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recognizeNearestCenterObjectStream', () => {
  it('逐 delta 回调并累积，最终解析出 Recognition', async () => {
    fetchMock.mockResolvedValueOnce(sseFetchResponse([sseEvent('这是'), sseEvent('一个'), sseEvent('马克杯')]))
    const deltas: string[] = []
    let lastAccumulated = ''
    const rec = await recognizeNearestCenterObjectStream({
      imageDataUrl: IMAGE,
      onDelta: (_delta, accumulated) => {
        deltas.push(accumulated)
        lastAccumulated = accumulated
      },
    })
    expect(deltas).toEqual(['这是', '这是一个', '这是一个马克杯'])
    expect(lastAccumulated).toBe('这是一个马克杯')
    expect(rec).toEqual({ name: '识别结果', intro: '这是一个马克杯', facts: '' })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body).stream).toBe(true)
    expect(JSON.parse(init.body).imageDataUrl).toBe('dGlueS1mcmFtZQ==')
    expect(init.headers.Accept).toBe('text/event-stream')
  })

  it('后端不支持流式（返回 JSON）时优雅回退，不触发 onDelta', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: '整包文本' } }] }),
    )
    const onDelta = vi.fn()
    const rec = await recognizeNearestCenterObjectStream({ imageDataUrl: IMAGE, onDelta })
    expect(onDelta).not.toHaveBeenCalled()
    expect(rec).toEqual({ name: '识别结果', intro: '整包文本', facts: '' })
  })

  it('SSE 里的结构化 JSON 文本在完成后被 buildRecognition 解析', async () => {
    const jsonText = '{"name":"水杯","intro":"用于饮水"}'
    fetchMock.mockResolvedValueOnce(
      sseFetchResponse([sseEvent(jsonText)]),
    )
    const rec = await recognizeNearestCenterObjectStream({ imageDataUrl: IMAGE })
    expect(rec).toEqual({ name: '水杯', intro: '用于饮水', facts: '' })
  })

  it('HTTP 错误映射为识别失败并带诊断信息', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const rec = await recognizeNearestCenterObjectStream({ imageDataUrl: IMAGE })
    expect(rec?.name).toBe('识别失败')
    expect(rec?.intro).toContain('500')
    expect(rec?.facts).toContain('诊断时间')
  })

  it('畸形 SSE 行被跳过而不中断整个流', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': comment ping\n\n'))
        controller.enqueue(encoder.encode('data: not-json\n\n'))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseEvent('好文本'))}\n\n`))
        controller.close()
      },
    })
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    )
    const rec = await recognizeNearestCenterObjectStream({ imageDataUrl: IMAGE })
    expect(rec).toEqual({ name: '识别结果', intro: '好文本', facts: '' })
  })
})
