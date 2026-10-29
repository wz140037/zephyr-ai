/**
 * zephyr-ai —— DeepSeek 反向代理（Cloudflare Worker）
 *
 * 作用：GitHub Pages 是纯静态托管，无法安全持有 API key。
 *      这个 Worker 充当中间人：浏览器只打到它，key 存在 Worker 的 Secret 里。
 *
 * 部署步骤：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件内容整个粘贴进去 → Deploy
 *   3. 进入该 Worker → Settings → Variables and Secrets → Add
 *        Type: Secret   Name: DEEPSEEK_API_KEY   Value: sk-你的key
 *   4. 记下地址，形如 https://zephyr-ai.xxx.workers.dev
 *   5. 本地建 docs/.env.production，写入：
 *        VITE_API_BASE_URL=https://zephyr-ai.xxx.workers.dev
 *   6. pnpm docs:publish   （重新构建 + 发布到 pages 分支）
 */

const ALLOWED_ORIGINS = [
  'https://wz140037.github.io',
  'http://localhost:5173',
  'http://localhost:5174'
]

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400'
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // 浏览器直接打开时给个自检信息，方便确认是否部署成功
    if (request.method === 'GET') {
      return new Response(
        `zephyr-ai deepseek proxy: ok\nkey configured: ${Boolean(env.DEEPSEEK_API_KEY)}`,
        { status: 200, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'DEEPSEEK_API_KEY 未在 Worker 中配置' }, 500, cors)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid json' }, 400, cors)
    }

    // 只透传白名单字段，避免这个代理被当成任意请求转发器
    const payload = {
      model: body.model || 'deepseek-chat',
      stream: body.stream === true,
      messages: Array.isArray(body.messages) ? body.messages : []
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    })

    // 直接透传上游 SSE 流，不缓冲，保持打字机效果
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    })
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  })
}
