/** GitHub.com REST provider plugin and adapter exports. @module @deepseek-ai/dsh-github-rest */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-github'
import { GitHubRestProvider } from './provider.ts'

export { GITHUB_REST_PROVIDER_ID, GitHubRestProvider } from './provider.ts'
export type { GitHubRestProviderOptions } from './provider.ts'

/** Default credential reference used for authenticated GitHub requests. */
export const DEFAULT_GITHUB_TOKEN_ENV = 'GITHUB_TOKEN'
/** Default timeout applied to each GitHub REST request. */
export const DEFAULT_GITHUB_TIMEOUT_MS = 10_000

/** Cordis plugin name used by loader diagnostics. */
export const name = 'github-rest'
/** The GitHub capability this provider registers into. */
export const inject = ['github']

/** GitHub REST provider configuration. */
export interface Config {
  /** Credential reference resolved before each operation; defaults to `GITHUB_TOKEN`. */
  tokenEnv?: string
  /** Timeout applied independently to each REST request. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  tokenEnv: z.string().role('credential-ref').default(DEFAULT_GITHUB_TOKEN_ENV),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_GITHUB_TIMEOUT_MS),
})

/**
 * Register the GitHub.com REST provider. Missing credentials select GitHub's
 * anonymous request quota instead of making the provider unavailable.
 * @param ctx - plugin context supplying GitHub and optional credential services.
 * @param config - credential reference and request timeout.
 */
export function apply(ctx: Context, config: Config): void {
  const tokenRef = credentialRef(config.tokenEnv ?? DEFAULT_GITHUB_TOKEN_ENV)
  ctx.github.registerProvider(
    new GitHubRestProvider({
      resolveToken: async () => {
        const credentials = ctx.get('credentials')
        if (credentials !== undefined) return (await credentials.resolve(tokenRef))?.value
        const ambient = launchEnvironmentOf(ctx).get(tokenRef)
        return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
      },
      timeoutMs: config.timeoutMs ?? DEFAULT_GITHUB_TIMEOUT_MS,
    }),
  )
}
