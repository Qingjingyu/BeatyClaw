import type { EmployeeEngineType, EmployeeStatus } from '@/api/agentic/employees'

const ENGINE_LABELS: Record<EmployeeEngineType | string, string> = {
  coco: 'COCO',
  zylos: 'COCO',
  hms: 'HMS',
  openclaw: 'OpenClaw',
}

const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  draft: '草稿',
  deploying: '部署中',
  installed: '已安装',
  running: '运行中',
  stopped: '已停止',
  failed: '失败',
}

export function getEngineDisplayLabel(engine: EmployeeEngineType | string | undefined | null) {
  if (!engine) return '未知'
  return ENGINE_LABELS[engine] || engine
}

export function getEngineStatusLabel(status: EmployeeStatus | string | undefined | null) {
  if (!status) return '未知'
  return EMPLOYEE_STATUS_LABELS[status as EmployeeStatus] || status
}
