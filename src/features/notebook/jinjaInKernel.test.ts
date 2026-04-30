import { describe, expect, it } from 'vitest'
import { buildNotebookJinjaRenderCode } from '@features/notebook/jinjaInKernel'

describe('buildNotebookJinjaRenderCode', () => {
  it('plain variant uses SandboxedEnvironment without describe filters', () => {
    const code = buildNotebookJinjaRenderCode('hello', '__k', 'plain')
    expect(code).toContain('SandboxedEnvironment()')
    expect(code).not.toContain('_cribl_ai_describe')
  })

  it('riptide_prompt variant registers describe and type_name filters', () => {
    const code = buildNotebookJinjaRenderCode('{{ x }}', '__k', 'riptide_prompt')
    expect(code).toContain('_env.filters["describe"]')
    expect(code).toContain('_env.filters["type_name"]')
    expect(code).toContain('_cribl_ai_describe')
  })
})
