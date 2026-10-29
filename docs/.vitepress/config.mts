import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'

// 读取 docs/.env（已 gitignore），让 key 只存在于 Node 侧，不进浏览器产物
function loadDotEnv() {
  const file = resolve(process.cwd(), '.env')
  const env: Record<string, string> = {}
  if (!existsSync(file)) return env
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    env[key] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}

const dotenv = loadDotEnv()
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || dotenv.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'

// 每次请求都重读 .env：改完 key 不用重启 dev server
function currentKey() {
  return process.env.DEEPSEEK_API_KEY || loadDotEnv().DEEPSEEK_API_KEY || ''
}

if (!currentKey()) {
  console.warn('[zephyr-ai] 未找到 DEEPSEEK_API_KEY，请在 docs/.env 中配置，否则 /api/deepseek 会 401')
}

export default defineConfig({
  base: '/zephyr-ai/',
  title: 'Zephyr AI',
  description: '轻量、实用的 AI 应用示例平台',
  lang: 'zh-CN',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/zephyr-ai/image/logo.svg' }],
  ],
  themeConfig: {
    logo: '/image/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  },
  vite: {
    server: {
      host: true,
      // 代理
      proxy: {
        '/localhost': {
          target: 'http://localhost:8080',
          changeOrigin: true
        },
        // DeepSeek：前端只请求 /api/deepseek/*，key 由服务端注入
        '/api/deepseek': {
          target: DEEPSEEK_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = currentKey()
              if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)
            })
          }
        }
      }
    }
  }
})
