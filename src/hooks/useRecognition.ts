import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  recognizeNearestCenterObject,
  diagText,
  type Recognition,
} from '../utils/ai-service'
import { useTypewriter } from './useTypewriter'
import { isPro, remaining, getCount, setCount, QUOTA } from '../utils/quota'

interface UseRecognitionOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  cameraReady: boolean
  audioCtxRef: RefObject<AudioContext | null>
  autoMode: boolean
  /** Called when the free quota is used up and activation is required. */
  onQuotaExhausted: () => void
}

/**
 * The recognition pipeline: frame capture, request lifecycle (busy/proc state,
 * abort, 8s timeout), quota consumption, completion beep, the 5s auto-mode
 * interval, and the streamed typewriter rendering of the latest result.
 */
export function useRecognition({
  videoRef,
  canvasRef,
  cameraReady,
  audioCtxRef,
  autoMode,
  onQuotaExhausted,
}: UseRecognitionOptions) {
  const [rec, setRec] = useState<Recognition | null>(null)
  const [busy, setBusy] = useState(false)
  // Mirror of `busy` readable synchronously inside the interval callback
  // (state updates are async, a bare state check would let requests pile up).
  const busyRef = useRef(false)
  const setBusyState = useCallback((v: boolean) => {
    busyRef.current = v
    setBusy(v)
  }, [])
  const lastSigRef = useRef<string>('')
  const [proc, setProc] = useState<string>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const [silenceUntil, setSilenceUntil] = useState<number>(0)
  const lastSuccessRef = useRef<boolean>(false)
  const [manualLoading, setManualLoading] = useState(false)

  const [typedName, typingName] = useTypewriter(rec?.name ?? '', 15)
  const [typedIntro, typingIntro] = useTypewriter(rec?.intro ?? '', 10)
  const [typedFacts, typingFacts] = useTypewriter(rec?.facts ?? '', 10)
  const streaming = typingName || typingIntro || typingFacts

  const triggerRecognize = useCallback(async (isManual: boolean = false) => {
    if (!cameraReady) return
    if (isManual) {
      if (abortRef.current) {
        try { abortRef.current.abort() } catch (e) { console.warn('abort previous request error', e) }
        abortRef.current = null
      }
      setBusyState(false)
    } else {
      if (busyRef.current) return
      if (!autoMode) return
      if (Date.now() < silenceUntil) return
    }
    if (streaming) return
    if (!isPro()) {
      const r = remaining()
      if (r <= 0) {
        onQuotaExhausted()
        return
      }
    }
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) {
      setRec({ name: '未获取到画面', intro: '请检查摄像头权限或设备', facts: '' })
      return
    }
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) {
      setRec({ name: '未获取到画面', intro: '渲染上下文不可用', facts: '' })
      return
    }
    ctx.drawImage(v, 0, 0, c.width, c.height)
    const side = Math.floor(Math.min(c.width, c.height) * 0.6)
    const cx = Math.floor(c.width / 2)
    const cy = Math.floor(c.height / 2)
    const sx = cx - Math.floor(side / 2)
    const sy = cy - Math.floor(side / 2)
    const crop = document.createElement('canvas')
    crop.width = side
    crop.height = side
    const cctx = crop.getContext('2d')
    cctx?.drawImage(c, sx, sy, side, side, 0, 0, side, side)
    const targetSize = Math.min(side, 640)
    const out = document.createElement('canvas')
    out.width = targetSize
    out.height = targetSize
    const octx = out.getContext('2d')
    octx?.drawImage(crop, 0, 0, side, side, 0, 0, targetSize, targetSize)
    const dataUrl = out.toDataURL('image/jpeg', 0.2).replace(/\s/g, '')
    setBusyState(true)
    if (isManual) setManualLoading(true)
    setProc('fetching')
    if (abortRef.current) {
      try {
        abortRef.current.abort()
      } catch (err) {
        console.warn('abort previous request error', err)
      }
      abortRef.current = null
    }
    abortRef.current = new AbortController()
    const controller = abortRef.current
    try {
      const timeoutTag = Symbol('timeout')
      const resultOrTimeout = await Promise.race([
        recognizeNearestCenterObject({
          imageDataUrl: dataUrl,
          signal: controller.signal,
        }),
        new Promise<Recognition | symbol>((resolve) =>
          setTimeout(() => resolve(timeoutTag), 8000),
        ),
      ])
      if (resultOrTimeout === timeoutTag) {
        console.warn('Processing Status: timeout')
        setProc('timeout')
        setRec({ name: '识别超时', intro: '请重试', facts: diagText() })
        setBusyState(false)
        abortRef.current?.abort()
        abortRef.current = null
        if (isManual) setManualLoading(false)
        return
      }
      const result = resultOrTimeout as Recognition | null
      if (result) {
        setRec(result)
        setProc('done')
        const ok = result.name !== '识别失败'
        lastSuccessRef.current = ok
        // Quota is only consumed by successful recognitions.
        if (ok && !isPro()) {
          const next = getCount() + 1
          setCount(next)
          if (QUOTA - next <= 0) {
            onQuotaExhausted()
          }
        }
        try {
          const el = resultRef.current
          if (el) {
            el.scrollTop = el.scrollHeight
          }
        } catch { void 0 }
        if (ok) {
          const sig = `${result.name}|${result.intro}`
          if (sig !== lastSigRef.current) {
            const actx = audioCtxRef.current
            if (actx) {
              const o = actx.createOscillator()
              const g = actx.createGain()
              o.type = 'sine'
              o.frequency.setValueAtTime(880, actx.currentTime)
              g.gain.setValueAtTime(0, actx.currentTime)
              g.gain.linearRampToValueAtTime(0.2, actx.currentTime + 0.01)
              g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.25)
              o.connect(g)
              g.connect(actx.destination)
              o.start()
              o.stop(actx.currentTime + 0.25)
            }
            lastSigRef.current = sig
          }
        }
      } else {
        setRec({ name: '网络繁忙', intro: '请稍后重试', facts: diagText() })
        setProc('empty')
      }
    } catch (e) {
      console.error('Processing Status: error', e)
      const name = (e as { name?: string })?.name
      let intro = (e as { message?: string })?.message || String(e)
      if (name === 'TypeError' && typeof intro === 'string' && intro.includes('Load failed')) {
        intro = '识别受阻：请检查手机是否开启了“内容拦截器”或“私密转送”，或尝试更换网络。'
      }
      setRec({ name: '识别失败', intro: `${name ? name + ': ' : ''}${intro}`, facts: diagText() })
      setProc('error')
    } finally {
      setBusyState(false)
      abortRef.current = null
      if (isManual) setManualLoading(false)
    }
  }, [cameraReady, autoMode, streaming, silenceUntil, setBusyState, videoRef, canvasRef, audioCtxRef, onQuotaExhausted])

  // Keep a ref to the latest callback so the 5s interval stays mounted and its
  // cadence does not reset whenever a dependency of triggerRecognize changes.
  const triggerRef = useRef(triggerRecognize)
  useEffect(() => {
    triggerRef.current = triggerRecognize
  })
  useEffect(() => {
    const id = window.setInterval(() => {
      void triggerRef.current()
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (proc !== 'done') return
    try {
      const el = resultRef.current
      if (el) {
        setTimeout(() => {
          el.scrollTop = el.scrollHeight
        }, 50)
      }
    } catch { void 0 }
  }, [typedIntro, typedFacts, proc])

  useEffect(() => {
    if (proc === 'done' && !streaming && lastSuccessRef.current) {
      setSilenceUntil(Date.now() + 5000)
    }
  }, [proc, streaming])

  return {
    rec,
    busy,
    manualLoading,
    streaming,
    typedName,
    typedIntro,
    typedFacts,
    resultRef,
    triggerRecognize,
  }
}
