import { chatEndpoint, model, systemPrompt } from "../api/config"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatRequest {
  /** 完整对话历史（调用方维护；system 由内部补在最前面） */
  messages: ChatMessage[]
  conversationId?: string
}

export interface ChatStreamOptions {
  onMessage?: (text: string) => void
  onEnd?: () => void
  onError?: (err: unknown) => void
  /** byok 模式下由访客提供的 key，直接放 Authorization 头 */
  apiKey?: string
}

/**
 * DeepSeek 流式聊天（OpenAI 兼容协议）
 * dev / proxy 模式 key 由服务端注入；byok 模式由访客自带
 */
export async function chatAIStream(data: ChatRequest, { onMessage, onEnd, onError, apiKey }: ChatStreamOptions = {}) {
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    onEnd?.()
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    // system 放最前面，后面接完整多轮历史，模型才能看见上文
    const payload: ChatMessage[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...data.messages]
      : [...data.messages]

    const res = await fetch(chatEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: true,
        messages: payload
      })
    })

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "")
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 300)}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const raw of lines) {
        const line = raw.trim()
        // 空行是 SSE 的事件分隔符，注释行（: keep-alive）直接跳过
        if (!line.startsWith("data:")) continue

        const payload = line.slice(5).trim()
        if (payload === "[DONE]") {
          end()
          return
        }

        try {
          const obj = JSON.parse(payload)
          const text = obj?.choices?.[0]?.delta?.content
          if (text) onMessage?.(text)
        } catch {
          // 非 JSON 心跳，忽略
        }
      }
    }

    end()
  } catch (err) {
    onError?.(err)
  }
}
