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
    <div className="w-full min-h-screen relative flex flex-col" style={{ paddingBottom: '100px' }}>
      <CameraView videoRef={videoRef} canvasRef={canvasRef} cameraError={cameraError} busy={busy} />
      {cameraError && <CameraErrorOverlay message={cameraError} />}
      <ResultPanel
        rec={rec}
        busy={busy}
        cameraReady={cameraReady}
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
