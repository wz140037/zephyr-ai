<script lang="ts" setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue"
import MarkdownIt from "markdown-it"
import { chatAIStream } from "./chat"
import { authMode } from "../api/config"

// 渲染 AI 回答的 Markdown。html:false 不解析原始 HTML，天然防 XSS
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
// 只放行安全协议，挡掉 javascript: 之类
md.validateLink = (url: string) => /^(https?:|mailto:|#|\/)/i.test(url)

function renderMd(text: string) {
  return md.render(text || "")
}

const input = ref("")
const loading = ref(false)
const conversationId = ref("")

const chatRef = ref<HTMLElement>()
const rootRef = ref<HTMLElement>()

// 移动端把聊天区锁成「一屏高」，让输入框永远在底部可见。
// VitePress 的 Nav / LocalNav 高度各机型不一致，纯 CSS 算不准，这里按实际位置量一次。
const MOBILE_MAX = 640
const fillHeight = ref(0)

function measureHeight() {
  if (typeof window === "undefined") return
  const el = rootRef.value
  if (!el || window.innerWidth > MOBILE_MAX) {
    fillHeight.value = 0
    return
  }
  // visualViewport 会随软键盘收缩，用它算高度，键盘弹出时输入框自然贴着键盘上沿。
  // 留 8px 余量，避免把页面撑出滚动条。
  const vh = window.visualViewport?.height ?? window.innerHeight
  const top = el.getBoundingClientRect().top
  fillHeight.value = Math.max(320, Math.round(vh - top - 8))
}

// 用户往上翻历史时，别被新消息强行拉回底部
let stickToBottom = true

function onChatScroll() {
  const el = chatRef.value
  if (!el) return
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

onMounted(() => {
  measureHeight()
  window.addEventListener("resize", measureHeight)
  window.addEventListener("orientationchange", measureHeight)
  window.visualViewport?.addEventListener("resize", measureHeight)
  chatRef.value?.addEventListener("scroll", onChatScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener("resize", measureHeight)
  window.removeEventListener("orientationchange", measureHeight)
  window.visualViewport?.removeEventListener("resize", measureHeight)
  chatRef.value?.removeEventListener("scroll", onChatScroll)
})

// 访客自带 key：只存在本机 localStorage，不经过任何服务端
// 注意：构建时 VitePress 会做 SSR，服务端没有 localStorage，必须判存在
const KEY_STORAGE = "zephyr_ai_key"
const needKey = authMode === "byok"

function readStoredKey() {
  if (typeof localStorage === "undefined") return ""
  return localStorage.getItem(KEY_STORAGE) || ""
}

function writeStoredKey(v: string) {
  if (typeof localStorage === "undefined") return
  if (v) localStorage.setItem(KEY_STORAGE, v)
  else localStorage.removeItem(KEY_STORAGE)
}

const apiKey = ref(readStoredKey())
const keyDraft = ref(apiKey.value)
const editingKey = ref(!apiKey.value)

function saveKey() {
  const v = keyDraft.value.trim()
  apiKey.value = v
  writeStoredKey(v)
  editingKey.value = !v
}

function clearKey() {
  apiKey.value = ""
  keyDraft.value = ""
  writeStoredKey("")
  editingKey.value = true
}

const maskedKey = computed(() => {
  const k = apiKey.value
  return k.length > 10 ? `${k.slice(0, 5)}****${k.slice(-4)}` : k
})

const messages = ref([
  {
    role: "ai",
    content: "你好，我是 Zephyr AI 助手，可以帮助你解答问题。"
  }
])

// 传给 API 的多轮历史。UI 里的欢迎语是装饰，不进上下文。
// 只保留最近若干条，避免长对话把 token 顶爆。
const MAX_HISTORY = 20
const history = ref<{ role: "user" | "assistant"; content: string }[]>([])

const disabled = computed(() => {
  return !input.value.trim() || loading.value || (needKey && !apiKey.value)
})

function scrollBottom(force = false) {
  if (!force && !stickToBottom) return
  nextTick(() => {
    const el = chatRef.value
    if (!el) return
    // 流式输出期间不要用 smooth，连续调用会互相打断、抖动
    el.scrollTop = el.scrollHeight
  })
}

async function send() {
  if (!input.value.trim() || loading.value) return
  if (needKey && !apiKey.value) {
    editingKey.value = true
    return
  }

  // 主动发消息时强制回到底部，并重新跟随
  stickToBottom = true
  scrollBottom(true)
  const question = input.value

  messages.value.push({
    role: "user",
    content: question
  })

  input.value = ""

  // 记录 AI 消息位置
  const aiIndex = messages.value.length

  messages.value.push({
    role: "ai",
    content: ""
  })

  // 进上下文：这一轮的提问
  history.value.push({ role: "user", content: question })

  loading.value = true

  chatAIStream(
    {
      messages: [...history.value],
      conversationId: conversationId.value
    },
    {
      onMessage(text) {
        messages.value[aiIndex].content += text
        scrollBottom()
      },
      onEnd() {
        loading.value = false

        // 这一轮答完了，把完整回答并进上下文
        const answer = messages.value[aiIndex].content
        if (!answer.trim()) return

        history.value.push({ role: "assistant", content: answer })

        if (history.value.length > MAX_HISTORY) {
          history.value.splice(0, history.value.length - MAX_HISTORY)
        }
        // 截断后保证第一条不是 assistant，符合对话时序
        if (history.value[0]?.role === "assistant") history.value.shift()
      },
      onError(err) {
        console.error("[ai-chat]", err)
        const detail = err instanceof Error ? err.message : String(err)
        messages.value[aiIndex].content = `AI 响应失败：${detail}`
        // 这轮没答上来，把刚压入的提问撤回，别让下一轮带上一个没人回答的问题
        if (history.value[history.value.length - 1]?.role === "user") history.value.pop()
        loading.value = false
      },
      apiKey: needKey ? apiKey.value : undefined
    }
  )
}

</script>

<template>
  <div class="chat-ai_container" ref="rootRef" :style="fillHeight ? { height: fillHeight + 'px' } : undefined">

    <!-- Chat -->
    <div class="chat-card">

      <div class="chat-header">
        <div class="dot"></div>
        AI 智能问答
      </div>

      <!-- 访客自带 key：只在没配服务端代理时出现 -->
      <div v-if="needKey" class="key-bar">
        <template v-if="editingKey">
          <input
            v-model="keyDraft"
            type="password"
            placeholder="粘贴你的 DeepSeek API Key（sk- 开头）"
            @keydown.enter="saveKey"
          />
          <button class="key-btn" @click="saveKey">保存</button>
          <a class="key-link" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">去申请</a>
        </template>
        <template v-else>
          <span class="key-ok">已使用本机 key：{{ maskedKey }}</span>
          <span class="key-tip">仅存在浏览器本地，不会上传</span>
          <button class="key-btn ghost" @click="clearKey">清除</button>
        </template>
      </div>

      <div class="chat-window" ref="chatRef">

        <div v-for="(msg, index) in messages" :key="index" :class="['msg', msg.role]">
          <div v-if="msg.role === 'ai'" class="md" v-html="renderMd(msg.content)"></div>
          <template v-else>{{ msg.content }}</template>
        </div>

        <!-- typing -->
        <div v-if="loading" class="msg ai typing">
          <span></span>
          <span></span>
          <span></span>
        </div>

      </div>

      <div class="chat-input">

        <input :disabled="loading" v-model="input" placeholder="输入你的问题..." @keydown.enter="send" />

        <button class="send-btn" @click="send" :disabled="disabled || loading">
          <span v-if="!loading">发送</span>
          <span v-else>思考中...</span>
        </button>

      </div>

    </div>

    <!-- capabilities -->
    <div class="caps">

      <div class="cap">
        <h3>实时 AI 对话</h3>
        <p>基于大语言模型实现自然语言理解与智能回复。</p>
      </div>

      <div class="cap">
        <h3>Dify Workflow</h3>
        <p>通过 API 调用 Workflow 实现 AI 能力编排。</p>
      </div>

      <div class="cap">
        <h3>企业级集成</h3>
        <p>前端 Vue + Java 后端服务完整 AI 解决方案。</p>
      </div>

    </div>

  </div>
</template>

<style lang="scss" scoped>
.chat-ai_container {
  width: 100%;
  height: 85vh;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 10%, rgba(111, 181, 255, 0.15), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(139, 107, 255, 0.15), transparent 40%);
  overflow: hidden;
}

/* chat card */

.chat-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(230, 235, 255, 0.9);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.06);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #eee;
  font-weight: 600;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6fb5ff, #8b6bff);
}

