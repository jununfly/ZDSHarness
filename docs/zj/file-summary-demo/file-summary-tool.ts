/**
 * 自创工具 `file_summary`（1-5-1）：走 ctx.fs seam 的只读摘要工具，
 * 把 1-4-2 精读的「观察-守卫闭环」用一遍——
 *   resolve（realpath 派生身份）→ stat（一次观察拿 FsVersion）→ readText →
 *   ctx.emit('fs/observed', { kind: 'present', version })（同步记账，策略插件可消费）
 *
 * 本文件只注册工具（测试可直接装载）；demo 驱动在 ./demo.ts。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const FILE_SUMMARY_TOOL_NAME = 'file_summary'

export const name = 'file-summary-tool'
export const inject = ['tools', 'fs']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: FILE_SUMMARY_TOOL_NAME,
    description: 'Summarize a UTF-8 text file: version, size, total line count, and a preview of the first lines.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to summarize, resolved by the filesystem backend.' },
      max_lines: { type: 'number', description: 'Maximum preview lines to return. Defaults to 5.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          version: { type: 'string', required: true },
          totalLines: { type: 'integer', required: true },
          preview: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `${value.path} (version ${value.version}): ${value.totalLines} lines; first ${value.preview.length}:\n`
          + value.preview.map(l => `${l.number}: ${l.text}`).join('\n'),
      }],
    },
    async execute(args, exec) {
      const maxLines = args.max_lines ?? 5
      if (maxLines < 1) throw new Error('max_lines must be >= 1')

      // resolve 先派生身份（realpath 使别名共享同一 targetKey/version）
      const target = await ctx.fs.resolve(args.path, { signal: exec.signal })
      // 一次 stat：缺席观察 OR 类型检查 + 现在的 FsVersion
      const info = await ctx.fs.stat(target, exec.signal)
      if (!info) throw new Error(`no such file: ${target.displayPath}`)

      const content = await ctx.fs.readText(target, exec.signal)
      const lines = content.split('\n')
      // 末尾换行不算一行
      const totalLines = lines.at(-1) === '' ? lines.length - 1 : lines.length
      const preview = lines.slice(0, Math.min(maxLines, totalLines)).map((text, i) => ({ number: i + 1, text }))

      // 观察-守卫闭环的另一半：把 present + version 记账给监听者。
      // 契约：同步 recorder；无策略插件监听时是 no-op（tool-fs read 同款姿势）。
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)

      return {
        path: target.displayPath,
        version: String(info.version),
        totalLines,
        preview,
      }
    },
  }))
}
