// The prompt constants live in one shared module (api/_prompts.js) consumed by
// BOTH backends, so copy drift is structurally impossible. This test guards
// the shared file's content itself — e.g. someone accidentally weakening the
// Chinese enforcement or emptying the default prompt.
import { describe, expect, it } from 'vitest'
import prompts from '../../api/_prompts.js'

const { SYSTEM_PROMPT, DEFAULT_PROMPT } = prompts as {
  SYSTEM_PROMPT: string
  DEFAULT_PROMPT: string
}

describe('共享 prompt 常量（api/_prompts.js，双后端单一来源）', () => {
  it('SYSTEM_PROMPT 保留简体中文强制', () => {
    expect(SYSTEM_PROMPT).toContain('简体中文')
    expect(SYSTEM_PROMPT).toContain('禁止输出英文')
  })

  it('DEFAULT_PROMPT 保持结构化识别格式', () => {
    expect(DEFAULT_PROMPT).toContain('视觉分析专家')
    expect(DEFAULT_PROMPT).toContain('【名称】')
  })
})
