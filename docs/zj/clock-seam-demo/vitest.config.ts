// demo 目录独立 vitest 配置：根配置只收 packages 下的 tests，
// 这里以本目录为 root 跑 clock seam 契约测试，不污染 upstream 文件。
// pathsPlugin 与根配置同款：tsconfig.base.json 的 paths 映射
// @deepseek-ai/* 到 packages/ 源码（源码单例，避免 lib/ 第二副本）。
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    tsconfigPaths({ projects: [fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))] }),
  ],
  test: {
    include: ['*.spec.ts'],
    environment: 'node',
  },
})
