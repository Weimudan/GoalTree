<template>
  <el-dialog v-model="visible" title="AI 目标拆解" width="500px" @closed="reset">
    <!-- 目标信息 -->
    <div class="goal-info">
      <el-icon><Aim /></el-icon>
      <span class="goal-name">{{ goal?.title }}</span>
    </div>

    <!-- 初始状态：还没拆解 -->
    <div v-if="state === 'idle'" class="idle-body">
      <p class="hint">AI 会根据目标名称和时间范围，自动拆解出 3～5 个可执行的子目标，你可以按需勾选后一键创建。</p>
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
      <p class="result-hint">已为你拆解出以下子目标，勾选想要创建的：</p>
      <el-checkbox-group v-model="selected" class="checkbox-list">
        <el-checkbox
          v-for="(s, i) in suggestions"
          :key="i"
          :label="s"
          class="checkbox-item"
        >
          {{ s }}
        </el-checkbox>
      </el-checkbox-group>
      <div class="result-actions">
        <el-button text @click="runDecompose">重新生成</el-button>
        <div>
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!selected.length"
            :loading="creating"
            @click="handleCreate"
          >
            创建选中的 {{ selected.length }} 个子目标
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
import { Aim, MagicStick, Loading } from '@element-plus/icons-vue'
import { decomposeGoal } from '../api/ai'
import { useGoalStore } from '../stores/goals'

const props = defineProps({
  modelValue: Boolean,
  goal: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const goalStore = useGoalStore()
const state = ref('idle')       // idle | loading | done | error
const suggestions = ref([])
const selected = ref([])
const errorMsg = ref('')
const creating = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// 每次打开都重置
watch(visible, (v) => { if (v) reset() })

function reset() {
  state.value = 'idle'
  suggestions.value = []
  selected.value = []
  errorMsg.value = ''
}

async function runDecompose() {
  state.value = 'loading'
  try {
    suggestions.value = await decomposeGoal(props.goal)
    selected.value = [...suggestions.value]   // 默认全选
    state.value = 'done'
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'AI 服务暂时不可用，请稍后重试'
    state.value = 'error'
  }
}

async function handleCreate() {
  creating.value = true
  try {
    for (const title of selected.value) {
      await goalStore.create({
        title,
        parent_id: props.goal.id,
        start_date: props.goal.start_date || null,
        end_date: props.goal.end_date || null,
      })
    }
    ElMessage.success(`已创建 ${selected.value.length} 个子目标`)
    visible.value = false
  } catch {
    ElMessage.error('部分子目标创建失败，请重试')
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: #909399;
  font-size: 14px;
}
.spin { font-size: 32px; color: #409eff; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-body { padding: 8px 0; }

.result-hint { font-size: 13px; color: #606266; margin-bottom: 12px; }
.checkbox-list { display: flex; flex-direction: column; gap: 4px; }
.checkbox-item {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  margin: 0 !important;
  transition: background 0.15s;
}
.checkbox-item:hover { background: #f5f7fa; }
.result-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
}
</style>
