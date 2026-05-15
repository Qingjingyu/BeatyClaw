import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { logger } from '../logger'
import { completeTasks, createTask } from '../hermes/hermes-kanban'

interface RuntimeConfig {
  baseUrl: string
  token: string
  botName: string
  workerBot: string
  workerTimeoutMs: number
  workerPollIntervalMs: number
  model: string
  openaiBaseUrl: string
  openaiApiKey: string
  kanbanBoard: string
}

interface KanbanTaskContext {
  id: string
  title: string
  board: string
}

interface HxaSendResponse {
  channel_id: string
  message?: {
    id?: string
    created_at?: number
  }
}

interface HxaMessage {
  id?: string
  sender_name?: string
  sender_id?: string
  content?: string
  created_at?: number
}

let started = false
const rememberedKanbanTasks = new Map<string, KanbanTaskContext>()
let rememberedTasksLoaded = false

interface RememberedKanbanTaskStore {
  version: 1
  tasksBySender: Record<string, KanbanTaskContext>
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/v1$/, '')
}

function getRuntimeConfig(): RuntimeConfig | null {
  if (process.env.ZYLOS_MAIN_RUNTIME_ENABLED !== '1') return null

  const token = process.env.ZYLOS_MAIN_HXA_TOKEN?.trim()
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!token || !openaiApiKey) return null

  return {
    baseUrl: normalizeBaseUrl(process.env.ZYLOS_MAIN_HXA_BASE_URL || process.env.HXA_CONNECT_BASE_URL || 'http://127.0.0.1:4800'),
    token,
    botName: process.env.ZYLOS_MAIN_BOT_NAME || 'zylos-main',
    workerBot: process.env.ZYLOS_MAIN_WORKER_BOT || 'worker-bot',
    workerTimeoutMs: Number(process.env.ZYLOS_MAIN_WORKER_TIMEOUT_MS || 10000),
    workerPollIntervalMs: Number(process.env.ZYLOS_MAIN_WORKER_POLL_INTERVAL_MS || 1000),
    model: process.env.ZYLOS_MAIN_MODEL || process.env.AGENTIC_DEFAULT_MODEL || 'gpt-5.5',
    openaiBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || 'https://api.openai.com'),
    openaiApiKey,
    kanbanBoard: process.env.ZYLOS_MAIN_KANBAN_BOARD || 'default',
  }
}

