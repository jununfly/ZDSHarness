/** Package-owned invariant companion for `@deepseek-ai/dsh-research-cli`. @module @deepseek-ai/dsh-research-cli/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-research-cli'
/** Cordis companion plugin name. */
export const name = 'research-cli-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']
/** No runtime invariant: the executable delegates to compiler validation. */
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
