<template>
  <div ref="chartRef" class="goal-tree-chart" />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const chartRef = ref(null)
let chart = null

// 把 API 返回的树（用 title + children）转成 ECharts 需要的格式（用 name + children）
function toEchartsTree(nodes) {
  return nodes.map(node => ({
    name: node.title,
    value: node.id,
    // 有时间范围就显示在 tooltip
    extra: node.start_date ? `${node.start_date} ~ ${node.end_date || '未定'}` : '',
    children: node.children?.length ? toEchartsTree(node.children) : undefined,
    // 叶节点（无子目标）用不同样式区分
    itemStyle: node.children?.length
      ? {}
      : { color: '#67c23a', borderColor: '#4db330' },
    label: {
      color: node.children?.length ? '#303133' : '#fff',
      backgroundColor: node.children?.length ? 'transparent' : '#67c23a',
    },
  }))
}

function buildOption(tree) {
  const echartsData = toEchartsTree(tree)

  // 多个根目标时套一个虚拟根节点
  const root = echartsData.length === 1
    ? echartsData[0]
    : { name: '我的目标', children: echartsData, itemStyle: { color: '#409eff' } }

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const extra = p.data.extra
        return extra ? `${p.data.name}<br/>${extra}` : p.data.name
      },
    },
    series: [
      {
        type: 'tree',
        data: [root],
        top: '5%',
        left: '12%',
        bottom: '5%',
        right: '20%',
        symbolSize: 10,
        orient: 'LR',          // 左到右布局
        expandAndCollapse: true,
        initialTreeDepth: 3,   // 默认展开 3 层
        label: {
          position: 'left',
          verticalAlign: 'middle',
          align: 'right',
          fontSize: 13,
          color: '#303133',
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
          },
        },
        itemStyle: {
          color: '#409eff',
          borderColor: '#2d7fd4',
          borderWidth: 2,
        },
        lineStyle: {
          color: '#c0c4cc',
          width: 1.5,
          curveness: 0.5,
        },
        emphasis: {
          focus: 'descendant',
        },
        animationDuration: 400,
        animationDurationUpdate: 300,
      },
    ],
  }
}

function render() {
  if (!chart || !props.data.length) return
  chart.setOption(buildOption(props.data))
}

onMounted(async () => {
  await nextTick()
  chart = echarts.init(chartRef.value)
  render()

  const ro = new ResizeObserver(() => chart?.resize())
  ro.observe(chartRef.value)
  onBeforeUnmount(() => ro.disconnect())
})

onBeforeUnmount(() => {
  chart?.dispose()
  chart = null
})

watch(() => props.data, render, { deep: true })
</script>

<style scoped>
.goal-tree-chart {
  width: 100%;
  height: 480px;
}
</style>
