/**
 * 最小 Standard Schema V1 验证器（自包含演示用，零依赖）
 *
 * Cordis 通过 `Config['~standard'].validate(config)` 验证插件配置
 * （vendor/cordis/src/fiber.ts → resolveConfig）：
 *   - 插件无 Config schema → 原样放行
 *   - 返回 { value } → 使用 value（验证器可在此补齐默认值、归一化）
 *   - 返回 { issues } → 抛 ValidationError，fiber 进入 FAILED，插件绝不启动
 *
 * schemastery 是 Cordis 生态的正式实现；本文件手写最小可用版本，
 * 展示「schema 声明 → 验证 → 默认值归一化 → 失败报错」的完整机制边界。
 */
export interface StdIssue {
  message: string
  path?: (string | number)[]
}

export interface StdSchema<T> {
  '~standard': {
    version: 1
    vendor: string
    validate(value: unknown): { value: T } | { issues: StdIssue[] }
  }
}

/** string + 可选默认值：undefined 时补齐 default，否则报错 */
export function stringSchema(opts: { default?: string } = {}): StdSchema<string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'demo',
      validate(value) {
        if (typeof value === 'string') return { value }
        if (value === undefined && opts.default !== undefined) return { value: opts.default }
        return { issues: [{ message: `expected string but got ${JSON.stringify(value)}` }] }
      },
    },
  }
}

/** string[] + 可选默认值：逐元素用 item 验证，失败带索引 path */
export function arraySchema(item: StdSchema<string>, opts: { default?: string[] } = {}): StdSchema<string[]> {
  return {
    '~standard': {
      version: 1,
      vendor: 'demo',
      validate(value) {
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const result = item['~standard'].validate(value[i])
            if (result.issues) {
              return { issues: result.issues.map((issue) => ({ message: issue.message, path: [i] })) }
            }
          }
          return { value }
        }
        if (value === undefined && opts.default !== undefined) return { value: opts.default }
        return { issues: [{ message: `expected array but got ${JSON.stringify(value)}` }] }
      },
    },
  }
}

/** 对象组合：逐字段验证，字段缺失走各字段默认值 */
export function objectSchema(fields: Record<string, StdSchema<unknown>>): StdSchema<Record<string, unknown>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'demo',
      validate(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { issues: [{ message: `expected object but got ${JSON.stringify(value)}` }] }
        }
        const out: Record<string, unknown> = {}
        for (const [key, schema] of Object.entries(fields)) {
          const result = schema['~standard'].validate((value as Record<string, unknown>)[key])
          if (result.issues) {
            return {
              issues: result.issues.map((i) => ({
                message: i.message,
                path: [key, ...(i.path ?? [])],
              })),
            }
          }
          out[key] = result.value
        }
        return { value: out }
      },
    },
  }
}