/* 访客自带的 key 提示条 */
.key-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid #eee;
  background: #fbfcff;
  font-size: 13px;

  input {
    flex: 1;
    min-width: 220px;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 8px;

    &:focus {
      outline: none;
      border-color: #6fb5ff;
      box-shadow: 0 0 0 3px rgba(111, 181, 255, .2);
    }
  }
}

.key-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #6fb5ff, #8b6bff);
  color: #fff;
  cursor: pointer;

  &.ghost {
    background: #eef2ff;
    color: #5f6575;
  }
}

.key-link {
  color: #6fb5ff;
  text-decoration: none;
}

.key-ok {
  color: #2f9e44;
}

.key-tip {
  font-size: 12px;
  color: #9aa3b2;
}

/* chat window */
.chat-window {
  flex: 1;
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg {
  max-width: 65%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.5;

  &.ai {
    background: #f5f7ff;
    border: 1px solid #e6ebff;
    align-self: flex-start;
  }

  &.user {
    align-self: flex-end;
    background: linear-gradient(135deg, #6fb5ff, #8b6bff);
    color: white;
    box-shadow:
      0 4px 12px rgba(111, 181, 255, 0.35);
  }
}

/* AI 回答的 Markdown 内容（v-html 渲染，需 :deep 穿透 scoped） */
.md {
  min-width: 0;
  word-break: break-word;

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(p) {
    margin: 0 0 8px;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-size: 15px;
    font-weight: 600;
    margin: 14px 0 6px;
  }

  :deep(ul),
  :deep(ol) {
    margin: 6px 0;
    padding-left: 22px;
  }

  :deep(li) {
    margin: 3px 0;
  }

  :deep(li > p) {
    margin: 0;
  }

  :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(139, 107, 255, 0.1);
    color: #5a4bd6;
  }

  :deep(pre) {
    margin: 10px 0;
    padding: 12px 14px;
    border-radius: 8px;
    background: #1e1f2b;
    overflow-x: auto;

    code {
      background: none;
      color: #e6e6f0;
      padding: 0;
      font-size: 13px;
      line-height: 1.6;
    }
  }

  :deep(a) {
    color: #4f8ef7;
    text-decoration: underline;
    word-break: break-all;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 2px 0 2px 12px;
    border-left: 3px solid #dfe3f0;
    color: #5f6575;
  }

  :deep(table) {
    display: block;
    width: 100%;
    margin: 10px 0;
    border-collapse: collapse;
    font-size: 13px;
    overflow-x: auto;
  }

  :deep(th),
  :deep(td) {
    padding: 6px 10px;
    border: 1px solid #e6ebff;
    text-align: left;
    white-space: nowrap;
  }

  :deep(th) {
    background: #f5f7ff;
    font-weight: 600;
  }

  :deep(hr) {
    margin: 12px 0;
    border: none;
    border-top: 1px solid #e6ebff;
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 6px;
  }
}

/* typing */
.typing {
  display: flex;
  gap: 6px;
  padding: 10px 14px;

  span {
    width: 6px;
    height: 6px;
    background: #8a94a6;
    border-radius: 50%;
    animation: blink 1.4s infinite;
  }

  span:nth-child(2) {
    animation-delay: .2s;
  }

  span:nth-child(3) {
    animation-delay: .4s;
  }
}

@keyframes blink {
  0% {
    opacity: .2
  }

  50% {
    opacity: 1
  }

  100% {
    opacity: .2
  }

}

/* input */

.chat-input {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-top: 1px solid #eee;

  input {
    flex: 1;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #ddd;
    transition: all .2s;

    &:focus {
      outline: none;
      border-color: #6fb5ff;
      box-shadow:
        0 0 0 3px rgba(111, 181, 255, 0.2);
    }
  }

}

.send-btn {
  width: 120px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #6fb5ff, #8b6bff);
  color: white;
  cursor: pointer;
  font-weight: 500;
  transition: all .2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 6px 16px rgba(111, 181, 255, 0.35);
}

.send-btn:disabled {
  background: #e4e7ef;
  color: #9aa3b2;
  cursor: not-allowed;
  box-shadow: none;
}

/* capability */
.caps {
  display: grid;
  /* 自适应列数：宽屏 3 列，平板 2 列，手机 1 列，不需要媒体查询也不会挤爆 */
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

/* 单卡片 */

.cap {
  position: relative;
  padding: 22px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(230, 235, 255, 0.9);
  backdrop-filter: blur(10px);
  transition: all .35s ease;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.04);
}

/* 顶部渐变光 */
.cap::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(120deg,
      rgba(111, 181, 255, 0.15),
      rgba(139, 107, 255, 0.15));
  opacity: 0;
  transition: opacity .35s;
}

