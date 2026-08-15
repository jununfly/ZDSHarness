/**
 * 向 harness 的 tools 服务注册一个「模型可调用」的工具，
 * 走真实工具流水线执行，并观察结果事件。全程无需密钥、不调模型。
 *
 * 每个模式都来自前几课：
 *  - inject: ['tools']（03 课）→ 插件等待工具注册表就绪
 *  - ctx.tools.register(...)（02 课）→ 注册是 effect，卸载时自动注销
 *  - defineTool：parameters 规约 → 模型可见的 JSON Schema；execute 前校验参数
 *  - output.schema 声明规范值；output.render 生成可持久化的结果内容
 *
 * 这是 Capability seam 三件套（Service Definition + Provider + Consumer）
 * 在 harness 真世界里的最小切片：模型（此处用代码模拟）只面对 tools 服务。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // 模拟模型：驱动一次调用走真实执行管道。
  // CallId 为 provider 会签发的关联 id 打上品牌（防止与普通字符串混淆）。
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
