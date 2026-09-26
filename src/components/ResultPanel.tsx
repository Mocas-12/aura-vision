import { useState } from 'react'
import type { RefObject } from 'react'
import { DIAG_MARK, type Recognition } from '../utils/ai-service'

interface ResultPanelProps {
  rec: Recognition | null
  busy: boolean
  cameraReady: boolean
  streaming: boolean
  /** Accumulated SSE text while an answer is still streaming in; null otherwise. */
  liveText: string | null
  /** Object name parsed mid-stream from the structured JSON shape; null otherwise. */
  liveName: string | null
  shownName: string
  shownIntro: string
  shownFacts: string
  autoMode: boolean
  onToggleAuto: (next: boolean) => void
  manualLoading: boolean
  onManualRecognize: () => void
  apiWarn: string | null
  resultRef: RefObject<HTMLDivElement | null>
}

export default function ResultPanel({
  rec,
  busy,
  cameraReady,
  streaming,
  liveText,
  liveName,
  shownName,
  shownIntro,
  shownFacts,
  autoMode,
  onToggleAuto,
  manualLoading,
  onManualRecognize,
  apiWarn,
  resultRef,
}: ResultPanelProps) {
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(null), 2000)
  }

  return (
    <div className="w-full p-4 pb-6">
      <div className="glass rounded-3xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <div className="text-sm cyber-soft">
            {liveText !== null
              ? 'AI 正在输出中…'
              : streaming
                ? 'AI 正在详细介绍中…'
                : busy
                  ? '识别中…'
                  : cameraReady
                    ? '待机'
                    : '摄像头启动中…'}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm cyber-soft">自动识别</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoMode}
                aria-label="自动识别开关"
                className={`toggle-switch ${autoMode ? 'is-on' : ''}`}
                onClick={() => {
                  const next = !autoMode
                  onToggleAuto(next)
                  showToast(next ? '已开启自动模式：每 5 秒识别一次' : '已切换为手动模式：请点击按钮触发识别')
                }}
              >
                <span className="toggle-knob" />
              </button>
            </div>
            {!autoMode && (
              <button
                className="action-btn px-4 py-1"
                onClick={onManualRecognize}
                disabled={manualLoading || busy}
              >
                {manualLoading || busy ? '识别中…' : '手动识别'}
              </button>
            )}
          </div>
        </div>
        {apiWarn && (
          <div className="mt-2 text-sm text-red-300">
            {apiWarn}
          </div>
        )}
        {rec?.name === '识别失败' && typeof rec?.intro === 'string' && rec.intro.includes('识别受阻') && (
          <div className="mt-3 flex gap-2">
            <button
              className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20"
              onClick={() => {
                const text = `${rec?.intro ?? ''}\n${rec?.facts ?? ''}`
                navigator.clipboard?.writeText(text).catch(() => {})
              }}
            >
              复制诊断信息
            </button>
            <button
              className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20"
              onClick={() => {
                try {
                  window.open(window.location.href, '_blank')
                } catch (e) {
                  void e
                }
              }}
            >
              切换到电脑端
            </button>
          </div>
        )}
        <div
          className="mt-2 scrollbox cyber-panel"
          style={{ height: 'auto', minHeight: '150px', maxHeight: '40vh', WebkitOverflowScrolling: 'touch', overflowY: 'auto', padding: '15px' }}
          ref={resultRef}
        >
          <div className="text-2xl font-semibold grad-title">{(liveName ?? shownName) || '等待识别…'}</div>
          <div className="grad-divider mt-2" />
          <div
            className="mt-2 text-sm whitespace-pre-wrap break-all cyber-body"
            style={{ lineHeight: 1.6, fontSize: '1.1rem' }}
          >
            {busy && liveText === null ? (
              <span className="thinking">
                AI 正在深度思考中
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            ) : (
              <>
                {liveText ?? shownIntro}
                {liveText !== null && <span className="animate-pulse">▌</span>}
              </>
            )}
          </div>
          {(rec?.name === '识别失败' || (rec?.facts ?? '').includes(DIAG_MARK)) && (
            <div
              className="mt-3 text-sm cyber-text whitespace-pre-wrap break-all"
              style={{ lineHeight: 1.6, fontSize: '1.1rem' }}
            >
              {shownFacts}
            </div>
          )}
        </div>
      </div>
      {toastMsg && (
        <div className="toast">
          <div className="inner">{toastMsg}</div>
        </div>
      )}
    </div>
  )
}
