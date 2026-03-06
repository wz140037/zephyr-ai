import { defineConfig } from 'vitepress'

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
        '/api': {
          target: 'https://server.mhaibaraai.cn/zephyr-ai-service',
          changeOrigin: true
        }
      }
    }
  }
})
