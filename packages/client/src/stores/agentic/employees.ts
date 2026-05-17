import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createEmployee as apiCreateEmployee,
  checkEmployeeHealth as apiCheckEmployeeHealth,
  deployEmployee as apiDeployEmployee,
  deleteEmployee as apiDeleteEmployee,
  fetchEmployees,
  hideEmployee as apiHideEmployee,
  restoreEmployee as apiRestoreEmployee,
  selectEmployee as apiSelectEmployee,
  showEmployee as apiShowEmployee,
  startEmployee as apiStartEmployee,
  stopEmployee as apiStopEmployee,
  type CreateEmployeePayload,
  type Employee,
} from '@/api/agentic/employees'

export const useEmployeesStore = defineStore('employees', () => {
  const employees = ref<Employee[]>([])
  const currentEmployeeId = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const lastLoadedAt = ref(0)
  const cacheTtlMs = 10_000

  const currentEmployee = computed(() =>
    employees.value.find(employee => employee.id === currentEmployeeId.value && !employee.deletedAt)
    || employees.value.find(employee => !employee.deletedAt)
    || null,
  )

  const activeEmployees = computed(() => employees.value.filter(employee => !employee.deletedAt))
  const sidebarEmployees = computed(() => activeEmployees.value.filter(employee => (employee.visibility || 'visible') === 'visible'))
  const hiddenEmployees = computed(() => activeEmployees.value.filter(employee => employee.visibility === 'hidden'))
  const deletedEmployees = computed(() => employees.value.filter(employee => Boolean(employee.deletedAt)))

  function applyList(payload: { currentEmployeeId: string; employees: Employee[] }) {
    employees.value = payload.employees
    currentEmployeeId.value = payload.currentEmployeeId
    lastLoadedAt.value = Date.now()
  }

  function upsertEmployee(employee: Employee) {
    const index = employees.value.findIndex(item => item.id === employee.id)
    if (index === -1) employees.value.push(employee)
    else employees.value[index] = employee
  }

  async function loadEmployees(options: { force?: boolean } = {}) {
    if (!options.force && employees.value.length > 0 && Date.now() - lastLoadedAt.value < cacheTtlMs) {
      return
    }
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      applyList(await fetchEmployees())
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function createEmployee(payload: CreateEmployeePayload) {
    saving.value = true
    error.value = ''
    try {
      const employee = await apiCreateEmployee(payload)
      upsertEmployee(employee)
      lastLoadedAt.value = Date.now()
      return employee
    } finally {
      saving.value = false
    }
  }

  async function selectEmployee(id: string) {
    applyList(await apiSelectEmployee(id))
  }

  async function deployEmployee(id: string) {
    upsertEmployee(await apiDeployEmployee(id))
  }

  async function startEmployee(id: string) {
    upsertEmployee(await apiStartEmployee(id))
  }

  async function stopEmployee(id: string) {
    upsertEmployee(await apiStopEmployee(id))
  }

  async function checkEmployeeHealth(id: string) {
    const result = await apiCheckEmployeeHealth(id)
    upsertEmployee(result.employee)
    return result
  }

  async function hideEmployee(id: string) {
    upsertEmployee(await apiHideEmployee(id))
  }

  async function showEmployee(id: string) {
    upsertEmployee(await apiShowEmployee(id))
  }

  async function deleteEmployee(id: string) {
    upsertEmployee(await apiDeleteEmployee(id))
  }

  async function restoreEmployee(id: string) {
    upsertEmployee(await apiRestoreEmployee(id))
  }

  return {
    employees,
    activeEmployees,
    sidebarEmployees,
    hiddenEmployees,
    deletedEmployees,
    currentEmployeeId,
    currentEmployee,
    loading,
    saving,
    error,
    loadEmployees,
    createEmployee,
    selectEmployee,
    deployEmployee,
    startEmployee,
    stopEmployee,
    hideEmployee,
    showEmployee,
    deleteEmployee,
    restoreEmployee,
    checkEmployeeHealth,
  }
})
