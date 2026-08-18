/** Package-owned invariant companion for `@deepseek-ai/dsh-tool-research`. @module @deepseek-ai/dsh-tool-research/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-research'
/** Cordis companion plugin name. */
export const name = 'tool-research-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']
/** No runtime invariant: the Evidence Compiler validates every returned ledger. */
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
