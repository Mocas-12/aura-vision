import { describe, expect, it } from 'vitest'
import { DIAG_MARK, buildRecognition, diagText, extractModelText } from '../ai-service'

describe('extractModelText', () => {
  it('reads choices[0].message.content as a string', () => {
    const json = { choices: [{ message: { content: '你好' } }] }
    expect(extractModelText(json)).toBe('你好')
  })

  it('joins array-style content parts', () => {
    const json = {
      choices: [
        { message: { content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] } },
      ],
    }
    expect(extractModelText(json)).toBe('第一段\n第二段')
  })

  it('falls back to streaming delta content', () => {
    const json = { choices: [{ delta: { content: '流式' } }] }
    expect(extractModelText(json)).toBe('流式')
  })

  it('returns empty string for missing or malformed payloads', () => {
    expect(extractModelText(null)).toBe('')
    expect(extractModelText({})).toBe('')
    expect(extractModelText({ choices: [{ message: { content: '   ' } }] })).toBe('')
  })
})

describe('buildRecognition', () => {
  it('parses structured JSON output', () => {
    const rec = buildRecognition('{"name":"水杯","intro":"用于饮水","facts":"保温"}')
    expect(rec).toEqual({ name: '水杯', intro: '用于饮水', facts: '保温' })
  })

  it('fills defaults for missing JSON fields', () => {
    const rec = buildRecognition('{"name":"水杯"}')
    expect(rec.name).toBe('水杯')
    expect(rec.intro).toBe('无简介')
    expect(rec.facts).toBe('')
  })

  it('shows plain text as the intro', () => {
    const rec = buildRecognition('这是一个马克杯')
    expect(rec.name).toBe('识别结果')
    expect(rec.intro).toBe('这是一个马克杯')
  })

  it('collapses redundant whitespace', () => {
    const rec = buildRecognition('第一行\n\n\n第二行  很多   空格')
    expect(rec.intro).toBe('第一行\n第二行 很多 空格')
  })

  it('reports empty input explicitly', () => {
    expect(buildRecognition('   ').intro).toBe('AI 返回内容为空')
  })
})

describe('diagText', () => {
  it('embeds the diagnostics marker with a timestamp', () => {
    expect(diagText()).toContain(DIAG_MARK)
    expect(diagText()).toMatch(/诊断时间: \d{4}-\d{2}-\d{2}T/)
  })
})
