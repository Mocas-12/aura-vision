import { useEffect, useRef, useState } from 'react'
import { useCamera } from './hooks/useCamera'
import { useRecognition } from './hooks/useRecognition'
import { initDefaults } from './utils/quota'
import { useSiteStats } from './utils/site-stats'
import { WORKER_BASE } from './utils/config'
import ActivationModal from './components/ActivationModal'
import CameraView from './components/CameraView'
import CameraErrorOverlay from './components/CameraErrorOverlay'
import ResultPanel from './components/ResultPanel'
import SiteFooter from './components/SiteFooter'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, cameraReady, cameraError, audioCtxRef } = useCamera()
  const [autoMode, setAutoMode] = useState(true)
  const [showActivation, setShowActivation] = useState(false)
  const [apiWarn, setApiWarn] = useState<string | null>(null)
  const { sitePv, devicePv } = useSiteStats()

  const {
    rec,
    busy,
    manualLoading,
    streaming,
    liveText,
    liveName,
    shownName,
    shownIntro,
    shownFacts,
    resultRef,
    triggerRecognize,
  } = useRecognition({
    videoRef,
    canvasRef,
    cameraReady,
    audioCtxRef,
    autoMode,
    onQuotaExhausted: () => setShowActivation(true),
  })

  useEffect(() => {
    initDefaults()
    let done = false
    fetch(WORKER_BASE)
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

  return (
    <div className="vision-app">
      <header className="vision-header">
        <h1>Aura-Vision</h1>
        <p>对准物体，查看识别结果。</p>
      </header>
      <main className="vision-workspace">
        <div className="camera-region">
          <CameraView videoRef={videoRef} canvasRef={canvasRef} cameraError={cameraError} busy={busy} />
          {cameraError && <CameraErrorOverlay message={cameraError} />}
        </div>
      <ResultPanel
        rec={rec}
        busy={busy}
        cameraReady={cameraReady}
        cameraError={cameraError}
        streaming={streaming}
        liveText={liveText}
        liveName={liveName}
        shownName={shownName}
        shownIntro={shownIntro}
        shownFacts={shownFacts}
        autoMode={autoMode}
        onToggleAuto={setAutoMode}
        manualLoading={manualLoading}
        onManualRecognize={() => void triggerRecognize(true)}
        apiWarn={apiWarn}
        resultRef={resultRef}
      />
      </main>
      <SiteFooter sitePv={sitePv} devicePv={devicePv} />
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
