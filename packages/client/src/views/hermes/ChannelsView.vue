<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NAlert, NButton, NInput, NModal, NSpin, NTag, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/hermes/settings'
import PlatformSettings from '@/components/hermes/settings/PlatformSettings.vue'
import { fetchHxaOverview, type HxaOverview } from '@/api/agentic/hxa'
import {
  fetchTelegramStatus,
  fetchWeixinQrCode,
  fetchWeixinStatus,
  pollWeixinQrStatus,
  saveCredentials,
  saveWeixinCredentials,
  type ConnectorStatus,
} from '@/api/hermes/config'

const settingsStore = useSettingsStore()
const { t } = useI18n()
const message = useMessage()
const hxaOverview = ref<HxaOverview | null>(null)
const hxaLoading = ref(false)
const hxaError = ref('')
const connectorLoading = ref(false)
const connectorSaving = ref<Record<string, boolean>>({})
const weixinStatus = ref<ConnectorStatus | null>(null)
const telegramStatus = ref<ConnectorStatus | null>(null)
const showWeixinModal = ref(false)
const wxQrUrl = ref('')
const wxQrId = ref('')
const wxQrStatus = ref<'idle' | 'loading' | 'waiting' | 'scaned' | 'confirmed' | 'error' | 'expired'>('idle')
const telegramToken = ref('')
const feishuAppId = ref('')
const feishuAppSecret = ref('')
const configPanel = ref<HTMLElement | null>(null)
const activeConfigKey = ref<'telegram' | 'feishu' | null>(null)
let wxPollTimer: ReturnType<typeof setTimeout> | null = null

