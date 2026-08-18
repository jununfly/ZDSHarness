#!/usr/bin/env node
/** Standalone manifest validation and receipt projection for research experiments. */
import {
  calibrateResearchJudge,
  parseResearchExperimentEvents,
  parseResearchExperimentManifest,
  projectResearchRunReceipt,
  validateResearchEvaluationAssets,
} from './index.ts'

const PROTOCOL = 'zj-research-eval-cli/v1' as const

type Request =
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'describe' }
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'validate-manifest'; readonly manifest: unknown }
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'validate-assets'; readonly manifest: unknown; readonly rubrics: unknown; readonly annotations: unknown; readonly calibration: unknown }
  | { readonly protocol: typeof PROTOCOL; readonly operation: 'calibrate-judge'; readonly rubrics: unknown; readonly calibration: unknown }
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
      result = {
        operations: ['validate-manifest', 'validate-assets', 'calibrate-judge', 'project-receipt'],
        manifestSchemas: ['zj-research-experiment/v1'],
        evaluationAssetSchemas: ['zj-research-rubric-set/v1', 'zj-research-human-annotation-set/v1', 'zj-research-judge-calibration-set/v1'],
        receiptSchemas: ['zj-research-run-receipt/v2'],
      }
      break
    case 'validate-manifest':
      result = parseResearchExperimentManifest(request.manifest)
      break
    case 'validate-assets':
      result = validateResearchEvaluationAssets(
        parseResearchExperimentManifest(request.manifest),
        request.rubrics,
        request.annotations,
        request.calibration,
      )
      break
    case 'calibrate-judge':
      result = calibrateResearchJudge(request.rubrics, request.calibration)
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
