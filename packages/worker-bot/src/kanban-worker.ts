import { mkdir as mkdirFs, readFile as readFileFs, writeFile as writeFileFs } from 'fs/promises'
import { join } from 'path'

export interface WorkerTask {
  taskId: string | null
  board: string
  traceId: string | null
}

export interface WorkerMessage {
  from: string
  content: string
}

export interface CompleteTaskOptions {
  taskId: string
  board: string
  content: string
  hermesBin: string
  botName: string
  execFile: ExecFile
}

export interface CompleteTaskResult {
  summary: string
}

export interface SplitChildTask {
  id?: string
  title: string
  body: string
}

export interface SplitPlan {
  skill: 'kanban.split'
  summary: string
  children: SplitChildTask[]
}

export interface SplitTaskOptions extends CompleteTaskOptions {
  concurrency?: number
}

export interface SplitTaskResult {
  summary: string
  children: Array<SplitChildTask & { id: string }>
  executedChild?: SplitChildTask & { id: string; summary: string; skill: string }
}

export interface KanbanListedTask {
  id: string
  title: string
  status: string
}

export interface ExecuteNextTaskResult {
  skill: 'kanban.execute_next'
  executedChild: KanbanListedTask & { summary: string; skill: string }
  remainingChildren: KanbanListedTask[]
  summary: string
}

export interface ExecuteAllTaskResult {
  skill: 'kanban.execute_all'
  executedChildren: Array<KanbanListedTask & { summary: string; skill: string }>
  remainingChildren: KanbanListedTask[]
  summary: string
}

export interface MemoryWriteOptions {
  content: string
  hermesHome: string
  writeFile?: (path: string, content: string, encoding: BufferEncoding) => Promise<unknown>
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>
  mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>
}

export interface MemoryWriteResult {
  skill: 'memory.write'
  memoryPath: string
  note: string
  summary: string
}

export interface MemoryWriteTaskResult {
  skill: 'memory.write'
  summary: string
  memoryPath: string
  note: string
}

export type ExecFile = (
  file: string,
  args: string[],
  options: {
    timeout: number
    maxBuffer: number
    env: NodeJS.ProcessEnv
  },
) => Promise<unknown>

function getStdout(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const stdout = (value as { stdout?: unknown }).stdout
  if (Buffer.isBuffer(stdout)) return stdout.toString('utf8')
  return stdout === undefined || stdout === null ? '' : String(stdout)
}

export function parseTask(content: string, defaultBoard = 'default'): WorkerTask {
  const taskId = content.match(/^kanban_task_id=(.+)$/m)?.[1]?.trim() || null
  const board = content.match(/^kanban_board=(.+)$/m)?.[1]?.trim() || defaultBoard
  const traceId = content.match(/\[agentic-task:([^\]]+)\]/)?.[1]?.trim() || null
  return { taskId, board, traceId }
}

export function cleanSummary(content: string): string {
  return content
    .split(/\r?\n/)
    .filter(line => !line.startsWith('[agentic-task:'))
    .filter(line => !line.startsWith('from='))
    .filter(line => !line.startsWith('kanban_task_id='))
    .filter(line => !line.startsWith('kanban_board='))
    .filter(line => !line.includes('请作为 worker-bot 处理下面的用户请求'))
    .join('\n')
    .trim()
}

export function buildCompletionSummary(content: string): string {
  return `worker-bot 已独立处理。\n${cleanSummary(content) || '任务已收到并处理。'}`
}

export function shouldSplitKanbanTask(content: string): boolean {
  return /(拆成|拆解|拆分|安排执行计划|执行计划|分解).*(任务|步骤|计划)|帮我把.*拆成任务/.test(content)
}

export function shouldExecuteFirstChildTask(content: string): boolean {
  return /(先|并|顺便)?执行第?一(步|个子任务|项)|先做第?一(步|个子任务|项)/.test(content)
}

export function shouldExecuteNextKanbanTask(content: string): boolean {
  if (shouldExecuteAllKanbanTasks(content)) return false
  return /(继续|接着|下一步|下一个).*(执行|处理|完成).*(剩余|下一个|子任务|任务)|继续执行剩余任务/.test(content)
}

export function shouldExecuteAllKanbanTasks(content: string): boolean {
  return /(执行|处理|完成).*(所有|全部|全部的|剩余全部|所有剩余).*(剩余|子任务|任务)|把.*(剩余|子任务|任务).*(全部|全都|都).*(执行|处理|完成).*(完)?/.test(content.trim())
}

export function shouldRunMemoryWrite(content: string): boolean {
  return /(请)?记住[:：]|写入记忆[:：]|保存到记忆[:：]|记录到记忆[:：]/.test(cleanSummary(content))
}

