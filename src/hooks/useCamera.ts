import { useEffect, useRef, useState } from 'react'

/**
 * Camera stream lifecycle: opens the rear camera once, tracks readiness and
 * permission errors, and owns the AudioContext used for the completion beep.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    async function start() {
      try {
        // 拿新流前先停掉旧流(StrictMode 双跑时), 保证同一时刻只有一条流
        const prev = videoRef.current?.srcObject as MediaStream | null
        prev?.getTracks()?.forEach((t) => t.stop())
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        const v = videoRef.current
        if (!v) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
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
    // Capture the stream in a local so cleanup stops the tracks this effect opened,
    // not whatever the ref points to by the time cleanup runs.
    const captured = videoRef.current
    return () => {
      const stream = captured?.srcObject as MediaStream | null
      stream?.getTracks()?.forEach((t) => t.stop())
    }
  }, [])

  // AudioContext created without a user gesture starts suspended; unlock it on
  // the first interaction so the completion beep can actually sound.
  useEffect(() => {
    const resume = () => {
      audioCtxRef.current?.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', resume, { once: true })
    return () => window.removeEventListener('pointerdown', resume)
  }, [])

  return { videoRef, cameraReady, cameraError, audioCtxRef }
}
