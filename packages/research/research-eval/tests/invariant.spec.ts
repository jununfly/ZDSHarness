import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { describe, expect, it } from 'vitest'
import * as ResearchEvalInvariant from '../src/invariant.ts'

describe('research evaluation invariant companion', () => {
  it('reserves package ownership without adding a runtime stream check', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(ResearchEvalInvariant)
    expect(ResearchEvalInvariant.name).toBe('research-eval-invariant')
    expect(ResearchEvalInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
