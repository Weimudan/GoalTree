<template>
  <div class="stats-page">
    <div class="page-header">
      <h2>完成统计</h2>
      <el-date-picker
        v-model="range"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="loadStats"
      />
    </div>

    <!-- 全局总耗时 -->
    <el-card class="total-card">
      <div class="total-hours">
        <span class="total-label">累计投入</span>
        <span class="total-value">{{ goalTimeData.global_total_hours ?? '--' }}</span>
        <span class="total-unit">/ 10000 小时</span>
      </div>
      <el-progress
        :percentage="totalProgress"
        :stroke-width="12"
        :color="'#409eff'"
        class="total-progress"
      />
    </el-card>

    <!-- 完成率图 -->
    <el-card v-loading="loading" class="chart-card">
      <el-empty v-if="!stats.length" description="暂无数据" />
      <div v-else ref="chartRef" style="height: 380px" />
    </el-card>

    <!-- 目标耗时图 -->
    <el-card v-if="goalTimeData.goals?.length" class="chart-card">
      <div ref="goalChartRef" style="height: 360px" />
    </el-card>

    <!-- 时间热力图 -->
    <el-card v-if="heatmapData.length" class="chart-card">
      <div ref="heatmapRef" style="height: 220px" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { getStatsRange, getGoalTime, getTimeHeatmap } from '../api/tasks'

const range = ref([
  dayjs().subtract(13, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD'),
])
const stats = ref([])
const loading = ref(false)
const goalTimeData = ref({ goals: [], global_total_hours: 0 })
const heatmapData = ref([])

const chartRef = ref(null)
const goalChartRef = ref(null)
const heatmapRef = ref(null)
let chart = null
let goalChart = null
let heatmapChart = null

const totalProgress = computed(() => {
  const h = goalTimeData.value.global_total_hours || 0
  return Math.min(Math.round((h / 10000) * 100), 100)
})

onMounted(() => { loadStats(); loadGoalTime(); loadHeatmap() })

watch(range, () => { loadStats(); loadHeatmap() })

async function loadStats() {
  if (!range.value?.length) return
  loading.value = true
  try {
    stats.value = await getStatsRange(range.value[0], range.value[1])
    await nextTick()
    renderChart()
  } catch {
    stats.value = []
  } finally {
    loading.value = false
  }
}

async function loadGoalTime() {
  try {
    goalTimeData.value = await getGoalTime()
    await nextTick()
    renderGoalChart()
  } catch { goalTimeData.value = { goals: [], global_total_hours: 0 } }
}

async function loadHeatmap() {
  if (!range.value?.length) return
  try {
    heatmapData.value = await getTimeHeatmap(range.value[0], range.value[1])
    await nextTick()
    renderHeatmap()
  } catch { heatmapData.value = [] }
}

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['总任务', '已完成', '完成率'] },
    xAxis: {
      type: 'category',
      data: stats.value.map(d => d.date),
      axisLabel: { rotate: 30 },
    },
    yAxis: [
      { type: 'value', name: '任务数', minInterval: 1 },
      { type: 'value', name: '完成率 %', min: 0, max: 100 },
    ],
    series: [
      {
        name: '总任务', type: 'bar',
        data: stats.value.map(d => d.total),
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '已完成', type: 'bar', stack: 'detail',
        data: stats.value.map(d => d.completed),
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '完成率', type: 'line', yAxisIndex: 1,
        data: stats.value.map(d => d.rate),
        smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { color: '#e6a23c', width: 2 },
        itemStyle: { color: '#e6a23c' },
      },
    ],
  })
}

function flattenGoals(goals, result = []) {
  goals.forEach(g => {
    result.push(g)
    if (g.children?.length) flattenGoals(g.children, result)
  })
  return result
}

function renderGoalChart() {
  if (!goalChartRef.value || !goalTimeData.value.goals?.length) return
  if (!goalChart) goalChart = echarts.init(goalChartRef.value)

  const flat = flattenGoals(goalTimeData.value.goals)
    .filter(g => g.total_hours > 0)
    .sort((a, b) => b.total_hours - a.total_hours)
    .slice(0, 15)

  const names = flat.map(g => g.title.length > 10 ? g.title.slice(0, 10) + '…' : g.title)
  const hours = flat.map(g => g.total_hours)
  const estimates = flat.map(g => g.estimated_hours || 0)

  const series = [{
    name: '实际耗时', type: 'bar',
    data: hours,
    itemStyle: { color: '#409eff', borderRadius: [0, 4, 4, 0] },
    label: { show: true, position: 'right', formatter: '{c}h' },
  }]
  if (estimates.some(e => e > 0)) {
    series.push({
      name: '预估时长', type: 'bar',
      data: estimates,
      itemStyle: { color: '#e6a23c', borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: '{c}h' },
    })
  }

  goalChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: estimates.some(e => e > 0) ? ['实际耗时', '预估时长'] : ['实际耗时'] },
    grid: { left: '3%', right: '8%', top: '3%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', name: '小时' },
    yAxis: { type: 'category', data: names.reverse(), inverse: true },
    series: series.map(s => ({ ...s, data: s.data.reverse() })),
  })
}

function renderHeatmap() {
  if (!heatmapRef.value || !heatmapData.value.length) return
  if (!heatmapChart) heatmapChart = echarts.init(heatmapRef.value)

  const data = heatmapData.value.map(d => [d.date, d.hours])
  const maxHours = Math.max(...heatmapData.value.map(d => d.hours), 1)
  const startDate = range.value[0]
  const endDate = range.value[1]

  heatmapChart.setOption({
    tooltip: {
      formatter: p => `${p.value[0]}<br/>投入 ${p.value[1]} 小时`,
    },
    visualMap: {
      min: 0, max: maxHours,
      orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] },
      text: ['高', '低'],
    },
    calendar: {
      range: [startDate, endDate],
      cellSize: ['auto', 16],
      yearLabel: { show: true },
      dayLabel: { firstDay: 1 },
    },
    series: [{
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: data,
    }],
  })
}
</script>

<style scoped>
.stats-page { padding: 24px; max-width: 900px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }
.chart-card { border-radius: 12px; margin-bottom: 20px; }

.total-card { border-radius: 12px; margin-bottom: 20px; text-align: center; }
.total-hours { display: flex; align-items: baseline; justify-content: center; gap: 6px; margin-bottom: 12px; }
.total-label { font-size: 14px; color: #909399; }
.total-value { font-size: 36px; font-weight: 700; color: #409eff; }
.total-unit { font-size: 16px; color: #909399; }
.total-progress { max-width: 400px; margin: 0 auto; }
</style>