/* hover效果 */
.cap:hover {
  transform: translateY(-6px);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.08);
}

.cap:hover::before {
  opacity: 1;
}

/* 标题 */
.cap h3 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 8px;
  background: linear-gradient(90deg,
      #6fb5ff,
      #8b6bff);
  -webkit-background-clip: text;
  color: transparent;

}

/* 描述 */
.cap p {
  font-size: 13px;
  line-height: 1.6;
  color: #5f6575;
}

/* subtle装饰线 */
.cap::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg,
      transparent,
      #6fb5ff,
      #8b6bff,
      transparent);
  opacity: .6;
}
/* ============ 响应式 ============ */

@media (max-width: 1024px) {
  .chat-ai_container {
    padding: 16px;
    gap: 18px;
  }

  .msg {
    max-width: 78%;
  }
}

/* 手机：竖屏主流宽度 320 ~ 430px */
@media (max-width: 640px) {
  .chat-ai_container {
    /* JS 会写入精确高度；这行是 JS 未生效时的兜底（Nav 48 + LocalNav 48） */
    height: calc(100dvh - 96px);
    min-height: 320px;
    padding: 0;
    gap: 0;
    overflow: hidden;
  }

  /* 卡片撑满一屏 → 输入框天然贴底，内容再多也不会把它挤出屏幕 */
  .chat-card {
    height: 100%;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  /* 手机上专注聊天，能力卡片不再占位（整页已不可滚动） */
  .caps {
    display: none;
  }

  .chat-header {
    padding: 10px 14px;
    font-size: 13px;
  }

  .chat-window {
    padding: 12px;
    gap: 10px;
    -webkit-overflow-scrolling: touch;
  }

  .msg {
    max-width: 88%;
    padding: 9px 12px;
    font-size: 14px;
  }

  .chat-input {
    gap: 8px;
    padding: 10px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));

    input {
      /* 关键：flex 子项默认 min-width:auto，会把容器撑破 */
      min-width: 0;
      /* iOS 上小于 16px 会触发输入框自动缩放 */
      font-size: 16px;
      padding: 9px 12px;
    }
  }

  .send-btn {
    flex: 0 0 auto;
    width: auto;
    min-width: 68px;
    padding: 0 14px;
    font-size: 14px;
  }

  .caps {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .cap {
    padding: 16px;
  }

  .cap h3 {
    font-size: 15px;
    margin-bottom: 6px;
  }

  .cap p {
    font-size: 13px;
  }

  .key-bar {
    padding: 8px 14px;

    input {
      min-width: 0;
      font-size: 16px;
    }
  }
}

/* 超窄屏：iPhone SE / 小屏安卓 */
@media (max-width: 380px) {
  .msg {
    max-width: 92%;
  }

  .send-btn {
    min-width: 60px;
    padding: 0 10px;
    font-size: 13px;
  }
}

/* 横屏手机：可视高度很矮，只留聊天区 */
/* 横屏手机：宽 844 会被当成桌面，但高度只有 390 左右，必须收紧 */
@media (max-height: 520px) and (orientation: landscape) {
  .chat-ai_container {
    height: 100dvh;
    padding: 8px;
    gap: 8px;
    overflow: hidden;
  }

  .chat-card {
    height: 100%;
  }

  .caps {
    display: none;
  }
}
</style>