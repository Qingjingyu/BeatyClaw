<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NSpin, NTag } from 'naive-ui'
import { fetchRuntimeStatus, type RuntimeStatusResponse } from '@/api/hermes/runtime'

const runtimeStatus = ref<RuntimeStatusResponse | null>(null)
const loading = ref(false)
const error = ref('')

const currentRuntime = computed(() => runtimeStatus.value?.runtime || null)
const runtimeName = computed(() => {
  const provider = currentRuntime.value?.provider || runtimeStatus.value?.provider
  if (!provider) return '未知'
  if (provider === 'zylos') return 'Zylos'
  if (provider === 'openai-direct') return 'OpenAI Direct'
  if (provider === 'openclaw') return 'OpenClaw'
  if (provider === 'hms') return 'HMS'
  return provider
})
const runtimeState = computed(() => {
  if (loading.value) return { label: '检查中', type: 'default' as const, detail: '正在读取当前 AI 能力端' }
  if (error.value) return { label: '读取失败', type: 'error' as const, detail: error.value }
  if (!currentRuntime.value) return { label: '未知', type: 'default' as const, detail: '尚未读取运行状态' }
  if (!currentRuntime.value.available) return { label: '未可用', type: 'warning' as const, detail: currentRuntime.value.detail || '当前运行时缺少必要配置' }
  return { label: '运行中', type: 'success' as const, detail: currentRuntime.value.detail || '当前运行时可用' }
})
const runtimeCapabilities = computed(() => currentRuntime.value?.capabilities || [])

const engines = [
  {
    key: 'coco',
    name: 'COCO',
    badge: '产品层参考',
    status: '待接入',
    description: '账号、支付、使用指南、案例和连接流程的产品参考源。',
    role: 'SaaS 产品能力',
  },
  {
    key: 'hms',
    name: 'HMS',
    badge: 'AI 能力端',
    status: '待接入',
    description: '计划作为可替换的 AI Runtime，通过统一接口接入 BeatyClaw。',
    role: 'Hermes / HMS Runtime',
  },
  {
    key: 'openclaw',
    name: 'OpenClaw',
    badge: 'AI 能力端',
    status: '待接入',
    description: '计划通过 Runtime SDK adapter 接入，承接多 Agent 和执行能力。',
    role: 'OpenClaw Runtime',
  },
]

async function loadRuntimeStatus() {
  loading.value = true
  error.value = ''
  try {
    runtimeStatus.value = await fetchRuntimeStatus()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadRuntimeStatus)
</script>

<template>
  <div class="ai-engines-view">
    <header class="page-header">
      <div>
        <h2>AI 引擎</h2>
        <p>统一管理 BeatyClaw 可对接的底层 AI 能力端。</p>
      </div>
      <NButton size="small" :loading="loading" @click="loadRuntimeStatus">刷新</NButton>
    </header>

    <main class="ai-engines-content">
      <section class="runtime-panel">
        <div class="runtime-main">
          <span class="section-label">当前生产运行时</span>
          <div class="runtime-title">
            <h3>{{ runtimeName }}</h3>
            <NTag :type="runtimeState.type" size="small" round>{{ runtimeState.label }}</NTag>
          </div>
          <p>{{ runtimeState.detail }}</p>
        </div>

        <div class="runtime-meta">
          <div>
            <span>接入方式</span>
            <strong>Runtime SDK</strong>
          </div>
          <div>
            <span>Provider</span>
            <strong>{{ currentRuntime?.provider || runtimeStatus?.provider || '未知' }}</strong>
          </div>
          <div>
            <span>能力</span>
            <strong>{{ runtimeCapabilities.length ? runtimeCapabilities.join('、') : '暂无' }}</strong>
          </div>
        </div>
      </section>

      <NSpin :show="loading">
        <section class="engine-grid">
          <article v-for="engine in engines" :key="engine.key" class="engine-card">
            <div class="engine-card-header">
              <div>
                <span class="engine-badge">{{ engine.badge }}</span>
                <h3>{{ engine.name }}</h3>
              </div>
              <NTag size="small" type="warning" round>{{ engine.status }}</NTag>
            </div>
            <p>{{ engine.description }}</p>
            <div class="engine-foot">
              <span>定位</span>
              <strong>{{ engine.role }}</strong>
            </div>
          </article>
        </section>
      </NSpin>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.ai-engines-view {
  height: 100%;
  overflow-y: auto;
  padding: 28px;
  background: $bg-primary;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;

  h2 {
    margin: 0 0 6px;
    color: $text-primary;
    font-size: 24px;
    font-weight: 650;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: $text-secondary;
    font-size: 14px;
  }
}

.ai-engines-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.runtime-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 20px;
  padding: 20px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;
}

.section-label,
.engine-badge {
  display: inline-flex;
  margin-bottom: 10px;
  color: $text-muted;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
}

.runtime-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0;
  }
}

.runtime-main p,
.engine-card p {
  margin: 0;
  color: $text-secondary;
  font-size: 14px;
  line-height: 1.6;
}

.runtime-meta {
  display: grid;
  gap: 10px;

  div {
    min-width: 0;
    padding: 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: rgba(var(--accent-primary-rgb), 0.04);
  }

  span {
    display: block;
    margin-bottom: 5px;
    color: $text-muted;
    font-size: 12px;
  }

  strong {
    display: block;
    overflow: hidden;
    color: $text-primary;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.engine-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.engine-card {
  min-height: 190px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;
}

.engine-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0;
  }
}

.engine-foot {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid $border-color;

  span {
    display: block;
    margin-bottom: 5px;
    color: $text-muted;
    font-size: 12px;
  }

  strong {
    color: $text-primary;
    font-size: 14px;
    font-weight: 600;
  }
}

@media (max-width: 1080px) {
  .runtime-panel,
  .engine-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: $breakpoint-mobile) {
  .ai-engines-view {
    padding: 20px 16px;
  }

  .page-header {
    flex-direction: column;
  }

  .runtime-panel,
  .engine-card {
    padding: 16px;
  }
}
</style>
