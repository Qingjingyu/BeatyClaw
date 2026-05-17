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
      visibility: 'visible',
      deletedAt: null,
    },
    {
      id: 'emp_hidden',
      name: '隐藏员工',
      engineType: 'hms',
      status: 'running',
      avatar: '',
      visibility: 'hidden',
      deletedAt: null,
    },
  ],
  sidebarEmployees: [
    {
      id: 'emp_coco',
      name: '苏白',
      engineType: 'zylos',
      status: 'running',
      avatar: '',
      visibility: 'visible',
      deletedAt: null,
    },
    {
      id: 'emp_hms',
      name: 'HMS 自动配置员工',
      engineType: 'hms',
      status: 'running',
      avatar: '',
      visibility: 'visible',
      deletedAt: null,
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
  hideEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
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
    expect(wrapper.text()).not.toContain('隐藏员工')
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

  it('collapses the employee list and exposes quick management actions', async () => {
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          LanguageSwitch: true,
        },
      },
    })

    const collapseButton = wrapper.find('button[title="折叠数字员工"]')
    expect(collapseButton.exists()).toBe(true)
    await collapseButton.trigger('click')
    expect(wrapper.text()).not.toContain('HMS 自动配置员工')

    await collapseButton.trigger('click')
    const hideButton = wrapper.find('button[title="隐藏 苏白"]')
    expect(hideButton.exists()).toBe(true)
    await hideButton.trigger('click')
    expect(mockEmployeesStore.hideEmployee).toHaveBeenCalledWith('emp_coco')
  })
})
