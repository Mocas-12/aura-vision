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

export function getCount(): number {
  const v = parseInt(Store.get(COUNT_KEY) || '0', 10)
  return isNaN(v) ? 0 : v
}

export function setCount(n: number): void {
  Store.set(COUNT_KEY, String(n))
}

export function isPro(): boolean {
  try {
    if (localStorage.getItem('PhotoChange_VIP_Status') === 'Active') return true
  } catch {
    void 0
  }
  const flags = [Store.get('PhotoChange_VIP_Status'), Store.get('unlimited_box_pro_status'), Store.get(PRO_KEY)]
  return flags.some((v) => String(v || '').toLowerCase() === 'active' || String(v || '').toLowerCase() === 'true')
}

export function remaining(): number {
  const used = getCount()
  const r = Math.max(0, QUOTA - used)
  return r
}

export function verifyCode(input: string): boolean {
  const code = (input || '').trim().toUpperCase()
  const rule = /^CY[A-Z0-9]{3}S1X$/
  if (rule.test(code)) {
    try {
      localStorage.setItem(PRO_KEY, 'Active')
    } catch {
      Store.set(PRO_KEY, 'Active')
    }
    return true
  }
  return false
}

export function initDefaults(): void {
  const raw = Store.get(COUNT_KEY)
  const v = parseInt(raw || '0', 10)
  if (raw == null || isNaN(v)) Store.set(COUNT_KEY, '0')
  const proRaw = Store.get(PRO_KEY)
  const norm = proRaw == null ? 'inactive' : String(proRaw).toLowerCase().trim()
  if (proRaw == null || (norm !== 'active' && norm !== 'inactive' && norm !== 'true' && norm !== 'false')) {
    Store.set(PRO_KEY, 'inactive')
  }
}
