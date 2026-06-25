-- GoalTree 数据库初始化脚本
CREATE DATABASE IF NOT EXISTS goaltree CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE goaltree;

-- 目标表（树结构靠 parent_id 实现，顶层目标 parent_id 为 NULL）
CREATE TABLE IF NOT EXISTS goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id INT DEFAULT NULL,
  start_date DATE,
  end_date DATE,
  estimated_hours DECIMAL(8,1) DEFAULT NULL COMMENT '预估总时长（小时）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- 任务表
-- 状态不存字段，读取时动态计算：
--   completed_at 有值            → 已完成
--   completed_at 为 NULL 且现在 > end_time + 10分钟 → 未完成（过期）
--   completed_at 为 NULL 且还在窗口内              → 待完成（可点）
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goal_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  task_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  completed_at TIMESTAMP DEFAULT NULL,
  summary TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
