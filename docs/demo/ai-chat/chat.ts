import { chatEndpoint, model } from "../api/config"

export interface ChatRequest {
  message: string
  conversationId?: string
}

export interface ChatStreamOptions {
  onMessage?: (text: string) => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

/**
 * DeepSeek 流式聊天（OpenAI 兼容协议）
 * key 只在服务端（vite 代理 / 边缘函数）注入，不进浏览器
 */
export async function chatAIStream(data: ChatRequest, { onMessage, onEnd, onError }: ChatStreamOptions = {}) {
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    onEnd?.()
  }

  try {
    const res = await fetch(chatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: "user", content: data.message }]
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
