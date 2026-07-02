import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setOpenAIChatCompletionsHandler } from '../../../src/platform/openaiTransport.js'
import type { OpenAIFixtureFile, RecordedOpenAICall } from '../types.js'
import { fetchLiveOpenAI } from './liveOpenAI.js'

function responseFromPayload(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function saveOpenAIFixtures(
  fixturePath: string,
  calls: RecordedOpenAICall[]
): Promise<void> {
  await mkdir(path.dirname(fixturePath), { recursive: true })
  const file: OpenAIFixtureFile = {
    version: 1,
    recordedAt: new Date().toISOString(),
    calls,
  }
  await writeFile(fixturePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

export async function loadOpenAIFixtures(fixturePath: string): Promise<OpenAIFixtureFile> {
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(fixturePath, 'utf8')
  const parsed = JSON.parse(raw) as OpenAIFixtureFile
  if (!parsed.calls?.length) {
    throw new Error(`Fixture ${fixturePath} has no recorded calls`)
  }
  return parsed
}

export function installMockOpenAI(calls: RecordedOpenAICall[]): void {
  let index = 0
  setOpenAIChatCompletionsHandler(async (body) => {
    const record = calls[index]
    if (!record) {
      throw new Error(
        `Mock OpenAI exhausted after ${calls.length} recorded calls (request #${index + 1}). Re-record with: npm run eval:record -- --case <name>`
      )
    }
    index += 1
    return responseFromPayload(record.response)
  })
}

/** Replay recorded fixtures from the first call (for multi-run consistency checks). */
export function resetMockOpenAI(calls: RecordedOpenAICall[]): void {
  installMockOpenAI(calls)
}

export function installRecordingOpenAI(fixturePath: string): void {
  const calls: RecordedOpenAICall[] = []

  setOpenAIChatCompletionsHandler(async (body) => {
    const response = await fetchLiveOpenAI(body)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI request failed (${response.status}): ${text}`)
    }
    const payload = (await response.json()) as Record<string, unknown>
    calls.push({ request: body, response: payload })
    await saveOpenAIFixtures(fixturePath, calls)
    return responseFromPayload(payload)
  })
}

export function clearOpenAIHandler(): void {
  setOpenAIChatCompletionsHandler(undefined)
}