const hxaStats = computed(() => hxaOverview.value?.stats || {})
const hxaOrgs = computed(() => hxaOverview.value?.orgs || [])
const telegramConfigured = computed(() => Boolean(settingsStore.platforms.telegram?.token))
const feishuConfigured = computed(() => Boolean(settingsStore.platforms.feishu?.extra?.app_id && settingsStore.platforms.feishu?.extra?.app_secret))
const connectedCount = computed(() => connectors.value.filter(connector => connector.configured).length)
const runningCount = computed(() => connectors.value.filter(connector => connector.running).length)
const weixinRuntime = computed(() => weixinStatus.value?.runtime)
const telegramRuntime = computed(() => telegramStatus.value?.runtime)
const weixinLastMessage = computed(() => weixinRuntime.value?.last_message_at || '')
const telegramLastMessage = computed(() => telegramRuntime.value?.last_message_at || '')
const latestConnectorActivity = computed(() => {
  const candidates = [
    { name: '微信', at: weixinLastMessage.value },
    { name: 'Telegram', at: telegramLastMessage.value },
  ].filter(item => item.at)
  return candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0]
})
const hasConnectorError = computed(() => Boolean(weixinRuntime.value?.last_error || telegramRuntime.value?.last_error || hxaError.value))
const overallState = computed(() => {
  if (!connectedCount.value) return { label: '未连接', tone: 'default' as const, caption: '还没有可用外部入口' }
  if (hxaOverview.value && !hxaOverview.value.online) return { label: '部分异常', tone: 'warning' as const, caption: 'hxa-connect 当前不可用' }
  if (hasConnectorError.value) return { label: '需要处理', tone: 'warning' as const, caption: '存在运行错误，查看下方细分卡片' }
  if (runningCount.value > 0) return { label: '整体正常', tone: 'success' as const, caption: '已连接渠道正在运行' }
  return { label: '部分异常', tone: 'warning' as const, caption: '已配置渠道未运行' }
})
const latestActivity = computed(() => {
  if (!latestConnectorActivity.value) return '暂无入站消息'
  return `${latestConnectorActivity.value.name} ${formatRelativeTime(latestConnectorActivity.value.at)}收到消息`
})
const issueSummary = computed(() => {
  const issues: string[] = []
  if (hxaError.value) issues.push('hxa-connect 状态读取异常')
  if (weixinStatus.value?.configured && !weixinRuntime.value?.running) issues.push('微信已配置，但 runtime 未运行')
  if (weixinRuntime.value?.last_error) issues.push(`微信最近错误：${weixinRuntime.value.last_error}`)
  if (telegramStatus.value?.configured && !telegramRuntime.value?.running) issues.push('Telegram 已配置，但 runtime 未运行')
  if (telegramRuntime.value?.last_error) issues.push(`Telegram 最近错误：${telegramRuntime.value.last_error}`)
  if (!telegramStatus.value?.configured) issues.push('Telegram 尚未配置')
  if (!feishuConfigured.value) issues.push('飞书尚未配置')
  return issues
})
const chainNodes = computed(() => [
  { label: '外部入口', state: (weixinRuntime.value?.running || telegramRuntime.value?.running) ? 'ok' : (connectedCount.value ? 'warn' : 'idle') },
  { label: 'Agentic', state: 'ok' },
  { label: 'hxa-connect', state: hxaOverview.value?.online ? 'ok' : 'warn' },
  { label: 'zylos-main', state: hxaOverview.value?.online ? 'ok' : 'warn' },
  { label: 'worker-bot', state: Number(hxaStats.value.online_bot_count || 0) > 0 ? 'ok' : 'warn' },
  { label: 'GPT-5.5', state: 'ok' },
])
const connectors = computed(() => [
  {
    key: 'weixin',
    name: '微信',
    source: 'Agentic 微信 iLink runtime',
    priority: '第一期',
    configured: Boolean(weixinStatus.value?.configured),
    running: Boolean(weixinRuntime.value?.running),
    state: weixinStatus.value?.configured ? (weixinRuntime.value?.running ? '已连接，runtime 运行中' : '已配置，runtime 未运行') : '未连接',
    meta: weixinStatus.value?.account_id ? `Account: ${weixinStatus.value.account_id}` : '扫码后自动保存账号',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    source: 'zylos-telegram 参考实现',
    priority: '第二候选',
    configured: Boolean(telegramStatus.value?.configured || telegramConfigured.value),
    running: Boolean(telegramRuntime.value?.running),
    state: telegramStatus.value?.configured ? (telegramRuntime.value?.running ? '已连接，runtime 运行中' : '已配置，runtime 未运行') : '待配置',
    meta: telegramRuntime.value?.bot_username ? `Bot: @${telegramRuntime.value.bot_username}` : '需要 Telegram Bot Token',
  },
  {
    key: 'feishu',
    name: '飞书',
    source: 'zylos-feishu 参考实现',
    priority: '第三候选',
    configured: feishuConfigured.value,
    running: false,
    state: feishuConfigured.value ? '已保存应用凭证' : '待配置',
    meta: '需要 App ID 和 App Secret',
  },
])

