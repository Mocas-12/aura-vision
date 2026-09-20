import { useEffect, useState } from 'react'
import { initProjectVisitor } from './visitor'
import { WORKER_BASE } from './config'

export type SiteStats = {
  /** Total site page views; '加载中...' while fetching, '暂不可用' when all channels fail. */
  sitePv: string
  /** Per-device page view count (localStorage). */
  devicePv: number
}

function fetchWorkerPv(): Promise<number> {
  return (async () => {
    await fetch(`${WORKER_BASE}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'aura-vision' }),
      mode: 'cors',
    })
    const res = await fetch(`${WORKER_BASE}/stats`, { method: 'GET', mode: 'cors' })
    if (!res.ok) throw new Error(`stats ${res.status}`)
    const json = (await res.json()) as { site_pv?: unknown }
    if (typeof json.site_pv !== 'number') throw new Error('stats payload invalid')
    return json.site_pv
  })()
}

// One-shot JSONP pull from busuanzi as a display fallback.
function fetchBusuanziPv(timeoutMs = 4000): Promise<number> {
  return new Promise((resolve, reject) => {
    const callbackName = `auraPvCb_${Date.now()}`
    const script = document.createElement('script')
    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName]
      script.remove()
      window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('busuanzi timeout'))
    }, timeoutMs)
    ;(window as unknown as Record<string, unknown>)[callbackName] = (data: { site_pv?: unknown }) => {
      cleanup()
      if (data && typeof data.site_pv === 'number') resolve(data.site_pv)
      else reject(new Error('busuanzi payload invalid'))
    }
    script.src = `https://busuanzi.ibruce.info/busuanzi?jsonpCallback=${callbackName}&_r=${Date.now()}`
    script.async = true
    script.onerror = () => {
      cleanup()
      reject(new Error('busuanzi load failed'))
    }
    document.head.appendChild(script)
  })
}

// Increment-once-per-page-load guard so React StrictMode double renders in dev
// don't double count.
let cachedDevicePv: number | null = null

function readDevicePv(): number {
  if (cachedDevicePv == null) cachedDevicePv = initProjectVisitor()
  return cachedDevicePv
}

export function useSiteStats(): SiteStats {
  const [sitePv, setSitePv] = useState<string>('加载中...')
  const [devicePv] = useState<number>(readDevicePv)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const workerPv = await fetchWorkerPv().catch(() => null)
      if (!alive) return
      if (workerPv != null) {
        setSitePv(String(workerPv))
        return
      }
      const busuanziPv = await fetchBusuanziPv().catch(() => null)
      if (!alive) return
      setSitePv(busuanziPv != null ? String(busuanziPv) : '暂不可用')
    })()
    return () => {
      alive = false
    }
  }, [])

  return { sitePv, devicePv }
}
