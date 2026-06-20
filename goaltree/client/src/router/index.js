import { createRouter, createWebHistory } from 'vue-router'
import TodayView from '../views/TodayView.vue'
import GoalsView from '../views/GoalsView.vue'
import StatsView from '../views/StatsView.vue'

const routes = [
  { path: '/', redirect: '/today' },
  { path: '/today', component: TodayView, meta: { title: '今日任务' } },
  { path: '/goals', component: GoalsView, meta: { title: '目标管理' } },
  { path: '/stats', component: StatsView, meta: { title: '完成统计' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
