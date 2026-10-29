// 对话接口地址
// - 本地 dev：留空 → 走同源 /api/deepseek，由 .vitepress/config.mts 的代理转发并注入 key
// - 线上静态站（GitHub Pages）：在 docs/.env.production 里配 VITE_API_BASE_URL 指向自己的代理（如 Cloudflare Worker）
const apiBase = ((import.meta as any).env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const chatEndpoint = apiBase ? `${apiBase}/chat/completions` : '/api/deepseek/chat/completions'

// DeepSeek 模型：deepseek-chat（通用）/ deepseek-reasoner（推理）
export const model = (import.meta as any).env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat'
