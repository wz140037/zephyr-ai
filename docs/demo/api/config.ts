// 基础请求地址：留空表示走同源（dev 阶段由 .vitepress/config.mts 的代理转发到 DeepSeek）
export const baseURL = (import.meta as any).env.VITE_API_BASE_URL ?? ''

// DeepSeek 模型：deepseek-chat（通用）/ deepseek-reasoner（推理）
export const model = (import.meta as any).env.VITE_DEEPSEEK_MODEL ?? 'deepseek-chat'
