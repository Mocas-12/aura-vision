import { useEffect, useRef, useState } from 'react'
import { recognizeNearestCenterObject, type Recognition } from './utils/ai-service'
import { useTypewriter } from './hooks/useTypewriter'

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? null
  const [rec, setRec] = useState<Recognition | null>(null)
  const [busy, setBusy] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastSigRef = useRef<string>('')

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
    const interval = window.setInterval(async () => {
      if (!cameraReady) return
      if (!apiKey) {
        setRec({ name: '未配置 API Key', intro: '请在环境变量中设置 VITE_GEMINI_API_KEY', facts: '' })
        return
      }
      if (busy) return
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
      const targetSize = Math.min(side, 800)
      const out = document.createElement('canvas')
      out.width = targetSize
      out.height = targetSize
      const octx = out.getContext('2d')
      octx?.drawImage(crop, 0, 0, side, side, 0, 0, targetSize, targetSize)
      const dataUrl = out.toDataURL('image/jpeg', 0.6)
      setBusy(true)
      try {
        const result = await recognizeNearestCenterObject({
          apiKey,
          imageDataUrl: dataUrl,
        })
        if (result) {
          setRec(result)
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
          setRec({ name: '网络繁忙', intro: '请稍后重试', facts: `Build Time: ${new Date().toISOString()}` })
        }
      } catch (e) {
        const name = (e as { name?: string })?.name
        const intro = (e as { message?: string })?.message || String(e)
        setRec({ name: '识别失败', intro: `${name ? name + ': ' : ''}${intro}`, facts: `Build Time: ${new Date().toISOString()}` })
      } finally {
        setBusy(false)
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [cameraReady, apiKey, busy])

  return (
    <div className="w-full h-full relative">
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

      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-6">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">
              {busy ? 'AI 正在深度思考中，请稍候...' : '每 5 秒更新一次'}
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-semibold">{typedName || '等待识别…'}</div>
            <div className="mt-2 text-sm leading-relaxed text-white/80">
              {busy ? 'AI 正在深度思考中，请稍候...' : typedIntro}
            </div>
            {(rec?.name === '识别失败' || ((rec?.facts ?? '').includes('Build Time'))) && (
              <div className="mt-3 text-sm leading-relaxed text-white/80">{typedFacts}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
