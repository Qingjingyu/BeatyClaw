import { describe, expect, it, vi } from 'vitest'
import {
  buildCompletionSummary,
  buildExecuteAllWorkerReply,
  buildMemoryWriteWorkerReply,
  buildSplitPlan,
  buildSplitWorkerReply,
  buildWorkerReply,
  cleanSummary,
  completeKanbanTask,
  completeMemoryWriteTask,
  executeAllKanbanTasks,
  executeNextKanbanTask,
  parseTask,
  runMemoryWrite,
  shouldRunMemoryWrite,
  shouldExecuteAllKanbanTasks,
  shouldExecuteNextKanbanTask,
  shouldExecuteFirstChildTask,
  splitKanbanTask,
  shouldIgnoreMessage,
} from '../../packages/worker-bot/src/kanban-worker'

describe('worker-bot kanban logic', () => {
  it('parses kanban task protocol from zylos-main messages', () => {
    const task = parseTask([
      '[agentic-task:trace-1]',
      'from=agentic-client',
      'kanban_task_id=t_123',
      'kanban_board=default',
      '帮我记录一个任务',
    ].join('\n'))

    expect(task).toEqual({ taskId: 't_123', board: 'default', traceId: 'trace-1' })
  })

  it('cleans worker protocol lines from completion summaries', () => {
    const summary = cleanSummary([
      '[agentic-task:trace-1]',
      'from=agentic-client',
      'kanban_task_id=t_123',
      'kanban_board=default',
      '请作为 worker-bot 处理下面的用户请求，并回复处理结果。',
      '帮我检查链接配置',
    ].join('\n'))

    expect(summary).toBe('帮我检查链接配置')
  })

  it('builds done replies that zylos-main can use to skip fallback completion', () => {
    const reply = buildWorkerReply('帮我记录一个任务', { taskId: 't_123', board: 'default', traceId: 'trace-1' }, 'done')

    expect(reply).toContain('[worker-reply] 收到')
    expect(reply).toContain('kanban_status=done')
    expect(reply).toContain('kanban_task_id=t_123')
    expect(reply).toContain('kanban_board=default')
  })

  it('runs hermes kanban complete as worker-bot profile', async () => {
    const execFile = vi.fn(async () => undefined)
    const result = await completeKanbanTask({
      taskId: 't_123',
      board: 'default',
      content: '帮我完成任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      ['kanban', '--board', 'default', 'complete', 't_123', '--summary', result.summary],
      expect.objectContaining({
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: expect.objectContaining({ HERMES_PROFILE: 'worker-bot' }),
      }),
    )
    expect(buildCompletionSummary('帮我完成任务')).toContain('worker-bot 已独立处理。')
  })

  it('ignores its own messages and worker replies', () => {
    expect(shouldIgnoreMessage({ from: 'worker-bot', content: 'hello' }, 'worker-bot')).toBe(true)
    expect(shouldIgnoreMessage({ from: 'zylos-main', content: '[worker-reply] 收到' }, 'worker-bot')).toBe(true)
    expect(shouldIgnoreMessage({ from: 'zylos-main', content: '[agentic-task:trace]' }, 'worker-bot')).toBe(false)
  })

  it('builds a deterministic kanban.split plan with 3 to 5 child tasks', () => {
    const plan = buildSplitPlan('帮我把 Agentic 登录、对话、任务看板拆成任务')

    expect(plan.skill).toBe('kanban.split')
    expect(plan.children.length).toBeGreaterThanOrEqual(3)
    expect(plan.children.length).toBeLessThanOrEqual(5)
    expect(plan.children[0].title).toContain('登录')
    expect(plan.children[1].title).toContain('对话')
    expect(plan.children[2].title).toContain('任务看板')
    expect(plan.summary).toContain('已拆解')
  })

  it('creates child tasks, links them to the parent, and completes the parent with a split summary', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('create')) {
        return { stdout: JSON.stringify({ id: `child-${execFile.mock.calls.length}`, title: args[3] }) }
      }
      return { stdout: '' }
    })

    const result = await splitKanbanTask({
      taskId: 'parent-1',
      board: 'default',
      content: '帮我把 Agentic 登录、对话、任务看板拆成任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(result.children.length).toBeGreaterThanOrEqual(3)
    expect(result.children.length).toBeLessThanOrEqual(5)
    expect(result.summary).toContain('child-1')
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      expect.arrayContaining(['kanban', '--board', 'default', 'create', expect.any(String), '--parent', 'parent-1', '--json']),
      expect.any(Object),
    )
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      expect.arrayContaining(['kanban', '--board', 'default', 'complete', 'parent-1', '--summary']),
      expect.any(Object),
    )
  })

  it('detects requests that ask worker-bot to execute the first child task', () => {
    expect(shouldExecuteFirstChildTask('帮我把登录和对话拆成任务并先执行第一步')).toBe(true)
    expect(shouldExecuteFirstChildTask('帮我把登录和对话拆成任务')).toBe(false)
  })

  it('detects requests that ask worker-bot to continue the next ready child task', () => {
    expect(shouldExecuteNextKanbanTask('继续执行剩余任务')).toBe(true)
    expect(shouldExecuteNextKanbanTask('继续执行下一个子任务')).toBe(true)
    expect(shouldExecuteNextKanbanTask('执行所有剩余任务')).toBe(false)
    expect(shouldExecuteNextKanbanTask('帮我把登录和对话拆成任务')).toBe(false)
  })

  it('detects requests that ask worker-bot to execute all remaining ready child tasks', () => {
    expect(shouldExecuteAllKanbanTasks('执行所有剩余任务')).toBe(true)
    expect(shouldExecuteAllKanbanTasks('把剩余子任务全部执行完')).toBe(true)
    expect(shouldExecuteAllKanbanTasks('继续执行剩余任务')).toBe(false)
  })

  it('detects requests that ask worker-bot to write memory', () => {
    expect(shouldRunMemoryWrite('请记住：Agentic 默认模型是 GPT-5.5')).toBe(true)
    expect(shouldRunMemoryWrite('写入记忆：Agentic 支持 execute_all')).toBe(true)
    expect(shouldRunMemoryWrite('继续执行剩余任务')).toBe(false)
  })

  it('writes a memory note and returns a memory.write summary', async () => {
    const writeFile = vi.fn(async () => undefined)
    const mkdir = vi.fn(async () => undefined)
    const readFile = vi.fn(async () => '已有记忆\n')

    const result = await runMemoryWrite({
      content: '请记住：Agentic 默认模型是 GPT-5.5',
      hermesHome: '/home/agent/.hermes',
      writeFile,
      mkdir,
      readFile,
    })

    expect(result.skill).toBe('memory.write')
    expect(result.summary).toContain('worker-bot 已执行 memory.write')
    expect(result.summary).toContain('Agentic 默认模型是 GPT-5.5')
    expect(mkdir).toHaveBeenCalledWith('/home/agent/.hermes/memories', { recursive: true })
    expect(writeFile).toHaveBeenCalledWith(
      '/home/agent/.hermes/memories/MEMORY.md',
      expect.stringContaining('Agentic 默认模型是 GPT-5.5'),
      'utf8',
    )
  })

  it('completes a kanban task after writing memory', async () => {
    const execFile = vi.fn(async () => ({ stdout: '' }))

    const result = await completeMemoryWriteTask({
      taskId: 'memory-task-1',
      board: 'default',
      content: '请记住：Agentic 支持 execute_all',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      hermesHome: '/tmp/hermes-memory-test',
      execFile,
    })

    expect(result.skill).toBe('memory.write')
    expect(result.summary).toContain('Agentic 支持 execute_all')
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      ['kanban', '--board', 'default', 'complete', 'memory-task-1', '--summary', result.summary],
      expect.any(Object),
    )

    const reply = buildMemoryWriteWorkerReply(
      '请记住：Agentic 支持 execute_all',
      { taskId: 'memory-task-1', board: 'default', traceId: 'trace-1' },
      result,
    )
    expect(reply).toContain('worker_skill=memory.write')
    expect(reply).toContain('memory_note=Agentic 支持 execute_all')
  })

  it('can complete the first child task while leaving the remaining child tasks ready', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('create')) {
        return { stdout: JSON.stringify({ id: `child-${execFile.mock.calls.length}`, title: args[3] }) }
      }
      if (args.includes('list')) {
        return { stdout: JSON.stringify([{ id: 'existing-task', status: 'ready' }]) }
      }
      return { stdout: '' }
    })

    const result = await splitKanbanTask({
      taskId: 'parent-1',
      board: 'default',
      content: '帮我把 Agentic 登录、对话、任务看板拆成任务并先执行第一步',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(result.executedChild?.id).toBe(result.children[0].id)
    expect(result.executedChild?.summary).toContain('worker-bot 已执行 status.check')
    expect(result.executedChild?.summary).toContain('HXA：已连接')
    expect(result.executedChild?.summary).toContain('Hermes CLI：可调用')
    expect(result.executedChild?.summary).toContain('Kanban：default 可访问')
    const parentCompleteIndex = execFile.mock.calls.findIndex(call =>
      call[1].includes('complete') && call[1].includes('parent-1'),
    )
    const firstChildCompleteIndex = execFile.mock.calls.findIndex(call =>
      call[1].includes('complete') && call[1].includes(result.children[0].id),
    )
    expect(parentCompleteIndex).toBeGreaterThan(-1)
    expect(firstChildCompleteIndex).toBeGreaterThan(parentCompleteIndex)
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      expect.arrayContaining(['kanban', '--board', 'default', 'complete', result.children[0].id, '--summary']),
      expect.any(Object),
    )
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      ['kanban', '--board', 'default', 'list', '--json'],
      expect.any(Object),
    )

    const reply = buildSplitWorkerReply('请求', { taskId: 'parent-1', board: 'default', traceId: 'trace-1' }, result)
    expect(reply).toContain('executed_child_task=')
    expect(reply).toContain('executed_child_skill=status.check')
    expect(reply).toContain('remaining_child_tasks:')
  })

  it('executes the next ready child task from a parent task', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('show')) {
        return {
          stdout: JSON.stringify({
            task: { id: 'parent-1', title: '父任务', status: 'done' },
            children: ['child-done', 'child-ready', 'child-later'],
          }),
        }
      }
      if (args.includes('list')) {
        return {
          stdout: JSON.stringify([
            { id: 'child-done', title: '1. 状态检查', status: 'done' },
            { id: 'child-ready', title: '2. 对话链路', status: 'ready' },
            { id: 'child-later', title: '3. 看板写回', status: 'ready' },
          ]),
        }
      }
      return { stdout: '' }
    })

    const result = await executeNextKanbanTask({
      taskId: 'parent-1',
      board: 'default',
      content: '继续执行剩余任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(result.executedChild.id).toBe('child-ready')
    expect(result.executedChild.skill).toBe('status.check')
    expect(result.executedChild.summary).toContain('worker-bot 已执行 status.check')
    expect(result.remainingChildren).toEqual([{ id: 'child-later', title: '3. 看板写回', status: 'ready' }])
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      ['kanban', '--board', 'default', 'show', 'parent-1', '--json'],
      expect.any(Object),
    )
    expect(execFile).toHaveBeenCalledWith(
      '/opt/hermes/.venv/bin/hermes',
      expect.arrayContaining(['kanban', '--board', 'default', 'complete', 'child-ready', '--summary']),
      expect.any(Object),
    )
  })

  it('executes the lowest-numbered ready child task even when parent children are unordered', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('show')) {
        return {
          stdout: JSON.stringify({
            task: { id: 'parent-1', title: '父任务', status: 'done' },
            children: ['child-three', 'child-two', 'child-one'],
          }),
        }
      }
      if (args.includes('list')) {
        return {
          stdout: JSON.stringify([
            { id: 'child-three', title: '3. 看板写回', status: 'ready' },
            { id: 'child-two', title: '2. 对话链路', status: 'ready' },
            { id: 'child-one', title: '1. 状态检查', status: 'done' },
          ]),
        }
      }
      return { stdout: '' }
    })

    const result = await executeNextKanbanTask({
      taskId: 'parent-1',
      board: 'default',
      content: '继续执行剩余任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(result.executedChild.id).toBe('child-two')
    expect(result.remainingChildren).toEqual([{ id: 'child-three', title: '3. 看板写回', status: 'ready' }])
  })

  it('executes all remaining ready child tasks in numeric order', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('show')) {
        return {
          stdout: JSON.stringify({
            task: { id: 'parent-1', title: '父任务', status: 'done' },
            children: ['child-three', 'child-two', 'child-one'],
          }),
        }
      }
      if (args.includes('list')) {
        return {
          stdout: JSON.stringify([
            { id: 'child-three', title: '3. 看板写回', status: 'ready' },
            { id: 'child-two', title: '2. 对话链路', status: 'ready' },
            { id: 'child-one', title: '1. 状态检查', status: 'done' },
          ]),
        }
      }
      return { stdout: '' }
    })

    const result = await executeAllKanbanTasks({
      taskId: 'parent-1',
      board: 'default',
      content: '执行所有剩余任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
    })

    expect(result.skill).toBe('kanban.execute_all')
    expect(result.executedChildren.map(child => child.id)).toEqual(['child-two', 'child-three'])
    expect(result.remainingChildren).toEqual([])
    const completedIds = execFile.mock.calls
      .filter(call => call[1].includes('complete'))
      .map(call => call[1][4])
    expect(completedIds).toEqual(['child-two', 'child-three'])
  })

  it('can execute all remaining ready child tasks with a bounded concurrency strategy', async () => {
    let activeCompletes = 0
    let maxActiveCompletes = 0
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes('show')) {
        return {
          stdout: JSON.stringify({
            task: { id: 'parent-1', title: '父任务', status: 'done' },
            children: ['child-one', 'child-two', 'child-three'],
          }),
        }
      }
      if (args.includes('list')) {
        return {
          stdout: JSON.stringify([
            { id: 'child-one', title: '1. 状态检查', status: 'ready' },
            { id: 'child-two', title: '2. 对话链路', status: 'ready' },
            { id: 'child-three', title: '3. 看板写回', status: 'ready' },
          ]),
        }
      }
      if (args.includes('complete')) {
        activeCompletes += 1
        maxActiveCompletes = Math.max(maxActiveCompletes, activeCompletes)
        await new Promise(resolve => setTimeout(resolve, 5))
        activeCompletes -= 1
      }
      return { stdout: '' }
    })

    const result = await executeAllKanbanTasks({
      taskId: 'parent-1',
      board: 'default',
      content: '执行所有剩余任务',
      hermesBin: '/opt/hermes/.venv/bin/hermes',
      botName: 'worker-bot',
      execFile,
      concurrency: 2,
    })

    expect(result.executedChildren.map(child => child.id)).toEqual(['child-one', 'child-two', 'child-three'])
    expect(maxActiveCompletes).toBe(2)
  })

  it('builds a worker reply for kanban.execute_all results', () => {
    const reply = buildExecuteAllWorkerReply(
      '执行所有剩余任务',
      { taskId: 'parent-1', board: 'default', traceId: 'trace-1' },
      {
        skill: 'kanban.execute_all',
        executedChildren: [
          { id: 'child-two', title: '2. 对话链路', status: 'ready', summary: '完成 2', skill: 'status.check' },
          { id: 'child-three', title: '3. 看板写回', status: 'ready', summary: '完成 3', skill: 'status.check' },
        ],
        remainingChildren: [],
        summary: 'worker-bot 已执行 kanban.execute_all，完成 2 个子任务。',
      },
    )

    expect(reply).toContain('worker_skill=kanban.execute_all')
    expect(reply).toContain('executed_child_tasks:')
    expect(reply).toContain('1. child-two 2. 对话链路')
    expect(reply).toContain('2. child-three 3. 看板写回')
    expect(reply).toContain('executed_child_result=worker-bot 已执行 kanban.execute_all')
    expect(reply).toContain('next_step=当前父任务下没有剩余 ready 子任务。')
  })
})
