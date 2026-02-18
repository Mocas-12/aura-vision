import { useState } from 'react'
import { encryptToLocalStorage, decryptFromLocalStorage, hasEncryptedKey } from '../utils/crypto'

type Props = {
  open: boolean
  onClose: () => void
  onUnlocked: (apiKey: string) => void
}

export default function SettingsModal({ open, onClose, onUnlocked }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [pass, setPass] = useState('')
  const [mode, setMode] = useState<'set' | 'unlock'>(hasEncryptedKey() ? 'unlock' : 'set')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleSave() {
    setError(null)
    if (!apiKey.trim()) {
      setError('请输入 API Key')
      return
    }
    if (!pass.trim()) {
      setError('请设置本地解锁密码用于加密存储')
      return
    }
    setLoading(true)
    try {
      await encryptToLocalStorage(apiKey.trim(), pass.trim())
      setApiKey('')
      setMode('unlock')
    } catch {
      setError('加密或存储失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlock() {
    setError(null)
    if (!pass.trim()) {
      setError('请输入解锁密码以读取 API Key')
      return
    }
    setLoading(true)
    try {
      const key = await decryptFromLocalStorage(pass.trim())
      if (key) {
        onUnlocked(key)
        onClose()
      } else {
        setError('解锁失败，密码错误或数据损坏')
      }
    } catch {
      setError('解锁失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass w-[92%] max-w-[520px] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">API 设置</h2>
          <button className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="mt-4">
          <div className="flex gap-2 mb-4">
            <button
              className={`px-3 py-1 rounded-md ${mode === 'set' ? 'bg-white/20' : 'bg-white/10'}`}
              onClick={() => setMode('set')}
            >
              设置密钥
            </button>
            <button
              className={`px-3 py-1 rounded-md ${mode === 'unlock' ? 'bg-white/20' : 'bg-white/10'}`}
              onClick={() => setMode('unlock')}
            >
              解锁密钥
            </button>
          </div>
          {mode === 'set' && (
            <>
              <label className="block text-sm mb-1">Google AI Studio API Key</label>
              <input
                className="w-full rounded-md bg-white/10 px-3 py-2 outline-none"
                placeholder="以 AIza 开头的密钥"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <label className="block text-sm mt-3 mb-1">本地解锁密码（仅用于加密）</label>
              <input
                type="password"
                className="w-full rounded-md bg-white/10 px-3 py-2 outline-none"
                placeholder="请输入自定义密码"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button
                className="mt-4 w-full rounded-md bg-blue-600 hover:bg-blue-500 py-2"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? '保存中…' : '保存并加密'}
              </button>
            </>
          )}
          {mode === 'unlock' && (
            <>
              <label className="block text-sm mb-1">输入解锁密码</label>
              <input
                type="password"
                className="w-full rounded-md bg-white/10 px-3 py-2 outline-none"
                placeholder="用于解密本地保存的密钥"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button
                className="mt-4 w-full rounded-md bg-green-600 hover:bg-green-500 py-2"
                onClick={handleUnlock}
                disabled={loading}
              >
                {loading ? '解锁中…' : '解锁'}
              </button>
            </>
          )}
          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
          <p className="mt-3 text-xs text-white/60">
            说明：密钥仅在本地浏览器中加密保存，不会上传到任何服务器。
          </p>
        </div>
      </div>
    </div>
  )
}
