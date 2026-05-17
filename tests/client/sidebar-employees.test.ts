// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routerPushMock = vi.hoisted(() => vi.fn())
const routerReplaceMock = vi.hoisted(() => vi.fn())
const mockAppStore = vi.hoisted(() => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  connected: true,
  toggleSidebarCollapsed: vi.fn(),
  closeSidebar: vi.fn(),
}))
const mockEmployeesStore = vi.hoisted(() => ({
  employees: [
    {
      id: 'emp_coco',
      name: '苏白',
      engineType: 'zylos',
      status: 'running',
      avatar: '',
    },
    {
      id: 'emp_hms',
      name: 'HMS 自动配置员工',
      engineType: 'hms',
      status: 'running',
      avatar: '',
    },
  ],
  currentEmployeeId: 'emp_coco',
  currentEmployee: {
    id: 'emp_coco',
    name: '苏白',
    engineType: 'zylos',
    status: 'running',
    avatar: '',
  },
  loading: false,
  saving: false,
  loadEmployees: vi.fn(),
  selectEmployee: vi.fn(),
  createEmployee: vi.fn(),
}))

vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => mockAppStore,
}))

vi.mock('@/stores/agentic/employees', () => ({
  useEmployeesStore: () => mockEmployeesStore,
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useRoute: () => ({ name: 'hermes.chat', query: {} }),
    useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('/logo.png', () => ({
  default: 'logo.png',
}))

import AppSidebar from '@/components/layout/AppSidebar.vue'

describe('AppSidebar employees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppStore.sidebarCollapsed = false
    mockEmployeesStore.currentEmployeeId = 'emp_coco'
  })

  it('shows employees as the primary sidebar switcher and aliases zylos to COCO', () => {
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          LanguageSwitch: true,
        },
      },
    })

    expect(wrapper.text()).toContain('数字员工')
    expect(wrapper.text()).toContain('苏白')
    expect(wrapper.text()).toContain('COCO · 运行中')
    expect(wrapper.text()).not.toContain('zylos')
  })

  it('selects another employee from the sidebar without opening employee management', async () => {
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          LanguageSwitch: true,
        },
      },
    })

    const hmsButton = wrapper.findAll('button').find(button => button.text().includes('HMS 自动配置员工'))
    expect(hmsButton).toBeTruthy()

    await hmsButton!.trigger('click')

    expect(mockEmployeesStore.selectEmployee).toHaveBeenCalledWith('emp_hms')
    expect(routerReplaceMock).toHaveBeenCalledWith({
      name: 'hermes.chat',
      query: { employee_id: 'emp_hms' },
    })
  })
})