function extractMemoryNote(content: string): string {
  return cleanSummary(content)
    .replace(/^.*?(?:请)?记住[:：]\s*/, '')
    .replace(/^.*?写入记忆[:：]\s*/, '')
    .replace(/^.*?保存到记忆[:：]\s*/, '')
    .replace(/^.*?记录到记忆[:：]\s*/, '')
    .trim()
}

export async function runMemoryWrite(options: MemoryWriteOptions): Promise<MemoryWriteResult> {
  const note = extractMemoryNote(options.content)
  if (!note) throw new Error('memory.write note is empty')

  const mkdir = options.mkdir || mkdirFs
  const readFile = options.readFile || readFileFs
  const writeFile = options.writeFile || writeFileFs
  const memoryDir = join(options.hermesHome, 'memories')
  const memoryPath = join(memoryDir, 'MEMORY.md')

  await mkdir(memoryDir, { recursive: true })
  let existing = ''
  try {
    existing = await readFile(memoryPath, 'utf8')
  } catch {
    existing = ''
  }

  const entry = `- ${new Date().toISOString()} ${note}`
  const nextContent = [existing.trimEnd(), existing.trim() ? '' : '', entry, ''].join('\n')
  await writeFile(memoryPath, nextContent, 'utf8')

  return {
    skill: 'memory.write',
    memoryPath,
    note,
    summary: [
      'worker-bot 已执行 memory.write。',
      `写入位置：${memoryPath}`,
      `记忆内容：${note}`,
    ].join('\n'),
  }
}

function pickTopic(content: string): string {
  return cleanSummary(content)
    .replace(/^帮我把/, '')
    .replace(/拆成任务.*$/, '')
    .replace(/拆解成任务.*$/, '')
    .replace(/安排执行计划.*$/, '')
    .trim() || '当前任务'
}

export function buildSplitPlan(content: string): SplitPlan {
  const topic = pickTopic(content)
  const rawParts = topic
    .split(/[、，,；;和与]/)
    .map(part => part.trim())
    .filter(Boolean)
  const parts = rawParts.length >= 3 ? rawParts.slice(0, 5) : ['需求确认', '方案设计', '核心实现', '验证上线', '复盘交接']
  const children = parts.slice(0, 5).map((part, index) => ({
    title: `${index + 1}. ${part}`,
    body: [
      `父任务拆解来源：${topic}`,
      `执行目标：完成「${part}」相关工作。`,
      '验收标准：产出可检查结果，并在完成时回写说明。',
    ].join('\n'),
  }))
  while (children.length < 3) {
    const index = children.length
    children.push({
      title: `${index + 1}. ${topic} - 执行步骤 ${index + 1}`,
      body: `父任务拆解来源：${topic}\n验收标准：完成该步骤并回写结果。`,
    })
  }
  return {
    skill: 'kanban.split',
    summary: `已拆解为 ${children.length} 个子任务。`,
    children,
  }
}

export async function completeKanbanTask(options: CompleteTaskOptions): Promise<CompleteTaskResult> {
  const summary = buildCompletionSummary(options.content)
  await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'complete', options.taskId, '--summary', summary],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_PROFILE: options.botName },
    },
  )
  return { summary }
}

export async function completeMemoryWriteTask(options: CompleteTaskOptions & { hermesHome: string }): Promise<MemoryWriteTaskResult> {
  const memory = await runMemoryWrite({
    content: options.content,
    hermesHome: options.hermesHome,
  })
  await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'complete', options.taskId, '--summary', memory.summary],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_PROFILE: options.botName },
    },
  )
  return {
    skill: memory.skill,
    summary: memory.summary,
    memoryPath: memory.memoryPath,
    note: memory.note,
  }
}

export function buildMemoryWriteWorkerReply(content: string, task: WorkerTask, result: MemoryWriteTaskResult): string {
  return [
    buildWorkerReply(content, task, 'done'),
    'worker_skill=memory.write',
    `memory_path=${result.memoryPath}`,
    `memory_note=${result.note.replace(/\r?\n/g, ' ')}`,
    `memory_result=${result.summary.replace(/\r?\n/g, ' ')}`,
  ].join('\n')
}

export async function runStatusCheck(options: SplitTaskOptions): Promise<{ skill: 'status.check'; summary: string }> {
  const result = await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'list', '--json'],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_PROFILE: options.botName },
    },
  )
  const stdout = getStdout(result)
  let taskCount: number | null = null
  if (stdout) {
    const parsed = JSON.parse(stdout)
    taskCount = Array.isArray(parsed) ? parsed.length : null
  }

  return {
    skill: 'status.check',
    summary: [
      'worker-bot 已执行 status.check。',
      `HXA：已连接为 ${options.botName}，已收到 zylos-main 调度。`,
      `Hermes CLI：可调用（${options.hermesBin}）。`,
      `Kanban：${options.board} 可访问${taskCount === null ? '' : `，当前返回 ${taskCount} 个任务`}。`,
    ].join('\n'),
  }
}

