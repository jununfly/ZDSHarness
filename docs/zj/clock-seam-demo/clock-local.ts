/**
 * 角色二（provider A）：真实系统时钟（对位 dsh-fs-local）。
 *
 * default 导出 Service 子类本身就是插件：yml 按名装载（或 ctx.plugin()），
 * 构造时经 super(ctx, 'clock') 自注册为 ctx.clock——与 fs-local 同款，
 * 没有 apply 函数。
 */
import type { Context } from '@deepseek-ai/cordis'
import { ClockService } from './clock-definition.ts'

export default class SystemClock extends ClockService {
  constructor(ctx: Context) {
    super(ctx)
  }

  override now(): number {
    return Date.now()
  }

  override iso(): string {
    return new Date().toISOString()
  }
}
