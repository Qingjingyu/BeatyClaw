<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/hermes/app";
import { useEmployeesStore } from "@/stores/agentic/employees";
import type { Employee, EmployeeEngineType } from "@/api/agentic/employees";
import { getEngineDisplayLabel, getEngineStatusLabel } from "@/utils/engine-display";
import LanguageSwitch from "./LanguageSwitch.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const employeesStore = useEmployeesStore();
const selectedKey = computed(() => route.name as string);
const logoPath = '/logo.png';
const currentEmployee = computed(() => employeesStore.currentEmployee);
const showCreatePanel = ref(false);
const employeesCollapsed = ref(false);
const createForm = reactive({
  name: '',
  engineType: 'hms' as EmployeeEngineType,
});

const collapsedGroups = reactive<Record<string, boolean>>({});
const engineOptions: Array<{ label: string; value: EmployeeEngineType }> = [
  { label: 'HMS', value: 'hms' },
  { label: 'COCO', value: 'zylos' },
  { label: 'OpenClaw', value: 'openclaw' },
];

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key];
}

function isGroupCollapsed(key: string) {
  return !!collapsedGroups[key];
}

function handleNav(key: string) {
  router.push({
    name: key,
    query: currentEmployee.value?.id ? { employee_id: currentEmployee.value.id } : route.query,
  });
}

function handleLogout() {
  localStorage.clear();
  router.replace({ name: 'login' });
}

function employeeInitial(employee: Employee) {
  return employee.name.trim().slice(0, 1).toUpperCase() || '员';
}

async function switchEmployee(employee: Employee) {
  if (employee.id === employeesStore.currentEmployeeId) return;
  await employeesStore.selectEmployee(employee.id);
  await router.replace({
    name: route.name || 'hermes.chat',
    query: {
      ...route.query,
      employee_id: employee.id,
    },
  });
}

async function createEmployee() {
  const name = createForm.name.trim();
  if (!name) return;
  const employee = await employeesStore.createEmployee({
    name,
    engineType: createForm.engineType,
  });
  await switchEmployee(employee);
  createForm.name = '';
  createForm.engineType = 'hms';
  showCreatePanel.value = false;
}

async function hideEmployee(employee: Employee) {
  await employeesStore.hideEmployee(employee.id);
}

async function deleteEmployee(employee: Employee) {
  await employeesStore.deleteEmployee(employee.id);
}

onMounted(() => {
  employeesStore.loadEmployees();
});
</script>

