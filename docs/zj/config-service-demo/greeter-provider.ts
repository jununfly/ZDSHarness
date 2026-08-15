/**
 * 服务提供方（cordis-tutorial 03 课）：
 * Service 子类 + super(ctx, 'greeter') 注册具名服务；
 * declare module 声明合并让 ctx.greeter 获得类型。
 * 注册本身是 effect——提供方卸载时服务随之消失，依赖方自动卸载等待重载。
 */
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  private greeted = 0

  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    this.greeted += 1
    return `Hello, ${who}! (greeted ${this.greeted} times)`
  }
}

export const name = 'greeter-provider'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
