import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import activate from '../activate.js'
import { jsonReq, jsonRes } from './helpers'

// Unique IP per request keeps the in-memory rate-limit buckets from leaking
// between tests; the dedicated rate-limit test pins one IP instead.
let ipSeq = 0
function freshHeaders() {
  return { 'x-forwarded-for': `10.1.0.${++ipSeq}` }
}

beforeEach(() => {
  vi.stubEnv('ACTIVATION_CODES', 'CODE-ALPHA,CODE-BETA;CODE-GAMMA\nCODE-DELTA')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('activate handler', () => {
  it('OPTIONS 预检返回 204', async () => {
    const { res } = jsonRes()
    await activate(jsonReq('OPTIONS'), res)
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('GET 健康检查返回服务标识', async () => {
    const { res, json } = jsonRes()
    await activate(jsonReq('GET'), res)
    expect(res.statusCode).toBe(200)
    expect(json()).toEqual({ ok: true, service: 'activate' })
  })

  it('不支持的返回 405', async () => {
    const { res } = jsonRes()
    await activate(jsonReq('DELETE'), res)
    expect(res.statusCode).toBe(405)
  })

  it('缺少 code 返回 400', async () => {
    const { res, json } = jsonRes()
    await activate(jsonReq('POST', {}, freshHeaders()), res)
    expect(res.statusCode).toBe(400)
    expect(json()).toEqual({ ok: false, error: 'Missing code' })
  })

  it('白名单码命中返回 200（逗号/分号/换行分隔，大小写不敏感）', async () => {
    for (const code of ['CODE-ALPHA', 'code-beta', ' CODE-GAMMA ', 'code-delta']) {
      const { res, json } = jsonRes()
      await activate(jsonReq('POST', { code }, freshHeaders()), res)
      expect(res.statusCode).toBe(200)
      expect(json()).toEqual({ ok: true })
    }
  })

  it('非法码返回 403', async () => {
    const { res, json } = jsonRes()
    await activate(jsonReq('POST', { code: 'NOT-A-CODE' }, freshHeaders()), res)
    expect(res.statusCode).toBe(403)
    expect(json()).toEqual({ ok: false, error: 'Invalid activation code' })
  })

  it('未配置码表时降级为旧版格式校验', async () => {
    vi.stubEnv('ACTIVATION_CODES', '')
    const hit = jsonRes()
    await activate(jsonReq('POST', { code: 'CY123S1X' }, freshHeaders()), hit.res)
    expect(hit.res.statusCode).toBe(200)
    expect(hit.json()).toEqual({ ok: true })

    const miss = jsonRes()
    await activate(jsonReq('POST', { code: 'WRONGFORMAT' }, freshHeaders()), miss.res)
    expect(miss.res.statusCode).toBe(403)
  })

  it('同一 IP 第 11 次 POST 被 429 限流并带 Retry-After', async () => {
    const headers = { 'x-forwarded-for': '10.2.0.1' }
    for (let i = 0; i < 10; i++) {
      const { res } = jsonRes()
      await activate(jsonReq('POST', { code: 'NOT-A-CODE' }, headers), res)
      expect(res.statusCode).toBe(403)
    }
    const { res, json } = jsonRes()
    await activate(jsonReq('POST', { code: 'CODE-ALPHA' }, headers), res)
    expect(res.statusCode).toBe(429)
    expect(json().error).toMatch(/Too many/i)
    expect(Number(res.headers['Retry-After'])).toBeGreaterThanOrEqual(1)
  })

  it('限流计数只针对 POST（GET 不占桶）', async () => {
    const headers = { 'x-forwarded-for': '10.3.0.1' }
    await activate(jsonReq('POST', { code: 'NOT-A-CODE' }, headers), jsonRes().res)
    const { res } = jsonRes()
    await activate(jsonReq('GET', undefined, headers), res)
    expect(res.statusCode).toBe(200)
  })
})
