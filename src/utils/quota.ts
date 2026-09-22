import { API_BASE } from './config'

export const QUOTA = 15

type StoreLike = {
  get: (k: string) => string | null
  set: (k: string, v: string) => void
}

const mem: Record<string, string> = {}
const Store: StoreLike = {
  get(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return mem[k] ?? null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {
      mem[k] = v
    }
  },
}

const COUNT_KEY = 'aura-vision-recognize-count'
const PRO_KEY = 'AuraVision_VIP_Status'

// Demo-only legacy format; real validation happens server-side (api/activate.js)
// against the ACTIVATION_CODES env var. The offline fallback below is skipped
// when VITE_STRICT_ACTIVATION=true is set at build time.
const LEGACY_CODE_RE = /^CY[A-Z0-9]{3}S1X$/

export function getCount(): number {
  const v = parseInt(Store.get(COUNT_KEY) || '0', 10)
  return isNaN(v) ? 0 : v
}

export function setCount(n: number): void {
  Store.set(COUNT_KEY, String(n))
}

export function isPro(): boolean {
  return String(Store.get(PRO_KEY) || '').toLowerCase() === 'active'
}

function markPro(): void {
  Store.set(PRO_KEY, 'Active')
}

export function remaining(): number {
  const used = getCount()
  return Math.max(0, QUOTA - used)
}

type ActivationResult = { ok: boolean; offline?: boolean; rateLimited?: boolean }

/**
 * Validate an activation code. Server-first when VITE_API_BASE is configured;
 * without a reachable backend this degrades to the legacy local check unless
 * VITE_STRICT_ACTIVATION=true, in which case it fails closed.
 */
export async function activateWithCode(input: string): Promise<ActivationResult> {
  const code = (input || '').trim().toUpperCase()
  if (!code) return { ok: false }
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.status === 429) return { ok: false, rateLimited: true }
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null
        if (json && json.ok) {
          markPro()
          return { ok: true }
        }
        return { ok: false }
      }
      if (res.status >= 500) throw new Error(`server error ${res.status}`)
      return { ok: false }
    } catch {
      // network failure: fall through to the offline path
    }
  }
  if (import.meta.env.VITE_STRICT_ACTIVATION === 'true') return { ok: false, offline: true }
  if (LEGACY_CODE_RE.test(code)) {
    markPro()
    return { ok: true }
  }
  return { ok: false, offline: !API_BASE }
}

export function initDefaults(): void {
  const raw = Store.get(COUNT_KEY)
  const v = parseInt(raw || '0', 10)
  if (raw == null || isNaN(v)) Store.set(COUNT_KEY, '0')
  const proRaw = Store.get(PRO_KEY)
  const norm = proRaw == null ? 'inactive' : String(proRaw).toLowerCase().trim()
  if (proRaw == null || (norm !== 'active' && norm !== 'inactive')) {
    Store.set(PRO_KEY, 'inactive')
  }
}
