<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NSpin, NButton, NTag, NModal, NInput, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useGatewayStore } from '@/stores/hermes/gateways'
import { useSettingsStore } from '@/stores/hermes/settings'
import {
  fetchWeixinStatus,
  fetchWeixinQrCode,
  pollWeixinQrStatus,
  saveWeixinCredentials,
  saveCredentials,
  type ConnectorStatus,
} from '@/api/hermes/config'

const { t } = useI18n()
const message = useMessage()
const gatewayStore = useGatewayStore()
const settingsStore = useSettingsStore()

const weixinStatus = ref<ConnectorStatus | null>(null)
const statusLoading = ref(false)
const showWeixinModal = ref(false)
const wxQrUrl = ref('')
const wxQrId = ref('')
const wxQrStatus = ref<'idle' | 'loading' | 'waiting' | 'scaned' | 'confirmed' | 'error' | 'expired'>('idle')
const telegramToken = ref('')
const feishuAppId = ref('')
const feishuAppSecret = ref('')
const connectorSaving = ref<Record<string, boolean>>({})
let wxPollTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  gatewayStore.fetchStatus()
  refreshConnectorStatus()
})

onUnmounted(() => {
  stopWeixinPoll()
})

const telegramConfigured = computed(() => Boolean(settingsStore.platforms.telegram?.token))
const feishuConfigured = computed(() => Boolean(settingsStore.platforms.feishu?.extra?.app_id && settingsStore.platforms.feishu?.extra?.app_secret))

const connectors = computed(() => [
  {
    key: 'weixin',
    name: '微信',
    source: 'Agentic 现有微信 iLink 接口 + Hermes gateway',
    priority: '第一期',
    configured: Boolean(weixinStatus.value?.configured),
    state: weixinStatus.value?.configured ? (weixinStatus.value.gateway_running ? '已配置，gateway 运行中' : '已配置，gateway 未运行') : '未连接',
    meta: weixinStatus.value?.account_id ? `Account: ${weixinStatus.value.account_id}` : '扫码后自动保存账号',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    source: 'COCO Telegram 参考实现，当前保存 Bot Token',
    priority: '第二候选',
    configured: telegramConfigured.value,
    state: telegramConfigured.value ? '已保存 Token' : '待配置',
    meta: '需要 Telegram Bot Token',
  },
  {
    key: 'feishu',
    name: '飞书',
    source: 'COCO 飞书参考实现，当前保存应用凭证',
    priority: '第三候选',
    configured: feishuConfigured.value,
    state: feishuConfigured.value ? '已保存应用凭证' : '待配置',
    meta: '需要 App ID 和 App Secret',
  },
])

async function refreshConnectorStatus() {
  statusLoading.value = true
  try {
    const [wx] = await Promise.all([
      fetchWeixinStatus(),
      settingsStore.fetchSettings(),
    ])
    weixinStatus.value = wx
    telegramToken.value = settingsStore.platforms.telegram?.token || ''
    feishuAppId.value = settingsStore.platforms.feishu?.extra?.app_id || ''
    feishuAppSecret.value = settingsStore.platforms.feishu?.extra?.app_secret || ''
  } catch (err: any) {
    message.error(err.message)
  } finally {
    statusLoading.value = false
  }
}

async function handleToggle(name: string, running: boolean) {
  try {
    if (running) {
      await gatewayStore.stop(name)
      message.success(`${t('gateways.stopped')}: ${name}`)
    } else {
      await gatewayStore.start(name)
      message.success(`${t('gateways.started')}: ${name}`)
    }
  } catch (err: any) {
    message.error(err.message)
  }
}

function openConnector(key: string) {
  if (key === 'weixin') {
    showWeixinModal.value = true
    return
  }
  const target = key === 'telegram' ? 'Telegram' : '飞书'
  message.info(`${target} 当前先支持保存配置；真实消息接入会在微信闭环后继续接。`)
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
    wxQrStatus.value = 'waiting'
    pollWeixinStatus()
  } catch (err: any) {
    wxQrStatus.value = 'error'
    message.error(err.message || '微信二维码获取失败')
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
        await refreshConnectorStatus()
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
    await refreshConnectorStatus()
    message.success('Telegram Token 已保存')
  } catch (err: any) {
    message.error(err.message)
  } finally {
    connectorSaving.value.telegram = false
  }
}

async function saveFeishuCredentials() {
  connectorSaving.value.feishu = true
  try {
    await saveCredentials('feishu', { extra: { app_id: feishuAppId.value, app_secret: feishuAppSecret.value } })
    await refreshConnectorStatus()
    message.success('飞书应用凭证已保存')
  } catch (err: any) {
    message.error(err.message)
  } finally {
    connectorSaving.value.feishu = false
  }
}
</script>

