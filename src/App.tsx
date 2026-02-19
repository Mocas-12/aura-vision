import { useEffect, useRef, useState } from 'react'
import { recognizeNearestCenterObject, type Recognition } from './utils/ai-service'
import { useTypewriter } from './hooks/useTypewriter'

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const apiKey = '' as const
  const [rec, setRec] = useState<Recognition | null>(null)
  const [busy, setBusy] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastSigRef = useRef<string>('')
  const buildTimeRef = useRef<string>(new Date().toISOString())
  const [proc, setProc] = useState<string>('idle')
  const isProcessingRef = useRef<boolean>(false)
  const abortRef = useRef<AbortController | null>(null)
  const [apiWarn, setApiWarn] = useState<string | null>(null)
  const [viewCount, setViewCount] = useState<number>(0)
  const [visitorCount, setVisitorCount] = useState<number>(1)

  const typedName = useTypewriter(rec?.name ?? '', 15)
  const typedIntro = useTypewriter(rec?.intro ?? '', 10)
  const typedFacts = useTypewriter(rec?.facts ?? '', 10)

  useEffect(() => {
    const initialVideo = videoRef.current
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        setCameraReady(true)
        if (!audioCtxRef.current) {
          const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
          const AC = w.AudioContext ?? w.webkitAudioContext
          if (AC) {
            audioCtxRef.current = new AC()
            audioCtxRef.current.resume().catch(() => {})
          }
        }
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name
        const message =
          name === 'NotAllowedError'
            ? '摄像头访问被拒绝，请在浏览器设置中允许相机权限。'
            : '无法访问摄像头，请检查设备或权限。'
        setCameraError(message)
      }
    }
    start()
    return () => {
      const stream = initialVideo?.srcObject as MediaStream | null
      stream?.getTracks()?.forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    const k1 = 'aura-vision-views'
    const v = Number(localStorage.getItem(k1) || '0') + 1
    localStorage.setItem(k1, String(v))
    setViewCount(v)
    const k2 = 'aura-vision-visitor-id'
    let id = localStorage.getItem(k2)
    if (!id) {
      id = Math.random().toString(36).slice(2)
      localStorage.setItem(k2, id)
    }
    setVisitorCount(1)
  }, [])

  useEffect(() => {
    let done = false
    fetch('/api/identify', { method: 'GET' })
      .then((r) => {
        if (!done && r.status === 404) {
          setApiWarn('API 路由未配置')
        }
      })
      .catch(() => {})
    return () => {
      done = true
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!cameraReady) return
      // 后端已使用 NVIDIA_API_KEY，不再需要前端密钥
      if (busy || isProcessingRef.current) return
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
      let dataUrl: string | null = out.toDataURL('image/jpeg', 0.2)
      dataUrl = dataUrl?.replace(/\s/g, '') ?? null
      setBusy(true)
      setProc('fetching')
      isProcessingRef.current = true
      if (abortRef.current) {
        try {
          abortRef.current.abort()
        } catch (err) {
          console.warn('abort previous request error', err)
        }
        abortRef.current = null
      }
      abortRef.current = new AbortController()
      try {
        const timeoutTag = Symbol('timeout')
        const resultOrTimeout = await Promise.race([
          recognizeNearestCenterObject({
            apiKey,
            imageDataUrl: dataUrl!,
            signal: abortRef.current.signal,
          }),
          new Promise<Recognition | symbol>((resolve) =>
            setTimeout(() => resolve(timeoutTag), 8000),
          ),
        ])
        if (resultOrTimeout === timeoutTag) {
          console.warn('Processing Status: timeout')
          setProc('timeout')
          setRec({ name: '识别超时', intro: '请重试', facts: `Build Time: ${new Date().toISOString()} -proxy-try` })
          setBusy(false)
          isProcessingRef.current = false
          abortRef.current?.abort()
          abortRef.current = null
          dataUrl = null
          return
        }
        const result = resultOrTimeout as Recognition | null
        if (result) {
          setRec(result)
          setProc('done')
          if (result.name !== '识别失败') {
            const sig = `${result.name}|${result.intro}`
            if (sig !== lastSigRef.current) {
              const ctx = audioCtxRef.current
              if (ctx) {
                const o = ctx.createOscillator()
                const g = ctx.createGain()
                o.type = 'sine'
                o.frequency.setValueAtTime(880, ctx.currentTime)
                g.gain.setValueAtTime(0, ctx.currentTime)
                g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01)
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
                o.connect(g)
                g.connect(ctx.destination)
                o.start()
                o.stop(ctx.currentTime + 0.25)
              }
              lastSigRef.current = sig
            }
          }
        } else {
          setRec({ name: '网络繁忙', intro: '请稍后重试', facts: `Build Time: ${new Date().toISOString()} -proxy-try` })
          setProc('empty')
        }
      } catch (e) {
        console.error('Processing Status: error', e)
        const name = (e as { name?: string })?.name
        let intro = (e as { message?: string })?.message || String(e)
        if (name === 'TypeError' && typeof intro === 'string' && intro.includes('Load failed')) {
          intro = '识别受阻：请检查手机是否开启了“内容拦截器”或“私密转送”，或尝试更换网络。'
        }
        setRec({ name: '识别失败', intro: `${name ? name + ': ' : ''}${intro}`, facts: `Build Time: ${new Date().toISOString()} -proxy-try` })
        setProc('error')
      } finally {
        setBusy(false)
        isProcessingRef.current = false
        abortRef.current = null
        dataUrl = null
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [cameraReady, apiKey, busy])

  return (
    <div className="w-full h-full relative pb-20">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />

      <div className="scan-frame bg-white/10" />

      {cameraError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="glass max-w-[560px] w-[92%] rounded-2xl p-6">
            <h3 className="text-lg font-semibold">摄像头错误</h3>
            <p className="mt-2 text-sm text-white/80">{cameraError}</p>
            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20"
                onClick={() => window.location.reload()}
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-0 right-0 bottom-16 z-20 p-4 pb-6">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">
              Status: {busy ? 'Busy' : 'Ready'} | Build: {buildTimeRef.current} -proxy-try · {proc}
            </div>
          </div>
          {apiWarn && (
            <div className="mt-2 text-sm text-red-300">
              {apiWarn}
            </div>
          )}
          {rec?.name === '识别失败' && typeof rec?.intro === 'string' && rec.intro.includes('识别受阻') && (
            <div className="mt-3 flex gap-2">
              <button
                className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20"
                onClick={() => {
                  const text = `${rec?.intro ?? ''}\n${rec?.facts ?? ''}`
                  navigator.clipboard?.writeText(text).catch(() => {})
                }}
              >
                复制诊断信息
              </button>
              <button
                className="px-3 py-2 rounded-md bg-white/10 hover:bg白色/20"
                onClick={() => {
                  try {
                    window.open(window.location.href, '_blank')
                  } catch (e) {
                    void e
                  }
                }}
              >
                切换到电脑端
              </button>
            </div>
          )}
          <div className="mt-2">
            <div className="text-2xl font-semibold">{typedName || '等待识别…'}</div>
          <div className="mt-2 text-sm leading-relaxed text-white/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {busy ? 'AI 正在深度思考中，请稍候...' : typedIntro}
            </div>
          {(rec?.name === '识别失败' || ((rec?.facts ?? '').includes('Build Time'))) && (
              <div className="mt-3 text-sm leading-relaxed text-white/80 whitespace-pre-wrap max-h-32 overflow-y-auto">{typedFacts}</div>
            )}
          </div>
        </div>
      </div>
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="glass mx-auto w-[92%] max-w-[640px] rounded-b-2xl px-4 py-3 text-center">
          <div className="text-sm text白色/80">👁️ 浏览量: {viewCount} | 👤 访客数: {visitorCount}</div>
          <div className="mt-1 text-sm text白色/70">
            作者：Unlimited Box | 邮箱：
            <a href="mailto:a18577y@gmail.com" className="underline text白色/80">a18577y@gmail.com</a>
          </div>
        </div>
      </div>
    </div>
  )
}
