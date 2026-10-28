export default function CameraErrorOverlay({ message }: { message: string }) {
  return (
    <div className="camera-error" role="alert">
      <div className="camera-error-message">
        <h3 className="text-lg font-semibold">摄像头错误</h3>
        <p className="mt-2 text-sm cyber-body">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            className="secondary-btn"
            onClick={() => window.location.reload()}
          >
            重试
          </button>
        </div>
      </div>
    </div>
  )
}
