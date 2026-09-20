import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUOTA, activateWithCode, getCount, initDefaults, isPro, remaining, setCount } from '../quota'

type MemStore = Record<string, string>

function stubLocalStorage(): MemStore {
  const store: MemStore = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
  })
  return store
}

describe('quota', () => {
  beforeEach(() => {
    stubLocalStorage()
    vi.unstubAllEnvs()
  })

  it('starts at zero usage and full quota', () => {
    initDefaults()
    expect(getCount()).toBe(0)
    expect(remaining()).toBe(QUOTA)
    expect(isPro()).toBe(false)
  })

  it('counts down as recognitions are recorded', () => {
    setCount(1)
    expect(remaining()).toBe(QUOTA - 1)
    setCount(QUOTA + 5)
    expect(remaining()).toBe(0)
  })

  it('tolerates a corrupted count', () => {
    const store = stubLocalStorage()
    store['aura-vision-recognize-count'] = 'not-a-number'
    expect(getCount()).toBe(0)
  })

  it('treats the pro key as active only when set', () => {
    expect(isPro()).toBe(false)
    const store = stubLocalStorage()
    store['AuraVision_VIP_Status'] = 'Active'
    expect(isPro()).toBe(true)
  })

  it('initDefaults normalizes invalid values', () => {
    const store = stubLocalStorage()
    store['AuraVision_VIP_Status'] = 'garbage'
    initDefaults()
    expect(store['AuraVision_VIP_Status']).toBe('inactive')
  })

  it('accepts legacy-format codes offline and unlocks the device', async () => {
    const result = await activateWithCode(' cy0a9s1x ')
    expect(result.ok).toBe(true)
    expect(isPro()).toBe(true)
  })

  it('rejects codes that do not match the legacy format', async () => {
    const result = await activateWithCode('CY Toolong S1X')
    expect(result.ok).toBe(false)
    expect(isPro()).toBe(false)
  })

  it('fails closed in strict mode when no backend is configured', async () => {
    ;(import.meta.env as unknown as Record<string, unknown>).VITE_STRICT_ACTIVATION = 'true'
    const result = await activateWithCode('CY000S1X')
    expect(result.ok).toBe(false)
    expect(result.offline).toBe(true)
    expect(isPro()).toBe(false)
  })

  it('rejects empty input', async () => {
    expect((await activateWithCode('   ')).ok).toBe(false)
  })
})