<template>
  <aside class="sidebar" :class="{ open: appStore.sidebarOpen, collapsed: appStore.sidebarCollapsed }">
    <div class="sidebar-logo" @click="router.push('/agentic/chat')">
      <img :src="logoPath" alt="BeatyClaw 数字员工" class="logo-img" />
      <span class="logo-text">BeatyClaw 数字员工</span>
    </div>

    <button class="collapse-btn" @click="appStore.toggleSidebarCollapsed()" :title="appStore.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="appStore.sidebarCollapsed" points="9 18 15 12 9 6" />
        <polyline v-else points="15 18 9 12 15 6" />
      </svg>
    </button>

    <section class="employee-section">
      <div class="employee-section-header">
        <span>数字员工</span>
        <span class="employee-section-actions">
          <button class="icon-action" type="button" :title="employeesCollapsed ? '展开数字员工' : '折叠数字员工'" @click="employeesCollapsed = !employeesCollapsed">
            <svg class="collapse-arrow" :class="{ collapsed: employeesCollapsed }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button class="icon-action" type="button" title="新增数字员工" @click="showCreatePanel = !showCreatePanel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </span>
      </div>

      <form v-if="showCreatePanel && !appStore.sidebarCollapsed && !employeesCollapsed" class="employee-create-panel" @submit.prevent="createEmployee">
        <input v-model="createForm.name" type="text" placeholder="员工名称" />
        <select v-model="createForm.engineType">
          <option v-for="option in engineOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button type="submit" :disabled="employeesStore.saving || !createForm.name.trim()">
          创建
        </button>
      </form>

      <div v-if="!employeesCollapsed" class="employee-list" :aria-busy="employeesStore.loading">
        <button
          v-for="employee in employeesStore.sidebarEmployees"
          :key="employee.id"
          type="button"
          class="employee-card"
          :class="{ active: employee.id === employeesStore.currentEmployeeId }"
          :title="`${employee.name} · ${getEngineDisplayLabel(employee.engineType)}`"
          @click="switchEmployee(employee)"
        >
          <img v-if="employee.avatar" :src="employee.avatar" :alt="employee.name" class="employee-avatar" />
          <span v-else class="employee-avatar employee-avatar-fallback">{{ employeeInitial(employee) }}</span>
          <span class="employee-meta">
            <strong>{{ employee.name }}</strong>
            <small>{{ getEngineDisplayLabel(employee.engineType) }} · {{ getEngineStatusLabel(employee.status) }}</small>
          </span>
          <span v-if="!appStore.sidebarCollapsed" class="employee-card-actions" @click.stop>
            <button type="button" :title="`隐藏 ${employee.name}`" @click="hideEmployee(employee)">
              隐藏
            </button>
            <button type="button" :title="`删除 ${employee.name}`" @click="deleteEmployee(employee)">
              删除
            </button>
          </span>
        </button>
        <div v-if="!employeesStore.loading && employeesStore.sidebarEmployees.length === 0" class="employee-empty">
          暂无员工
        </div>
      </div>
      <button v-else class="employee-collapsed-summary" type="button" @click="employeesCollapsed = false">
        已折叠 {{ employeesStore.sidebarEmployees.length }} 个员工
      </button>
    </section>

    <nav class="sidebar-nav">
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('workspace')">
          <span>{{ currentEmployee?.name || '当前员工工作台' }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('workspace') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('workspace')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.chat' }" @click="handleNav('hermes.chat')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{{ t("sidebar.chat") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.history' }" @click="handleNav('hermes.history')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{{ t("sidebar.history") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.files' }" @click="handleNav('hermes.files')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>档案</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.jobs' }" @click="handleNav('hermes.jobs')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{{ t("sidebar.jobs") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.kanban' }" @click="handleNav('hermes.kanban')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="5" height="18" rx="1" />
              <rect x="10" y="3" width="5" height="12" rx="1" />
              <rect x="17" y="3" width="5" height="18" rx="1" />
            </svg>
            <span>{{ t("sidebar.kanban") }}</span>
          </button>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('capabilities')">
          <span>{{ t("sidebar.groupCapabilities") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('capabilities') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('capabilities')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.channels' }" @click="handleNav('hermes.channels')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span>{{ t("sidebar.channels") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.aiEngines' }" @click="handleNav('hermes.aiEngines')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
              <path d="M9 1v3" />
              <path d="M15 1v3" />
              <path d="M9 20v3" />
              <path d="M15 20v3" />
              <path d="M20 9h3" />
              <path d="M20 14h3" />
              <path d="M1 9h3" />
              <path d="M1 14h3" />
            </svg>
            <span>AI 引擎</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.skills' }" @click="handleNav('hermes.skills')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>{{ t("sidebar.skills") }}</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.memory' }" @click="handleNav('hermes.memory')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            <span>{{ t("sidebar.memory") }}</span>
          </button>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('system')">
          <span>数据</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('system') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('system')">
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.usage' }" @click="handleNav('hermes.usage')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
            <span>{{ t("sidebar.usage") }}</span>
          </button>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('settings')">
          <span>设置</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('settings') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('settings')">
          <button class="nav-item" :class="{ active: selectedKey === 'agentic.employees' }" @click="handleNav('agentic.employees')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>员工管理</span>
          </button>
          <button class="nav-item" :class="{ active: selectedKey === 'hermes.settings' }" @click="handleNav('hermes.settings')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82V22a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.82V2a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.37.67.68.91.31.24.69.36 1.08.34H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
            </svg>
            <span>{{ t("sidebar.settings") }}</span>
          </button>
        </div>
      </div>
    </nav>

    <div class="sidebar-footer">
      <button class="nav-item logout-item" @click="handleLogout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{{ t("sidebar.logout") }}</span>
      </button>
      <div class="status-row">
        <div
          class="status-indicator"
          :class="{
            connected: appStore.connected,
            disconnected: !appStore.connected,
          }"
        >
          <span class="status-dot"></span>
          <span class="status-text">{{
            appStore.connected
              ? t("sidebar.connected")
              : t("sidebar.disconnected")
          }}</span>
        </div>
        <LanguageSwitch />
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.sidebar {
  position: relative;
  width: $sidebar-width;
  height: calc(100 * var(--vh));
  background-color: $bg-sidebar;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  padding: 0 12px 20px;
  flex-shrink: 0;
  transition: width $transition-normal;
}

.logo-img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 12px;
  margin: 0 -12px;
  color: $text-primary;
  cursor: pointer;
  background-color: $bg-card;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  .dark & {
    background-color: #393939;
  }
  position: relative;
  overflow: hidden;

  .logo-text {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.25;
  }

  .logo-dance {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    height: 100px;
    border-radius: $radius-md;
    object-fit: contain;
    flex-shrink: 0;
    width: auto;
    pointer-events: none;
  }
}

.sidebar-nav {
  flex: 1;
  display: flex;
  padding-top: 10px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.employee-section {
  padding: 14px 2px 10px;
  border-bottom: 1px solid $border-color;
}

.employee-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 8px;
  color: $text-muted;
  font-size: 12px;
  font-weight: 600;
}

.employee-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid $border-color;
  border-radius: 50%;
  background: $bg-card;
  color: $text-secondary;
  cursor: pointer;

  &:hover {
    color: $text-primary;
    border-color: rgba(var(--accent-primary-rgb), 0.45);
  }
}

