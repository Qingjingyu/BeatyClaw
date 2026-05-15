import { execFile } from 'child_process'
import { promisify } from 'util'
import { HxaBotClient, type HxaMessageEvent } from './hxa-client'
import {
  buildExecuteAllWorkerReply,
  buildExecuteNextWorkerReply,
  buildMemoryWriteWorkerReply,
  buildSplitWorkerReply,
  buildWorkerReply,
  completeKanbanTask,
  completeMemoryWriteTask,
  executeAllKanbanTasks,
  executeNextKanbanTask,
  parseTask,
  shouldRunMemoryWrite,
  shouldExecuteAllKanbanTasks,
  shouldExecuteNextKanbanTask,
  shouldSplitKanbanTask,
  splitKanbanTask,
  shouldIgnoreMessage,
} from './kanban-worker'

const execFileAsync = promisify(execFile)

const hxaUrl = process.env.HXA_URL || process.env.AGENTIC_HXA_BASE_URL || 'https://agent.aibosss.com/hxa'
const token = process.env.HXA_TOKEN || ''
const target = process.env.TARGET_BOT || process.env.ZYLOS_MAIN_BOT_NAME || 'zylos-main'
const botName = process.env.BOT_NAME || 'worker-bot'
const hermesBin = process.env.HERMES_BIN || '/opt/hermes/.venv/bin/hermes'
const hermesHome = process.env.HERMES_HOME || '/home/agent/.hermes'
const defaultBoard = process.env.KANBAN_BOARD || process.env.ZYLOS_MAIN_KANBAN_BOARD || 'default'
const taskConcurrency = Math.max(1, Number(process.env.WORKER_BOT_TASK_CONCURRENCY || 1))

if (!token) {
  throw new Error('HXA_TOKEN is required')
}

const client = new HxaBotClient({ url: hxaUrl, token })

client.on('message', async (event: HxaMessageEvent) => {
  const from = event.sender_name || event.sender_id || 'unknown'
  const content = event.message?.content || ''
  console.log(`[worker-bot] message from ${from}: ${content}`)

  if (shouldIgnoreMessage({ from, content }, botName)) return

  const task = parseTask(content, defaultBoard)
  let reply: string
  if (task.taskId) {
    try {
      if (shouldExecuteAllKanbanTasks(content)) {
        const result = await executeAllKanbanTasks({
          taskId: task.taskId,
          board: task.board,
          content,
          hermesBin,
          botName,
          execFile: execFileAsync,
          concurrency: taskConcurrency,
        })
        reply = buildExecuteAllWorkerReply(content, task, result)
        console.log(`[worker-bot] executed all remaining children (${result.executedChildren.length}) for parent ${task.taskId} on board ${task.board}`)
      } else if (shouldRunMemoryWrite(content)) {
        const result = await completeMemoryWriteTask({
          taskId: task.taskId,
          board: task.board,
          content,
          hermesBin,
          botName,
          hermesHome,
          execFile: execFileAsync,
        })
        reply = buildMemoryWriteWorkerReply(content, task, result)
        console.log(`[worker-bot] wrote memory for task ${task.taskId} at ${result.memoryPath}`)
      } else if (shouldExecuteNextKanbanTask(content)) {
        const result = await executeNextKanbanTask({
          taskId: task.taskId,
          board: task.board,
          content,
          hermesBin,
          botName,
          execFile: execFileAsync,
        })
        reply = buildExecuteNextWorkerReply(content, task, result)
        console.log(`[worker-bot] executed next child ${result.executedChild.id} for parent ${task.taskId} on board ${task.board}`)
      } else if (shouldSplitKanbanTask(content)) {
        const result = await splitKanbanTask({
          taskId: task.taskId,
          board: task.board,
          content,
          hermesBin,
          botName,
          execFile: execFileAsync,
        })
        reply = buildSplitWorkerReply(content, task, result)
        console.log(`[worker-bot] split kanban task ${task.taskId} into ${result.children.length} children on board ${task.board}`)
      } else {
        await completeKanbanTask({
          taskId: task.taskId,
          board: task.board,
          content,
          hermesBin,
          botName,
          execFile: execFileAsync,
        })
        reply = buildWorkerReply(content, task, 'done')
        console.log(`[worker-bot] completed kanban task ${task.taskId} on board ${task.board}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      reply = buildWorkerReply(content, task, 'complete_failed', message)
      console.error('[worker-bot] kanban complete failed', message)
    }
  } else {
    reply = `[worker-reply] 收到：${content}`
  }

  try {
    await client.send(from, reply)
    console.log(`[worker-bot] replied to ${from}`)
  } catch (err) {
    console.error('[worker-bot] reply failed', err instanceof Error ? err.message : err)
  }
})

client.on('thread_message', (event: any) => {
  const from = event.message?.sender_name || event.message?.sender_id || 'unknown'
  console.log(`[worker-bot] thread message from ${from}: ${event.message?.content || ''}`)
})

client.on('error', err => console.error('[worker-bot] ws error', err instanceof Error ? err.message : err))
client.on('close', event => console.log('[worker-bot] ws closed', JSON.stringify(event)))
client.on('reconnected', () => console.log('[worker-bot] reconnected'))

async function main(): Promise<void> {
  await client.connect()
  const me = await client.getProfile()
  console.log(`[worker-bot] connected as ${me.name || botName}`)
  try {
    await client.send(target, '[worker-online] worker-bot 已上线，支持 Kanban 独立完成任务。')
    console.log(`[worker-bot] sent online message to ${target}`)
  } catch (err) {
    console.error('[worker-bot] online message failed', err instanceof Error ? err.message : err)
  }
  setInterval(() => undefined, 60_000)
}

main().catch(err => {
  console.error('[worker-bot] fatal', err instanceof Error ? err.message : err)
  process.exit(1)
})
