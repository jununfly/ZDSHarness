/** Low-cardinality OpenTelemetry Metrics Consumer for research health. @module @deepseek-ai/dsh-research-telemetry-otel */
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import { APP_IDENTITY } from '@deepseek-ai/dsh-llm'
import { researchHealthMetrics } from '@deepseek-ai/dsh-research'
import type {} from '@deepseek-ai/dsh-session'
import z from '@deepseek-ai/schemastery'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

/** Cordis plugin name used by loader diagnostics. */
export const name = 'research-telemetry-otel'
/** Session events carrying deterministic evaluation facts. */
export const inject = ['sessions']

/** OTLP/HTTP Metrics export settings. */
export interface Config {
  /** Full OTLP Metrics endpoint. */
  url: string
  /** Periodic export interval in milliseconds. */
  exportIntervalMillis?: number
  /** Per-export transport timeout in milliseconds. */
  timeoutMillis?: number
}

export const Config: z<Config> = z.object({
  url: z.string().required(),
  exportIntervalMillis: z.number().step(1).min(1).default(60_000),
  timeoutMillis: z.number().step(1).min(1).default(10_000),
})

/** Export each durable research evaluation as bounded metric distributions. */
export function apply(ctx: Context, config: Config): void {
  const endpoint = new URL(config.url)
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:')
    throw new Error(`research-telemetry-otel: url must be http(s), got ${endpoint.protocol}`)
  const reader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: endpoint.href, timeoutMillis: config.timeoutMillis ?? 10_000 }),
    exportIntervalMillis: config.exportIntervalMillis ?? 60_000,
  })
  const provider = new MeterProvider({
    resource: resourceFromAttributes({ 'service.name': APP_IDENTITY.product, 'service.version': APP_IDENTITY.version }),
    readers: [reader],
  })
  const meter = provider.getMeter('@deepseek-ai/dsh-research-telemetry-otel', version)
  const instruments = new Map([
    ['dsh.research.healthy', meter.createHistogram('dsh.research.healthy', { unit: '1' })],
    ['dsh.research.correctness_failures', meter.createHistogram('dsh.research.correctness_failures', { unit: '{failure}' })],
    ['dsh.research.evidence', meter.createHistogram('dsh.research.evidence', { unit: '{evidence}' })],
    ['dsh.research.unknown', meter.createHistogram('dsh.research.unknown', { unit: '{criterion}' })],
    ['dsh.research.navigation_failures', meter.createHistogram('dsh.research.navigation_failures', { unit: '{failure}' })],
    ['dsh.research.source_files', meter.createHistogram('dsh.research.source_files', { unit: '{file}' })],
    ['dsh.research.source_bytes', meter.createHistogram('dsh.research.source_bytes', { unit: 'By' })],
    ['dsh.research.duration_ms', meter.createHistogram('dsh.research.duration_ms', { unit: 'ms' })],
    ['dsh.research.cache_hit', meter.createHistogram('dsh.research.cache_hit', { unit: '1' })],
  ] as const)
  const inputTokens = meter.createHistogram('dsh.research.model_input_tokens', { unit: '{token}' })
  const outputTokens = meter.createHistogram('dsh.research.model_output_tokens', { unit: '{token}' })
  const cacheReadTokens = meter.createHistogram('dsh.research.model_cache_read_tokens', { unit: '{token}' })
  const cacheWriteTokens = meter.createHistogram('dsh.research.model_cache_write_tokens', { unit: '{token}' })
  const reasoningTokens = meter.createHistogram('dsh.research.model_reasoning_tokens', { unit: '{token}' })
  const usageBySession = new WeakMap<
    object,
    { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; reasoningTokens: number }
  >()
  ctx.on('session/event', (session, event) => {
    if (event.type === 'assistant/message' && event.data.usage !== undefined) {
      const current = usageBySession.get(session) ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      }
      usageBySession.set(session, {
        inputTokens: current.inputTokens + event.data.usage.inputTokens,
        outputTokens: current.outputTokens + event.data.usage.outputTokens,
        cacheReadTokens: current.cacheReadTokens + (event.data.usage.cacheReadTokens ?? 0),
        cacheWriteTokens: current.cacheWriteTokens + (event.data.usage.cacheWriteTokens ?? 0),
        reasoningTokens: current.reasoningTokens + (event.data.usage.reasoningTokens ?? 0),
      })
      return
    }
    if (event.type !== 'research/evaluation-completed') return
    const attributes = { 'report.family': event.data.reportFamily, 'compiler.version': event.data.compilerVersion }
    for (const point of researchHealthMetrics(event.data)) {
      instruments.get(point.name)?.record(point.value, attributes)
    }
    const usage = usageBySession.get(session) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    }
    inputTokens.record(usage.inputTokens, attributes)
    outputTokens.record(usage.outputTokens, attributes)
    cacheReadTokens.record(usage.cacheReadTokens, attributes)
    cacheWriteTokens.record(usage.cacheWriteTokens, attributes)
    reasoningTokens.record(usage.reasoningTokens, attributes)
    usageBySession.delete(session)
  })
  ctx.effect(
    () => async () => {
      await provider.shutdown()
    },
    'research-telemetry-otel: metric provider',
  )
}
