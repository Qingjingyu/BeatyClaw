<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { NButton, NInput, NModal, NSelect, NSpin, NTag, useMessage } from 'naive-ui'
import { useEmployeesStore } from '@/stores/agentic/employees'
import type { Employee, EmployeeEngineType, EmployeeHealthStatus, EmployeeStatus } from '@/api/agentic/employees'
import { getEngineDisplayLabel } from '@/utils/engine-display'

const employeesStore = useEmployeesStore()
const message = useMessage()
const showCreateModal = ref(false)
const filterKey = ref<'all' | 'visible' | 'hidden' | 'deleted'>('all')
const form = reactive({
  name: '',
  engineType: 'openclaw' as EmployeeEngineType,
  systemRole: '',
})

const engineOptions = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'HMS', value: 'hms' },
  { label: 'COCO', value: 'zylos' },
]

const statusMap: Record<EmployeeStatus, { label: string; type: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  draft: { label: '草稿', type: 'default' },
  deploying: { label: '部署中', type: 'info' },
  installed: { label: '已安装', type: 'success' },
  running: { label: '运行中', type: 'success' },
  stopped: { label: '已停止', type: 'warning' },
  failed: { label: '失败', type: 'error' },
}

const healthStatusMap: Record<EmployeeHealthStatus, { label: string; type: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  unknown: { label: '未检查', type: 'default' },
  provisioning: { label: '预留目录中', type: 'info' },
  healthy: { label: '健康', type: 'success' },
  stopped: { label: '已停止', type: 'warning' },
  unhealthy: { label: '异常', type: 'error' },
}

const currentId = computed(() => employeesStore.currentEmployeeId)
const filteredEmployees = computed(() => {
  if (filterKey.value === 'visible') return employeesStore.sidebarEmployees
  if (filterKey.value === 'hidden') return employeesStore.hiddenEmployees
  if (filterKey.value === 'deleted') return employeesStore.deletedEmployees
  return employeesStore.employees
})
const filterOptions = computed(() => [
  { key: 'all' as const, label: `全部 ${employeesStore.employees.length}` },
  { key: 'visible' as const, label: `显示中 ${employeesStore.sidebarEmployees.length}` },
  { key: 'hidden' as const, label: `已隐藏 ${employeesStore.hiddenEmployees.length}` },
  { key: 'deleted' as const, label: `已删除 ${employeesStore.deletedEmployees.length}` },
])

onMounted(() => {
  employeesStore.loadEmployees()
})

function engineLabel(engine: string) {
  return getEngineDisplayLabel(engine)
}

function statusInfo(status: EmployeeStatus) {
  return statusMap[status] || statusMap.draft
}

function healthInfo(status: EmployeeHealthStatus) {
  return healthStatusMap[status] || healthStatusMap.unknown
}

function resetForm() {
  form.name = ''
  form.engineType = 'openclaw'
  form.systemRole = ''
}

