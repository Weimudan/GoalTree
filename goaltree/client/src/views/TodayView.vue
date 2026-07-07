<template>
  <div class="today-page">
    <div class="page-header">
      <div>
        <h2>今日任务</h2>
        <span class="date-label">{{ todayLabel }}</span>
      </div>
      <div class="header-right">
        <el-date-picker
          v-model="selectedDate"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 160px"
          @change="loadTasks"
        />
        <el-button type="primary" :icon="Plus" @click="openNewTask(false)">新建任务</el-button>
        <el-button :icon="Plus" @click="openNewTask(true)" v-if="isToday">明天任务</el-button>
        <el-popconfirm
          title="确认删除今日全部任务？此操作不可恢复"
          confirm-button-text="确认删除"
          @confirm="batchDelete"
        >
          <template #reference>
            <el-button type="danger" :icon="Delete" :disabled="!tasks.length" plain>清空今日</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <!-- 当天完成率 -->
    <el-card class="summary-card">
      <div class="summary">
        <el-statistic title="总任务" :value="tasks.length" />
        <el-statistic title="已完成" :value="completedCount" />
        <el-statistic title="未完成" :value="expiredCount" />
        <el-statistic title="待完成" :value="pendingCount" />
        <div class="stat-block">
          <span class="stat-label">计划时长</span>
          <span class="stat-value">{{ totalHours }}h</span>
        </div>
        <div class="stat-block">
          <span class="stat-label">已完成时长</span>
          <span class="stat-value completed">{{ completedHours }}h</span>
        </div>
        <div class="progress-wrap">
          <span class="progress-label">完成率</span>
          <el-progress
            :percentage="rate"
            :color="rate === 100 ? '#67c23a' : '#409eff'"
            :stroke-width="10"
            style="width: 160px"
          />
        </div>
      </div>
    </el-card>

    <!-- AI 对话板块 -->
    <el-card class="ai-chat-card">
      <div class="chat-header">
        <div class="chat-title">
          <el-icon color="#7c3aed" :size="20"><MagicStick /></el-icon>
          <span>AI 目标助理</span>
          <el-tag size="small" type="info" effect="plain" class="chat-badge">对话中</el-tag>
        </div>
        <el-button
          size="small"
          type="primary"
          text
          :icon="Refresh"
          :loading="chatLoading && chatMessages.length <= 1"
          @click="refreshChat"
        >
          重新分析
        </el-button>
      </div>

      <!-- 消息列表 -->
      <div class="chat-messages" ref="chatContainerRef">
        <div v-if="!chatMessages.length && !chatLoading" class="chat-placeholder">
          <el-icon color="#c0c4cc" :size="40"><ChatDotRound /></el-icon>
          <span>点击「重新分析」让 AI 帮你分析今日任务</span>
        </div>

        <div
          v-for="(msg, idx) in chatMessages"
          :key="idx"
          class="chat-bubble-wrap"
          :class="msg.role === 'user' ? 'bubble-right' : 'bubble-left'"
        >
          <div class="bubble-avatar" v-if="msg.role === 'assistant'">
            <div class="avatar-ai">✨</div>
          </div>
          <div class="bubble-body">
            <div class="bubble-text" :class="msg.role === 'user' ? 'bubble-user' : 'bubble-ai'">
              {{ msg.content }}
            </div>
            <div class="bubble-time">{{ msg.time }}</div>
          </div>
          <div class="bubble-avatar" v-if="msg.role === 'user'">
            <div class="avatar-user">
              <el-icon :size="16"><UserFilled /></el-icon>
            </div>
          </div>
        </div>

        <!-- 加载气泡 -->
        <div v-if="chatLoading" class="chat-bubble-wrap bubble-left">
          <div class="bubble-avatar">
            <div class="avatar-ai">✨</div>
          </div>
          <div class="bubble-body">
            <div class="bubble-text bubble-ai typing-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="chat-input-area">
        <el-input
          v-model="chatInput"
          placeholder="输入你想问的，比如「今天的安排合理吗？」..."
          :disabled="chatLoading"
          @keydown.enter.exact="sendMessage"
          clearable
          class="chat-input"
        >
          <template #suffix>
            <el-button
              :icon="Promotion"
              type="primary"
              circle
              size="small"
              :disabled="!chatInput.trim() || chatLoading"
              @click="sendMessage"
            />
          </template>
        </el-input>
      </div>
    </el-card>

    <!-- 任务表格 -->
    <el-card v-loading="loading" class="table-card">
      <el-empty v-if="!tasks.length" description="今天还没有任务" />

      <el-table
        v-else
        :data="tasks"
        row-key="id"
        stripe
        :expand-row-keys="expandedRows"
        style="width: 100%"
        :row-class-name="tableRowClass"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-detail">
              <!-- 所属目标 -->
              <div class="detail-row">
                <span class="detail-label">所属目标</span>
                <el-tag v-if="row.goal_title" size="small" type="info">{{ row.goal_title }}</el-tag>
                <span v-else class="no-goal">未关联</span>
              </div>

              <!-- 总结 -->
              <div class="detail-row">
                <span class="detail-label">总结</span>
                <div v-if="row.summary && expandedId !== row.id" class="summary-display-inline">
                  <p class="summary-content">{{ row.summary }}</p>
                  <el-button size="small" text type="primary" :icon="EditPen" @click="toggleSummary(row)">
                    修改
                  </el-button>
                </div>
                <div v-else class="summary-editor-inline">
                  <el-input
                    v-model="draftSummary"
                    type="textarea"
                    :rows="2"
                    placeholder="记录收获、复盘或改进思路..."
                    maxlength="500"
                    show-word-limit
                  />
                  <div class="summary-actions">
                    <el-button size="small" @click="closeExpand(row)">取消</el-button>
                    <el-button
                      size="small"
                      type="primary"
                      :loading="savingId === row.id"
                      @click="handleSaveSummary(row)"
                    >
                      保存
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="时间段" width="140" prop="timeRange">
          <template #default="{ row }">
            <div class="time-cell">
              <span class="time-dot" :class="dotClass(row.status)"></span>
              <div class="time-info">
                <span class="time-text">{{ row.start_time.slice(0,5) }} - {{ row.end_time.slice(0,5) }}</span>
                <span v-if="getRemaining(row)" class="time-remain">
                  {{ getRemaining(row) }}
                </span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="任务" min-width="280" prop="title" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="task-name">{{ row.title }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="statusTag(row.status).type"
              size="small"
              :style="{ backgroundColor: getStatusColor(row.status) + '18', color: getStatusColor(row.status), borderColor: getStatusColor(row.status) + '30' }"
            >
              {{ getStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button
                v-if="row.status === 'pending'"
                size="small"
                type="success"
                :icon="Check"
                :loading="completing === row.id"
                @click="handleComplete(row)"
              >
                完成
              </el-button>
              <el-button
                v-if="row.status === 'completed' || row.status === 'expired'"
                size="small"
                text
                type="primary"
                :icon="EditPen"
                @click="toggleSummary(row)"
              >
                {{ row.summary ? '改总结' : '写总结' }}
              </el-button>
              <el-button size="small" text :icon="Edit" @click="openEdit(row)" />
              <el-popconfirm title="确认删除这条任务？" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button size="small" text type="danger" :icon="Delete" />
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <TaskForm
      v-model="taskFormVisible"
      :edit-data="editTask"
      :default-date="taskDateOverride || selectedDate"
      @saved="loadTasks"
      @closed="onTaskFormClosed"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Plus, Check, Edit, Delete, EditPen, MagicStick, Refresh, Loading, UserFilled, ChatDotRound, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { getTasksByDate, completeTask, deleteTask, saveSummary } from '../api/tasks'
import { analyzeTodayTasks, chatWithAI } from '../api/ai'
import { useGoalStore } from '../stores/goals'
import TaskForm from '../components/TaskForm.vue'

const goalStore = useGoalStore()
const tasks = ref([])
const loading = ref(false)
const completing = ref(null)
const taskFormVisible = ref(false)
const editTask = ref(null)
const taskDateOverride = ref('')  // 快捷添加任务的目标日期
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
const todayLabel = computed(() => dayjs(selectedDate.value).format('YYYY年M月D日 dddd'))
const isToday = computed(() => selectedDate.value === dayjs().format('YYYY-MM-DD'))

// 总结相关状态
const expandedId = ref(null)   // 当前展开编辑器的任务 id
const draftSummary = ref('')   // 编辑中的草稿
const savingId = ref(null)

// AI 对话状态
const chatMessages = ref([])        // { role: 'user'|'assistant', content, time }
const chatInput = ref('')
const chatLoading = ref(false)
const chatContainerRef = ref(null)
let pollTimer = null

// 表格展开行控制
const expandedRows = computed(() => {
  if (!expandedId.value) return []
  return [expandedId.value]
})

const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length)
const expiredCount = computed(() => tasks.value.filter(t => t.status === 'expired').length)
const pendingCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)
const rate = computed(() =>
  tasks.value.length ? Math.round((completedCount.value / tasks.value.length) * 100) : 0
)

// 今日时长计算
function taskHours(task) {
  if (!task.start_time || !task.end_time) return 0
  const [sh, sm] = task.start_time.slice(0, 5).split(':').map(Number)
  const [eh, em] = task.end_time.slice(0, 5).split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}
const totalHours = computed(() =>
  tasks.value.reduce((sum, t) => sum + taskHours(t), 0).toFixed(1)
)
const completedHours = computed(() =>
  tasks.value.filter(t => t.status === 'completed').reduce((sum, t) => sum + taskHours(t), 0).toFixed(1)
)

onMounted(() => {
  goalStore.fetch()
  loadTasks()
  // 每 30 秒自动刷新任务状态
  pollTimer = setInterval(() => loadTasks(true), 30_000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
})

async function loadTasks(skipAi = false) {
  loading.value = true
  try {
    tasks.value = await getTasksByDate(selectedDate.value)
    // 自动触发 AI 分析（轮询刷新时跳过）
    if (tasks.value.length && !skipAi) initAiChat()
  } catch {
    tasks.value = []
  } finally {
    loading.value = false
  }
}

// ========== AI 对话 ==========

/** 格式化当前时间 */
function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 自动滚动到底部 */
function scrollToBottom() {
  setTimeout(() => {
    const el = chatContainerRef.value
    if (el) el.scrollTop = el.scrollHeight
  }, 100)
}

/** 带短暂延迟推送一条 AI 消息，保持「正在输入」的动画感 */
function pushAiMessage(text) {
  chatLoading.value = true
  return new Promise(resolve => {
    setTimeout(() => {
      chatMessages.value.push({ role: 'assistant', content: text, time: nowTime() })
      chatLoading.value = false
      scrollToBottom()
      resolve()
    }, 600)
  })
}

/** 初始 AI 分析（页面加载/切换日期时自动调用） */
async function initAiChat() {
  chatMessages.value = []
  try {
    const analysis = await analyzeTodayTasks(tasks.value)
    await pushAiMessage(analysis)
  } catch (e) {
    chatLoading.value = false
    chatMessages.value.push({
      role: 'assistant',
      content: '抱歉，AI 服务暂时不可用，请稍后重试 😥',
      time: nowTime(),
    })
  } finally {
    scrollToBottom()
  }
}

/** 重新分析 */
function refreshChat() {
  initAiChat()
}

/** 发送用户消息 */
async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || chatLoading.value) return

  // 添加用户消息
  chatMessages.value.push({ role: 'user', content: text, time: nowTime() })
  chatInput.value = ''
  scrollToBottom()

  // 调用对话 API
  chatLoading.value = true
  try {
    // 构建历史记录（只传 role + content）
    const history = chatMessages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)  // 去掉刚加的用户消息，API 会自己加
      .map(m => ({ role: m.role, content: m.content }))

    const reply = await chatWithAI(tasks.value, history, text)
    await pushAiMessage(reply)
  } catch (e) {
    chatLoading.value = false
    chatMessages.value.push({
      role: 'assistant',
      content: '网络好像不太稳定，稍后再试试吧～',
      time: nowTime(),
    })
  } finally {
    scrollToBottom()
  }
}

