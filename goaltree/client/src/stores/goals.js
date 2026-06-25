import { defineStore } from 'pinia'
import { getGoalTree, createGoal, updateGoal, deleteGoal } from '../api/goals'

// 把树拍平成列表，方便 el-select 选父目标
function flattenTree(nodes, result = []) {
  for (const node of nodes) {
    result.push({ id: node.id, title: node.title, parent_id: node.parent_id })
    if (node.children?.length) flattenTree(node.children, result)
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
  },
})
