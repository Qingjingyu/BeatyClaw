import { describe, expect, it } from 'vitest'

import { getEngineDisplayLabel, getEngineStatusLabel } from '@/utils/engine-display'

describe('engine display labels', () => {
  it('shows the legacy zylos engine as COCO in product UI', () => {
    expect(getEngineDisplayLabel('zylos')).toBe('COCO')
    expect(getEngineDisplayLabel('coco')).toBe('COCO')
  })

  it('keeps status labels short for sidebar employee cards', () => {
    expect(getEngineStatusLabel('running')).toBe('运行中')
    expect(getEngineStatusLabel('installed')).toBe('已安装')
    expect(getEngineStatusLabel('draft')).toBe('草稿')
  })
})