<template>
  <div class="gateways-view">
    <header class="page-header">
      <h2 class="header-title">链接 / 频道</h2>
    </header>

    <div class="gateways-content">
      <section class="connector-section">
        <div class="section-header">
          <div>
            <h3>外部连接器</h3>
            <p>微信先做完整闭环；Telegram 和飞书先保留配置入口，后续接真实消息运行时。</p>
          </div>
          <NButton size="small" @click="refreshConnectorStatus">刷新状态</NButton>
        </div>

        <NSpin :show="statusLoading" size="small">
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

        <div class="inline-config">
          <div class="config-card">
            <div class="config-title">Telegram Bot Token</div>
            <div class="config-row">
              <NInput v-model:value="telegramToken" type="password" show-password-on="click" placeholder="123456:ABC-DEF..." />
              <NButton :loading="connectorSaving.telegram" @click="saveTelegramToken">保存</NButton>
            </div>
          </div>
          <div class="config-card">
            <div class="config-title">飞书应用凭证</div>
            <div class="config-row two-fields">
              <NInput v-model:value="feishuAppId" placeholder="cli_..." />
              <NInput v-model:value="feishuAppSecret" type="password" show-password-on="click" placeholder="App Secret" />
              <NButton :loading="connectorSaving.feishu" @click="saveFeishuCredentials">保存</NButton>
            </div>
          </div>
        </div>
      </section>

      <section class="gateway-section">
        <div class="section-header">
          <div>
            <h3>{{ t('gateways.title') }}</h3>
            <p>运行承载层，负责 Hermes gateway profile 的启动、停止和健康检查。</p>
          </div>
        </div>

        <NSpin :show="gatewayStore.loading" size="large">
        <div v-if="gatewayStore.gateways.length === 0" class="empty-state">
          {{ t('common.noData') }}
        </div>

        <div v-else class="gateway-list">
          <div v-for="gw in gatewayStore.gateways" :key="gw.profile" class="gateway-card">
            <div class="gateway-info">
              <div class="gateway-name">{{ gw.profile }}</div>
              <div class="gateway-meta">
                <span class="meta-item">{{ gw.host }}:{{ gw.port }}</span>
                <span v-if="gw.pid" class="meta-item">PID: {{ gw.pid }}</span>
              </div>
            </div>
            <div class="gateway-actions">
              <NTag :type="gw.running ? 'success' : 'default'" size="small" round>
                {{ gw.running ? t('gateways.running') : t('gateways.stopped') }}
              </NTag>
              <NButton
                size="small"
                :type="gw.running ? 'warning' : 'primary'"
                round
                @click="handleToggle(gw.profile, gw.running)"
              >
                {{ gw.running ? t('common.stop') : t('common.start') }}
              </NButton>
            </div>
          </div>
        </div>
        </NSpin>
      </section>
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

        <div v-if="wxQrUrl" class="qr-box">
          <img :src="wxQrUrl" alt="微信登录二维码">
        </div>

        <div class="qr-status">
          <span v-if="wxQrStatus === 'idle'">点击下方按钮获取二维码。</span>
          <span v-if="wxQrStatus === 'loading'">正在获取二维码...</span>
          <span v-if="wxQrStatus === 'waiting'">请使用微信扫码确认。</span>
          <span v-if="wxQrStatus === 'scaned'">已扫码，请在微信里确认。</span>
          <span v-if="wxQrStatus === 'confirmed'">微信配置已保存，gateway 已触发重启。</span>
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

.gateways-view {
  height: calc(100 * var(--vh));
  display: flex;
  flex-direction: column;
}

.gateways-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.connector-section,
.gateway-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;

  h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 650;
    color: $text-primary;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: $text-muted;
    line-height: 1.5;
  }
}

.connector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.connector-card,
.config-card {
  padding: 16px;
  background-color: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
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
  background-color: $bg-secondary;
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
  font-size: 14px;
  font-weight: 650;
  color: $text-primary;
}

.connector-source,
.connector-meta {
  font-size: 12px;
  line-height: 1.5;
  color: $text-muted;
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
  font-size: 13px;
  font-weight: 650;
  color: $text-primary;
}

.config-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;

  &.two-fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }
}

.empty-state {
  text-align: center;
  color: $text-muted;
  padding: 40px 0;
}

.gateway-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gateway-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background-color: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  transition: border-color $transition-fast;

  &:hover {
    border-color: $text-muted;
  }
}

.gateway-name {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 4px;
}

.gateway-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  font-size: 12px;
  color: $text-muted;
}

.gateway-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  font-size: 12px;
  color: $text-muted;
}

.qr-box {
  display: flex;
  justify-content: center;
  padding: 16px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background-color: #fff;

  img {
    width: 220px;
    height: 220px;
    object-fit: contain;
  }
}

.qr-status {
  min-height: 20px;
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .gateway-card,
  .connector-actions,
  .section-header {
    align-items: stretch;
    flex-direction: column;
  }

  .config-row,
  .config-row.two-fields {
    grid-template-columns: 1fr;
  }
}
</style>
