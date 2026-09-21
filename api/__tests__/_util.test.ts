import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyCors,
  checkRateLimit,
  readJsonBody,
  resolveOrigin,
  sendJson,
} from '../_util.js'
import { jsonReq, jsonRes, mockRes, streamReq } from './helpers'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('resolveOrigin / applyCors', () => {
  it('无 Origin 头时返回 null', () => {
    expect(resolveOrigin({ headers: {} })).toBeNull()
  })

  it('白名单内的 Origin 原样回显，白名单外的置 null', () => {
    expect(resolveOrigin({ headers: { origin: 'https://mocas-12.github.io' } })).toBe(
      'https://mocas-12.github.io',
    )
    expect(resolveOrigin({ headers: { origin: 'https://evil.example' } })).toBeNull()
  })

  it('ALLOWED_ORIGINS 环境变量可扩充白名单', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://extra.example, https://two.example')
    expect(resolveOrigin({ headers: { origin: 'https://extra.example' } })).toBe(
      'https://extra.example',
    )
    expect(resolveOrigin({ headers: { origin: 'https://two.example' } })).toBe(
      'https://two.example',
    )
  })

  it('applyCors 回显 Origin 并设置 Vary 与允许的方法/头', () => {
    const res = mockRes()
    const origin = applyCors({ headers: { origin: 'https://mocas-12.github.io' } }, res)
    expect(origin).toBe('https://mocas-12.github.io')
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://mocas-12.github.io')
    expect(res.headers['Vary']).toBe('Origin')
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS')
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type')
  })

  it('applyCors 对非白名单 Origin 绝不回显（不允许 *）', () => {
    const res = mockRes()
    const origin = applyCors({ headers: { origin: 'https://evil.example' } }, res)
    expect(origin).toBeNull()
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('checkRateLimit', () => {
  it('同一 IP 超过 max 次后被限流，窗口内 retryAfter 递减', () => {
    const req = { headers: { 'x-forwarded-for': '10.9.9.9' } }
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(req, { max: 10 }).limited).toBe(false)
    }
    const limited = checkRateLimit(req, { max: 10 })
    expect(limited.limited).toBe(true)
    expect(limited.retryAfterSec).toBeGreaterThanOrEqual(1)
  })

  it('不同 IP 互不影响', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit({ headers: { 'x-forwarded-for': '10.8.8.8' } }, { max: 10 })
    }
    expect(
      checkRateLimit({ headers: { 'x-forwarded-for': '10.8.8.9' } }, { max: 10 }).limited,
    ).toBe(false)
  })

  it('窗口过后计数重置', () => {
    vi.useFakeTimers()
    const req = { headers: { 'x-forwarded-for': '10.7.7.7' } }
    for (let i = 0; i < 10; i++) {
      checkRateLimit(req, { max: 10, windowMs: 60_000 })
    }
    expect(checkRateLimit(req, { max: 10, windowMs: 60_000 }).limited).toBe(true)
    vi.advanceTimersByTime(61_000)
    expect(checkRateLimit(req, { max: 10, windowMs: 60_000 }).limited).toBe(false)
  })

  it('无 x-forwarded-for 时回退 socket 地址', () => {
    const req = { headers: {}, socket: { remoteAddress: '10.6.6.6' } }
    expect(checkRateLimit(req, { max: 1 }).limited).toBe(false)
    expect(checkRateLimit(req, { max: 1 }).limited).toBe(true)
  })
})

describe('sendJson', () => {
  it('设置状态码、Content-Type 并序列化 payload', () => {
    const res = mockRes()
    sendJson(res, 418, { ok: false, error: 'teapot' })
    expect(res.statusCode).toBe(418)
    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'teapot' })
  })
})

describe('readJsonBody', () => {
  it('解析合法 JSON 请求体', async () => {
    const body = await readJsonBody(jsonReq('POST', { code: 'ABC', n: 1 }))
    expect(body).toEqual({ code: 'ABC', n: 1 })
  })

  it('空请求体解析为空对象', async () => {
    const body = await readJsonBody(jsonReq('POST'))
    expect(body).toEqual({})
  })

  it('非法 JSON 返回 400', async () => {
    const badReq = {
      method: 'POST',
      headers: { 'content-length': '9' },
      on(event: string, cb: (c?: Buffer) => void) {
        if (event === 'data') cb(Buffer.from('not-json{'))
        if (event === 'end') cb()
      },
      destroy() {},
    }
    await expect(readJsonBody(badReq)).rejects.toMatchObject({ status: 400 })
  })

  it('声明 content-length 超限时直接 413 且不读流', async () => {
    const req = jsonReq('POST', { code: 'X' })
    req.headers['content-length'] = String(99 * 1024 * 1024)
    await expect(readJsonBody(req, { maxBytes: 16 * 1024 })).rejects.toMatchObject({
      status: 413,
    })
  })

  it('流式累计超限返回 413 并销毁连接', async () => {
    const req = streamReq([Buffer.alloc(8, 'a'), Buffer.alloc(8, 'b')])
    await expect(readJsonBody(req, { maxBytes: 10 })).rejects.toMatchObject({ status: 413 })
    expect(req.destroyed).toBe(true)
  })
})

describe('jsonReq/jsonRes helpers', () => {
  it('jsonRes().json() 能解析 sendJson 写出的 body', async () => {
    const { res, json } = jsonRes()
    sendJson(res, 200, { hello: 'world' })
    expect(json()).toEqual({ hello: 'world' })
  })
})