/** 自动发送一条系统触发的消息（如完成任务后通知 AI） */
async function triggerAiReply(text) {
  if (chatLoading.value) return  // 正在回复中则跳过
  chatMessages.value.push({ role: 'user', content: text, time: nowTime() })
  scrollToBottom()

  chatLoading.value = true
  try {
    const history = chatMessages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content }))

    const reply = await chatWithAI(tasks.value, history, text)
    await pushAiMessage(reply)
  } catch (e) {
    chatLoading.value = false
    chatMessages.value.push({
      role: 'assistant',
      content: '网络好像不太稳定，稍后再试试吧～',
      time: nowTime(),
    })
  } finally {
    scrollToBottom()
  }
}

async function handleComplete(task) {
  completing.value = task.id
  try {
    const updated = await completeTask(task.id)
    const idx = tasks.value.findIndex(t => t.id === task.id)
    if (idx !== -1) tasks.value[idx] = updated
    ElMessage.success('太棒了，完成一个！')
    // 完成一个任务后让 AI 重新看看进展
    triggerAiReply(`我刚完成了「${task.title}」这个任务～`)
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '操作失败')
  } finally {
    completing.value = null
  }
}

async function handleDelete(id) {
  try {
    await deleteTask(id)
    tasks.value = tasks.value.filter(t => t.id !== id)
    expandedId.value = null
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

async function batchDelete() {
  const ids = tasks.value.map(t => t.id)
  let count = 0
  for (const id of ids) {
    try {
      await deleteTask(id)
      count++
    } catch { /* 跳过 */ }
  }
  tasks.value = []
  expandedId.value = null
  ElMessage.success(`已删除 ${count} 条任务`)
}

function openEdit(task) {
  editTask.value = task
  taskFormVisible.value = true
}

/** 打开新建任务弹窗，tomorrow=true 则日期默认为明天 */
function openNewTask(tomorrow) {
  editTask.value = null
  taskDateOverride.value = tomorrow ? dayjs().add(1, 'day').format('YYYY-MM-DD') : ''
  taskFormVisible.value = true
}

function onTaskFormClosed() {
  editTask.value = null
  taskDateOverride.value = ''
}

function toggleSummary(task) {
  if (expandedId.value === task.id) {
    expandedId.value = null
    return
  }
  expandedId.value = task.id
  draftSummary.value = task.summary || ''
}

function closeExpand(row) {
  expandedId.value = null
}

async function handleSaveSummary(task) {
  savingId.value = task.id
  try {
    const updated = await saveSummary(task.id, draftSummary.value)
    const idx = tasks.value.findIndex(t => t.id === task.id)
    if (idx !== -1) tasks.value[idx] = updated
    expandedId.value = null
    ElMessage.success('总结已保存')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    savingId.value = null
  }
}

// 表格行样式
function tableRowClass({ row }) {
  if (row.status === 'completed') return 'row-completed'
  if (row.status === 'expired') return 'row-expired'
  return ''
}

// 时间点颜色
function dotClass(status) {
  return { completed: 'dot-success', expired: 'dot-danger', pending: 'dot-primary', upcoming: 'dot-info' }[status] || 'dot-primary'
}

// 状态颜色
function getStatusColor(status) {
  return { completed: '#67c23a', expired: '#f56c6c', pending: '#409eff', upcoming: '#909399' }[status] || '#409eff'
}

// 状态文本
function getStatusText(task) {
  const map = { completed: '已完成', expired: '未完成', pending: '进行中', upcoming: '未开始' }
  return map[task.status] || task.status
}

function statusTag(status) {
  return {
    completed: { type: 'success', text: '已完成' },
    expired:   { type: 'danger',  text: '未完成' },
    pending:   { type: '',        text: '进行中' },
    upcoming:  { type: 'info',    text: '未开始' },
  }[status]
}

// 剩余时间（仅进行中任务显示）
function getRemaining(task) {
  if (task.status !== 'pending') return ''
  const now = new Date()
  const [eh, em] = task.end_time.slice(0, 5).split(':').map(Number)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0)
  const diff = Math.floor((end - now) / 60_000)
  if (diff > 0) return `剩余 ${diff} 分钟`
  if (diff === 0) return '即将结束'
  return `已超时 ${Math.abs(diff)} 分钟`
}

</script>

<style scoped>
.today-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.date-label { color: #909399; font-size: 13px; }
.header-right { display: flex; gap: 10px; align-items: center; }
.summary-card { margin-bottom: 16px; border-radius: 12px; }
.summary { display: flex; gap: 32px; align-items: center; flex-wrap: wrap; }
.stat-block { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat-label { font-size: 12px; color: #909399; }
.stat-value { font-size: 24px; font-weight: 600; color: #303133; }
.stat-value.completed { color: #67c23a; }
.progress-wrap { display: flex; flex-direction: column; gap: 6px; }
.progress-label { font-size: 12px; color: #909399; }

/* 表格卡片 */
.table-card { border-radius: 12px; }

/* ========== AI 对话卡片 ========== */
.ai-chat-card {
  margin-bottom: 16px;
  border-radius: 12px;
  border-left: 4px solid #7c3aed;
  overflow: hidden;
}
.ai-chat-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(135deg, #faf5ff 0%, #f8f9fc 100%);
  flex-shrink: 0;
}
.chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #7c3aed;
}
.chat-badge {
  font-size: 11px !important;
}

/* 消息区域 */
.chat-messages {
  height: 320px;
  overflow-y: auto;
  padding: 16px 18px;
  background: #fafbfc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chat-messages::-webkit-scrollbar {
  width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 4px;
}

/* 占位 */
.chat-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: auto;
  color: #c0c4cc;
  font-size: 13px;
}

/* 气泡行 */
.chat-bubble-wrap {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  animation: bubbleIn 0.3s ease;
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.bubble-left { justify-content: flex-start; }
.bubble-right { justify-content: flex-end; }

.bubble-avatar {
  flex-shrink: 0;
}

/* AI 头像 - 渐变紫 + 星星 */
.avatar-ai {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
}

/* 用户头像 - 浅蓝灰 */
.avatar-user {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);
}

.bubble-body {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}
.bubble-right .bubble-body {
  align-items: flex-end;
}

/* 气泡文字 */
.bubble-text {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.bubble-ai {
  background: #fff;
  border: 1px solid #e8e0f0;
  border-bottom-left-radius: 4px;
  color: #4a4458;
  box-shadow: 0 1px 3px rgba(124, 58, 237, 0.06);
}
.bubble-user {
  background: linear-gradient(135deg, #7c3aed, #8b5cf6);
  color: #fff;
  border-bottom-right-radius: 4px;
}

/* 时间戳 */
.bubble-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
  padding: 0 4px;
}

/* 输入中动画 */
.typing-bubble {
  padding: 12px 18px;
  display: flex;
  gap: 5px;
  align-items: center;
}
.typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c4b5fd;
  animation: typingBounce 1.4s infinite ease-in-out both;
}
.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.16s; }
.typing-dot:nth-child(3) { animation-delay: 0.32s; }
@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 输入区 */
.chat-input-area {
  padding: 12px 18px;
  border-top: 1px solid #f0f0f0;
  background: #fff;
  flex-shrink: 0;
}
.chat-input :deep(.el-input__wrapper) {
  border-radius: 20px;
  background: #f5f5f5;
  box-shadow: none;
}
.chat-input :deep(.el-input__wrapper:hover) {
  background: #eee;
}
.chat-input :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: 0 0 0 1px #7c3aed inset;
}
.chat-input :deep(.el-input__suffix) {
  right: 4px;
}

/* 时间列 */
.time-cell { display: flex; align-items: flex-start; gap: 8px; }
.time-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.time-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dot-success { background: #67c23a; }
.dot-danger { background: #f56c6c; }
.dot-primary { background: #409eff; }
.dot-info { background: #909399; }
.time-text { font-size: 13px; color: #606266; white-space: nowrap; }
.time-remain {
  font-size: 11px;
  color: #409eff;
  white-space: nowrap;
}

/* 任务名 */
.task-name { font-size: 16px; font-weight: 600; color: #303133; }

/* 目标标签 */
.no-goal { color: #c0c4cc; }

/* 操作按钮 */
.action-btns { display: flex; align-items: center; gap: 2px; justify-content: center; }

/* 展开行——详情 */
.expand-detail {
  padding: 16px 24px;
  background: #f9fafc;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.detail-label {
  font-size: 13px;
  color: #909399;
  white-space: nowrap;
  min-width: 56px;
  padding-top: 1px;
}
.summary-display-inline {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.summary-content {
  margin: 0;
  font-size: 14px;
  color: #303133;
  line-height: 1.7;
  white-space: pre-wrap;
  flex: 1;
}
.summary-editor-inline {
  flex: 1;
}
.summary-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }

/* 行样式 */
:deep(.row-completed) { background-color: #f6ffed !important; }
:deep(.row-expired) { background-color: #fef0f0 !important; }
</style>