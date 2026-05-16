// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const mockFetchRuntimeStatus = vi.hoisted(() => vi.fn())
const mockFetchHxaOverview = vi.hoisted(() => vi.fn())
const mockFetchWeixinStatus = vi.hoisted(() => vi.fn())
const mockFetchTelegramStatus = vi.hoisted(() => vi.fn())
const mockFetchSettings = vi.hoisted(() => vi.fn())

vi.mock('@/api/hermes/runtime', () => ({
  fetchRuntimeStatus: mockFetchRuntimeStatus,
}))

vi.mock('@/api/agentic/hxa', () => ({
  fetchHxaOverview: mockFetchHxaOverview,
}))

vi.mock('@/api/hermes/config', () => ({
  fetchWeixinStatus: mockFetchWeixinStatus,
  fetchTelegramStatus: mockFetchTelegramStatus,
  fetchWeixinQrCode: vi.fn(),
  pollWeixinQrStatus: vi.fn(),
  saveCredentials: vi.fn(),
  saveWeixinCredentials: vi.fn(),
}))

vi.mock('@/stores/hermes/settings', () => ({
  useSettingsStore: () => ({
    loading: false,
    saving: false,
    platforms: { telegram: {}, feishu: { extra: {} } },
    fetchSettings: mockFetchSettings,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', () => ({
  useMessage: () => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
  NAlert: defineComponent({ name: 'NAlert', template: '<div class="n-alert-stub"><slot /></div>' }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button class="n-button-stub" @click="$emit(\'click\')"><slot /></button>',
  }),
  NInput: defineComponent({
    name: 'NInput',
    props: { value: String, placeholder: String },
    emits: ['update:value'],
    template: '<input class="n-input-stub" :placeholder="placeholder" :value="value" />',
  }),
  NModal: defineComponent({
    name: 'NModal',
    props: { show: Boolean },
    template: '<div v-if="show" class="n-modal-stub"><slot /></div>',
  }),
  NSpin: defineComponent({ name: 'NSpin', template: '<div class="n-spin-stub"><slot /></div>' }),
  NTag: defineComponent({ name: 'NTag', template: '<span class="n-tag-stub"><slot /></span>' }),
}))

vi.mock('@/components/hermes/settings/PlatformSettings.vue', () => ({
  default: defineComponent({ name: 'PlatformSettings', template: '<div class="platform-settings-stub" />' }),
}))

import ChannelsView from '../../packages/client/src/views/hermes/ChannelsView.vue'

describe('ChannelsView runtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchRuntimeStatus.mockResolvedValue({
      provider: 'openai-direct',
      runtime: {
        provider: 'openai-direct',
        available: false,
        mode: 'not_configured',
        detail: 'OpenAI Direct runtime requires OPENAI_API_KEY.',
        missingConfig: ['OPENAI_API_KEY'],
        checks: [
          { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', ok: false, required: true },
        ],
      },
    })
    mockFetchHxaOverview.mockResolvedValue({ online: false, stats: {} })
    mockFetchWeixinStatus.mockResolvedValue({ configured: false, runtime: { running: false, configured: false, primed: false, messages_received: 0, messages_forwarded: 0, replies_sent: 0 } })
    mockFetchTelegramStatus.mockResolvedValue({ configured: false, runtime: { running: false, configured: false, primed: false, messages_received: 0, messages_forwarded: 0, replies_sent: 0 } })
    mockFetchSettings.mockResolvedValue({})
  })

  it('shows the deployment runtime provider and missing configuration', async () => {
    const wrapper = mount(ChannelsView)
    await flushPromises()

    expect(wrapper.text()).toContain('AI 引擎状态')
    expect(wrapper.text()).toContain('openai-direct')
    expect(wrapper.text()).toContain('未配置')
    expect(wrapper.text()).toContain('OPENAI_API_KEY')
  })

  it('treats hxa as hidden engine internals when no AI engine is installed', async () => {
    mockFetchRuntimeStatus.mockResolvedValue({
      provider: 'none',
      runtime: {
        provider: 'none',
        available: false,
        mode: 'not_configured',
        detail: 'BeatyClaw is running as a product shell. No AI engine is installed yet.',
        missingConfig: ['AI_ENGINE'],
        checks: [
          { key: 'AI_ENGINE', label: 'AI 引擎', ok: false, required: true },
        ],
      },
    })
    mockFetchHxaOverview.mockRejectedValue(new Error('hxa stopped'))

    const wrapper = mount(ChannelsView)
    await flushPromises()

    expect(wrapper.text()).toContain('AI 引擎状态')
    expect(wrapper.text()).toContain('none')
    expect(wrapper.text()).toContain('未安装')
    expect(wrapper.text()).not.toContain('hxa-connect')
    expect(wrapper.text()).not.toContain('hxa stopped')
  })
})
