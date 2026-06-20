<template>
  <el-container class="layout">
    <el-header class="header">
      <div class="logo">
        <el-icon size="22" color="#409eff"><TrendCharts /></el-icon>
        <span>GoalTree</span>
      </div>
      <el-menu
        mode="horizontal"
        :default-active="$route.path"
        router
        class="nav"
        :ellipsis="false"
      >
        <el-menu-item index="/today">
          <el-icon><Calendar /></el-icon>今日任务
        </el-menu-item>
        <el-menu-item index="/goals">
          <el-icon><Aim /></el-icon>目标管理
        </el-menu-item>
        <el-menu-item index="/stats">
          <el-icon><TrendCharts /></el-icon>完成统计
        </el-menu-item>
      </el-menu>
    </el-header>

    <el-main class="main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { Calendar, Aim, TrendCharts } from '@element-plus/icons-vue'
</script>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f5f7fa; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.layout { min-height: 100vh; }
.header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 24px;
  height: 56px !important;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  color: #303133;
  margin-right: 32px;
  white-space: nowrap;
}
.nav { flex: 1; border-bottom: none !important; height: 56px; }
.main { padding: 0; background: #f5f7fa; }
</style>