function formatRelativeTime(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

async function loadHxaOverview() {
  hxaLoading.value = true
  hxaError.value = ''
  try {
    hxaOverview.value = await fetchHxaOverview()
    if (hxaOverview.value.error) hxaError.value = hxaOverview.value.error
  } catch (err) {
    hxaError.value = err instanceof Error ? err.message : String(err)
  } finally {
    hxaLoading.value = false
  }
}

async function refreshConnectors() {
  connectorLoading.value = true
  try {
    const [wx, tg] = await Promise.all([
      fetchWeixinStatus(),
      fetchTelegramStatus(),
      settingsStore.fetchSettings(),
    ])
    weixinStatus.value = wx
    telegramStatus.value = tg
    telegramToken.value = settingsStore.platforms.telegram?.token || ''
    feishuAppId.value = settingsStore.platforms.feishu?.extra?.app_id || ''
    feishuAppSecret.value = settingsStore.platforms.feishu?.extra?.app_secret || ''
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    connectorLoading.value = false
  }
}

function openConnector(key: string) {
  if (key === 'weixin') {
    showWeixinModal.value = true
    return
  }
  if (key === 'telegram' || key === 'feishu') {
    activeConfigKey.value = key
    requestAnimationFrame(() => {
      configPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

async function startWeixinQrLogin() {
  wxQrStatus.value = 'loading'
  wxQrUrl.value = ''
  wxQrId.value = ''
  stopWeixinPoll()

  try {
    const data = await fetchWeixinQrCode()
    wxQrId.value = data.qrcode
    wxQrUrl.value = data.qrcode_url
    window.open(data.qrcode_url, '_blank')
    wxQrStatus.value = 'waiting'
    pollWeixinStatus()
  } catch (err) {
    wxQrStatus.value = 'error'
    message.error(err instanceof Error ? err.message : '微信二维码获取失败')
  }
}

function pollWeixinStatus() {
  if (!wxQrId.value) return
  wxPollTimer = setTimeout(async () => {
    try {
      const data = await pollWeixinQrStatus(wxQrId.value)
      if (data.status === 'wait' || data.status === 'scaned_but_redirect') {
        pollWeixinStatus()
      } else if (data.status === 'scaned') {
        wxQrStatus.value = 'scaned'
        pollWeixinStatus()
      } else if (data.status === 'expired') {
        wxQrStatus.value = 'expired'
      } else if (data.status === 'confirmed') {
        wxQrStatus.value = 'confirmed'
        await saveWeixinCredentials({
          account_id: data.account_id!,
          token: data.token!,
          base_url: data.base_url,
        })
        message.success('微信配置已保存')
        await refreshConnectors()
      }
    } catch {
      pollWeixinStatus()
    }
  }, 3000)
}

function stopWeixinPoll() {
  if (wxPollTimer) {
    clearTimeout(wxPollTimer)
    wxPollTimer = null
  }
}

async function saveTelegramToken() {
  connectorSaving.value.telegram = true
  try {
    await saveCredentials('telegram', { token: telegramToken.value })
    await refreshConnectors()
    message.success('Telegram Token 已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    connectorSaving.value.telegram = false
  }
}

async function saveFeishuCredentials() {
  connectorSaving.value.feishu = true
  try {
    await saveCredentials('feishu', { extra: { app_id: feishuAppId.value, app_secret: feishuAppSecret.value } })
    await refreshConnectors()
    message.success('飞书应用凭证已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    connectorSaving.value.feishu = false
  }
}

onMounted(() => {
  refreshConnectors()
  loadHxaOverview()
})

onUnmounted(() => {
  stopWeixinPoll()
})
</script>

<template>
  <div class="channels-view">
    <header class="page-header">
      <h2 class="header-title">{{ t('sidebar.channels') }}</h2>
      <NButton size="small" quaternary :loading="hxaLoading" @click="loadHxaOverview">
        刷新
      </NButton>
    </header>

    <div class="channels-content">
      <section class="overview-panel">
        <div class="overview-heading">
          <div>
            <h3>外部连接器概览</h3>
            <p>这里看整体是否能用；下方卡片负责单个渠道配置和排查。</p>
          </div>
          <NTag :type="overallState.tone" round>
            {{ overallState.label }}
          </NTag>
        </div>

        <div class="overview-metrics">
          <div class="overview-metric">
            <span>整体状态</span>
            <strong>{{ overallState.label }}</strong>
            <small>{{ overallState.caption }}</small>
          </div>
          <div class="overview-metric">
            <span>已连接渠道</span>
            <strong>{{ connectedCount }} / {{ connectors.length }}</strong>
            <small>微信、Telegram、飞书</small>
          </div>
          <div class="overview-metric">
            <span>运行中渠道</span>
            <strong>{{ runningCount }}</strong>
            <small>真实 runtime 正在工作</small>
          </div>
          <div class="overview-metric">
            <span>最近活动</span>
            <strong>{{ latestActivity }}</strong>
            <small>来自外部渠道的最近消息</small>
          </div>
        </div>

        <div class="chain-row" aria-label="外部消息处理链路">
          <template v-for="(node, index) in chainNodes" :key="node.label">
            <div class="chain-node" :class="`chain-node--${node.state}`">
              <span class="chain-dot" />
              <span>{{ node.label }}</span>
            </div>
            <span v-if="index < chainNodes.length - 1" class="chain-arrow">→</span>
          </template>
        </div>

        <div class="issue-strip" :class="{ 'issue-strip--ok': !hasConnectorError && connectedCount > 0 }">
          <template v-if="hasConnectorError">
            <strong>需要处理</strong>
            <span>{{ issueSummary[0] }}</span>
          </template>
          <template v-else-if="connectedCount > 0">
            <strong>所有已连接渠道运行正常</strong>
            <span>微信闭环已通过真实消息验证。</span>
          </template>
          <template v-else>
            <strong>等待连接</strong>
            <span>先连接微信，完成第一条外部消息闭环。</span>
          </template>
        </div>
      </section>

      <section class="connectors-panel">
        <div class="section-heading">
          <div>
            <h3>外部连接器</h3>
            <p>微信已跑通完整闭环；Telegram runtime 已接入，保存 Bot Token 后启动；飞书保留配置入口。</p>
          </div>
          <NButton size="small" :loading="connectorLoading" @click="refreshConnectors">刷新状态</NButton>
        </div>

        <NSpin :show="connectorLoading">
          <div class="connector-grid">
            <div v-for="connector in connectors" :key="connector.key" class="connector-card">
              <div class="connector-main">
                <div class="connector-icon">{{ connector.name.slice(0, 1) }}</div>
                <div class="connector-info">
                  <div class="connector-title-row">
                    <span class="connector-name">{{ connector.name }}</span>
                    <NTag size="small" round>{{ connector.priority }}</NTag>
                  </div>
                  <div class="connector-source">{{ connector.source }}</div>
                  <div class="connector-meta">{{ connector.meta }}</div>
                </div>
              </div>
              <div class="connector-actions">
                <NTag :type="connector.configured ? 'success' : 'default'" size="small" round>
                  {{ connector.state }}
                </NTag>
                <NButton size="small" type="primary" round @click="openConnector(connector.key)">
                  {{ connector.configured ? '管理' : '连接' }}
                </NButton>
              </div>
            </div>
          </div>
        </NSpin>

        <div v-if="activeConfigKey" ref="configPanel" class="inline-config">
          <div v-if="activeConfigKey === 'telegram'" class="config-card">
            <div class="config-title">Telegram Bot Token</div>
            <div class="config-row">
              <NInput v-model:value="telegramToken" type="password" show-password-on="click" placeholder="123456:ABC-DEF..." />
              <NButton :loading="connectorSaving.telegram" @click="saveTelegramToken">保存</NButton>
            </div>
          </div>
          <div v-if="activeConfigKey === 'feishu'" class="config-card">
            <div class="config-title">飞书应用凭证</div>
            <div class="config-row two-fields">
              <NInput v-model:value="feishuAppId" placeholder="cli_..." />
              <NInput v-model:value="feishuAppSecret" type="password" show-password-on="click" placeholder="App Secret" />
              <NButton :loading="connectorSaving.feishu" @click="saveFeishuCredentials">保存</NButton>
            </div>
          </div>
        </div>
      </section>

      <section class="hxa-panel">
        <div class="section-heading">
          <div>
            <h3>hxa-connect</h3>
            <p>外部渠道和多 Agent 协作服务</p>
          </div>
          <NTag :type="hxaOverview?.online ? 'success' : 'error'" round>
            {{ hxaOverview?.online ? '在线' : '离线' }}
          </NTag>
        </div>

        <NAlert v-if="hxaError" type="warning" :bordered="false" class="hxa-alert">
          {{ hxaError }}
        </NAlert>

        <NSpin :show="hxaLoading">
          <div class="hxa-grid">
            <div class="metric-card">
              <span class="metric-label">组织</span>
              <strong>{{ hxaStats.org_count ?? '-' }}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">Bots</span>
              <strong>{{ hxaStats.bot_count ?? '-' }}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">在线 Bots</span>
              <strong>{{ hxaStats.online_bot_count ?? '-' }}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">Threads</span>
              <strong>{{ hxaStats.thread_count ?? '-' }}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">消息</span>
              <strong>{{ hxaStats.message_count ?? '-' }}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">活跃 Threads</span>
              <strong>{{ hxaStats.active_thread_count ?? '-' }}</strong>
            </div>
          </div>

          <div class="hxa-meta">
            <span>{{ hxaOverview?.version?.server || 'hxa-connect' }}</span>
            <span>版本 {{ hxaOverview?.version?.version || '-' }}</span>
            <span>{{ hxaOverview?.baseUrl || '-' }}</span>
          </div>

          <div class="org-list">
            <div class="org-list-header">
              <span>组织概览</span>
              <span>{{ hxaOrgs.length }} 个</span>
            </div>
            <div v-if="hxaOrgs.length" class="org-items">
              <div v-for="org in hxaOrgs" :key="org.id" class="org-item">
                <div>
                  <strong>{{ org.name }}</strong>
                  <span>{{ org.id }}</span>
                </div>
                <NTag size="small" :type="org.status === 'active' ? 'success' : 'default'">
                  {{ org.status || 'unknown' }}
                </NTag>
              </div>
            </div>
            <div v-else class="empty-state">
              暂无组织数据，或 hxa admin secret 未配置。
            </div>
          </div>
        </NSpin>
      </section>

      <NSpin :show="settingsStore.loading || settingsStore.saving" size="large" :description="t('common.loading')">
        <PlatformSettings v-if="!settingsStore.loading" />
      </NSpin>
    </div>

    <NModal
      v-model:show="showWeixinModal"
      preset="card"
      title="连接微信"
      :style="{ width: '420px', maxWidth: 'calc(100vw - 32px)' }"
      @after-leave="stopWeixinPoll"
    >
      <div class="weixin-modal">
        <div v-if="weixinStatus?.configured" class="connected-panel">
          <NTag type="success" round>已配置</NTag>
          <span>{{ weixinStatus.account_id }}</span>
        </div>

        <div v-if="wxQrUrl" class="qr-link-box">
          <div>
            <strong>微信扫码页已生成</strong>
            <span>如果浏览器没有自动打开新窗口，请点击下方按钮打开。</span>
          </div>
          <NButton tag="a" :href="wxQrUrl" target="_blank" type="primary" secondary block>
            打开微信扫码页
          </NButton>
        </div>

        <div class="qr-status">
          <span v-if="wxQrStatus === 'idle'">点击下方按钮获取二维码。</span>
          <span v-if="wxQrStatus === 'loading'">正在获取二维码...</span>
          <span v-if="wxQrStatus === 'waiting'">请在打开的微信扫码页完成扫码确认。</span>
          <span v-if="wxQrStatus === 'scaned'">已扫码，请在微信里确认。</span>
          <span v-if="wxQrStatus === 'confirmed'">微信配置已保存，runtime 会自动使用新凭证。</span>
          <span v-if="wxQrStatus === 'expired'">二维码已过期，请重新获取。</span>
          <span v-if="wxQrStatus === 'error'">二维码获取失败，请稍后重试。</span>
        </div>

        <NButton type="primary" block :loading="wxQrStatus === 'loading'" @click="startWeixinQrLogin">
          {{ wxQrStatus === 'confirmed' || wxQrStatus === 'expired' ? '重新扫码' : '获取二维码' }}
        </NButton>
      </div>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.channels-view {
  height: calc(100 * var(--vh));
  display: flex;
  flex-direction: column;
}

.channels-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  position: relative;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.page-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 20px;
  border-bottom: 1px solid $border-color;
}

.header-title {
  margin: 0;
  color: $text-primary;
  font-size: 16px;
  font-weight: 600;
}

.overview-panel,
.connectors-panel,
.hxa-panel {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto 16px;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  background: $bg-primary;
  padding: 18px;
}

.overview-panel {
  display: grid;
  gap: 16px;
}

.overview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 15px;
    font-weight: 650;
  }

  p {
    margin: 4px 0 0;
    color: $text-secondary;
    font-size: 13px;
  }
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.overview-metric {
  min-height: 96px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 14px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-secondary;

  span,
  small {
    color: $text-secondary;
    font-size: 12px;
    line-height: 1.4;
  }

  strong {
    color: $text-primary;
    font-size: 20px;
    font-weight: 650;
    line-height: 1.15;
  }
}

.chain-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-secondary;
}

.chain-node {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 26px;
  color: $text-secondary;
  font-size: 12px;
  white-space: nowrap;
}

.chain-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $text-muted;
}

.chain-node--ok {
  color: $text-primary;

  .chain-dot {
    background: #18a058;
  }
}

.chain-node--warn .chain-dot {
  background: #f0a020;
}

.chain-node--idle .chain-dot {
  background: $text-muted;
}

.chain-arrow {
  color: $text-muted;
  font-size: 12px;
}

.issue-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(240, 160, 32, 0.35);
  border-radius: $radius-sm;
  background: rgba(240, 160, 32, 0.08);
  color: $text-secondary;
  font-size: 13px;

  strong {
    color: $text-primary;
    font-weight: 650;
  }
}

.issue-strip--ok {
  border-color: rgba(24, 160, 88, 0.24);
  background: rgba(24, 160, 88, 0.07);
}

.connector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.connector-card,
.config-card {
  padding: 16px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-secondary;
}

.connector-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.connector-main {
  display: flex;
  gap: 12px;
}

.connector-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  background: $bg-primary;
  color: $text-primary;
  font-size: 14px;
  font-weight: 700;
}

.connector-info {
  min-width: 0;
}

.connector-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.connector-name {
  color: $text-primary;
  font-size: 14px;
  font-weight: 650;
}

.connector-source,
.connector-meta {
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.5;
}

.connector-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.inline-config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.config-title {
  margin-bottom: 10px;
  color: $text-primary;
  font-size: 13px;
  font-weight: 650;
}

.config-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;

  &.two-fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 15px;
    font-weight: 600;
  }

  p {
    margin: 4px 0 0;
    color: $text-secondary;
    font-size: 13px;
  }
}

