#!/usr/bin/env node
/** Standalone manifest validation and receipt projection for research experiments. */
import { parseResearchExperimentEvents, parseResearchExperimentManifest, projectResearchRunReceipt } from './index.ts'

const PROTOCOL = 'zj-research-eval-cli/v1' as const

type Request =
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'describe' }
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'validate-manifest'; readonly manifest: unknown }
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'project-receipt'; readonly events: unknown }

async function main(): Promise<void> {
  process.stdin.setEncoding('utf8')
  let input = ''
  for await (const chunk of process.stdin) input += String(chunk)
  const decoded = JSON.parse(input) as Record<string, unknown>
  if (decoded.protocol !== PROTOCOL) throw new Error(`unsupported research eval CLI protocol: ${String(decoded.protocol)}`)
  const request = decoded as Request
  let result: unknown
  switch (request.operation) {
    case 'describe':
      result = { operations: ['validate-manifest', 'project-receipt'], manifestSchemas: ['zj-research-experiment/v1'], receiptSchemas: ['zj-research-run-receipt/v1'] }
      break
    case 'validate-manifest':
      result = parseResearchExperimentManifest(request.manifest)
      break
    case 'project-receipt':
      result = projectResearchRunReceipt(parseResearchExperimentEvents(request.events))
      break
    default:
      return assertNever(request)
  }
  process.stdout.write(`${JSON.stringify({ protocol: PROTOCOL, operation: request.operation, result })}\n`)
}

function assertNever(value: never): never {
  throw new Error(`unsupported research eval CLI operation: ${JSON.stringify(value)}`)
}

main().catch((error: unknown) => {
  process.stderr.write(`dsh-research-eval: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
