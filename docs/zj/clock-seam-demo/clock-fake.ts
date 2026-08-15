/**
 * 角色二（provider B）：可注入固定时间的假时钟（对位测试里的 FakeFs / e2b 远端后端）。
 *
 * 同一个 seam 的第二个 provider——证明「provider 可替换，consumer 无感」：
 * 换掉 cordis.yml 里一行（clock-local → clock-fake），clock 工具的代码一行不改。
 */
import type { Context } from '@deepseek-ai/cordis'
import { ClockService } from './clock-definition.ts'

export interface Config {
  /** 固定时刻（epoch 毫秒）。缺省用 Unix 纪元。 */
  fixedAt?: number
}

export default class FakeClock extends ClockService {
  private fixedAt: number

  constructor(ctx: Context, config?: Config) {
    super(ctx)
    this.fixedAt = config?.fixedAt ?? 0
  }

  /** 测试推进时间用。 */
  advance(ms: number): void {
    this.fixedAt += ms
  }

  override now(): number {
    return this.fixedAt
  }

  override iso(): string {
    return new Date(this.fixedAt).toISOString()
  }
}