.collapse-arrow {
  transition: transform $transition-fast;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.employee-create-panel {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;

  input,
  select {
    width: 100%;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    padding: 8px 9px;
    background: $bg-primary;
    color: $text-primary;
    font-size: 12px;
    outline: none;
  }

  button {
    border: none;
    border-radius: $radius-sm;
    padding: 8px 10px;
    background: $accent-primary;
    color: white;
    font-size: 12px;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }
}

.employee-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.employee-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: $radius-md;
  background: transparent;
  color: $text-primary;
  cursor: pointer;
  text-align: left;
  transition: background-color $transition-fast, border-color $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.06);
  }

  &.active {
    border-color: rgba(var(--accent-primary-rgb), 0.24);
    background: rgba(var(--accent-primary-rgb), 0.1);
  }
}

.employee-card-actions {
  display: none;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;

  button {
    border: none;
    border-radius: $radius-sm;
    padding: 4px 5px;
    background: rgba($text-muted, 0.1);
    color: $text-muted;
    font-size: 10px;
    cursor: pointer;

    &:hover {
      color: $text-primary;
      background: rgba(var(--accent-primary-rgb), 0.12);
    }
  }
}

.employee-card:hover .employee-card-actions {
  display: inline-flex;
}

.employee-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.employee-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: $bg-card;
  color: $text-primary;
  font-size: 13px;
  font-weight: 650;
}

.employee-meta {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;

  strong,
  small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: $text-primary;
    font-size: 13px;
    font-weight: 650;
  }

  small {
    color: $text-muted;
    font-size: 11px;
  }
}

.employee-empty {
  padding: 12px;
  color: $text-muted;
  font-size: 12px;
}

.employee-collapsed-summary {
  width: 100%;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  padding: 10px;
  background: transparent;
  color: $text-muted;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: $text-primary;
    border-color: rgba(var(--accent-primary-rgb), 0.35);
  }
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.nav-group-bottom {
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid $border-color;
  }
}

.nav-group-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  border-radius: $radius-sm;
  transition: color $transition-fast;

  &:hover {
    color: $text-secondary;
  }

  .nav-group:first-child & {
    padding-top: 0;
  }
}

.nav-group-arrow {
  transition: transform $transition-fast;
  flex-shrink: 0;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: none;
  background: none;
  color: $text-secondary;
  font-size: 14px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  width: 100%;
  text-align: left;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  &.active {
    background-color: rgba(var(--accent-primary-rgb), 0.12);
    color: $accent-primary;
  }

  .beta-tag {
    font-size: 10px;
    color: $text-muted;
    margin-left: 2px;
  }
}

.sidebar-footer {
  padding-top: 8px;
  border-top: 1px solid $border-color;
}

.logout-item {
  margin: 0 -12px;
  padding: 10px 12px;
  border-radius: 0;
  font-size: 13px;
  color: $text-muted;

  &:hover {
    color: $error;
    background: rgba(var(--error-rgb, 239, 68, 68), 0.06);
  }
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &.connected .status-dot {
    background-color: $success;
    box-shadow: 0 0 6px rgba(var(--success-rgb), 0.5);
  }

  &.disconnected .status-dot {
    background-color: $error;
  }

  .status-text {
    color: $text-secondary;
  }
}

// ─── Collapsed sidebar (icon-rail mode) ─────────────────────────

.sidebar.collapsed {
  width: $sidebar-collapsed-width;
  padding: 0 8px 12px;
  overflow: hidden;

  .sidebar-logo {
    padding: 12px 4px 8px;
    margin: 0 -8px;
    justify-content: center;
    gap: 0;

    .logo-text {
      display: none;
    }
  }

  .collapse-btn {
    display: flex;
    margin: 0 auto 8px;
  }

  .employee-section {
    padding: 10px 0;
  }

  .employee-section-header span,
  .employee-meta {
    display: none;
  }

  .employee-section-header {
    justify-content: center;
    padding: 0 0 8px;
  }

  .employee-card {
    justify-content: center;
    padding: 8px 4px;
    gap: 0;
  }

  .nav-group-label {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 10px 4px;
    gap: 0;

    span {
      display: none;
    }

    svg {
      flex-shrink: 0;
    }
  }

  // Keep group children visible — user can still see icons
  .nav-group > div {
    display: flex !important;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar-footer {
    .logout-item span {
      display: none;
    }

    .status-text {
      display: none;
    }

    .status-row {
      justify-content: center;

      :deep(.input-sm) {
        display: none;
      }
    }
  }
}

// ─── Collapse button ────────────────────────────────────────────

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  border-radius: $radius-sm;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 0;
  transition: all $transition-fast;

  &:hover {
    color: $text-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.08);
  }
}

// In expanded mode, overlap the top-right of the logo area
.sidebar:not(.collapsed) .collapse-btn {
  position: absolute;
  top: 18px;
  right: 16px;
  z-index: 5;
}

@media (max-width: $breakpoint-mobile) {
  .logo-dance {
    display: none;
  }

  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform $transition-normal;

    &.open {
      transform: translateX(0);
    }

    // Override global utility — sidebar is always 240px wide
    .input-sm {
      width: 90px;
    }
  }
}

.fun-link {
  text-decoration: none;
}
</style>
