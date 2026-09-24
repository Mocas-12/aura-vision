// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import { useRecognition } from '../useRecognition'
import { getCount, setCount } from '../../utils/quota'

const streamMock = vi.fn()

vi.mock('../../utils/ai-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/ai-service')>()
  return {
    ...actual,
    recognizeNearestCenterObjectStream: (opts: unknown) => streamMock(opts),
  }
})

const FAILURE = { name: '识别失败', intro: 'Error: 服务器响应异常 (401)', facts: '' }

function setup() {
  const videoEl = document.createElement('video')
  // videoWidth/videoHeight are getter-only on the prototype; pin instance values.
  Object.defineProperty(videoEl, 'videoWidth', { value: 640 })
  Object.defineProperty(videoEl, 'videoHeight', { value: 480 })
  const videoRef = { current: videoEl } as RefObject<HTMLVideoElement | null>
  const canvasRef = {
    current: document.createElement('canvas'),
  } as RefObject<HTMLCanvasElement | null>
  const audioCtxRef = { current: null } as RefObject<AudioContext | null>
  const onQuotaExhausted = vi.fn()
  const hook = renderHook(() =>
    useRecognition({
      videoRef,
      canvasRef,
      cameraReady: true,
      audioCtxRef,
      autoMode: true,
      onQuotaExhausted,
    }),
  )
  return { ...hook, onQuotaExhausted }
}

beforeEach(() => {
  localStorage.clear()
  setCount(0)
  // jsdom canvas has no 2d context; stub just enough for the frame capture path.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,TEST',
  )
  streamMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useRecognition', () => {
  it('流提前落定失败时立即呈现结果，而非等待 8s 被改判为超时', async () => {
    // 回归测试：401 等错误响应没有 delta，旧实现只盯首 token，把瞬时错误
    // 硬等成"识别超时"。
    streamMock.mockResolvedValue(FAILURE)
    const { result } = setup()
    const started = Date.now()
    await act(async () => {
      await result.current.triggerRecognize(true)
    })
    expect(result.current.rec?.name).toBe('识别失败')
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('流式 delta 驱动 liveText，成功结果消耗一次额度', async () => {
    streamMock.mockImplementation(async (opts: {
      onDelta?: (delta: string, accumulated: string) => void
    }) => {
      opts.onDelta?.('黑色', '黑色')
      opts.onDelta?.('图像', '黑色图像')
      return { name: '识别结果', intro: '黑色图像', facts: '' }
    })
    const { result } = setup()
    await act(async () => {
      await result.current.triggerRecognize(true)
    })
    expect(result.current.rec).toEqual({ name: '识别结果', intro: '黑色图像', facts: '' })
    expect(result.current.liveText).toBeNull() // finally 清空直播文本
    expect(getCount()).toBe(1)
  })

  it('相同结果（签名一致）不重复扣减额度', async () => {
    streamMock.mockResolvedValue({ name: '识别结果', intro: '同一句话', facts: '' })
    const { result } = setup()
    await act(async () => {
      await result.current.triggerRecognize(true)
    })
    await act(async () => {
      await result.current.triggerRecognize(true)
    })
    expect(getCount()).toBe(1)
  })

  it('8 秒无首 token 判定识别超时', async () => {
    vi.useFakeTimers()
    streamMock.mockReturnValue(new Promise(() => {})) // 永不落定、无 delta
    const { result } = setup()
    const pending = act(async () => {
      await result.current.triggerRecognize(true)
    })
    await vi.advanceTimersByTimeAsync(8000)
    await pending
    expect(result.current.rec?.name).toBe('识别超时')
  })
})
