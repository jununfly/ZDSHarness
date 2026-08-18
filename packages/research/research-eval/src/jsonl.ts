/** Durable JSONL event storage for standalone research experiments. @module @deepseek-ai/dsh-research-eval/jsonl */
import { open, readFile } from 'node:fs/promises'
import type { ResearchExperimentEvent, ResearchExperimentEventSink } from './types.ts'
import { parseResearchExperimentEvents } from './index.ts'

/** One-run JSONL sink that creates on start and appends one terminal fact. */
export class JsonlResearchExperimentEventSink implements ResearchExperimentEventSink {
  /** @param path - exclusive event-log path for one run. */
  constructor(private readonly path: string) {}

  /** Append and fsync one lifecycle fact before returning. */
  async append(event: ResearchExperimentEvent): Promise<void> {
    const handle = await open(this.path, event.seq === 1 ? 'wx' : 'a', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(event)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
}

/**
 * Read and validate one complete run event log.
 * @param path - JSONL artifact produced by {@link JsonlResearchExperimentEventSink}.
 * @returns validated events in durable order.
 */
export async function readResearchExperimentEventLog(path: string): Promise<readonly ResearchExperimentEvent[]> {
  const content = await readFile(path, 'utf8')
  const records = content.split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as unknown)
  return parseResearchExperimentEvents(records)
}