async function createEmployee() {
  try {
    const employee = await employeesStore.createEmployee({
      name: form.name,
      engineType: form.engineType,
      systemRole: form.systemRole,
    })
    await employeesStore.selectEmployee(employee.id)
    showCreateModal.value = false
    resetForm()
    if (employee.status === 'running' && employee.healthStatus === 'healthy') {
      message.success('数字员工已创建并启动')
    } else {
      message.error('数字员工已创建，但自动启动失败，请在卡片中查看状态')
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  }
}

async function selectEmployee(employee: Employee) {
  await employeesStore.selectEmployee(employee.id)
  message.success(`已切换到 ${employee.name}`)
}

async function deploy(employee: Employee) {
  await employeesStore.deployEmployee(employee.id)
  message.success(`${employee.name} 已完成模拟部署`)
}

async function start(employee: Employee) {
  await employeesStore.startEmployee(employee.id)
}

async function stop(employee: Employee) {
  await employeesStore.stopEmployee(employee.id)
}

async function checkHealth(employee: Employee) {
  await employeesStore.checkEmployeeHealth(employee.id)
  message.success(`${employee.name} 健康状态已刷新`)
}

async function hideEmployee(employee: Employee) {
  await employeesStore.hideEmployee(employee.id)
  message.success(`${employee.name} 已从侧边栏隐藏`)
}

async function showEmployee(employee: Employee) {
  await employeesStore.showEmployee(employee.id)
  message.success(`${employee.name} 已恢复到侧边栏`)
}

async function deleteEmployee(employee: Employee) {
  await employeesStore.deleteEmployee(employee.id)
  message.success(`${employee.name} 已移入已删除`)
}

async function restoreEmployee(employee: Employee) {
  await employeesStore.restoreEmployee(employee.id)
  message.success(`${employee.name} 已恢复`)
}
</script>

<template>
  <div class="employees-view">
    <header class="page-header">
      <div>
        <h2>数字员工</h2>
        <p>管理每个员工的资料、角色和底层 AI 引擎。</p>
      </div>
      <NButton type="primary" @click="showCreateModal = true">新增数字员工</NButton>
    </header>

    <NSpin :show="employeesStore.loading && employeesStore.employees.length === 0">
      <div v-if="employeesStore.error" class="error-panel">
        {{ employeesStore.error }}
      </div>

      <div class="filter-tabs">
        <button
          v-for="option in filterOptions"
          :key="option.key"
          type="button"
          :class="{ active: filterKey === option.key }"
          @click="filterKey = option.key"
        >
          {{ option.label }}
        </button>
      </div>

      <section class="employee-grid">
        <article v-for="employee in filteredEmployees" :key="employee.id" class="employee-card" :class="{ active: employee.id === currentId, deleted: Boolean(employee.deletedAt) }">
          <div class="card-main">
            <img :src="employee.avatar || '/logo.png'" :alt="employee.name" class="avatar" />
            <div>
              <div class="name-row">
                <h3>{{ employee.name }}</h3>
                <NTag v-if="employee.id === currentId" size="small" type="success" round>当前员工</NTag>
                <NTag v-if="employee.visibility === 'hidden' && !employee.deletedAt" size="small" round>已隐藏</NTag>
                <NTag v-if="employee.deletedAt" size="small" type="error" round>已删除</NTag>
              </div>
              <p>{{ employee.systemRole || '尚未设置系统角色' }}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div>
              <span>AI 引擎</span>
              <strong>{{ engineLabel(employee.engineType) }}</strong>
            </div>
            <div>
              <span>状态</span>
              <NTag :type="statusInfo(employee.status).type" size="small" round>
                {{ statusInfo(employee.status).label }}
              </NTag>
            </div>
          </div>

          <div class="instance-panel">
            <div>
              <span>实例目录</span>
              <strong :title="employee.instanceRoot">{{ employee.instanceRoot }}</strong>
            </div>
            <div>
              <span>容器名</span>
              <strong :title="employee.containerName">{{ employee.containerName }}</strong>
            </div>
            <div>
              <span>端口</span>
              <strong>{{ employee.port || '待分配' }}</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong :title="employee.runtimeUrl">{{ employee.runtimeUrl || '待启动' }}</strong>
            </div>
            <div>
              <span>健康</span>
              <NTag :type="healthInfo(employee.healthStatus).type" size="small" round>
                {{ healthInfo(employee.healthStatus).label }}
              </NTag>
            </div>
          </div>

          <div class="card-actions">
            <NButton size="small" secondary :disabled="employee.id === currentId || Boolean(employee.deletedAt)" @click="selectEmployee(employee)">
              设为当前
            </NButton>
            <NButton v-if="employee.deletedAt" size="small" @click="restoreEmployee(employee)">
              恢复
            </NButton>
            <NButton v-else-if="employee.visibility === 'hidden'" size="small" @click="showEmployee(employee)">
              显示
            </NButton>
            <NButton v-else size="small" quaternary @click="hideEmployee(employee)">
              隐藏
            </NButton>
            <NButton v-if="!employee.deletedAt && (employee.status === 'draft' || employee.status === 'failed')" size="small" @click="deploy(employee)">
              部署
            </NButton>
            <NButton v-else-if="!employee.deletedAt && (employee.status === 'installed' || employee.status === 'stopped')" size="small" @click="start(employee)">
              启动
            </NButton>
            <NButton v-else-if="!employee.deletedAt && employee.status === 'running'" size="small" @click="stop(employee)">
              停止
            </NButton>
            <NButton v-if="!employee.deletedAt" size="small" quaternary @click="checkHealth(employee)">
              刷新健康
            </NButton>
            <NButton v-if="!employee.deletedAt" size="small" quaternary type="error" @click="deleteEmployee(employee)">
              删除
            </NButton>
          </div>
        </article>
      </section>
      <div v-if="filteredEmployees.length === 0" class="empty-panel">
        当前筛选下暂无数字员工
      </div>
    </NSpin>

    <NModal v-model:show="showCreateModal" preset="card" title="新增数字员工" class="employee-modal">
      <div class="form-stack">
        <label>
          <span>员工名称</span>
          <NInput v-model:value="form.name" placeholder="例如：客服小美" />
        </label>
        <label>
          <span>AI 引擎</span>
          <NSelect v-model:value="form.engineType" :options="engineOptions" />
        </label>
        <label>
          <span>系统角色</span>
          <NInput v-model:value="form.systemRole" type="textarea" placeholder="这个员工负责什么，应该怎么说话和做事" />
        </label>
      </div>
      <template #footer>
        <div class="modal-actions">
          <NButton @click="showCreateModal = false">取消</NButton>
          <NButton type="primary" :loading="employeesStore.saving" :disabled="!form.name.trim()" @click="createEmployee">
            {{ employeesStore.saving ? '创建并启动中' : '创建并启动' }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.employees-view {
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
  }

  p {
    margin: 0;
    color: $text-secondary;
    font-size: 14px;
  }
}

.error-panel {
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid rgba(var(--error-rgb, 239, 68, 68), 0.25);
  border-radius: $radius-md;
  color: $error;
  background: rgba(var(--error-rgb, 239, 68, 68), 0.06);
}

.filter-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;

  button {
    border: none;
    border-radius: $radius-sm;
    padding: 7px 12px;
    background: transparent;
    color: $text-secondary;
    font-size: 13px;
    cursor: pointer;

    &:hover,
    &.active {
      background: rgba(var(--accent-primary-rgb), 0.1);
      color: $text-primary;
    }
  }
}

