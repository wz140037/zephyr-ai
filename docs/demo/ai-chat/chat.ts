import { baseURL } from "../api/config"

export interface ChatRequest {
  message: string
  conversationId?: string
}

export interface ChatStreamOptions {
  onMessage?: (text: string) => void
  onEnd?: () => void
  onError?: (err: any) => void
}

/**
 * AI 流式聊天
 */
export async function chatAIStream(data, { onMessage, onEnd, onError }) {

  const res = await fetch(`${baseURL}/api/ai/chat-stream?message=${encodeURIComponent(data.message)}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    },
  }).catch(err => {
    onError?.(err)
  }).finally(() => {
    onEnd?.()
  })

  const reader = res?.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()

  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value)

    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data:")) continue

      const json = line.replace("data:", "").trim()

      try {
        const obj = JSON.parse(json)

        if (obj.event === "text_chunk") {
          onMessage?.(obj.data.text)
        }

        if (obj.event === "workflow_finished") {
          onEnd?.()
        }

      } catch { }
    }
  }

  onEnd?.()
}