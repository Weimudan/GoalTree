import { defineStore } from 'pinia'
import { getGoalTree, createGoal, updateGoal, deleteGoal, completeGoal } from '../api/goals'

// 把树拍平成列表，方便 el-select 选父目标
// depth 用于在下拉列表中显示层级缩进
function flattenTree(nodes, result = [], depth = 0) {
  for (const node of nodes) {
    result.push({ id: node.id, title: node.title, parent_id: node.parent_id, depth, completed_at: node.completed_at })
    if (node.children?.length) flattenTree(node.children, result, depth + 1)
  }
  return result
}

// 递归过滤：仅保留未完成的目标（已完成节点及其子树全部移除）
function filterActiveTree(nodes) {
  return nodes
    .filter(n => !n.completed_at)
    .map(n => ({
      ...n,
      children: n.children ? filterActiveTree(n.children) : []
    }))
}

// 递归收集：提取所有已完成的目标（拍平，不再保留树结构）
function collectCompleted(nodes, result = []) {
  for (const node of nodes) {
    if (node.completed_at) result.push(node)
    if (node.children?.length) collectCompleted(node.children, result)
  }
  return result
}

export const useGoalStore = defineStore('goals', {
  state: () => ({
    tree: [],
    loading: false,
  }),
  getters: {
    flatList: (state) => flattenTree(state.tree),
    // 仅未完成目标，供任务/目标选择器使用
    flatActiveList: (state) => {
      const activeTree = filterActiveTree(state.tree)
      return flattenTree(activeTree)
    },
    // 活跃目标树（主视图用）
    activeTree: (state) => filterActiveTree(state.tree),
    // 已完成目标列表（过往目标库）
    completedList: (state) => collectCompleted(state.tree),
  },
  actions: {
    async fetch() {
      this.loading = true
      try {
        this.tree = await getGoalTree()
      } catch {
        // 后端未就绪时静默失败，保持空树
      } finally {
        this.loading = false
      }
    },
    async create(data) {
      await createGoal(data)
      await this.fetch()
    },
    async createAndReturn(data) {
      const created = await createGoal(data)
      await this.fetch()
      return created
    },
    async update(id, data) {
      await updateGoal(id, data)
      await this.fetch()
    },
    async remove(id) {
      await deleteGoal(id)
      await this.fetch()
    },
    async complete(id) {
      await completeGoal(id)
      await this.fetch()
    },
  },
})
