<template>
  <div class="goals-page">
    <div class="page-header">
      <h2>目标管理</h2>
      <div class="header-right">
        <el-segmented v-model="viewMode" :options="viewOptions" />
        <el-button type="primary" :icon="Plus" @click="openCreate()">新建顶层目标</el-button>
      </div>
    </div>

    <el-card v-loading="goalStore.loading" class="tree-card">
      <el-empty v-if="!goalStore.tree.length" description="还没有目标，点击右上角新建吧" />

      <template v-else>
        <!-- 列表视图 -->
        <el-tree
          v-if="viewMode === 'list'"
          :data="goalStore.tree"
          :props="{ label: 'title', children: 'children' }"
          node-key="id"
          default-expand-all
          class="goal-tree"
        >
          <template #default="{ data }">
            <div class="tree-node">
              <div class="node-left">
                <el-icon class="node-icon"><Aim /></el-icon>
                <span class="node-title">{{ data.title }}</span>
                <el-tag v-if="data.start_date" size="small" type="info" class="node-tag">
                  {{ formatDate(data.start_date) }} ~ {{ formatDate(data.end_date) || '未定' }}
                </el-tag>
              </div>
              <div class="node-actions">
                <el-button
                  v-if="!data.parent_id"
                  size="small"
                  text
                  type="primary"
                  :icon="MagicStick"
                  @click.stop="openAi(data)"
                >AI拆解</el-button>
                <el-button size="small" text :icon="Plus" @click.stop="openCreate(data)">子目标</el-button>
                <el-button size="small" text :icon="Edit" @click.stop="openEdit(data)">编辑</el-button>
                <el-popconfirm
                  title="删除后子目标和相关任务会一并删除，确认？"
                  @confirm="handleDelete(data.id)"
                >
                  <template #reference>
                    <el-button size="small" text type="danger" :icon="Delete" @click.stop>删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </template>
        </el-tree>

        <!-- 图形视图 -->
        <GoalTreeChart v-else :data="goalStore.tree" />
      </template>
    </el-card>

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
import { Plus, Edit, Delete, Aim, MagicStick } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useGoalStore } from '../stores/goals'
import GoalForm from '../components/GoalForm.vue'
import GoalTreeChart from '../components/GoalTreeChart.vue'
import AiDecomposeDialog from '../components/AiDecomposeDialog.vue'

const goalStore = useGoalStore()
const formVisible = ref(false)
const editTarget = ref(null)
const defaultParent = ref(null)
const aiVisible = ref(false)
const aiTarget = ref(null)
const viewMode = ref('list')
const viewOptions = [
  { label: '列表', value: 'list' },
  { label: '图形', value: 'chart' },
]

onMounted(() => goalStore.fetch())

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

function formatDate(d) {
  return d ? dayjs(d).format('YYYY-MM-DD') : null
}

async function handleDelete(id) {
  try {
    await goalStore.remove(id)
    ElMessage.success('删除成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '删除失败')
  }
}
</script>

<style scoped>
.goals-page { padding: 24px; max-width: 960px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.tree-card { border-radius: 12px; }
.goal-tree { --el-tree-node-content-height: 48px; }
.tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 8px;
}
.node-left { display: flex; align-items: center; gap: 8px; }
.node-icon { color: var(--el-color-primary); }
.node-title { font-size: 14px; }
.node-tag { margin-left: 4px; }
.node-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.tree-node:hover .node-actions { opacity: 1; }
</style>
