/** Package-owned invariant companion for `@deepseek-ai/dsh-research-eval`. @module @deepseek-ai/dsh-research-eval/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-research-eval'

/** Cordis companion plugin name. */
export const name = 'research-eval-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the runtime validates every event stream before projecting a receipt. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
