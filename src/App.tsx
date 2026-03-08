import { useCallback, useEffect, useRef, useState } from 'react'
import { recognizeNearestCenterObject, type Recognition } from './utils/ai-service'
import { useTypewriter } from './hooks/useTypewriter'
import { initDefaults, isPro, remaining, getCount, setCount, QUOTA } from './utils/quota'
import ActivationModal from './components/ActivationModal'
import { initProjectVisitor } from './utils/visitor'

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
  const [showActivation, setShowActivation] = useState(false)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const [autoMode, setAutoMode] = useState(true)
  const [silenceUntil, setSilenceUntil] = useState<number>(0)
  const lastSuccessRef = useRef<boolean>(false)
  const [manualLoading, setManualLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [projectVisitor, setProjectVisitor] = useState<number>(0)

  const [typedName, typingName] = useTypewriter(rec?.name ?? '', 15)
  const [typedIntro, typingIntro] = useTypewriter(rec?.intro ?? '', 10)
  const [typedFacts, typingFacts] = useTypewriter(rec?.facts ?? '', 10)
  const streaming = typingName || typingIntro || typingFacts

  const triggerRecognize = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      console.log('Manual trigger clicked')
    }
    if (!cameraReady) return
    if (isManual) {
      if (abortRef.current) {
        try { abortRef.current.abort() } catch (e) { console.warn('abort previous request error', e) }
        abortRef.current = null
      }
      setBusy(false)
      isProcessingRef.current = false
    } else {
      if (busy || isProcessingRef.current) return
      if (!autoMode) return
      if (Date.now() < silenceUntil) return
    }
    if (streaming) return
    if (!isPro()) {
      const r = remaining()
      if (r <= 0) {
        setShowActivation(true)
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
    let dataUrl: string | null = out.toDataURL('image/jpeg', 0.2)
    dataUrl = dataUrl?.replace(/\s/g, '') ?? null
    if (!isPro()) {
      const next = getCount() + 1
      setCount(next)
      const r2 = QUOTA - next
      if (r2 <= 0) {
        setShowActivation(true)
      }
    }
    setBusy(true)
    if (isManual) setManualLoading(true)
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
    const controller = abortRef.current
    try {
      const timeoutTag = Symbol('timeout')
      const resultOrTimeout = await Promise.race([
        recognizeNearestCenterObject({
          apiKey,
          imageDataUrl: dataUrl!,
          signal: controller!.signal,
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
        if (isManual) setManualLoading(false)
        return
      }
      const result = resultOrTimeout as Recognition | null
      if (result) {
        setRec(result)
        setProc('done')
        lastSuccessRef.current = result.name !== '识别失败'
        try {
          const el = resultRef.current
          if (el) {
            el.scrollTop = el.scrollHeight
          }
        } catch { void 0 }
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
      if (isManual) setManualLoading(false)
    }
  }, [cameraReady, busy, autoMode, streaming, silenceUntil])

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
    const n = initProjectVisitor()
    setProjectVisitor(n)
  }, [])


  useEffect(() => {
    initDefaults()
    let done = false
    fetch('https://square-bread-b238.a18577y.workers.dev', { method: 'GET' })
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
    const interval = window.setInterval(() => {
      triggerRecognize()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [triggerRecognize])

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

  return (
    <div className="w-full min-h-screen relative flex flex-col" style={{ paddingBottom: '100px' }}>
      <div className="relative w-full" style={{ height: '60vh' }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />
        {busy && <div className="scan-line absolute inset-0 pointer-events-none" />}
      </div>

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

      <div className="w-full p-4 pb-6">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm cyber-soft">
              Status: {streaming ? 'AI 正在详细介绍中...' : busy ? 'Busy' : 'Ready'} | Build: {buildTimeRef.current} -proxy-try · {proc}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="action-btn px-3 py-1"
                onClick={() => {
                  const next = !autoMode
                  setAutoMode(next)
                  setToastMsg(next ? '已开启自动模式：每 5 秒识别一次' : '已切换为手动模式：请点击按钮触发识别')
                  window.setTimeout(() => setToastMsg(null), 2000)
                }}
              >
                {autoMode ? '自动识别：开' : '自动识别：关'}
              </button>
              {!autoMode && (
                <button
                  className="action-btn px-3 py-1"
                  onClick={async () => {
                    setManualLoading(true)
                    try {
                      await triggerRecognize(true)
                    } finally {
                      setManualLoading(false)
                    }
                  }}
                  disabled={manualLoading || busy || isProcessingRef.current}
                >
                  {manualLoading || busy || isProcessingRef.current ? '识别中...' : '手动识别'}
                </button>
              )}
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
          <div
            className="mt-2 scrollbox cyber-panel"
            style={{ height: 'auto', minHeight: '150px', maxHeight: '40vh', WebkitOverflowScrolling: 'touch', overflowY: 'auto', padding: '15px' }}
            ref={resultRef}
          >
            <div className="text-2xl font-semibold cyber-title">{typedName || '等待识别…'}</div>
            <div
              className="mt-2 text-sm whitespace-pre-wrap break-all cyber-title"
              style={{ lineHeight: 1.6, fontSize: '1.1rem' }}
            >
              {busy ? 'AI 正在深度思考中，请稍候...' : typedIntro}
            </div>
            {(rec?.name === '识别失败' || ((rec?.facts ?? '').includes('Build Time'))) && (
              <div
                className="mt-3 text-sm cyber-text whitespace-pre-wrap break-all"
                style={{ lineHeight: 1.6, fontSize: '1.1rem' }}
              >
                {typedFacts}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="relative z-10 w-full mt-auto pt-5 mb-10">
        <div
          className="glass mx-auto rounded-2xl px-4 py-2 text-center flex flex-col items-center gap-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', width: 'fit-content', maxWidth: '90%' }}
        >
          <div className="text-sm cyber-text flex items-center justify-center gap-4">
            <span id="busuanzi_container_site_pv" className="flex items-center gap-1" style={{ display: 'inline' }}>
              <span>👁️</span>
              <span>总访问量：</span>
              <span id="busuanzi_value_site_pv" style={{ fontFamily: 'monospace' }}>加载中...</span>
            </span>
            <span className="sep" id="busuanzi_sep" style={{ display: 'none' }}>|</span>
            <span id="av_container_project_uv" className="flex items-center gap-1" style={{ display: 'inline' }}>
              <span>👤</span>
              <span>本设备浏览次数：</span>
              <span id="av_project_uv_value" style={{ fontFamily: 'monospace' }}>{projectVisitor}</span>
            </span>
          </div>
          <div className="text-sm cyber-text flex items-center justify-center gap-[10px] overflow-hidden flex-nowrap">
            <img
              src="https://github.com/Mocas-12.png"
              alt="avatar"
              className="inline-block rounded-full"
              style={{ width: '24px', height: '24px', objectFit: 'cover' }}
            />
            <span>Unlimited Box</span>
            <span>|</span>
            <a href="mailto:a18577y@gmail.com" className="cyber-text" style={{ textDecoration: 'none' }}>📧 a18577y@gmail.com</a>
          </div>
        </div>
      </div>
      {toastMsg && (
        <div className="toast">
          <div className="inner">{toastMsg}</div>
        </div>
      )}
      <ActivationModal
        open={showActivation}
        onClose={() => setShowActivation(false)}
        onActivated={() => {
          setShowActivation(false)
        }}
      />
    </div>
  )
}
