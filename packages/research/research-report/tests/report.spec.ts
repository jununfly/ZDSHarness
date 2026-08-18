import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderResearchHtml, validateResearchMarkdown } from '../src/index.ts'

const sourceUrl = 'https://github.com/example/harness/blob/0123456789abcdef/README.md'

function technicalMarkdown(): string {
  return `# Harness engineering

## 调研主题
[[agent-harness]]

## 输入材料与观察时间
2026-08-18

## Key-Value 概念索引
- Key: \`agent-harness\`

## C4 System Landscape
\`\`\`mermaid
flowchart LR
  Team --> Harness
\`\`\`

## 候选项目表
| Project | Source |
| --- | --- |
| Harness | [[agent-harness]] [1](${sourceUrl}) |

## 深读项目卡片
[[agent-harness]]

## 方案族及适用场景对比
[[agent-harness]]

## C4 Context/Container 与子主题图
[[agent-harness]]

## 关键技术指标矩阵
[[agent-harness]]

## 建议、限制与待验证事项
[[agent-harness]]

## 来源清单
1. [Primary source](${sourceUrl})
`
}

function draftMarkdown(): string {
  return `# Harness engineering

## 1. Executive summary
[1](${sourceUrl})

## 2. Key findings
Finding [1](${sourceUrl}).

## 3. Analysis & synthesis
Analysis.

## 4. Information gaps & next steps
Gap.

## 6. Source list
1. [Primary source](${sourceUrl})
`
}

function linkDestinations(markup: string, selector: string): string[] {
  const document = new JSDOM(markup).window.document
  return [...document.querySelectorAll<HTMLAnchorElement>(selector)].map(anchor => anchor.href)
}

function markdownLinkDestinations(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].flatMap(match => (match[1] === undefined ? [] : [match[1]]))
}

describe('research report projection', () => {
  it('validates each report family and rejects a mismatched family', async () => {
    await expect(validateResearchMarkdown(technicalMarkdown(), 'technical-c4/v1')).resolves.toBeUndefined()
    await expect(validateResearchMarkdown(draftMarkdown(), 'zj-draft/v1')).resolves.toBeUndefined()
    await expect(validateResearchMarkdown(draftMarkdown(), 'technical-c4/v1')).rejects.toThrow(
      'research report is missing required heading: 调研主题',
    )
  })

  it('preserves citation destinations in standalone offline HTML', async () => {
    const markdown = draftMarkdown()
    const html = await renderResearchHtml(markdown, 'zj-draft/v1')

    expect(linkDestinations(html, 'a')).toEqual(markdownLinkDestinations(markdown))
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//)
    expect(html).not.toContain('<script>')
  })

  it('embeds the pinned Mermaid runtime without external assets', async () => {
    const html = await renderResearchHtml(technicalMarkdown(), 'technical-c4/v1')

    expect(html).toContain('<pre class="mermaid">flowchart LR')
    expect(html).toContain('mermaid.initialize({startOnLoad:true')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//)
  })
})
