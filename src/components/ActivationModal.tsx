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
      className="activate-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="activate-panel cyber-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-title"
      >
        <div className="activation-heading">
          <div>
            Aura-Vision 激活
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="dialog-close"
          >
            ✕
          </button>
        </div>

        {phase === 'success' ? (
          <div className="py-8 flex flex-col items-center text-center">
            <div
              className="activation-success"
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
                className="cyber-text"
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
              免费识别次数（<span className="cyber-text numeric">15</span> 次）已耗尽。输入激活码永久解锁，无需注册。
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
                  className="cyber-input"
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
                  className="activation-error"
                  role="alert"
                >
                  {error}
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
                  获取激活码
                </button>
              </div>
            </form>

            <p className="activation-note">
              激活后本设备永久解锁
            </p>
          </>
        )}
      </div>
    </div>
  )
}
