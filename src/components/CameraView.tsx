import type { RefObject } from 'react'

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  cameraError: string | null
  busy: boolean
}

export default function CameraView({ videoRef, canvasRef, cameraError, busy }: CameraViewProps) {
  return (
    <div className="relative w-full" style={{ height: '60vh' }}>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className={`scan-frame ${cameraError ? 'is-error' : busy ? 'is-busy' : 'is-idle'}`} />
      {busy && <div className="scan-line absolute inset-0 pointer-events-none" />}
    </div>
  )
}
