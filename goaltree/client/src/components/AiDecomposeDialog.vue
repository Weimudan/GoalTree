<template>
  <el-dialog v-model="visible" title="AI 目标拆解" width="560px" @closed="reset">
    <!-- 目标信息 -->
    <div class="goal-info">
      <el-icon><Aim /></el-icon>
      <span class="goal-name">{{ goal?.title }}</span>
    </div>

    <!-- 初始状态 -->
    <div v-if="state === 'idle'" class="idle-body">
      <p class="hint">AI 会将这个目标拆解为子目标 + 建议任务，并估算每个子目标/任务的时长，你可以按需勾选后一键创建。</p>
      <el-button type="primary" :icon="MagicStick" @click="runDecompose">开始拆解</el-button>
    </div>

    <!-- 加载中 -->
    <div v-else-if="state === 'loading'" class="loading-body">
      <el-icon class="spin"><Loading /></el-icon>
      <span>AI 思考中，请稍候…</span>
    </div>

    <!-- 报错 -->
    <div v-else-if="state === 'error'" class="error-body">
      <el-alert :title="errorMsg" type="error" :closable="false" />
      <el-button style="margin-top:12px" @click="runDecompose">重试</el-button>
    </div>

    <!-- 结果 -->
    <div v-else-if="state === 'done'" class="result-body">
      <p class="result-hint">已拆解出以下子目标及建议任务，勾选想要创建的：</p>
      <div
        v-for="(item, i) in suggestions"
        :key="i"
        class="subgoal-block"
        :class="{ selected: selectedSet.has(i) }"
      >
        <el-checkbox
          :model-value="selectedSet.has(i)"
          class="subgoal-check"
          @change="(v) => toggleSubGoal(i, v)"
        >
          <span class="subgoal-title">{{ item.title }}</span>
          <el-tag v-if="item.estimated_hours" size="small" type="warning" class="hours-tag">
            预估 {{ item.estimated_hours }}h
          </el-tag>
        </el-checkbox>
        <div v-if="selectedSet.has(i) && item.tasks?.length" class="task-list">
          <div v-for="(t, j) in item.tasks" :key="j" class="task-item">
            <el-icon><CircleCheck /></el-icon>
            <span>{{ t.title }}</span>
            <el-tag v-if="t.estimated_minutes" size="small" class="min-tag">{{ t.estimated_minutes }}min</el-tag>
          </div>
        </div>
      </div>
      <div class="result-actions">
        <el-button text @click="runDecompose">重新生成</el-button>
        <div>
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!selectedSet.size"
            :loading="creating"
            @click="handleCreate"
          >
            创建选中的 {{ selectedSet.size }} 个子目标
          </el-button>
        </div>
      </div>
    </div>

    <template v-if="state === 'idle'" #footer>
      <el-button @click="visible = false">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Aim, MagicStick, Loading, CircleCheck } from '@element-plus/icons-vue'
import { decomposeGoal } from '../api/ai'
import { useGoalStore } from '../stores/goals'
import { createTask } from '../api/tasks'
import dayjs from 'dayjs'

const props = defineProps({
  modelValue: Boolean,
  goal: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const goalStore = useGoalStore()
const state = ref('idle')
const suggestions = ref([])
const selectedSet = ref(new Set())
const errorMsg = ref('')
const creating = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

watch(visible, (v) => { if (v) reset() })

function reset() {
  state.value = 'idle'
  suggestions.value = []
  selectedSet.value = new Set()
  errorMsg.value = ''
}

async function runDecompose() {
  state.value = 'loading'
  try {
    suggestions.value = await decomposeGoal(props.goal)
    // 默认全选所有子目标
    selectedSet.value = new Set(suggestions.value.map((_, i) => i))
    state.value = 'done'
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'AI 服务暂时不可用，请稍后重试'
    state.value = 'error'
  }
}

function toggleSubGoal(i, checked) {
  const next = new Set(selectedSet.value)
  checked ? next.add(i) : next.delete(i)
  selectedSet.value = next
}

async function handleCreate() {
  creating.value = true
  try {
    // 排期起点：当前本地时间取整到最近 30 分钟；晚于 20 点则推到明天 9 点
    const now = dayjs()
    let scheduleDate = now.format('YYYY-MM-DD')
    let currentMin = now.hour() * 60 + now.minute()
    if (currentMin >= 20 * 60) {
      scheduleDate = now.add(1, 'day').format('YYYY-MM-DD')
      currentMin = 9 * 60
    } else {
      currentMin = Math.ceil(currentMin / 30) * 30
    }

    const fmt = (m) => {
      const hh = String(Math.floor(m / 60)).padStart(2, '0')
      const mm = String(m % 60).padStart(2, '0')
      return hh + ':' + mm + ':00'
    }

    for (const i of selectedSet.value) {
      const item = suggestions.value[i]
      const createdGoal = await goalStore.createAndReturn({
        title: item.title,
        parent_id: props.goal.id,
        estimated_hours: item.estimated_hours || null,
        start_date: props.goal.start_date || null,
        end_date: props.goal.end_date || null,
      })

      if (item.tasks?.length && createdGoal?.id) {
        for (const t of item.tasks) {
          const dur = t.estimated_minutes || 60
          // 跨天则推到次日 9:00
          if (currentMin + dur > 23 * 60 + 30) {
            scheduleDate = dayjs(scheduleDate).add(1, 'day').format('YYYY-MM-DD')
            currentMin = 9 * 60
          }
          try {
            await createTask({
              goal_id: createdGoal.id,
              title: t.title,
              task_date: scheduleDate,
              start_time: fmt(currentMin),
              end_time: fmt(currentMin + dur),
            })
            currentMin += dur
          } catch { /* 忽略单个任务失败 */ }
        }
      }
    }
    ElMessage.success(`已创建 ${selectedSet.value.size} 个子目标及其任务`)
    await goalStore.fetch()
    visible.value = false
  } catch (e) {
    ElMessage.error('部分创建失败：' + (e.response?.data?.message || e.message))
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.goal-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f0f7ff;
  border-radius: 8px;
  margin-bottom: 20px;
  color: #409eff;
}
.goal-name { font-weight: 600; font-size: 14px; color: #303133; }

.idle-body { text-align: center; padding: 16px 0 8px; }
.hint { color: #606266; font-size: 13px; line-height: 1.8; margin-bottom: 20px; }

.loading-body {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 32px 0; color: #909399; font-size: 14px;
}
.spin { font-size: 32px; color: #409eff; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-body { padding: 8px 0; }

.result-hint { font-size: 13px; color: #606266; margin-bottom: 12px; }

.subgoal-block {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  transition: border-color 0.2s;
}
.subgoal-block.selected { border-color: #409eff; background: #f0f7ff; }
.subgoal-check { margin-right: 0 !important; }
.subgoal-title { font-weight: 500; }
.hours-tag { margin-left: 8px; }

.task-list {
  margin: 8px 0 0 24px;
  display: flex; flex-direction: column; gap: 4px;
}
.task-item {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #606266;
}
.task-item .el-icon { color: #67c23a; font-size: 14px; }
.min-tag { font-size: 11px; margin-left: auto; }

.result-actions {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16px;
}
</style>