function parseJsonObject(stdout: string): any {
  return stdout ? JSON.parse(stdout) : {}
}

function parseJsonArray(stdout: string): any[] {
  const parsed = stdout ? JSON.parse(stdout) : []
  return Array.isArray(parsed) ? parsed : []
}

function titleOrder(task: KanbanListedTask): number {
  const value = task.title.match(/^\s*(\d+)[\.\)、)\s]/)?.[1]
  return value ? Number(value) : Number.MAX_SAFE_INTEGER
}

function pickReadyChild(parent: { children?: string[] }, tasks: KanbanListedTask[]): {
  child: KanbanListedTask | null
  remaining: KanbanListedTask[]
} {
  const readyChildren = listReadyChildren(parent, tasks)
  return {
    child: readyChildren[0] || null,
    remaining: readyChildren.slice(1),
  }
}

function listReadyChildren(parent: { children?: string[] }, tasks: KanbanListedTask[]): KanbanListedTask[] {
  const childIds = Array.isArray(parent.children) ? parent.children : []
  const children = childIds
    .map(id => tasks.find(task => task.id === id))
    .filter((task): task is KanbanListedTask => Boolean(task))
  return children
    .filter(task => task.status === 'ready')
    .sort((a, b) => titleOrder(a) - titleOrder(b) || a.title.localeCompare(b.title, 'zh-Hans-CN') || a.id.localeCompare(b.id))
}

export async function executeNextKanbanTask(options: SplitTaskOptions): Promise<ExecuteNextTaskResult> {
  const execOptions = {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, HERMES_PROFILE: options.botName },
  }
  const parentResult = await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'show', options.taskId, '--json'],
    execOptions,
  )
  const parent = parseJsonObject(getStdout(parentResult))
  const listResult = await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'list', '--json'],
    execOptions,
  )
  const tasks = parseJsonArray(getStdout(listResult)) as KanbanListedTask[]
  const { child, remaining } = pickReadyChild(parent, tasks)
  if (!child) throw new Error(`No ready child task found for ${options.taskId}`)

  const statusCheck = await runStatusCheck(options)
  const childSummary = [
    `worker-bot 已执行 kanban.execute_next：${child.id} ${child.title}`,
    statusCheck.summary,
  ].join('\n')

  await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'complete', child.id, '--summary', childSummary],
    execOptions,
  )

  return {
    skill: 'kanban.execute_next',
    executedChild: {
      ...child,
      summary: childSummary,
      skill: statusCheck.skill,
    },
    remainingChildren: remaining,
    summary: childSummary,
  }
}

export async function executeAllKanbanTasks(options: SplitTaskOptions): Promise<ExecuteAllTaskResult> {
  const execOptions = {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, HERMES_PROFILE: options.botName },
  }
  const parentResult = await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'show', options.taskId, '--json'],
    execOptions,
  )
  const parent = parseJsonObject(getStdout(parentResult))
  const listResult = await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'list', '--json'],
    execOptions,
  )
  const tasks = parseJsonArray(getStdout(listResult)) as KanbanListedTask[]
  const readyChildren = listReadyChildren(parent, tasks)
  if (!readyChildren.length) throw new Error(`No ready child task found for ${options.taskId}`)

  const executeChild = async (child: KanbanListedTask): Promise<ExecuteAllTaskResult['executedChildren'][number]> => {
    const statusCheck = await runStatusCheck(options)
    const childSummary = [
      `worker-bot 已执行 kanban.execute_all：${child.id} ${child.title}`,
      statusCheck.summary,
    ].join('\n')
    await options.execFile(
      options.hermesBin,
      ['kanban', '--board', options.board, 'complete', child.id, '--summary', childSummary],
      execOptions,
    )
    return {
      ...child,
      summary: childSummary,
      skill: statusCheck.skill,
    }
  }
  const executedChildren = await runWithConcurrency(readyChildren, Math.max(1, Math.floor(options.concurrency || 1)), executeChild)

  const summary = [
    `worker-bot 已执行 kanban.execute_all，完成 ${executedChildren.length} 个子任务。`,
    ...executedChildren.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
  ].join('\n')

  return {
    skill: 'kanban.execute_all',
    executedChildren,
    remainingChildren: [],
    summary,
  }
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex])
    }
  }))

  return results
}

