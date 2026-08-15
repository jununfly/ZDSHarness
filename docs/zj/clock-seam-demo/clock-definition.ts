/**
 * 角色一：Service Definition（对位 dsh-fs 包）。
 *
 * 只定义「能力长什么样」：抽象服务类 + declare module 声明合并（ctx.clock 类型）。
 * 不提供实现、不是插件、不进 cordis.yml——provider import 它，consumer 只认接口。
 * upstream 对位：packages/fs/fs 之于 fs-local / fs-sandbox / fs-e2b。
 */
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    clock: ClockService
  }
}

export abstract class ClockService extends Service {
  constructor(ctx: Context) {
    // 第二参 = 服务名：装载后自注册为 ctx.clock
    super(ctx, 'clock')
  }

  /** 当前时刻（epoch 毫秒）。 */
  abstract now(): number

  /** 当前时刻的 ISO-8601 字符串。 */
  abstract iso(): string
}
