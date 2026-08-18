/** Family-aware validation and offline HTML projection for research Markdown. @module @deepseek-ai/dsh-research-report */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Marked, Renderer } from 'marked'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const mermaidRuntimePath = require.resolve('mermaid/dist/mermaid.min.js')
let mermaidRuntime: Promise<string> | undefined
let mermaidParser: Promise<(source: string) => Promise<unknown>> | undefined

/** Report family whose Markdown structure is validated before HTML projection. */
export type ResearchReportFamily = 'technical-c4/v1' | 'zj-draft/v1'

const TECHNICAL_C4_HEADINGS = [
  '调研主题',
  '输入材料与观察时间',
  'Key-Value 概念索引',
  'C4 System Landscape',
  '候选项目表',
  '深读项目卡片',
  '方案族及适用场景对比',
  'C4 Context/Container 与子主题图',
  '关键技术指标矩阵',
  '建议、限制与待验证事项',
  '来源清单',
] as const

const ZJ_DRAFT_HEADINGS = [
  '1. Executive summary',
  '2. Key findings',
  '3. Analysis & synthesis',
  '4. Information gaps & next steps',
  '6. Source list',
] as const

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function renderer(): Renderer {
  const value = new Renderer()
  value.html = ({ text }) => `<p>${escapeHtml(text)}</p>\n`
  value.code = ({ text, lang }) => {
    if (lang?.trim() === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`
    const language = lang === undefined || lang.length === 0 ? '' : ` class="language-${escapeHtml(lang)}"`
    return `<pre><code${language}>${escapeHtml(text)}</code></pre>\n`
  }
  return value
}

const markdownRenderer = new Marked({
  gfm: true,
  breaks: false,
  renderer: renderer(),
})

/**
 * Validate one report family's section order, links, and Mermaid syntax.
 * @param markdown - authoritative report Markdown.
 * @param family - structural report family selected by the validated Report IR.
 */
export async function validateResearchMarkdown(markdown: string, family: ResearchReportFamily): Promise<void> {
  const requiredHeadings = family === 'technical-c4/v1' ? TECHNICAL_C4_HEADINGS : ZJ_DRAFT_HEADINGS
  let previousHeadingIndex = -1
  for (const heading of requiredHeadings) {
    const match = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, 'm').exec(markdown)
    if (match === null) throw new Error(`research report is missing required heading: ${heading}`)
    if (match.index <= previousHeadingIndex) throw new Error(`research report heading is out of order: ${heading}`)
    previousHeadingIndex = match.index
  }
  if (family === 'technical-c4/v1') validateConceptReferences(markdown)
  validateLinkProtocols(markdown)
  const parseMermaid = await loadMermaidParser()
  for (const match of markdown.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)) {
    const source = match[1]
    if (source !== undefined) await parseMermaid(source)
  }
}

function validateConceptReferences(markdown: string): void {
  const definitions = [...markdown.matchAll(/^- Key:\s+`([a-z0-9][a-z0-9._-]*)`(?:\s|$)/gim)].flatMap(match =>
    match[1] === undefined ? [] : [match[1]],
  )
  if (definitions.length === 0) throw new Error('Key-Value 概念索引 must declare at least one - Key: `identifier`')
  if (new Set(definitions).size !== definitions.length) throw new Error('Key-Value 概念索引 contains a duplicate Key')
  const references = [...markdown.matchAll(/\[\[([a-z0-9][a-z0-9._-]*)\]\]/gi)].flatMap(match =>
    match[1] === undefined ? [] : [match[1]],
  )
  const defined = new Set(definitions)
  for (const reference of references) if (!defined.has(reference)) throw new Error(`report references undefined Key: ${reference}`)
  for (const definition of definitions) if (!references.includes(definition)) throw new Error(`report never references Key: ${definition}`)
}

function validateLinkProtocols(markdown: string): void {
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) {
    const target = match[1]
    if (target === undefined) continue
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target)?.[1]?.toLowerCase()
    if (scheme !== undefined && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto')
      throw new Error(`report link uses unsupported protocol: ${scheme}`)
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function loadMermaidParser(): Promise<(source: string) => Promise<unknown>> {
  mermaidParser ??= (async () => {
    const { window } = new JSDOM('')
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true })
    Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    return source => mermaid.parse(source, { suppressErrors: false })
  })()
  return await mermaidParser
}

const STYLE = `
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.6}body{max-width:1100px;margin:0 auto;padding:40px 28px}h1,h2,h3{line-height:1.25}table{border-collapse:collapse;width:100%;display:block;overflow:auto}th,td{border:1px solid #8886;padding:8px 10px;text-align:left}pre{overflow:auto;padding:16px;border-radius:8px;background:#8882}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}blockquote{border-left:4px solid #8888;margin-left:0;padding-left:16px;color:#666}a{color:#0969da}.mermaid{text-align:center;background:transparent}@media print{body{max-width:none;padding:0}a{color:inherit}}
`.trim()

async function loadMermaidRuntime(): Promise<string> {
  mermaidRuntime ??= readFile(mermaidRuntimePath, 'utf8')
  return await mermaidRuntime
}

/**
 * Derive a deterministic single-file HTML document from validated Markdown.
 * Raw HTML is escaped; reports with Mermaid use the pinned inline runtime and
 * retain readable diagram source when scripts are disabled.
 * @param markdown - authoritative report Markdown.
 * @param family - structural report family selected by the validated Report IR.
 * @returns a complete offline HTML document.
 */
export async function renderResearchHtml(markdown: string, family: ResearchReportFamily): Promise<string> {
  await validateResearchMarkdown(markdown, family)
  const body = await markdownRenderer.parse(markdown)
  const mermaidScripts = markdown.includes('```mermaid')
    ? [
      `<script>${(await loadMermaidRuntime()).replaceAll('</script', '<\\/script')}</script>`,
      '<script>mermaid.initialize({startOnLoad:true,securityLevel:"strict",theme:"default"});</script>',
    ]
    : []
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Technical Research Report</title>',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    body,
    '</main>',
    ...mermaidScripts,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
