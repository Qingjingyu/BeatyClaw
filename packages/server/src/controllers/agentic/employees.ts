import {
  checkEmployeeHealth,
  createEmployee,
  deployEmployee,
  getCurrentEmployee,
  getEmployee,
  hideEmployee,
  listEmployees,
  restoreEmployee,
  selectEmployee,
  showEmployee,
  softDeleteEmployee,
  startEmployee,
  stopEmployee,
  updateEmployee,
} from '../../services/agentic/employees'

function body(ctx: any): Record<string, any> {
  return (ctx.request?.body || {}) as Record<string, any>
}

function idParam(ctx: any): string {
  return String(ctx.params?.id || '').trim()
}

async function handle(ctx: any, fn: () => Promise<unknown>) {
  try {
    ctx.body = await fn()
  } catch (err) {
    ctx.status = err instanceof Error && err.message === 'Employee not found' ? 404 : 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function list(ctx: any) {
  await handle(ctx, listEmployees)
}

export async function current(ctx: any) {
  await handle(ctx, getCurrentEmployee)
}

export async function detail(ctx: any) {
  await handle(ctx, () => getEmployee(idParam(ctx)))
}

export async function create(ctx: any) {
  await handle(ctx, () => createEmployee(body(ctx) as any))
  if (!ctx.status) ctx.status = 201
}

export async function update(ctx: any) {
  await handle(ctx, () => updateEmployee(idParam(ctx), body(ctx) as any))
}

export async function hide(ctx: any) {
  await handle(ctx, () => hideEmployee(idParam(ctx)))
}

export async function show(ctx: any) {
  await handle(ctx, () => showEmployee(idParam(ctx)))
}

export async function remove(ctx: any) {
  await handle(ctx, () => softDeleteEmployee(idParam(ctx)))
}

export async function restore(ctx: any) {
  await handle(ctx, () => restoreEmployee(idParam(ctx)))
}

export async function deploy(ctx: any) {
  await handle(ctx, () => deployEmployee(idParam(ctx)))
}

export async function start(ctx: any) {
  await handle(ctx, () => startEmployee(idParam(ctx)))
}

export async function stop(ctx: any) {
  await handle(ctx, () => stopEmployee(idParam(ctx)))
}

export async function health(ctx: any) {
  await handle(ctx, () => checkEmployeeHealth(idParam(ctx)))
}

export async function select(ctx: any) {
  await handle(ctx, () => selectEmployee(idParam(ctx)))
}
