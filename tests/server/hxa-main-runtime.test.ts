import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildMainAgentMessages,
  buildKanbanTaskDraft,
  buildFallbackReply,
  buildKanbanCompletionSummary,
  buildDeterministicReply,
  clearRememberedKanbanTasks,
  resetRememberedKanbanTaskCacheForTest,
  rememberKanbanTaskForSender,
  resolveExplicitKanbanTask,
  resolveKanbanTaskForRequest,
  buildWorkerTask,
  shouldDispatchWorker,
  shouldMainCompleteKanbanTask,
  shouldCreateKanbanTask,
} from '../../packages/server/src/services/agentic/hxa-main-runtime'

const originalMemoryFile = process.env.ZYLOS_MAIN_TASK_MEMORY_FILE

afterEach(() => {
  if (originalMemoryFile) {
    process.env.ZYLOS_MAIN_TASK_MEMORY_FILE = originalMemoryFile
  } else {
    delete process.env.ZYLOS_MAIN_TASK_MEMORY_FILE
  }
  clearRememberedKanbanTasks()
})

describe('zylos-main hxa runtime', () => {
  it('builds worker task with a trace id that worker replies can echo', () => {
    const task = buildWorkerTask('trace-1', 'agentic-client', '整理今天的任务')

    expect(task).toContain('[agentic-task:trace-1]')
    expect(task).toContain('from=agentic-client')
    expect(task).toContain('整理今天的任务')
    expect(task).not.toContain('[worker-reply]')
  })

  it('includes kanban task id in worker task when the task was persisted first', () => {
    const task = buildWorkerTask('trace-1', 'agentic-client', '整理今天的任务', { id: 'task-123', title: '整理今天的任务', board: 'default' })

    expect(task).toContain('[agentic-task:trace-1]')
    expect(task).toContain('kanban_task_id=task-123')
    expect(task).toContain('kanban_board=default')
  })

  it('resolves an explicit parent kanban task id for continue-execution requests', () => {
    const task = resolveExplicitKanbanTask('继续执行剩余任务，父任务是 t_957c24fa', 'default')

    expect(task).toEqual({ id: 't_957c24fa', title: 't_957c24fa', board: 'default' })
  })

  it('reuses the latest remembered parent task for continue-execution requests', () => {
    clearRememberedKanbanTasks()
    rememberKanbanTaskForSender('agentic-client', { id: 't_parent123', title: '父任务', board: 'default' })

    const task = resolveKanbanTaskForRequest('agentic-client', '继续执行剩余任务', 'default')

    expect(task).toEqual({ id: 't_parent123', title: '父任务', board: 'default' })
  })

  it('reuses the latest remembered parent task for execute-all requests', () => {
    clearRememberedKanbanTasks()
    rememberKanbanTaskForSender('agentic-client', { id: 't_parent789', title: '父任务', board: 'default' })

    const task = resolveKanbanTaskForRequest('agentic-client', '执行所有剩余任务', 'default')

    expect(task).toEqual({ id: 't_parent789', title: '父任务', board: 'default' })
  })

  it('persists the latest remembered parent task across runtime cache resets', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'agentic-task-memory-'))
    process.env.ZYLOS_MAIN_TASK_MEMORY_FILE = join(tmpDir, 'memory.json')

    try {
      clearRememberedKanbanTasks()
      rememberKanbanTaskForSender('agentic-client', { id: 't_parent456', title: '父任务', board: 'default' })
      resetRememberedKanbanTaskCacheForTest()

      const task = resolveKanbanTaskForRequest('agentic-client', '继续执行剩余任务', 'default')

      expect(task).toEqual({ id: 't_parent456', title: '父任务', board: 'default' })
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does not reuse remembered task for unrelated chat messages', () => {
    clearRememberedKanbanTasks()
    rememberKanbanTaskForSender('agentic-client', { id: 't_parent123', title: '父任务', board: 'default' })

    expect(resolveKanbanTaskForRequest('agentic-client', '你好，今天怎么样', 'default')).toBeNull()
  })

  it('summarizes with worker-bot result instead of ignoring the worker output', () => {
    const messages = buildMainAgentMessages(
      'agentic-client',
      '查一下当前状态',
      '[worker-reply] 收到：[agentic-task:trace-1] 当前状态正常',
    )

    expect(messages[0].content).toContain('协调 worker-bot')
    expect(messages[1].content).toContain('查一下当前状态')
    expect(messages[1].content).toContain('worker-bot 返回')
    expect(messages[1].content).toContain('当前状态正常')
  })

  it('builds normal chat context without pretending worker-bot timed out', () => {
    const messages = buildMainAgentMessages(
      'agentic-client',
      '你是谁',
      null,
      null,
    )

    expect(messages[0].content).toContain('普通问答直接回答')
    expect(messages[1].content).toContain('本次是普通对话，没有派发 worker-bot')
    expect(messages[1].content).not.toContain('超时时间')
  })

  it('detects actionable requests that should be captured as kanban tasks', () => {
    expect(shouldCreateKanbanTask('帮我把官网改版拆成任务')).toBe(true)
    expect(shouldCreateKanbanTask('记录一下：明天检查微信连接')).toBe(true)
    expect(shouldCreateKanbanTask('请记住：Agentic 默认模型是 GPT-5.5')).toBe(true)
    expect(shouldCreateKanbanTask('你好，今天怎么样')).toBe(false)
  })

  it('dispatches worker-bot only for actionable work, not normal chat', () => {
    expect(shouldDispatchWorker('你好')).toBe(false)
    expect(shouldDispatchWorker('你是谁')).toBe(false)
    expect(shouldDispatchWorker('帮我把官网改版拆成任务')).toBe(true)
    expect(shouldDispatchWorker('继续执行剩余任务')).toBe(true)
    expect(shouldDispatchWorker('继续执行 t_957c24fa')).toBe(true)
  })

  it('builds a kanban task draft from user request and worker result', () => {
    const draft = buildKanbanTaskDraft(
      'agentic-client',
      '帮我把官网改版拆成任务，先做登录页',
      '[worker-reply] 已拆解登录页优先级',
    )

    expect(draft.title).toBe('帮我把官网改版拆成任务，先做登录页')
    expect(draft.body).toContain('来源：agentic-client')
    expect(draft.body).toContain('用户请求：')
    expect(draft.body).toContain('worker-bot 返回：')
    expect(draft.assignee).toBe('worker-bot')
    expect(draft.priority).toBe(2)
    expect(draft.tenant).toBe('agentic')
  })

  it('includes kanban task id in main agent context when a task is persisted', () => {
    const messages = buildMainAgentMessages(
      'agentic-client',
      '帮我创建一个任务',
      '[worker-reply] 已处理',
      { id: 'task-123', title: '帮我创建一个任务', board: 'default' },
    )

    expect(messages[1].content).toContain('看板任务：')
    expect(messages[1].content).toContain('task-123')
    expect(messages[1].content).toContain('default')
  })

  it('builds a fallback reply when GPT is unavailable after worker returns', () => {
    const reply = buildFallbackReply(
      '帮我记录一个任务',
      '[worker-reply] 收到：[agentic-task:trace-1] 已记录请求',
      { id: 'task-123', title: '帮我记录一个任务', board: 'default' },
    )

    expect(reply).toContain('worker-bot 已处理')
    expect(reply).toContain('task-123')
    expect(reply).toContain('GPT-5.5')
  })

  it('builds a plain fallback reply for normal chat without worker noise', () => {
    const reply = buildFallbackReply('你好', null, null)

    expect(reply).toContain('我收到你的消息了')
    expect(reply).toContain('当前 GPT 回复服务暂时不可用')
    expect(reply).not.toContain('worker-bot')
  })

  it('builds a kanban completion summary from worker result', () => {
    const summary = buildKanbanCompletionSummary('[worker-reply] 收到：[agentic-task:trace-1]\n已检查微信连接配置')

    expect(summary).toContain('worker-bot 已处理')
    expect(summary).toContain('已检查微信连接配置')
    expect(summary).not.toContain('[agentic-task:trace-1]')
  })

  it('does not let zylos-main complete kanban tasks when worker reports completion', () => {
    expect(shouldMainCompleteKanbanTask('[worker-reply] 收到\nkanban_status=done')).toBe(false)
    expect(shouldMainCompleteKanbanTask('[worker-reply] 收到')).toBe(true)
  })

  it('builds a deterministic chat reply when worker returns kanban.split child tasks', () => {
    const reply = buildDeterministicReply(
      '帮我把 Agentic 拆成任务',
      [
        '[worker-reply] 收到：[agentic-task:trace-1]',
        'kanban_status=done',
        'kanban_task_id=parent-1',
        'kanban_board=default',
        'worker_skill=kanban.split',
        'child_tasks:',
        '1. child-1 登录',
        '2. child-2 对话',
        '3. child-3 看板',
        'next_step=按子任务顺序逐项执行，完成后回写结果。',
      ].join('\n'),
      { id: 'parent-1', title: '帮我把 Agentic 拆成任务', board: 'default' },
    )

    expect(reply).toContain('父任务 ID：parent-1')
    expect(reply).toContain('状态：done')
    expect(reply).toContain('child-1 登录')
    expect(reply).toContain('下一步：按子任务顺序逐项执行')
  })

  it('builds a deterministic chat reply when worker executes the first child task', () => {
    const reply = buildDeterministicReply(
      '帮我把 Agentic 拆成任务并先执行第一步',
      [
        '[worker-reply] 收到：[agentic-task:trace-1]',
        'kanban_status=done',
        'kanban_task_id=parent-1',
        'kanban_board=default',
        'worker_skill=kanban.split',
        'child_tasks:',
        '1. child-1 登录',
        '2. child-2 对话',
        '3. child-3 看板',
        'executed_child_skill=status.check',
        'executed_child_task=child-1 登录',
        'executed_child_result=worker-bot 已执行 status.check。 HXA：已连接 Hermes CLI：可调用 Kanban：default 可访问',
        'remaining_child_tasks:',
        '1. child-2 对话',
        '2. child-3 看板',
        'next_step=继续执行剩余子任务，完成后回写结果。',
      ].join('\n'),
      { id: 'parent-1', title: '帮我把 Agentic 拆成任务并先执行第一步', board: 'default' },
    )

    expect(reply).toContain('父任务 ID：parent-1')
    expect(reply).toContain('执行技能：status.check')
    expect(reply).toContain('已执行第一步：child-1 登录')
    expect(reply).toContain('执行结果：worker-bot 已执行 status.check')
    expect(reply).toContain('剩余子任务：')
    expect(reply).toContain('child-2 对话')
    expect(reply).toContain('下一步：继续执行剩余子任务')
  })

  it('builds a deterministic chat reply when worker executes the next child task', () => {
    const reply = buildDeterministicReply(
      '继续执行剩余任务',
      [
        '[worker-reply] 收到：[agentic-task:trace-1]',
        'kanban_status=done',
        'kanban_task_id=parent-1',
        'kanban_board=default',
        'worker_skill=kanban.execute_next',
        'executed_child_skill=status.check',
        'executed_child_task=child-2 对话链路',
        'executed_child_result=worker-bot 已执行 kanban.execute_next：child-2 对话链路 worker-bot 已执行 status.check。',
        'remaining_child_tasks:',
        '1. child-3 看板写回',
        'next_step=继续执行剩余子任务，完成后回写结果。',
      ].join('\n'),
      { id: 'parent-1', title: '继续执行剩余任务', board: 'default' },
    )

    expect(reply).toContain('已执行下一个子任务。')
    expect(reply).toContain('父任务 ID：parent-1')
    expect(reply).toContain('执行技能：status.check')
    expect(reply).toContain('已执行子任务：child-2 对话链路')
    expect(reply).toContain('剩余子任务：')
    expect(reply).toContain('child-3 看板写回')
  })

  it('builds a deterministic chat reply when worker executes all remaining child tasks', () => {
    const reply = buildDeterministicReply(
      '执行所有剩余任务',
      [
        '[worker-reply] 收到：[agentic-task:trace-1]',
        'kanban_status=done',
        'kanban_task_id=parent-1',
        'kanban_board=default',
        'worker_skill=kanban.execute_all',
        'executed_child_tasks:',
        '1. child-2 对话链路',
        '2. child-3 看板写回',
        'executed_child_result=worker-bot 已执行 kanban.execute_all，完成 2 个子任务。',
        'remaining_child_tasks:',
        'next_step=当前父任务下没有剩余 ready 子任务。',
      ].join('\n'),
      { id: 'parent-1', title: '执行所有剩余任务', board: 'default' },
    )

    expect(reply).toContain('已执行所有剩余子任务。')
    expect(reply).toContain('父任务 ID：parent-1')
    expect(reply).toContain('child-2 对话链路')
    expect(reply).toContain('child-3 看板写回')
    expect(reply).toContain('执行结果：worker-bot 已执行 kanban.execute_all')
    expect(reply).toContain('下一步：当前父任务下没有剩余 ready 子任务。')
  })

  it('builds a deterministic chat reply when worker writes memory', () => {
    const reply = buildDeterministicReply(
      '请记住：Agentic 默认模型是 GPT-5.5',
      [
        '[worker-reply] 收到：[agentic-task:trace-1]',
        'kanban_status=done',
        'kanban_task_id=memory-task-1',
        'kanban_board=default',
        'worker_skill=memory.write',
        'memory_path=/home/agent/.hermes/memories/MEMORY.md',
        'memory_note=Agentic 默认模型是 GPT-5.5',
        'memory_result=worker-bot 已执行 memory.write。 写入位置：/home/agent/.hermes/memories/MEMORY.md 记忆内容：Agentic 默认模型是 GPT-5.5',
      ].join('\n'),
      { id: 'memory-task-1', title: '请记住：Agentic 默认模型是 GPT-5.5', board: 'default' },
    )

    expect(reply).toContain('记忆已写入。')
    expect(reply).toContain('任务 ID：memory-task-1')
    expect(reply).toContain('Agentic 默认模型是 GPT-5.5')
    expect(reply).toContain('/home/agent/.hermes/memories/MEMORY.md')
  })
})