.employee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.employee-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 240px;
  padding: 18px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;

  &.active {
    border-color: rgba(var(--accent-primary-rgb), 0.65);
    box-shadow: 0 0 0 1px rgba(var(--accent-primary-rgb), 0.12);
  }

  &.deleted {
    opacity: 0.72;
  }
}

.card-main {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 18px;
    font-weight: 650;
  }
}

.card-main p {
  margin: 8px 0 0;
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.55;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  div {
    padding: 12px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background: rgba(var(--accent-primary-rgb), 0.04);
  }

  span {
    display: block;
    margin-bottom: 6px;
    color: $text-muted;
    font-size: 12px;
  }

  strong {
    color: $text-primary;
    font-size: 14px;
  }
}

.instance-panel {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: rgba(var(--accent-primary-rgb), 0.025);

  div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  span {
    color: $text-muted;
    font-size: 12px;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: $text-primary;
    font-size: 12px;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.card-actions,
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.empty-panel {
  padding: 28px;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  color: $text-muted;
  text-align: center;
  background: $bg-card;
}

.form-stack {
  display: grid;
  gap: 14px;

  label {
    display: grid;
    gap: 6px;
  }

  span {
    color: $text-secondary;
    font-size: 13px;
  }
}

@media (max-width: $breakpoint-mobile) {
  .employees-view {
    padding: 20px 16px;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