async function hxaRequest<T>(config: RuntimeConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HXA ${path} failed with ${res.status}: ${text || res.statusText}`)
  return text ? JSON.parse(text) as T : ({} as T)
}

function extractHxaMessages(payload: any): HxaMessage[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.messages)) return payload.messages
  return []
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function buildWorkerTask(traceId: string, from: string, content: string, kanbanTask?: KanbanTaskContext | null): string {
  const lines = [
    `[agentic-task:${traceId}]`,
    `from=${from}`,
  ]
  if (kanbanTask) {
    lines.push(`kanban_task_id=${kanbanTask.id}`)
    lines.push(`kanban_board=${kanbanTask.board}`)
  }
  lines.push(
    '请作为 worker-bot 处理下面的用户请求，并回复处理结果。',
    content,
  )
  return lines.join('\n')
}

export function shouldCreateKanbanTask(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) return false
  return [
    /帮我.*(任务|安排|处理|做|完成)/,
    /(创建|新增|记录|添加|安排).*(任务|待办|事项)/,
    /(请)?记住[:：]|写入记忆[:：]|保存到记忆[:：]|记录到记忆[:：]/,
    /(拆成|拆解).*(任务|步骤|计划)/,
    /(明天|今天|本周|下周|月底|上线前).*(检查|处理|完成|跟进|安排)/,
  ].some(pattern => pattern.test(normalized))
}

export function resolveExplicitKanbanTask(content: string, defaultBoard: string): KanbanTaskContext | null {
  const taskId = content.match(/\b(t_[a-z0-9]+)\b/i)?.[1]?.trim()
  if (!taskId) return null
  const board = content.match(/(?:看板|board)[=：:\s]+([a-zA-Z0-9_-]+)/)?.[1]?.trim() || defaultBoard
  return { id: taskId, title: taskId, board }
}

export function shouldContinueRememberedKanbanTask(content: string): boolean {
  const normalized = content.trim()
  return /(继续|接着|下一步|下一个).*(执行|处理|完成).*(剩余|下一个|子任务|任务)|继续执行剩余任务/.test(normalized) ||
    /(执行|处理|完成).*(所有|全部|全部的|剩余全部|所有剩余).*(剩余|子任务|任务)|把.*(剩余|子任务|任务).*(全部|全都|都).*(执行|处理|完成).*(完)?/.test(normalized)
}

function getRememberedKanbanTaskStorePath(): string {
  const configuredPath = process.env.ZYLOS_MAIN_TASK_MEMORY_FILE?.trim()
  if (configuredPath) return configuredPath

  const hermesHome = process.env.HERMES_HOME?.trim() || join(process.cwd(), 'data', 'hermes')
  return join(hermesHome, 'agentic-task-memory.json')
}

function isKanbanTaskContext(value: unknown): value is KanbanTaskContext {
  const task = value as KanbanTaskContext
  return Boolean(task && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.board === 'string')
}

export function loadRememberedKanbanTasks(): void {
  rememberedTasksLoaded = true
  const storePath = getRememberedKanbanTaskStorePath()
  if (!existsSync(storePath)) return

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<RememberedKanbanTaskStore>
    const tasksBySender = parsed.tasksBySender || {}
    rememberedKanbanTasks.clear()
    for (const [sender, task] of Object.entries(tasksBySender)) {
      if (sender && isKanbanTaskContext(task)) rememberedKanbanTasks.set(sender, task)
    }
  } catch (err) {
    logger.warn({ err, storePath }, '[zylos-main-runtime] failed to load remembered kanban tasks')
  }
}

function ensureRememberedKanbanTasksLoaded(): void {
  if (!rememberedTasksLoaded) loadRememberedKanbanTasks()
}

function persistRememberedKanbanTasks(): void {
  const storePath = getRememberedKanbanTaskStorePath()
  const tasksBySender = Object.fromEntries(rememberedKanbanTasks.entries())
  const store: RememberedKanbanTaskStore = { version: 1, tasksBySender }

  try {
    mkdirSync(dirname(storePath), { recursive: true })
    writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch (err) {
    logger.warn({ err, storePath }, '[zylos-main-runtime] failed to persist remembered kanban tasks')
  }
}

export function rememberKanbanTaskForSender(sender: string, task: KanbanTaskContext | null): void {
  if (!sender || !task) return
  rememberedKanbanTasks.set(sender, task)
  rememberedTasksLoaded = true
  persistRememberedKanbanTasks()
}

export function clearRememberedKanbanTasks(): void {
  rememberedKanbanTasks.clear()
  rememberedTasksLoaded = true
}

export function resetRememberedKanbanTaskCacheForTest(): void {
  rememberedKanbanTasks.clear()
  rememberedTasksLoaded = false
}

export function resolveKanbanTaskForRequest(sender: string, content: string, defaultBoard: string): KanbanTaskContext | null {
  const explicitTask = resolveExplicitKanbanTask(content, defaultBoard)
  if (explicitTask) return explicitTask
  if (!shouldContinueRememberedKanbanTask(content)) return null
  ensureRememberedKanbanTasksLoaded()
  return rememberedKanbanTasks.get(sender) || null
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map(line => line.trim()).find(Boolean) || value.trim()
}

export function buildKanbanTaskDraft(from: string, content: string, workerResult: string | null): {
  title: string
  body: string
  assignee: string
  priority: number
  tenant: string
} {
  const title = firstLine(content).slice(0, 80)
  return {
    title,
    body: [
      `来源：${from}`,
      '',
      '用户请求：',
      content,
      '',
      'worker-bot 返回：',
      workerResult || 'worker-bot 暂未返回。',
    ].join('\n'),
    assignee: 'worker-bot',
    priority: 2,
    tenant: 'agentic',
  }
}

async function createKanbanTaskFromRequest(config: RuntimeConfig, from: string, content: string, workerResult: string | null): Promise<KanbanTaskContext | null> {
  const resolvedTask = resolveKanbanTaskForRequest(from, content, config.kanbanBoard)
  if (resolvedTask) {
    rememberKanbanTaskForSender(from, resolvedTask)
    return resolvedTask
  }
  if (!shouldCreateKanbanTask(content)) return null

  try {
    const draft = buildKanbanTaskDraft(from, content, workerResult)
    const task = await createTask(draft.title, {
      board: config.kanbanBoard,
      body: draft.body,
      assignee: draft.assignee,
      priority: draft.priority,
      tenant: draft.tenant,
    })
    const context = { id: task.id, title: task.title, board: config.kanbanBoard }
    rememberKanbanTaskForSender(from, context)
    return context
  } catch (err) {
    logger.error({ err }, '[zylos-main-runtime] failed to create kanban task')
    return null
  }
}

function stripWorkerProtocol(value: string): string {
  return value
    .split(/\r?\n/)
    .filter(line => !line.includes('[worker-reply] 收到：[agentic-task:'))
    .filter(line => !line.startsWith('[agentic-task:'))
    .filter(line => !line.startsWith('from='))
    .filter(line => !line.startsWith('kanban_task_id='))
    .filter(line => !line.startsWith('kanban_board='))
    .filter(line => !line.includes('请作为 worker-bot 处理下面的用户请求'))
    .join('\n')
    .trim()
}

export function buildKanbanCompletionSummary(workerResult: string | null): string {
  const cleaned = workerResult ? stripWorkerProtocol(workerResult) : ''
  return [
    'worker-bot 已处理。',
    cleaned || 'worker-bot 已返回结果，但没有提供额外摘要。',
  ].join('\n')
}

async function completeKanbanTask(config: RuntimeConfig, kanbanTask: KanbanTaskContext | null, workerResult: string | null): Promise<void> {
  if (!kanbanTask || !workerResult) return
  if (!shouldMainCompleteKanbanTask(workerResult)) return

  try {
    await completeTasks([kanbanTask.id], buildKanbanCompletionSummary(workerResult), { board: kanbanTask.board })
  } catch (err) {
    logger.error({ err, taskId: kanbanTask.id }, '[zylos-main-runtime] failed to complete kanban task')
  }
}

export function shouldMainCompleteKanbanTask(workerResult: string | null): boolean {
  if (!workerResult) return false
  return !workerResult.includes('kanban_status=done')
}

function findWorkerReply(messages: HxaMessage[], workerBot: string, traceId: string, sinceCreatedAt: number): HxaMessage | null {
  return messages
    .filter(message => {
      const sender = message.sender_name || message.sender_id || ''
      const content = String(message.content || '')
      return sender === workerBot &&
        content.includes(`[agentic-task:${traceId}]`) &&
        Number(message.created_at || 0) >= sinceCreatedAt
    })
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0] || null
}

async function dispatchWorkerTask(config: RuntimeConfig, from: string, content: string, kanbanTask?: KanbanTaskContext | null): Promise<string | null> {
  const traceId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const sent = await hxaRequest<HxaSendResponse>(config, '/api/send', {
    method: 'POST',
    body: JSON.stringify({
      to: config.workerBot,
      content: buildWorkerTask(traceId, from, content, kanbanTask),
    }),
  })
  const channelId = sent.channel_id
  const createdAt = Number(sent.message?.created_at || Date.now())
  if (!channelId) return null

  const deadline = Date.now() + config.workerTimeoutMs
  while (Date.now() <= deadline) {
    const payload = await hxaRequest(config, `/api/channels/${encodeURIComponent(channelId)}/messages?limit=20`)
    const reply = findWorkerReply(extractHxaMessages(payload), config.workerBot, traceId, createdAt)
    if (reply?.content) return String(reply.content)
    await sleep(config.workerPollIntervalMs)
  }

  return null
}

export function buildMainAgentMessages(
  from: string,
  content: string,
  workerResult: string | null,
  kanbanTask?: KanbanTaskContext | null,
): Array<{ role: string; content: string }> {
  return [
    {
      role: 'system',
      content: [
        '你是 Agentic 的 zylos-main 主 Agent。',
        '你负责接收用户入口发来的请求，并协调 worker-bot 完成任务。',
        '如果 worker-bot 已返回结果，要基于 worker 结果给用户做清晰汇总。',
        '回复要简短、直接、中文。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `来自 ${from} 的请求：`,
        content,
        '',
        'worker-bot 返回：',
        workerResult || 'worker-bot 在本次超时时间内没有返回结果，请基于用户请求直接回复，并说明 worker 暂未返回。',
        '',
        '看板任务：',
        kanbanTask ? `${kanbanTask.id} / ${kanbanTask.title} / board=${kanbanTask.board}` : '本次没有创建看板任务。',
      ].join('\n'),
    },
  ]
}

export function buildFallbackReply(content: string, workerResult: string | null, kanbanTask: KanbanTaskContext | null): string {
  return [
    'worker-bot 已处理本次请求，但 GPT-5.5 当前暂时不可用，先返回已确认的执行状态。',
    '',
    `用户请求：${content}`,
    '',
    'worker-bot 返回：',
    workerResult || 'worker-bot 暂未返回。',
    '',
    '看板任务：',
    kanbanTask ? `${kanbanTask.id} / ${kanbanTask.title} / board=${kanbanTask.board}` : '本次没有创建看板任务。',
  ].join('\n')
}

function parseWorkerLine(workerResult: string, key: string): string | null {
  const value = workerResult.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
  return value || null
}

function parseChildTasks(workerResult: string): string[] {
  return parseListBlock(workerResult, 'child_tasks:', ['next_step=', 'executed_child_task=', 'remaining_child_tasks:'])
}

function parseListBlock(workerResult: string, marker: string, stopPrefixes: string[]): string[] {
  const lines = workerResult.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === marker)
  if (start < 0) return []
  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (stopPrefixes.some(prefix => trimmed.startsWith(prefix))) break
    if (/^\d+\.\s+/.test(trimmed)) items.push(trimmed)
  }
  return items
}

export function buildDeterministicReply(content: string, workerResult: string | null, kanbanTask: KanbanTaskContext | null): string | null {
  if (!workerResult) return null
  if (workerResult.includes('worker_skill=memory.write')) {
    const memoryPath = parseWorkerLine(workerResult, 'memory_path') || '未知'
    const memoryNote = parseWorkerLine(workerResult, 'memory_note') || 'worker-bot 已写入记忆。'
    const memoryResult = parseWorkerLine(workerResult, 'memory_result')
    const status = parseWorkerLine(workerResult, 'kanban_status') || 'done'
    return [
      '记忆已写入。',
      '',
      `- 任务 ID：${kanbanTask?.id || parseWorkerLine(workerResult, 'kanban_task_id') || '未知'}`,
      `- 看板：${kanbanTask?.board || parseWorkerLine(workerResult, 'kanban_board') || 'default'}`,
      `- 状态：${status}`,
      `- 写入位置：${memoryPath}`,
      `- 记忆内容：${memoryNote}`,
      ...(memoryResult ? ['', `执行结果：${memoryResult}`] : []),
      '',
      `原始请求：${content}`,
    ].join('\n')
  }
  if (workerResult.includes('worker_skill=kanban.execute_all')) {
    const executedChildren = parseListBlock(workerResult, 'executed_child_tasks:', ['executed_child_result=', 'remaining_child_tasks:', 'next_step='])
    const executedResult = parseWorkerLine(workerResult, 'executed_child_result')
    const remainingChildren = parseListBlock(workerResult, 'remaining_child_tasks:', ['next_step='])
    const nextStep = parseWorkerLine(workerResult, 'next_step') || '当前父任务下没有剩余 ready 子任务。'
    const status = parseWorkerLine(workerResult, 'kanban_status') || 'done'
    return [
      '已执行所有剩余子任务。',
      '',
      `- 父任务 ID：${kanbanTask?.id || parseWorkerLine(workerResult, 'kanban_task_id') || '未知'}`,
      `- 看板：${kanbanTask?.board || parseWorkerLine(workerResult, 'kanban_board') || 'default'}`,
      `- 状态：${status}`,
      '',
      '已执行子任务：',
      ...(executedChildren.length ? executedChildren.map(child => `- ${child}`) : ['- worker-bot 已执行，但没有返回子任务列表。']),
      ...(executedResult ? ['', `执行结果：${executedResult}`] : []),
      ...(remainingChildren.length ? ['', '剩余子任务：', ...remainingChildren.map(child => `- ${child}`)] : []),
      '',
      `下一步：${nextStep.replace(/^下一步[:：]\s*/, '')}`,
      '',
      `原始请求：${content}`,
    ].join('\n')
  }
  if (workerResult.includes('worker_skill=kanban.execute_next')) {
    const executedSkill = parseWorkerLine(workerResult, 'executed_child_skill')
    const executedChild = parseWorkerLine(workerResult, 'executed_child_task')
    const executedResult = parseWorkerLine(workerResult, 'executed_child_result')
    const remainingChildren = parseListBlock(workerResult, 'remaining_child_tasks:', ['next_step='])
    const nextStep = parseWorkerLine(workerResult, 'next_step') || '继续执行剩余子任务，完成后回写结果。'
    const status = parseWorkerLine(workerResult, 'kanban_status') || 'done'
    return [
      '已执行下一个子任务。',
      '',
      `- 父任务 ID：${kanbanTask?.id || parseWorkerLine(workerResult, 'kanban_task_id') || '未知'}`,
      `- 看板：${kanbanTask?.board || parseWorkerLine(workerResult, 'kanban_board') || 'default'}`,
      `- 状态：${status}`,
      ...(executedSkill ? ['', `执行技能：${executedSkill}`] : []),
      ...(executedChild ? ['', `已执行子任务：${executedChild}`] : []),
      ...(executedResult ? [`执行结果：${executedResult}`] : []),
      ...(remainingChildren.length ? ['', '剩余子任务：', ...remainingChildren.map(child => `- ${child}`)] : []),
      '',
      `下一步：${nextStep.replace(/^下一步[:：]\s*/, '')}`,
      '',
      `原始请求：${content}`,
    ].join('\n')
  }
  if (!workerResult.includes('worker_skill=kanban.split')) return null
  const children = parseChildTasks(workerResult)
  const executedSkill = parseWorkerLine(workerResult, 'executed_child_skill')
  const executedChild = parseWorkerLine(workerResult, 'executed_child_task')
  const executedResult = parseWorkerLine(workerResult, 'executed_child_result')
  const remainingChildren = parseListBlock(workerResult, 'remaining_child_tasks:', ['next_step='])
  const nextStep = parseWorkerLine(workerResult, 'next_step') || '按子任务顺序逐项执行，完成后回写结果。'
  const status = parseWorkerLine(workerResult, 'kanban_status') || 'done'
  return [
    '任务已拆解并写入看板。',
    '',
    `- 父任务 ID：${kanbanTask?.id || parseWorkerLine(workerResult, 'kanban_task_id') || '未知'}`,
    `- 看板：${kanbanTask?.board || parseWorkerLine(workerResult, 'kanban_board') || 'default'}`,
    `- 状态：${status}`,
    '',
    '子任务：',
    ...(children.length ? children.map(child => `- ${child}`) : ['- worker-bot 已拆解，但没有返回子任务列表。']),
    ...(executedSkill ? ['', `执行技能：${executedSkill}`] : []),
    ...(executedChild ? ['', `已执行第一步：${executedChild}`] : []),
    ...(executedResult ? [`执行结果：${executedResult}`] : []),
    ...(remainingChildren.length ? ['', '剩余子任务：', ...remainingChildren.map(child => `- ${child}`)] : []),
    '',
    `下一步：${nextStep.replace(/^下一步[:：]\s*/, '')}`,
    '',
    `原始请求：${content}`,
  ].join('\n')
}

async function createReply(
  config: RuntimeConfig,
  from: string,
  content: string,
  workerResult: string | null,
  kanbanTask: KanbanTaskContext | null,
): Promise<string> {
  const deterministicReply = buildDeterministicReply(content, workerResult, kanbanTask)
  if (deterministicReply) return deterministicReply

  const res = await fetch(`${config.openaiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: buildMainAgentMessages(from, content, workerResult, kanbanTask),
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    logger.error(
      { status: res.status, body: text || res.statusText },
      '[zylos-main-runtime] GPT reply failed, using fallback reply',
    )
    return buildFallbackReply(content, workerResult, kanbanTask)
  }
  const parsed = text ? JSON.parse(text) : {}
  return parsed.choices?.[0]?.message?.content?.trim() || '我收到消息了，但没有生成有效回复。'
}

