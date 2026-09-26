export default function CameraErrorOverlay({ message }: { message: string }) {
  return (
    /* 错误态是模态：加暗色遮罩把浮层与被盖住的控制行视觉分离（摄像头不可用时控制行本就无操作意义） */
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass max-w-[560px] w-[92%] rounded-3xl p-6">
        <h3 className="text-lg font-semibold">摄像头错误</h3>
        <p className="mt-2 text-sm text-white/80">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20"
            onClick={() => window.location.reload()}
          >
            重试
          </button>
        </div>
      </div>
    </div>
  )
}
