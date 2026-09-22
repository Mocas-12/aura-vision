import { useEffect, useState } from 'react'
import { activateWithCode } from '../utils/quota'

type Props = {
  open: boolean
  onClose: () => void
  onActivated: () => void
}

type Phase = 'idle' | 'loading' | 'success'

const BUY_URL = 'https://mbd.pub/o/bread/mbd-YZWblZZpZQ=='

export default function ActivationModal({ open, onClose, onActivated }: Props) {
  // Mount the dialog only while open so its state resets naturally on reopen.
  if (!open) return null
  return <ActivationDialog onClose={onClose} onActivated={onActivated} />
}

type DialogProps = { onClose: () => void; onActivated: () => void }

function ActivationDialog({ onClose, onActivated }: DialogProps) {
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Flash the unlocked state briefly before returning to the app.
  useEffect(() => {
    if (phase !== 'success') return
    const t = window.setTimeout(onActivated, 1400)
    return () => window.clearTimeout(t)
  }, [phase, onActivated])

  const submit = async () => {
    if (phase !== 'idle') return
    setError(null)
    setPhase('loading')
    const result = await activateWithCode(code)
    if (result.ok) {
      setPhase('success')
      return
    }
    if (result.rateLimited) setError('尝试次数过多，请一分钟后再试。')
    else if (result.offline) setError('激活服务不可用，请检查网络后重试。')
    else setError('激活码无效，请检查是否输入正确。')
    setPhase('idle')
    setShake((s) => s + 1)
  }

  return (
    <div
      className="activate-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="activate-panel cyber-panel rounded-3xl w-full max-w-[440px] px-6 py-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-title"
      >
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-2 text-[11px] cyber-soft"
            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', letterSpacing: '0.18em' }}
          >
            <span
              className={`status-dot inline-block w-1.5 h-1.5 rounded-full ${error ? 'bg-red-400' : 'bg-cyan-300'}`}
              style={{ boxShadow: '0 0 6px currentColor' }}
            />
            AURA-VISION // ACTIVATION
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="w-7 h-7 rounded-full border border-white/15 text-white/60 hover:text-white hover:border-cyan-300/50 hover:bg-white/5 transition text-sm leading-none"
          >
            ✕
          </button>
        </div>

        {phase === 'success' ? (
          <div className="py-8 flex flex-col items-center text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{
                background: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.5)',
                boxShadow: '0 0 24px rgba(0, 229, 255, 0.35)',
                color: '#7df3ff',
              }}
            >
              ✓
            </div>
            <div className="mt-4 text-2xl font-semibold grad-title">系统已解锁</div>
            <div className="grad-divider mt-3 w-40" />
            <p className="mt-3 text-sm cyber-body">激活成功，本设备不限使用次数。</p>
          </div>
        ) : (
          <>
            <h2 id="activation-title" className="mt-4 text-2xl font-semibold grad-title flex items-center gap-2.5">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-cyan-300"
                style={{ filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.45))' }}
                aria-hidden="true"
              >
                <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                <circle cx="12" cy="15.8" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              额度已用尽
            </h2>
            <div className="grad-divider mt-3" />
            <p className="mt-3 text-sm cyber-body">
              免费识别次数（<span className="cyber-text" style={{ fontFamily: 'monospace' }}>15</span> 次）已耗尽。输入激活码永久解锁，无需注册。
            </p>

            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <div key={shake} className={shake > 0 ? 'shake-once' : ''}>
                <input
                  autoFocus
                  className={`cyber-input w-full px-4 py-3 text-base ${error ? 'border-red-400/60' : ''}`}
                  placeholder="CY□□□S1X"
                  value={code}
                  maxLength={16}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={phase === 'loading'}
                  aria-label="激活码"
                  aria-invalid={error != null}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase())
                    if (error) setError(null)
                  }}
                />
              </div>
              {error && (
                <p
                  className="mt-2.5 text-sm text-red-300"
                  style={{ textShadow: '0 0 8px rgba(255, 92, 118, 0.35)' }}
                  role="alert"
                >
                  ⚠ {error}
                </p>
              )}

              <div className="mt-5 flex gap-2.5">
                <button
                  type="submit"
                  className="activate-btn flex-1 py-2.5 text-sm"
                  disabled={phase === 'loading'}
                >
                  {phase === 'loading' ? '校验中…' : '立即激活'}
                </button>
                <button
                  type="button"
                  className="action-btn px-4 py-2.5 text-sm"
                  onClick={() => {
                    try {
                      window.open(BUY_URL, '_blank')
                    } catch (e) {
                      void e
                    }
                  }}
                >
                  获取激活码 ↗
                </button>
              </div>
            </form>

            <p
              className="mt-4 text-[11px] cyber-soft text-center"
              style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', letterSpacing: '0.08em' }}
            >
              UNLOCK://DEVICE-BOUND · 激活后本设备永久解锁
            </p>
          </>
        )}
      </div>
    </div>
  )
}