export async function splitKanbanTask(options: SplitTaskOptions): Promise<SplitTaskResult> {
  const plan = buildSplitPlan(options.content)
  const created: Array<SplitChildTask & { id: string }> = []

  for (const child of plan.children) {
    const result = await options.execFile(
      options.hermesBin,
      [
        'kanban',
        '--board',
        options.board,
        'create',
        child.title,
        '--body',
        child.body,
        '--assignee',
        options.botName,
        '--parent',
        options.taskId,
        '--tenant',
        'agentic',
        '--priority',
        '2',
        '--json',
      ],
      {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, HERMES_PROFILE: options.botName },
      },
    )
    const parsed = JSON.parse(getStdout(result) || '{}') as { id?: string; title?: string; body?: string }
    if (!parsed.id) throw new Error(`Failed to create child task for ${child.title}`)
    created.push({
      id: parsed.id,
      title: parsed.title || child.title,
      body: parsed.body || child.body,
    })
  }

  let executedChild: SplitTaskResult['executedChild']
  const shouldExecuteFirst = shouldExecuteFirstChildTask(options.content) && Boolean(created[0])
  const statusCheck = shouldExecuteFirst && created[0] ? await runStatusCheck(options) : null
  const childSummary = statusCheck?.summary || null

  const summary = [
    `worker-bot 已执行 kanban.split，创建 ${created.length} 个子任务。`,
    ...created.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
    ...(childSummary && created[0] ? ['', `已执行第一个子任务：${created[0].id} ${created[0].title}`] : []),
    '',
    childSummary ? '下一步：继续执行剩余子任务，完成后回写结果。' : '下一步：按子任务顺序逐项执行，完成后回写结果。',
  ].join('\n')

  await options.execFile(
    options.hermesBin,
    ['kanban', '--board', options.board, 'complete', options.taskId, '--summary', summary],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_PROFILE: options.botName },
    },
  )

  if (childSummary && created[0]) {
    await options.execFile(
      options.hermesBin,
      ['kanban', '--board', options.board, 'complete', created[0].id, '--summary', childSummary],
      {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, HERMES_PROFILE: options.botName },
      },
    )
    executedChild = {
      ...created[0],
      summary: childSummary,
      skill: statusCheck?.skill || 'manual.check',
    }
  }

  return { summary, children: created, executedChild }
}

export function shouldIgnoreMessage(message: WorkerMessage, botName: string): boolean {
  if (message.from === botName) return true
  return message.content.includes('[worker-reply]')
}

export function buildWorkerReply(content: string, task: WorkerTask, status: 'done' | 'complete_failed', error?: string): string {
  const lines = [
    `[worker-reply] 收到：${content}`,
    `kanban_status=${status}`,
  ]
  if (task.taskId) lines.push(`kanban_task_id=${task.taskId}`)
  lines.push(`kanban_board=${task.board}`)
  if (error) lines.push(`kanban_error=${error}`)
  return lines.join('\n')
}

export function buildSplitWorkerReply(content: string, task: WorkerTask, result: SplitTaskResult): string {
  const remaining = result.executedChild
    ? result.children.filter(child => child.id !== result.executedChild?.id)
    : result.children
  return [
    buildWorkerReply(content, task, 'done'),
    'worker_skill=kanban.split',
    'child_tasks:',
    ...result.children.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
    ...(result.executedChild
      ? [
          `executed_child_skill=${result.executedChild.skill}`,
          `executed_child_task=${result.executedChild.id} ${result.executedChild.title}`,
          `executed_child_result=${result.executedChild.summary.replace(/\r?\n/g, ' ')}`,
          'remaining_child_tasks:',
          ...remaining.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
          'next_step=继续执行剩余子任务，完成后回写结果。',
        ]
      : ['next_step=按子任务顺序逐项执行，完成后回写结果。']),
  ].join('\n')
}

export function buildExecuteNextWorkerReply(content: string, task: WorkerTask, result: ExecuteNextTaskResult): string {
  return [
    buildWorkerReply(content, task, 'done'),
    'worker_skill=kanban.execute_next',
    `executed_child_skill=${result.executedChild.skill}`,
    `executed_child_task=${result.executedChild.id} ${result.executedChild.title}`,
    `executed_child_result=${result.executedChild.summary.replace(/\r?\n/g, ' ')}`,
    'remaining_child_tasks:',
    ...result.remainingChildren.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
    result.remainingChildren.length
      ? 'next_step=继续执行剩余子任务，完成后回写结果。'
      : 'next_step=当前父任务下没有剩余 ready 子任务。',
  ].join('\n')
}

export function buildExecuteAllWorkerReply(content: string, task: WorkerTask, result: ExecuteAllTaskResult): string {
  return [
    buildWorkerReply(content, task, 'done'),
    'worker_skill=kanban.execute_all',
    'executed_child_tasks:',
    ...result.executedChildren.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
    `executed_child_result=${result.summary.replace(/\r?\n/g, ' ')}`,
    'remaining_child_tasks:',
    ...result.remainingChildren.map((child, index) => `${index + 1}. ${child.id} ${child.title}`),
    result.remainingChildren.length
      ? 'next_step=继续执行剩余子任务，完成后回写结果。'
      : 'next_step=当前父任务下没有剩余 ready 子任务。',
  ].join('\n')
}
