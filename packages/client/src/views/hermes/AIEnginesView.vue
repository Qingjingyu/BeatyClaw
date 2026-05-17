<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NSpin, NTag } from 'naive-ui'
import {
  fetchRuntimeDiagnostics,
  fetchRuntimeStatus,
  type RuntimeDiagnosticsResponse,
  type RuntimeStatusResponse,
} from '@/api/hermes/runtime'
import { getEngineDisplayLabel } from '@/utils/engine-display'

const runtimeStatus = ref<RuntimeStatusResponse | null>(null)
const runtimeDiagnostics = ref<RuntimeDiagnosticsResponse | null>(null)
const loading = ref(false)
const error = ref('')

const currentRuntime = computed(() => runtimeStatus.value?.runtime || null)
const runtimeName = computed(() => {
  const provider = currentRuntime.value?.provider || runtimeStatus.value?.provider
  if (!provider) return '未知'
  if (provider === 'none') return '未安装'
  if (provider === 'openai-direct') return 'OpenAI Direct'
  return getEngineDisplayLabel(provider)
})
const runtimeState = computed(() => {
  if (loading.value) return { label: '检查中', type: 'default' as const, detail: '正在读取当前 AI 能力端' }
  if (error.value) return { label: '读取失败', type: 'error' as const, detail: error.value }
  if (!currentRuntime.value) return { label: '未知', type: 'default' as const, detail: '尚未读取运行状态' }
  if (currentRuntime.value.provider === 'none') return { label: '未安装', type: 'default' as const, detail: currentRuntime.value.detail || '当前还没有安装 AI 引擎' }
  if (!currentRuntime.value.available) return { label: '未可用', type: 'warning' as const, detail: currentRuntime.value.detail || '当前运行时缺少必要配置' }
  return { label: '运行中', type: 'success' as const, detail: currentRuntime.value.detail || '当前运行时可用' }
})
const runtimeCapabilities = computed(() => currentRuntime.value?.capabilities || [])
const diagnosticState = computed(() => {
  const status = runtimeDiagnostics.value?.status
  if (loading.value) return { label: '检查中', type: 'default' as const, detail: '正在检查产品端和 AI 能力链路' }
  if (error.value) return { label: '读取失败', type: 'error' as const, detail: error.value }
  if (status === 'ok') return { label: '全部正常', type: 'success' as const, detail: '产品端和当前 AI 能力链路可用' }
  if (status === 'warning') return { label: '需要关注', type: 'warning' as const, detail: '主链路可用，但有配置或辅助服务需要检查' }
  if (status === 'error') return { label: '存在异常', type: 'error' as const, detail: '至少一个关键检查失败，需要先修复' }
  return { label: '未检查', type: 'default' as const, detail: '点击刷新读取运行自检' }
})

function diagnosticTagType(status: string) {
  if (status === 'ok') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'error') return 'error'
  return 'default'
}

const engines = [
  {
    key: 'coco',
    name: 'COCO',
    badge: '产品能力包',
    status: '可安装',
    description: '提供账号、支付、使用指南、案例和连接流程等产品能力。',
    role: 'COCO 产品层',
  },
  {
    key: 'hms',
    name: 'HMS',
    badge: 'AI 能力端',
    status: '可安装',
    description: '作为本地或服务器 AI Runtime，通过统一接口接入 BeatyClaw。',
    role: 'Hermes / HMS Runtime',
  },
  {
    key: 'openclaw',
    name: 'OpenClaw',
    badge: 'AI 能力端',
    status: '可安装',
    description: '通过 Runtime SDK adapter 接入，承接多 Agent 和执行能力。',
    role: 'OpenClaw Runtime',
  },
]

async function loadRuntimeStatus() {
  loading.value = true
  error.value = ''
  try {
    const [status, diagnostics] = await Promise.all([
      fetchRuntimeStatus(),
      fetchRuntimeDiagnostics(),
    ])
    runtimeStatus.value = status
    runtimeDiagnostics.value = diagnostics
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
        <p>统一管理 BeatyClaw 可安装、可接入的底层 AI 能力端。</p>
      </div>
      <NButton size="small" :loading="loading" @click="loadRuntimeStatus">刷新</NButton>
    </header>

    <main class="ai-engines-content">
      <section class="runtime-panel">
        <div class="runtime-main">
          <span class="section-label">当前 AI 引擎</span>
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

      <section class="diagnostics-panel">
        <div class="diagnostics-head">
          <div>
            <span class="section-label">运行自检</span>
            <h3>产品端与 AI 能力链路</h3>
            <p>{{ diagnosticState.detail }}</p>
          </div>
          <NTag :type="diagnosticState.type" size="small" round>{{ diagnosticState.label }}</NTag>
        </div>

        <div class="diagnostics-list">
          <article
            v-for="check in runtimeDiagnostics?.checks || []"
            :key="check.key"
            class="diagnostic-item"
          >
            <div>
              <strong>{{ check.label }}</strong>
              <p>{{ check.detail }}</p>
              <small v-if="check.action">{{ check.action }}</small>
            </div>
            <NTag :type="diagnosticTagType(check.status)" size="small" round>{{ check.status }}</NTag>
          </article>
          <article v-if="!runtimeDiagnostics?.checks?.length" class="diagnostic-item diagnostic-empty">
            <div>
              <strong>暂无自检结果</strong>
              <p>点击刷新后会检查 Runtime、hxa-connect、zylos-main、worker-bot、模型配置和数据目录。</p>
            </div>
          </article>
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

.diagnostics-panel {
  padding: 20px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;
}

.diagnostics-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h3 {
    margin: 0 0 6px;
    color: $text-primary;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: $text-secondary;
    font-size: 14px;
    line-height: 1.5;
  }
}

.diagnostics-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.diagnostic-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-secondary;

  strong {
    display: block;
    margin-bottom: 5px;
    color: $text-primary;
    font-size: 14px;
    font-weight: 650;
  }

  p {
    margin: 0;
    color: $text-secondary;
    font-size: 13px;
    line-height: 1.5;
  }

  small {
    display: block;
    margin-top: 6px;
    color: $text-muted;
    font-size: 12px;
    line-height: 1.45;
  }
}

.diagnostic-empty {
  grid-column: 1 / -1;
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
  .diagnostics-list,
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
  .diagnostics-panel,
  .engine-card {
    padding: 16px;
  }

  .diagnostics-head {
    flex-direction: column;
  }
}
</style>
