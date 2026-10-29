/**
 * zephyr-ai —— DeepSeek 反向代理（Cloudflare Worker）
 *
 * 作用：GitHub Pages 是纯静态托管，无法安全持有 API key。
 *      这个 Worker 充当中间人：浏览器只打到它，key 存在 Worker 的 Secret 里。
 *
 * 安全策略：
 *   - 只放行白名单里的来源（Origin / Referer），其余一律 403
 *   - 只接受 POST，只透传 model / stream / messages，不做任意转发
 *   - 不提供任何 GET 自检响应，避免暴露 key 状态
 *   注意：Origin 头可以被脚本伪造，这是"提高门槛"而非"真锁"。
 *        真正的损失上限靠"专用 key + 低余额"兜底。
 *
 * 部署步骤：
 *   1. Cloudflare Dashboard → Workers & Pages → zephyr-ai-proxy → Edit code
 *   2. 全选删除，粘贴本文件内容 → Deploy
 *   3. Settings → Variables and Secrets → 添加 Secret：DEEPSEEK_API_KEY
 *   4. 前端 docs/.env.production 里配 VITE_API_BASE_URL=https://<你的worker地址>
 */

// 只允许自己的站点使用（如需本地调试直连 worker，把 localhost 两行注释放开）
const ALLOWED_ORIGINS = [
  'https://wz140037.github.io'
  // 'http://localhost:5173',
  // 'http://localhost:5174'
]

function isAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))
}

// 优先看 Origin；没有 Origin 时退回看 Referer（https://site/xxx → https://site）
function resolveSource(request) {
  const origin = request.headers.get('Origin')
  if (origin) return origin.replace(/\/$/, '')

  const referer = request.headers.get('Referer')
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

export default {
  async fetch(request, env) {
    const source = resolveSource(request)

    if (!isAllowed(source)) {
      return new Response('Forbidden', { status: 403 })
    }

    const cors = {
      'Access-Control-Allow-Origin': source,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
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

    // 只透传白名单字段
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
