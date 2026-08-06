import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { BatchDocumentReviewResult, DocumentReviewResult } from '../../types/documentReview'
import { LoadSheetRow, ParsedLoadSheet } from '../../types/loadSheet'
import { buildReviewChatContext } from '../../utils/buildReviewChatContext'
import { isAIReviewEnabled } from '../../config/aiReview'
import {
  createChatMessage,
  ExplainChatMessage,
  sendReviewExplainMessage,
} from '../../services/reviewExplainChatService'

const SUGGESTED_QUESTIONS = [
  'Why did this load get approved or rejected?',
  'How was the load number extracted?',
  'Explain the BOL signature checks.',
  'Why are there flags on this load?',
  'How does the Excel row compare to the documents?',
]

interface ReviewExplainChatProps {
  batchResult: BatchDocumentReviewResult | null
  reviewedDocs: DocumentReviewResult[]
  loadSheet?: ParsedLoadSheet | null
  selectedRow?: LoadSheetRow | null
}

/** Ask the AI how it reached review conclusions for the current load. */
export default function ReviewExplainChat({
  batchResult,
  reviewedDocs,
  loadSheet,
  selectedRow,
}: ReviewExplainChatProps) {
  const [messages, setMessages] = useState<ExplainChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastChatCost, setLastChatCost] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const contextJson = useMemo(
    () =>
      buildReviewChatContext({
        batchResult,
        reviewedDocs,
        loadSheet,
        selectedRow,
      }),
    [batchResult, reviewedDocs, loadSheet, selectedRow]
  )

  const hasReviewContext = Boolean(batchResult && reviewedDocs.length > 0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    setMessages([])
    setLastChatCost(null)
    setError(null)
  }, [batchResult?.reviewedAt])

  const submitMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    if (!hasReviewContext) {
      setError('Run a full load review first so the assistant has context to explain.')
      return
    }

    if (!isAIReviewEnabled()) {
      setError('AI chat requires the openai-proxy Edge Function.')
      return
    }

    const userMessage = createChatMessage('user', trimmed)
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setIsSending(true)

    try {
      const { reply, estimatedCostUsd } = await sendReviewExplainMessage(
        contextJson,
        messages,
        trimmed
      )
      setMessages((prev) => [...prev, createChatMessage('assistant', reply)])
      setLastChatCost(estimatedCostUsd)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the assistant.')
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submitMessage(input)
  }

  return (
    <div
      className="rounded-lg border overflow-hidden flex flex-col"
      style={{ borderColor: '#113543', backgroundColor: '#FFFFFF' }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-2"
        style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" style={{ color: '#C2A558' }} />
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#113543' }}>
              Ask about this review
            </h3>
            <p className="text-xs" style={{ color: '#819291' }}>
              Questions about extraction, flags, BOL audit, Excel match, or status
            </p>
          </div>
        </div>
        {lastChatCost != null && (
          <span className="text-xs whitespace-nowrap" style={{ color: '#819291' }}>
            Last reply ~${lastChatCost.toFixed(4)}
          </span>
        )}
      </div>

      {!hasReviewContext && (
        <p className="px-4 py-3 text-xs" style={{ color: '#819291', backgroundColor: '#FFFBF0' }}>
          Run <strong>Full Load Review</strong> above, then ask how the AI classified pages, extracted
          fields, or chose APPROVED / REJECTED.
        </p>
      )}

      {hasReviewContext && messages.length === 0 && (
        <div className="px-4 py-3 flex flex-wrap gap-2 border-b" style={{ borderColor: '#819291' }}>
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={isSending}
              onClick={() => void submitMessage(question)}
              className="text-xs px-2.5 py-1.5 rounded-full border transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#819291', color: '#113543' }}
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-[200px] max-h-[360px] overflow-y-auto px-4 py-3 space-y-3"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {messages.length === 0 && hasReviewContext && (
          <p className="text-xs text-center py-6" style={{ color: '#819291' }}>
            Try a suggested question or type your own.
          </p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
              style={
                message.role === 'user'
                  ? { backgroundColor: '#113543', color: '#FFFFFF' }
                  : { backgroundColor: '#f8f9fa', color: '#113543', border: '1px solid #819291' }
              }
            >
              {message.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#819291' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-xs border-t" style={{ borderColor: '#819291', color: '#991B1B' }}>
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t flex gap-2"
        style={{ borderColor: '#819291', backgroundColor: '#f8f9fa' }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isSending || !hasReviewContext}
          placeholder={
            hasReviewContext
              ? 'e.g. Why was the broker flagged? How did you read the rate?'
              : 'Run a review first…'
          }
          className="flex-1 px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{ borderColor: '#819291', color: '#113543' }}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim() || !hasReviewContext}
          className="px-3 py-2 rounded text-white disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium"
          style={{ backgroundColor: '#113543' }}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </form>
    </div>
  )
}
