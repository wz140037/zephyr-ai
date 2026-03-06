<script lang="ts" setup>
import { ref, computed, nextTick } from "vue"
import { chatAIStream } from "./chat"

const input = ref("")
const loading = ref(false)
const conversationId = ref("")

const chatRef = ref<HTMLElement>()

const messages = ref([
  {
    role: "ai",
    content: "你好，我是 Zephyr AI 助手，可以帮助你解答问题。"
  }
])

const disabled = computed(() => {
  return !input.value.trim() || loading.value
})

function scrollBottom() {
  nextTick(() => {
    chatRef.value?.scrollTo({
      top: chatRef.value.scrollHeight,
      behavior: "smooth"
    })
  })
}

async function send() {
  if (!input.value.trim() || loading.value) return

  scrollBottom()
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

  loading.value = true

  chatAIStream(
    {
      message: question,
      conversationId: conversationId.value
    },
    {
      onMessage(text) {
        messages.value[aiIndex].content += text
        scrollBottom()
      },
      onEnd() {
        loading.value = false
      },
      onError() {
        messages.value[aiIndex].content = "AI 响应失败"
        loading.value = false
      }
    }
  )
}

</script>

<template>
  <div class="chat-ai_container">

    <!-- Chat -->
    <div class="chat-card">

      <div class="chat-header">
        <div class="dot"></div>
        AI 智能问答
      </div>

      <div class="chat-window" ref="chatRef">

        <div v-for="(msg, index) in messages" :key="index" :class="['msg', msg.role]">
          {{ msg.content }}
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
  grid-template-columns: repeat(3, 1fr);
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
</style>