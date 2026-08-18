/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-research-telemetry-otel`.
 * @module @deepseek-ai/dsh-research-telemetry-otel/invariant
 */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-research-telemetry-otel'
/** Cordis companion plugin name. */
export const name = 'research-telemetry-otel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']
/** No runtime invariant: durable evaluation events are the authoritative input and the OTel SDK owns export state. */
const install: InvariantInstaller = () => {}
/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
