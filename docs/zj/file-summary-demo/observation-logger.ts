/**
 * 观察者：监听 fs/observed，展示「观察-守卫闭环」的记账侧。
 * 与工具提供方互不知晓——fs-observation-policy（read-before-edit）就是
 * 这样一类监听者：把 present 观察记成后续 write/edit 的 stale 守卫版本。
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'observation-logger'
export const inject = ['fs']

export function apply(ctx: Context) {
  ctx.on('fs/observed', (target, observation, actor) => {
    const who = actor === undefined ? 'no actor' : 'tool exec'
    if (observation.kind === 'present') {
      console.log(`[observed] present ${target.displayPath} @ ${observation.version} (${who})`)
    } else {
      console.log(`[observed] absent  ${target.displayPath} (${who})`)
    }
  })
}
