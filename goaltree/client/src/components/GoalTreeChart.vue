<template>
  <div ref="chartRef" class="goal-tree-chart" />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, onUpdated } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: { type: Array, default: () => [] },
  onNodeClick: { type: Function, default: null },
})

const chartRef = ref(null)
let chart = null
const zoomLevel = ref(1)
const panPosition = ref({ x: 0, y: 0 })

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
    // 添加可拖拽属性
    draggable: true,
    // 添加节点数据用于事件处理
    nodeData: node,
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
        // 添加交互配置
        roam: true,  // 开启鼠标缩放和平移
        zoom: 1,     // 初始缩放级别
        // 添加事件处理
        nodeClick: (params) => {
          if (props.onNodeClick) {
            props.onNodeClick(params.data.nodeData)
          }
        },
        // 优化大数据量渲染
        layout: 'orthogonal',  // 使用正交布局，更适合树结构
        large: true,          // 启用大数据量优化
        largeThreshold: 1000,  // 大数据量阈值
      },
    ],
    // 添加全局交互配置
    toolbox: {
      show: true,
      feature: {
        saveAsImage: { show: true },
        restore: { show: true },
        zoom: {
          title: '缩放',
          yAxisIndex: 'none',
        },
        dataView: {
          title: '数据视图',
          readOnly: false,
        },
      },
    },
    // 添加缩放控制
    dataZoom: [
      {
        type: 'inside',
        min: 0.1,
        max: 5,
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        min: 0.1,
        max: 5,
        start: 0,
        end: 100,
        bottom: 10,
      },
    ],
  }
}

function render() {
  if (!chart || !props.data.length) return

  // 应用缩放和平移
  const option = buildOption(props.data)
  option.series[0].zoom = zoomLevel.value
  option.series[0].x = panPosition.value.x
  option.series[0].y = panPosition.value.y

  chart.setOption(option)
}

// 处理缩放事件
function handleZoom(event) {
  if (event.type === 'zoom') {
    zoomLevel.value = event.scale
    render()
  } else if (event.type === 'pan') {
    panPosition.value.x += event.dx
    panPosition.value.y += event.dy
    render()
  }
}

onMounted(async () => {
  await nextTick()
  chart = echarts.init(chartRef.value)

  // 监听缩放和平移事件
  chart.on('zoom', handleZoom)
  chart.on('pan', handleZoom)

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
watch(() => zoomLevel.value, render)
watch(() => panPosition.value, render)
</script>

<style scoped>
.goal-tree-chart {
  width: 100%;
  height: 480px;
}

/* 添加缩放控制按钮样式 */
.echarts-toolbox {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}
</style>
