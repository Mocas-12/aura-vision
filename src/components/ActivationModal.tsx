import { useState } from 'react'
import { verifyCode } from '../utils/quota'

type Props = {
  open: boolean
  onClose: () => void
  onActivated: () => void
}

export default function ActivationModal({ open, onClose, onActivated }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass w-[92%] max-w-[520px] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">额度已用尽</h2>
          <button className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="mt-2 text-sm text-white/80">您已达到免费识别次数。请输入激活码以永久解锁使用。</p>
        <div className="mt-4">
          <input
            className="w-full rounded-md bg-white/10 px-3 py-2 outline-none"
            placeholder="输入激活码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500"
              disabled={loading}
              onClick={() => {
                setError(null)
                setLoading(true)
                try {
                  const ok = verifyCode(code)
                  if (ok) {
                    onActivated()
                  } else {
                    setError('激活码无效，请检查是否输入正确。')
                  }
                } finally {
                  setLoading(false)
                }
              }}
            >
              {loading ? '激活中…' : '激活'}
            </button>
            <button
              className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20"
              onClick={() => {
                try {
                  window.open('https://mbd.pub/o/bread/mbd-YZWblZZpZQ==', '_blank')
                } catch (e) {
                  void e
                }
              }}
            >
              获取激活码
            </button>
          </div>
          {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
          <p className="mt-3 text-xs text-white/60">说明：激活后本设备永久解锁，不限制使用次数。</p>
        </div>
      </div>
    </div>
  )
}
