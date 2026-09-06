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

const VID_KEY = 'aura-vision-visitor-id'
const VCOUNT_KEY = 'aura-vision-visitor-count'

export function initProjectVisitor(): number {
  let id = Store.get(VID_KEY)
  if (!id) {
    id = Math.random().toString(36).slice(2)
    Store.set(VID_KEY, id)
  }
  const raw = Store.get(VCOUNT_KEY)
  const curr = parseInt(raw || '0', 10)
  const next = isNaN(curr) ? 1 : curr + 1
  Store.set(VCOUNT_KEY, String(next))
  return next
}
