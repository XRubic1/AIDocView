import { AI_REVIEW_CONFIG } from '../../../src/config/aiReview.js'
import { getRuntimeEnvString } from '../../../src/platform/runtimeEnv.js'

const MAX_429_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getKey(): string {
  const key = getRuntimeEnvString('VITE_OPENAI_API_KEY')
  if (!key) {
    throw new Error('VITE_OPENAI_API_KEY is required for live eval recording.')
  }
  return key
}

/** Live OpenAI HTTP — bypasses mock handler (used by --record). */
export async function fetchLiveOpenAI(body: Record<string, unknown>): Promise<Response> {
  let lastErrorBody = ''

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const response = await fetch(AI_REVIEW_CONFIG.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.status !== 429 || attempt >= MAX_429_RETRIES) {
      return response
    }

    lastErrorBody = await response.text()
    await sleep(3000)
  }

  return new Response(lastErrorBody, { status: 429, statusText: 'Too Many Requests' })
}