.hxa-alert {
  margin-bottom: 14px;
}

.hxa-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.metric-card {
  min-height: 82px;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  background: $bg-secondary;
  padding: 13px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  strong {
    color: $text-primary;
    font-size: 22px;
    font-weight: 650;
    line-height: 1;
  }
}

.metric-label {
  color: $text-secondary;
  font-size: 12px;
}

.hxa-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin: 14px 0;
  color: $text-secondary;
  font-size: 12px;
}

.org-list {
  border-top: 1px solid $border-light;
  padding-top: 14px;
}

.org-list-header,
.org-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.org-list-header {
  color: $text-secondary;
  font-size: 12px;
  margin-bottom: 8px;
}

.org-items {
  display: grid;
  gap: 8px;
}

.org-item {
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  padding: 10px 12px;

  strong,
  span {
    display: block;
  }

  strong {
    color: $text-primary;
    font-size: 13px;
    font-weight: 600;
  }

  span {
    margin-top: 3px;
    color: $text-muted;
    font-size: 12px;
    word-break: break-all;
  }
}

.empty-state {
  padding: 18px 0 4px;
  color: $text-muted;
  font-size: 13px;
  text-align: center;
}

.weixin-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.connected-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: $text-muted;
  font-size: 12px;
}

.qr-link-box {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background-color: $bg-secondary;

  strong,
  span {
    display: block;
  }

  strong {
    color: $text-primary;
    font-size: 14px;
    font-weight: 650;
  }

  span {
    margin-top: 4px;
    color: $text-secondary;
    font-size: 12px;
    line-height: 1.5;
  }
}

.qr-status {
  min-height: 20px;
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hxa-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: $breakpoint-mobile) {
  .page-header,
  .overview-heading,
  .issue-strip,
  .section-heading,
  .connector-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-metrics,
  .hxa-grid {
    grid-template-columns: 1fr;
  }

  .config-row,
  .config-row.two-fields {
    grid-template-columns: 1fr;
  }
}
</style>
