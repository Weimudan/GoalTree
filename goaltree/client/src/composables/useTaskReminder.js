import { ref, onUnmounted } from 'vue'
import { getTasksByDate } from '../api/tasks.js'
import { requestPermission, notify, isSupported } from '../utils/notifications.js'
import dayjs from 'dayjs'

/**
 * 任务提醒 Composable
 *
 * 功能：
 * - 每 30 秒轮询今日任务
 * - 任务开始前 5 分钟 / 结束前 10 分钟弹出桌面通知
 * - 动态更新浏览器标签页标题
 * - localStorage 持久化已确认提醒，刷新页面不再重复弹
 * - 点击通知即确认（标记已读，永久不再弹）
 */

// ============ 可配置参数 ============
const START_SOON_MINUTES = 5
const END_SOON_MINUTES = 10
const POLL_INTERVAL_MS = 30000
const STORAGE_KEY = 'goaltree_ack'

const RemindType = {
  STARTING_SOON: 'starting_soon',
  ENDING_SOON: 'ending_soon'
}

// ============ localStorage 持久化 ============

function loadAcknowledged() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveAcknowledged(ackSet) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ackSet])) } catch { /* 存储满 */ }
}

// ============ composable ============

export function useTaskReminder(options = {}) {
  const startSoonMinutes = options.startSoonMinutes ?? START_SOON_MINUTES
  const endSoonMinutes = options.endSoonMinutes ?? END_SOON_MINUTES
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS

  // localStorage 持久化：已确认的提醒
  const acknowledged = loadAcknowledged()
  // 当前会话：已发送待确认的
  const pendingSend = new Set()

  // 定时器 ID
  let timerId = null

  // 是否已授权通知
  const permissionGranted = ref(false)

  // 当前进行中的任务（用于标题展示）
  const activeTaskTitle = ref('')

  function reminderKey(taskId, type) {
    return `${taskId}:${type}`
  }

  /** 用户确认某条提醒（点击通知后调用），持久化到 localStorage */
  function acknowledge(taskId, type) {
    const key = reminderKey(taskId, type)
    acknowledged.add(key)
    saveAcknowledged(acknowledged)
  }

  function isAcknowledged(taskId, type) {
    return acknowledged.has(reminderKey(taskId, type))
  }

  /** 尝试发送桌面通知（带去重 + localStorage 永久去重） */
  function tryNotify(taskId, type, title, body) {
    if (isAcknowledged(taskId, type)) return
    const key = reminderKey(taskId, type)
    if (pendingSend.has(key)) return
    pendingSend.add(key)
    notify(title, body, {
      tag: `goaltree-${taskId}-${type}`,
      requireInteraction: true,
      onClick: () => {
        acknowledge(taskId, type)
        window.focus()
      }
    })
  }

  /** 更新页面标题 */
  function updateTitle(taskTitle, remainingMinutes) {
    if (taskTitle && remainingMinutes !== null && remainingMinutes >= 0) {
      document.title = `⏰ ${taskTitle} · 剩余${remainingMinutes}分钟 - GoalTree`
    } else {
      document.title = 'GoalTree'
    }
  }

  /**
   * 检查并触发提醒
   * @param {Array} tasks 今日任务列表
   */
  function checkAndRemind(tasks) {
    if (!tasks || tasks.length === 0) {
      updateTitle('', null)
      return
    }

    const now = dayjs()
    const todayStr = now.format('YYYY-MM-DD')

    let firstPendingTask = null

    for (const task of tasks) {
      // 跳过已完成或已过期的任务
      if (task.status === 'completed' || task.status === 'expired') continue

      const startTime = dayjs(`${todayStr} ${task.start_time}`)
      const endTime = dayjs(`${todayStr} ${task.end_time}`)

      // ---- 提醒：任务即将开始 ----
      const msToStart = startTime.diff(now, 'millisecond')
      if (msToStart > 0 && msToStart <= startSoonMinutes * 60 * 1000) {
        const mins = Math.ceil(msToStart / 60000)
        tryNotify(
          task.id, RemindType.STARTING_SOON,
          `⏰ 任务即将开始`,
          `「${task.title}」将在 ${mins} 分钟后开始\n点击通知可确认，不再重复提醒`
        )
      }

      // ---- 提醒：任务即将结束 ----
      const msToEnd = endTime.diff(now, 'millisecond')
      if (
        task.status === 'pending' &&
        msToEnd > 0 &&
        msToEnd <= endSoonMinutes * 60 * 1000
      ) {
        const mins = Math.ceil(msToEnd / 60000)
        tryNotify(
          task.id, RemindType.ENDING_SOON,
          `⚠️ 任务即将结束`,
          `「${task.title}」还剩约 ${mins} 分钟\n点击通知可确认，不再重复提醒`
        )
      }

      // 记录第一个进行中的任务，用于标题
      if (task.status === 'pending' && !firstPendingTask) {
        const msRemaining = endTime.diff(now, 'millisecond')
        if (msRemaining > 0) {
          firstPendingTask = {
            title: task.title,
            remainingMinutes: Math.ceil(msRemaining / 60000)
          }
        }
      }
    }

    // 更新标题
    if (firstPendingTask) {
      activeTaskTitle.value = firstPendingTask.title
      updateTitle(firstPendingTask.title, firstPendingTask.remainingMinutes)
    } else {
      activeTaskTitle.value = ''
      updateTitle('', null)
    }
  }

  /** 拉取今日任务并检查提醒 */
  async function poll() {
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const res = await getTasksByDate(today)
      const tasks = res.data || res || []
      checkAndRemind(tasks)
    } catch {
      // 静默失败，避免网络抖动干扰
    }
  }

  /** 启动轮询 */
  async function start() {
    if (isSupported()) {
      const perm = await requestPermission()
      permissionGranted.value = perm === 'granted'
    }
    // 清理过期记录
    if (acknowledged.size > 500) { acknowledged.clear(); saveAcknowledged(acknowledged) }
    await poll()
    timerId = setInterval(poll, pollIntervalMs)
  }

  /** 停止轮询 */
  function stop() {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
    // 恢复默认标题
    document.title = 'GoalTree'
    activeTaskTitle.value = ''
  }

  // 组件卸载时自动停止（如果作为 composable 使用）
  onUnmounted(() => stop())

  return {
    permissionGranted,
    activeTaskTitle,
    start,
    stop,
    poll,
    acknowledge
  }
}
