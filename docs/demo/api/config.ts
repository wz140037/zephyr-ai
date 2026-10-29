// 对话接口地址，三种模式：
//   dev    → 走同源 /api/deepseek，由 .vitepress/config.mts 的 vite 代理转发（key 在 docs/.env）
//   proxy  → 配了 VITE_API_BASE_URL，走自己的代理（如 Cloudflare Worker，需绑自有域名）
//   byok   → 都没配，浏览器直连 DeepSeek，key 由访客自己填（存 localStorage，不上传）
const env = (import.meta as any).env
const apiBase = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const authMode: 'dev' | 'proxy' | 'byok' = env.DEV ? 'dev' : apiBase ? 'proxy' : 'byok'

export const chatEndpoint =
  authMode === 'dev'
    ? '/api/deepseek/chat/completions'
    : authMode === 'proxy'
      ? `${apiBase}/chat/completions`
      : 'https://api.deepseek.com/chat/completions'

// DeepSeek 模型：deepseek-chat（通用）/ deepseek-reasoner（推理）
export const model = env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat'
