import type { RefObject } from 'react'

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  cameraError: string | null
  busy: boolean
}

export default function CameraView({ videoRef, canvasRef, cameraError, busy }: CameraViewProps) {
  return (
    <div className="camera-view">
      <video
        ref={videoRef}
        className="camera-video"
        aria-label="实时相机画面"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <div aria-hidden="true" className={`scan-frame ${cameraError ? 'is-error' : busy ? 'is-busy' : 'is-idle'}`} />
      {busy && <div className="scan-line absolute inset-0 pointer-events-none" />}
    </div>
  )
}
