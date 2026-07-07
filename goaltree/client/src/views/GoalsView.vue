<template>
  <div class="goals-page">
    <div class="page-header">
      <h2>目标管理</h2>
      <div class="header-right">
        <el-segmented v-model="viewMode" :options="viewOptions" />
        <el-button type="primary" :icon="Plus" @click="openCreate()">新建顶层目标</el-button>
        <el-dropdown v-if="goalStore.tree.length" trigger="click" @command="batchDelete">
          <el-button type="danger" plain :icon="Delete">批量清理</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="clearChildren">
                <el-icon><List /></el-icon> 清空子目标（保留根目标）
              </el-dropdown-item>
              <el-dropdown-item command="clearAll">
                <el-icon><Warning /></el-icon> 删除全部目标
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- ========== 进行中的目标 ========== -->
    <el-card v-loading="goalStore.loading" class="tree-card">
      <template #header>
        <span class="card-title">🎯 进行中</span>
      </template>
      <el-empty v-if="!goalStore.activeTree.length" description="暂无进行中的目标" />

      <template v-else>
        <el-tree
          v-if="viewMode === 'list'"
          :data="goalStore.activeTree"
          :props="{ label: 'title', children: 'children' }"
          node-key="id"
          default-expand-all
          class="goal-tree"
        >
          <template #default="{ data }">
            <div class="tree-node" @click="openDetail(data)">
              <div class="node-left">
                <el-icon class="node-icon"><Aim /></el-icon>
                <span class="node-title">{{ data.title }}</span>
                <el-tag size="small" type="info" class="node-tag">未完成</el-tag>
                <!-- 进度 -->
                <div v-if="progressMap[data.id] != null" class="node-progress">
                  <el-progress
                    :percentage="progressMap[data.id]"
                    :color="progressColor"
                    :stroke-width="6"
                    :show-text="false"
                    style="width:100px"
                  />
                  <span class="progress-text" :style="{ color: progressColor(progressMap[data.id]) }">
                    {{ progressFormat(data.id) }}
                  </span>
                </div>
                <el-tag v-else-if="getHours(data.id)" size="small" type="success" class="node-tag">
                  {{ getHours(data.id) }}
                </el-tag>
                <el-tag v-if="data.end_date" size="small" :type="getRemainTagType(data.end_date)" class="node-tag">
                  {{ getRemainText(data.end_date) }}
                </el-tag>
              </div>
              <div class="node-arrow">
                <el-icon><ArrowRight /></el-icon>
              </div>
            </div>
          </template>
        </el-tree>

        <GoalTreeChart
          v-else
          :data="goalStore.activeTree"
          :onNodeClick="handleNodeClick"
        />
      </template>
    </el-card>

    <!-- ========== 过往目标库 ========== -->
    <el-card v-if="goalStore.completedList.length" class="tree-card archive-card">
      <template #header>
        <div class="archive-header">
          <span class="card-title">📦 过往目标库</span>
          <span class="archive-count">共 {{ goalStore.completedList.length }} 个</span>
        </div>
      </template>
      <div class="archive-list">
        <div
          v-for="item in goalStore.completedList"
          :key="item.id"
          class="archive-item"
          @click="openDetail(item)"
        >
          <div class="archive-left">
            <el-icon class="archive-icon"><CircleCheckFilled /></el-icon>
            <span class="archive-title">{{ item.title }}</span>
            <el-tag size="small" type="success">已完成</el-tag>
            <span v-if="item.completed_at" class="archive-date">
              {{ dayjs(item.completed_at).format('YYYY-MM-DD HH:mm') }}
            </span>
          </div>
          <div class="node-arrow">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
      </div>
    </el-card>

    <!-- ========== 详情抽屉 ========== -->
    <el-drawer
      v-model="detailVisible"
      :title="detailGoal?.title || '目标详情'"
      size="420px"
      direction="rtl"
    >
      <template v-if="detailGoal">
        <div class="detail-body">
          <!-- 状态区域 -->
          <div class="detail-section">
            <div class="detail-label">状态</div>
            <div class="detail-status">
              <el-tag
                :type="detailGoal.completed_at ? 'success' : 'info'"
                size="large"
                effect="plain"
              >
                <el-icon style="margin-right:4px">
                  <CircleCheckFilled v-if="detailGoal.completed_at" />
                  <Clock v-else />
                </el-icon>
                {{ detailGoal.completed_at ? '已完成' : '未完成' }}
              </el-tag>
              <el-button
                :type="detailGoal.completed_at ? 'warning' : 'success'"
                :icon="detailGoal.completed_at ? RefreshRight : CircleCheck"
                size="small"
                plain
                @click="handleComplete(detailGoal)"
              >
                {{ detailGoal.completed_at ? '改为未完成' : '标记完成' }}
              </el-button>
            </div>
          </div>

          <!-- 描述 -->
          <div v-if="detailGoal.description" class="detail-section">
            <div class="detail-label">描述</div>
            <p class="detail-desc">{{ detailGoal.description }}</p>
          </div>

          <!-- 时间信息 -->
          <div class="detail-section">
            <div class="detail-label">时间信息</div>
            <div class="detail-info-grid">
              <div class="info-item">
                <span class="info-key">开始日期</span>
                <span class="info-val">{{ detailGoal.start_date || '未设置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-key">截止日期</span>
                <span class="info-val">{{ detailGoal.end_date || '未设置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-key">预估时长</span>
                <span class="info-val">{{ detailGoal.estimated_hours ? detailGoal.estimated_hours + 'h' : '未设置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-key">实际耗时</span>
                <span class="info-val">{{ getHours(detailGoal.id) || '暂无' }}</span>
              </div>
              <div class="info-item" v-if="detailGoal.completed_at">
                <span class="info-key">完成时间</span>
                <span class="info-val">{{ dayjs(detailGoal.completed_at).format('YYYY-MM-DD HH:mm') }}</span>
              </div>
            </div>
          </div>

          <!-- 进度 -->
          <div v-if="progressMap[detailGoal.id] != null" class="detail-section">
            <div class="detail-label">进度</div>
            <div class="detail-progress">
              <el-progress
                :percentage="progressMap[detailGoal.id]"
                :color="progressColor"
                :stroke-width="10"
              />
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="detail-actions">
          <el-button
            type="primary"
            :icon="MagicStick"
            @click="openAi(detailGoal); detailVisible = false"
            v-if="!detailGoal.completed_at"
          >AI 拆解</el-button>
          <el-button
            :icon="Plus"
            @click="openCreate(detailGoal); detailVisible = false"
            v-if="!detailGoal.completed_at"
          >添加子目标</el-button>
          <el-button
            :icon="Edit"
            @click="openEdit(detailGoal); detailVisible = false"
          >编辑</el-button>
          <el-popconfirm
            title="删除后子目标和相关任务会一并删除，确认？"
            @confirm="handleDelete(detailGoal.id); detailVisible = false"
          >
            <template #reference>
              <el-button type="danger" :icon="Delete" plain>删除</el-button>
            </template>
          </el-popconfirm>
        </div>
      </template>
    </el-drawer>

    <GoalForm
      v-model="formVisible"
      :edit-data="editTarget"
      :default-parent="defaultParent"
    />

    <AiDecomposeDialog v-model="aiVisible" :goal="aiTarget" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { Plus, Edit, Delete, Aim, MagicStick, Timer, List, Warning, CircleCheck, CircleCheckFilled, RefreshRight, ArrowRight, Clock } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useGoalStore } from '../stores/goals'
import { getGoalTime } from '../api/tasks'
import GoalForm from '../components/GoalForm.vue'
import GoalTreeChart from '../components/GoalTreeChart.vue'
import AiDecomposeDialog from '../components/AiDecomposeDialog.vue'

const goalStore = useGoalStore()
const formVisible = ref(false)
const editTarget = ref(null)
const defaultParent = ref(null)
const aiVisible = ref(false)
const aiTarget = ref(null)
const detailVisible = ref(false)
const detailGoal = ref(null)
const viewMode = ref('list')
const viewOptions = [
  { label: '列表', value: 'list' },
  { label: '图形', value: 'chart' },
]

// 目标耗时映射: id → total_hours
const hourMap = ref({})
// 目标预估时长映射: id → estimated_hours
const estimatedMap = ref({})
// 目标进度映射: id → progress (0-100 或 null)
const progressMap = ref({})

onMounted(async () => {
  await goalStore.fetch()
  loadGoalTimes()
})

async function loadGoalTimes() {
  try {
    const data = await getGoalTime()
    // 递归拍平所有目标及其耗时、预估、进度
    function flatten(g, resultH = {}, resultE = {}, resultP = {}) {
      resultH[g.id] = g.total_hours ?? 0
      resultE[g.id] = g.estimated_hours ?? 0
      resultP[g.id] = g.progress ?? null
      if (g.children) g.children.forEach(c => flatten(c, resultH, resultE, resultP))
      return { hours: resultH, estimated: resultE, progress: resultP }
    }
    const mapped = {}
    data.goals.forEach(g => flatten(g, mapped))
    hourMap.value = mapped.hours || {}
    estimatedMap.value = mapped.estimated || {}
    progressMap.value = mapped.progress || {}
  } catch { /* 静默 */ }
}

function getHours(id) {
  const h = hourMap.value[id]
  return h != null && h > 0 ? h + 'h' : ''
}

function getEstimated(id) {
  const e = estimatedMap.value[id]
  return e > 0 ? e + 'h' : ''
}

/**
 * 渐变色函数：<40% 红 → 40-80% 橙 → >80% 绿
 */
function progressColor(pct) {
  if (pct < 40) return '#f56c6c'
  if (pct < 80) return '#e6a23c'
  return '#67c23a'
}

function progressFormat(id) {
  const pct = progressMap.value[id]
  const actual = hourMap.value[id] ?? 0
  const estimated = estimatedMap.value[id] ?? 0
  if (pct == null || estimated <= 0) return getHours(id)
  return `${pct}%（${actual}h/${estimated}h）`
}

function openAi(data) {
  aiTarget.value = data
  aiVisible.value = true
}

function openCreate(parentData = null) {
  editTarget.value = null
  defaultParent.value = parentData
  formVisible.value = true
}

function openEdit(data) {
  editTarget.value = data
  formVisible.value = true
}

function openDetail(data) {
  detailGoal.value = data
  detailVisible.value = true
}

function getRemainText(endDate) {
  if (!endDate) return '未设截止'
  const days = dayjs(endDate).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天截止'
  return `剩余 ${days} 天`
}

function getRemainTagType(endDate) {
  if (!endDate) return 'info'
  const days = dayjs(endDate).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (days < 0) return 'danger'
  if (days <= 3) return 'danger'
  if (days <= 7) return 'warning'
  return 'success'
}

async function handleDelete(id) {
  try {
    await goalStore.remove(id)
    ElMessage.success('删除成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '删除失败')
  }
}

async function handleComplete(data) {
  try {
    await goalStore.complete(data.id)
    ElMessage.success(data.completed_at ? '目标已恢复到进行中' : '目标已完成，已移入过往目标库')
    loadGoalTimes()
    // 刷新 detail 中的数据
    if (detailGoal.value?.id === data.id) {
      detailVisible.value = false
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '操作失败')
  }
}

async function batchDelete(command) {
  const tree = goalStore.tree
  if (!tree.length) return

  if (command === 'clearChildren') {
    // 收集根目标的直接子节点 → 删父级联删孙
    const childIds = []
    tree.forEach(root => {
      if (root.children) root.children.forEach(c => childIds.push(c.id))
    })
    if (!childIds.length) {
      ElMessage.info('没有子目标可删除')
      return
    }
    try {
      await ElMessageBox.confirm(
        `将删除 ${childIds.length} 个子目标及其所有后代+任务，根目标保留。确认？`,
        '清空子目标',
        { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }
      )
    } catch { return }

    let count = 0
    for (const id of childIds) {
      try { await goalStore.remove(id); count++ } catch { /* skip */ }
    }
    await goalStore.fetch()
    ElMessage.success(`已删除 ${count} 个子目标`)
    loadGoalTimes()
  } else if (command === 'clearAll') {
    try {
      await ElMessageBox.confirm(
        '将删除全部目标及所有关联任务，不可恢复。确认？',
        '删除全部',
        { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }
      )
    } catch { return }

    let count = 0
    for (const root of tree) {
      try { await goalStore.remove(root.id); count++ } catch { /* skip */ }
    }
    await goalStore.fetch()
    ElMessage.success('已删除全部目标')
    loadGoalTimes()
  }
}

function handleNodeClick(nodeData) {
  // 节点点击处理逻辑
  console.log('节点点击:', nodeData)
  // 可以在这里添加编辑、查看详情等逻辑
}
</script>

<style scoped>
.goals-page { padding: 24px; max-width: 960px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.tree-card { border-radius: 12px; }
.goal-tree { --el-tree-node-content-height: 52px; }
.tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 4px 8px 4px 0;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}
.tree-node:hover { background: #f0f2f5; }
.node-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.node-icon { color: var(--el-color-primary); flex-shrink: 0; }
.node-title { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-tag { margin-left: 4px; flex-shrink: 0; }
.node-progress { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.progress-text { font-size: 12px; white-space: nowrap; }
.node-arrow { color: #c0c4cc; margin-left: 8px; flex-shrink: 0; }

/* 过往目标库 */
.archive-card { margin-top: 20px; }
.archive-header { display: flex; justify-content: space-between; align-items: center; }
.card-title { font-size: 15px; font-weight: 600; }
.archive-count { font-size: 13px; color: #909399; }
.archive-list { display: flex; flex-direction: column; gap: 8px; }
.archive-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.archive-item:hover { background: #ebeef5; }
.archive-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.archive-icon { color: #67c23a; font-size: 18px; flex-shrink: 0; }
.archive-title { font-size: 14px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.archive-date { font-size: 12px; color: #c0c4cc; flex-shrink: 0; }

/* 详情抽屉 */
.detail-body { padding-bottom: 20px; }
.detail-section { margin-bottom: 24px; }
.detail-label { font-size: 13px; color: #909399; margin-bottom: 8px; }
.detail-status { display: flex; align-items: center; gap: 12px; }
.detail-desc { margin: 0; font-size: 14px; color: #606266; line-height: 1.6; }
.detail-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-key { font-size: 12px; color: #909399; }
.info-val { font-size: 14px; color: #303133; }
.detail-progress { padding-top: 4px; }

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
.node-progress { display: flex; align-items: center; gap: 6px; margin-left: 4px; }
.progress-text { font-size: 12px; font-weight: 600; white-space: nowrap; }
.node-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.tree-node:hover .node-actions { opacity: 1; }
</style>