export async function startZylosMainRuntime(): Promise<void> {
  if (started) return
  const runtimeConfig = getRuntimeConfig()
  if (!runtimeConfig) {
    logger.info('[zylos-main-runtime] disabled or missing token/key')
    return
  }
  const config: RuntimeConfig = runtimeConfig

  started = true
  const WebSocket = (await import('ws')).default

  async function connect() {
    try {
      const ticketRes = await hxaRequest<{ ticket: string }>(config, '/api/ws-ticket', { method: 'POST', body: '{}' })
      const wsBase = config.baseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
      const ws = new WebSocket(`${wsBase}/ws?ticket=${encodeURIComponent(ticketRes.ticket)}`)

      ws.on('open', () => logger.info('[zylos-main-runtime] connected as %s', config.botName))
      ws.on('message', async (raw) => {
        let event: any
        try {
          event = JSON.parse(String(raw))
        } catch {
          return
        }
        if (event.type !== 'message') return

        const from = event.sender_name || event.message?.sender_name || event.message?.sender_id || ''
        const content = String(event.message?.content || '').trim()
        if (!content || from === config.botName) return
        if (content.startsWith('[worker-reply]') || content.startsWith('[worker-online]')) return

        try {
          const kanbanTask = await createKanbanTaskFromRequest(config, from, content, null)
          const workerResult = await dispatchWorkerTask(config, from, content, kanbanTask)
          if (kanbanTask && workerResult?.includes('worker_skill=kanban.split')) {
            rememberKanbanTaskForSender(from, kanbanTask)
          }
          await completeKanbanTask(config, kanbanTask, workerResult)
          const reply = await createReply(config, from, content, workerResult, kanbanTask)
          await hxaRequest(config, '/api/send', {
            method: 'POST',
            body: JSON.stringify({ to: from, content: reply }),
          })
        } catch (err) {
          logger.error({ err }, '[zylos-main-runtime] failed to reply')
        }
      })
      ws.on('close', () => {
        logger.warn('[zylos-main-runtime] ws closed, reconnecting')
        setTimeout(connect, 2000).unref()
      })
      ws.on('error', err => logger.error({ err }, '[zylos-main-runtime] ws error'))
    } catch (err) {
      logger.error({ err }, '[zylos-main-runtime] connect failed')
      setTimeout(connect, 5000).unref()
    }
  }

  await connect()
}
