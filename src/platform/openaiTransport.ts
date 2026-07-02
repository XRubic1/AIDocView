export type OpenAIChatCompletionsHandler = (
  body: Record<string, unknown>
) => Promise<Response>

let handler: OpenAIChatCompletionsHandler | undefined

/** Replace OpenAI HTTP calls (eval mock/recorder). Browser uses default fetch transport. */
export function setOpenAIChatCompletionsHandler(next: OpenAIChatCompletionsHandler | undefined): void {
  handler = next
}

export function getOpenAIChatCompletionsHandler(): OpenAIChatCompletionsHandler | undefined {
  return handler
}
