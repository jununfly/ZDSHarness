/**
 * 服务消费方 + 配置机制（cordis-tutorial 03/05 课）：
 *
 * - inject: ['greeter']：硬性依赖，greeter 服务就绪前本插件保持 PENDING
 * - 导出同名 Config 接口 + Config schema：
 *     apply 收到的一定是「验证过 + 默认值补齐」的完整配置
 * - 无效配置（如 targets 传字符串）→ ValidationError → fiber FAILED → 插件绝不启动
 *
 * 注意：export const Config 必须是 Standard Schema 验证器（本 demo 用自写的
 * schema.ts，正式生态用 schemastery）；导出普通对象无法工作。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from './greeter-provider.ts'
import { arraySchema, objectSchema, stringSchema, type StdSchema } from './schema.ts'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: StdSchema<Config> = objectSchema({
  greeting: stringSchema({ default: 'Hello' }),
  targets: arraySchema(stringSchema(), { default: ['world'] }),
}) as StdSchema<Config>

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context, config: Config) {
  // 到达这里时配置已被验证并补齐默认值：greeting 未配置会得到 'Hello'
  console.log(`[consumer] resolved config: greeting=${config.greeting}, targets=[${config.targets.join(', ')}]`)
  for (const target of config.targets) {
    console.log(`  ${ctx.greeter.greet(target)}`)
  }
}
