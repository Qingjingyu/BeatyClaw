// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mockReplace = vi.hoisted(() => vi.fn())
const mockFetchYoyooMe = vi.hoisted(() => vi.fn())
const mockLoginWithYoyoo = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}))

vi.mock('@/api/auth', () => ({
  fetchYoyooMe: mockFetchYoyooMe,
  loginWithYoyoo: mockLoginWithYoyoo,
}))

import LoginView from '@/views/LoginView.vue'

describe('LoginView Yoyoo login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchYoyooMe.mockRejectedValue(new Error('not logged in'))
    mockLoginWithYoyoo.mockResolvedValue({
      id: 'user-1',
      email: 'owner.com',
      username: '苏白',
      role: 'admin',
      status: 'active',
      created_at: Date.now(),
      last_login_at: Date.now(),
    })
  })

  it('logs in with email and password', async () => {
    const wrapper = mount(LoginView)
    const inputs = wrapper.findAll('input.login-input')

    await inputs[0].setValue('owner.com')
    await inputs[1].setValue('owner.com')
    await wrapper.find('form.login-form').trigger('submit')

    expect(mockLoginWithYoyoo).toHaveBeenCalledWith('owner.com', 'owner.com')
    expect(mockReplace).toHaveBeenCalledWith('/agentic/chat')
  })

  it('shows validation error when credentials are empty', async () => {
    const wrapper = mount(LoginView)

    await wrapper.find('form.login-form').trigger('submit')

    expect(wrapper.find('.login-error').text()).toBe('请输入邮箱和密码')
    expect(mockLoginWithYoyoo).not.toHaveBeenCalled()
  })

  it('shows invalid credential message on 401', async () => {
    const err: any = new Error('bad credentials')
    err.status = 401
    mockLoginWithYoyoo.mockRejectedValue(err)
    const wrapper = mount(LoginView)
    const inputs = wrapper.findAll('input.login-input')

    await inputs[0].setValue('owner.com')
    await inputs[1].setValue('wrong-password')
    await wrapper.find('form.login-form').trigger('submit')

    expect(wrapper.find('.login-error').text()).toBe('邮箱或密码不正确')
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
