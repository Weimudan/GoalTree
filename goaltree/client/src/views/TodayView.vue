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
        <el-button type="primary" :icon="Plus" @click="taskFormVisible = true">新建任务</el-button>
      </div>
    </div>

    <!-- 当天完成率 -->
    <el-card class="summary-card">
      <div class="summary">
        <el-statistic title="总任务" :value="tasks.length" />
        <el-statistic title="已完成" :value="completedCount" />
        <el-statistic title="未完成" :value="expiredCount" />
        <el-statistic title="待完成" :value="pendingCount" />
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

    <!-- 时间轴 -->
    <el-card v-loading="loading" class="timeline-card">
      <el-empty v-if="!tasks.length" description="今天还没有任务" />

      <el-timeline v-else>
        <el-timeline-item
          v-for="task in tasks"
          :key="task.id"
          :timestamp="`${task.start_time.slice(0,5)} ~ ${task.end_time.slice(0,5)}`"
          placement="top"
          :type="timelineType(task.status)"
        >
          <el-card class="task-card" shadow="never">
            <div class="task-row">
              <div class="task-info">
                <span class="task-title">{{ task.title }}</span>
                <el-tag size="small" type="info" class="goal-tag" :title="task.goal_title">
                  {{ task.goal_title?.length > 8 ? task.goal_title.slice(0, 8) + '…' : task.goal_title }}
                </el-tag>
              </div>
              <div class="task-right">
                <el-tag :type="statusTag(task.status).type" size="small">
                  {{ statusTag(task.status).text }}
                </el-tag>
                <el-button
                  v-if="task.status === 'pending'"
                  size="small"
                  type="success"
                  :icon="Check"
                  :loading="completing === task.id"
                  @click="handleComplete(task)"
                >
                  完成
                </el-button>
                <!-- 已完成/过期才能写总结 -->
                <el-button
                  v-if="task.status === 'completed' || task.status === 'expired'"
                  size="small"
                  text
                  :icon="EditPen"
                  @click="toggleSummary(task)"
                >
                  {{ task.summary ? '改总结' : '写总结' }}
                </el-button>
                <el-button size="small" text :icon="Edit" @click="openEdit(task)" />
                <el-popconfirm title="确认删除这条任务？" @confirm="handleDelete(task.id)">
                  <template #reference>
                    <el-button size="small" text type="danger" :icon="Delete" />
                  </template>
                </el-popconfirm>
              </div>
            </div>

            <!-- 内联总结区 -->
            <div v-if="task.summary && expandedId !== task.id" class="summary-text">
              <el-icon><ChatLineRound /></el-icon>
              {{ task.summary }}
            </div>
            <div v-if="expandedId === task.id" class="summary-editor">
              <el-input
                v-model="draftSummary"
                type="textarea"
                :rows="3"
                placeholder="记录一下这个任务的收获、复盘或改进思路..."
                maxlength="500"
                show-word-limit
              />
              <div class="summary-actions">
                <el-button size="small" @click="expandedId = null">取消</el-button>
                <el-button
                  size="small"
                  type="primary"
                  :loading="savingId === task.id"
                  @click="handleSaveSummary(task)"
                >
                  保存
                </el-button>
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <TaskForm
      v-model="taskFormVisible"
      :edit-data="editTask"
      :default-date="selectedDate"
      @saved="loadTasks"
      @closed="editTask = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus, Check, Edit, Delete, EditPen, ChatLineRound } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { getTasksByDate, completeTask, deleteTask, saveSummary } from '../api/tasks'
import { useGoalStore } from '../stores/goals'
import TaskForm from '../components/TaskForm.vue'

const goalStore = useGoalStore()
const tasks = ref([])
const loading = ref(false)
const completing = ref(null)
const taskFormVisible = ref(false)
const editTask = ref(null)
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
const todayLabel = computed(() => dayjs(selectedDate.value).format('YYYY年M月D日 dddd'))

// 总结相关状态
const expandedId = ref(null)   // 当前展开编辑器的任务 id
const draftSummary = ref('')   // 编辑中的草稿
const savingId = ref(null)

const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length)
const expiredCount = computed(() => tasks.value.filter(t => t.status === 'expired').length)
const pendingCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)
const rate = computed(() =>
  tasks.value.length ? Math.round((completedCount.value / tasks.value.length) * 100) : 0
)

onMounted(() => {
  goalStore.fetch()
  loadTasks()
})

async function loadTasks() {
  loading.value = true
  try {
    tasks.value = await getTasksByDate(selectedDate.value)
  } catch {
    tasks.value = []
  } finally {
    loading.value = false
  }
}

async function handleComplete(task) {
  completing.value = task.id
  try {
    const updated = await completeTask(task.id)
    const idx = tasks.value.findIndex(t => t.id === task.id)
    if (idx !== -1) tasks.value[idx] = updated
    ElMessage.success('太棒了，完成一个！')
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

function openEdit(task) {
  editTask.value = task
  taskFormVisible.value = true
}

function toggleSummary(task) {
  if (expandedId.value === task.id) {
    expandedId.value = null
    return
  }
  expandedId.value = task.id
  draftSummary.value = task.summary || ''
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

function timelineType(status) {
  return { completed: 'success', expired: 'danger', pending: 'primary', upcoming: 'info' }[status]
}

function statusTag(status) {
  return {
    completed: { type: 'success', text: '已完成' },
    expired:   { type: 'danger',  text: '未完成' },
    pending:   { type: '',        text: '进行中' },
    upcoming:  { type: 'info',    text: '未开始' },
  }[status]
}
</script>

<style scoped>
.today-page { padding: 24px; max-width: 860px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.date-label { color: #909399; font-size: 13px; }
.header-right { display: flex; gap: 10px; align-items: center; }
.summary-card { margin-bottom: 16px; border-radius: 12px; }
.summary { display: flex; gap: 32px; align-items: center; flex-wrap: wrap; }
.progress-wrap { display: flex; flex-direction: column; gap: 6px; }
.progress-label { font-size: 12px; color: #909399; }
.timeline-card { border-radius: 12px; }
.task-card { border: 1px solid #f0f0f0; }
.task-row { display: flex; justify-content: space-between; align-items: center; }
.task-info { display: flex; align-items: center; gap: 8px; }
.task-title { font-size: 14px; font-weight: 500; }
.goal-tag { color: #606266; }
.task-right { display: flex; align-items: center; gap: 6px; }
.summary-text {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.6;
}
.summary-editor { margin-top: 10px; }
.summary-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
</style>
