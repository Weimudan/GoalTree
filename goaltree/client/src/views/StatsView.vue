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

    <el-card v-loading="loading" class="chart-card">
      <el-empty v-if="!stats.length" description="暂无数据" />
      <div v-else ref="chartRef" style="height: 380px" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { getStatsRange } from '../api/tasks'

const range = ref([
  dayjs().subtract(13, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD'),
])
const stats = ref([])
const loading = ref(false)
const chartRef = ref(null)
let chart = null

onMounted(() => loadStats())

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

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['总任务', '已完成', '未完成'] },
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
        name: '总任务',
        type: 'bar',
        data: stats.value.map(d => d.total),
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '已完成',
        type: 'bar',
        stack: 'detail',
        data: stats.value.map(d => d.completed),
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '完成率',
        type: 'line',
        yAxisIndex: 1,
        data: stats.value.map(d => d.rate),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#e6a23c', width: 2 },
        itemStyle: { color: '#e6a23c' },
      },
    ],
  })
}
</script>

<style scoped>
.stats-page { padding: 24px; max-width: 900px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }
.chart-card { border-radius: 12px; }
</style>
