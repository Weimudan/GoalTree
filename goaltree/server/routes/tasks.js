const express = require('express');
const router = express.Router();
const db = require('../db');

// 状态计算缓存，提高性能
const statusCache = new Map();

// 动态计算任务状态（不存库，读取时算）
// status: 'upcoming' | 'pending' | 'completed' | 'expired'
//   upcoming  — 还没到开始时间
//   pending   — 在 [start_time, end_time+10min] 窗口内，可点完成
//   completed — 已完成
//   expired   — 超过 end_time+10min 仍未完成
function calcStatus(task) {
  if (task.completed_at) return 'completed';

  // 使用缓存键
  const cacheKey = `${task.task_date}-${task.start_time}-${task.end_time}`;
  if (statusCache.has(cacheKey)) {
    return statusCache.get(cacheKey);
  }

  const now = new Date();
  const start = new Date(`${task.task_date}T${task.start_time}+08:00`);
  const deadline = new Date(`${task.task_date}T${task.end_time}+08:00`);
  deadline.setMinutes(deadline.getMinutes() + 10);

  // 优化：使用时间戳比较，提高性能
  const nowTimestamp = now.getTime();
  const startTimestamp = start.getTime();
  const deadlineTimestamp = deadline.getTime();

  let status;
  if (nowTimestamp < startTimestamp) status = 'upcoming';
  else if (nowTimestamp > deadlineTimestamp) status = 'expired';
  else status = 'pending';

  // 缓存结果
  statusCache.set(cacheKey, status);
  return status;
}

function formatTask(task) {
  return { ...task, status: calcStatus(task) };
}

// 批量计算任务状态，提高性能
function batchFormatTasks(tasks) {
  return tasks.map(formatTask);
}

// 清理缓存（可选：可以添加定时清理逻辑）
function clearStatusCache() {
  statusCache.clear();
}

// GET /api/tasks?date=2026-06-19 — 查询某天的所有任务（含状态）
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: '请传 date 参数，格式 YYYY-MM-DD' });

  try {
    const [rows] = await db.query(
      `SELECT t.*, g.title AS goal_title
       FROM tasks t
       LEFT JOIN goals g ON t.goal_id = g.id
       WHERE t.task_date = ?
       ORDER BY t.start_time ASC`,
      [date]
    );

    // 使用批量格式化，提高性能
    res.json(batchFormatTasks(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/:id — 单个任务详情
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT t.*, g.title AS goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id WHERE t.id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: '任务不存在' });
    res.json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tasks — 新建任务
router.post('/', async (req, res) => {
  const { goal_id, title, task_date, start_time, end_time } = req.body;
  if (!goal_id || !title || !task_date || !start_time || !end_time) {
    return res.status(400).json({ message: 'goal_id、title、task_date、start_time、end_time 均为必填' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ message: '开始时间必须早于结束时间' });
  }

  try {
    const [goal] = await db.query('SELECT id FROM goals WHERE id = ?', [goal_id]);
    if (!goal.length) return res.status(400).json({ message: '目标不存在' });

    const [result] = await db.query(
      'INSERT INTO tasks (goal_id, title, task_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
      [goal_id, title, task_date, start_time, end_time]
    );
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/tasks/:id — 修改任务基本信息
router.put('/:id', async (req, res) => {
  const { goal_id, title, task_date, start_time, end_time } = req.body;
  if (!goal_id || !title || !task_date || !start_time || !end_time) {
    return res.status(400).json({ message: '所有字段均为必填' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ message: '开始时间必须早于结束时间' });
  }

  try {
    const [result] = await db.query(
      'UPDATE tasks SET goal_id=?, title=?, task_date=?, start_time=?, end_time=? WHERE id=?',
      [goal_id, title, task_date, start_time, end_time, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: '任务不存在' });
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tasks/:id/complete — 标记完成（核心校验）
router.post('/:id/complete', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '任务不存在' });

    const task = rows[0];
    if (task.completed_at) {
      return res.status(400).json({ message: '任务已经完成过了' });
    }

    const now = new Date();
    const start = new Date(`${task.task_date}T${task.start_time}+08:00`);
    const deadline = new Date(`${task.task_date}T${task.end_time}+08:00`);
    deadline.setMinutes(deadline.getMinutes() + 10);

    if (now < start) {
      return res.status(400).json({ message: '任务还未开始，不能标记完成' });
    }
    if (now > deadline) {
      return res.status(400).json({ message: '已超过可完成时间窗口（结束后10分钟），无法标记完成' });
    }

    await db.query('UPDATE tasks SET completed_at = NOW() WHERE id = ?', [req.params.id]);
    const [updated] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(formatTask(updated[0]));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id/summary — 保存优化总结（完成或过期后可写）
router.patch('/:id/summary', async (req, res) => {
  const { summary } = req.body
  if (summary === undefined) return res.status(400).json({ message: '请传 summary 字段' })

  try {
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: '任务不存在' })

    const task = rows[0]
    const status = calcStatus(task)
    if (status === 'pending') {
      return res.status(400).json({ message: '任务还未结束，不能写总结' })
    }

    await db.query('UPDATE tasks SET summary = ? WHERE id = ?', [summary || null, req.params.id])
    const [updated] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id])
    res.json(formatTask(updated[0]))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/tasks/:id — 删除任务
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: '任务不存在' });
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/stats?start=2026-06-01&end=2026-06-30 — 完成率统计（供 ECharts 用）
router.get('/stats/range', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ message: '请传 start 和 end 参数' });

  try {
    const [rows] = await db.query(
      `SELECT
         task_date,
         COUNT(*) AS total,
         SUM(completed_at IS NOT NULL) AS completed
       FROM tasks
       WHERE task_date BETWEEN ? AND ?
       GROUP BY task_date
       ORDER BY task_date ASC`,
      [start, end]
    );
    // 补全：加上 expired 数（过期且未完成）
    const now = new Date();
    const result = rows.map(row => {
      const expired = Number(row.total) - Number(row.completed);
      return {
        date: row.task_date,
        total: Number(row.total),
        completed: Number(row.completed),
        // 这里简化处理：历史日期的未完成全算 expired
        expired: row.task_date < now.toISOString().slice(0, 10) ? expired : 0,
        rate: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/stats/goal-time — 递归计算每个目标的累计耗时 + 全局总耗时
router.get('/stats/goal-time', async (req, res) => {
  try {
    // 获取所有目标
    const [goals] = await db.query('SELECT * FROM goals ORDER BY created_at ASC');

    // 获取所有已完成任务及其耗时（小时）
    const [tasks] = await db.query(
      `SELECT goal_id, TIME_TO_SEC(TIMEDIFF(end_time, start_time)) / 3600 AS hours
       FROM tasks
       WHERE completed_at IS NOT NULL`
    );

    // 按 goal_id 汇总耗时
    const goalTimeMap = {};
    tasks.forEach(t => {
      goalTimeMap[t.goal_id] = (goalTimeMap[t.goal_id] || 0) + Number(t.hours);
    });

    // 构建 id→goal 映射
    const goalMap = {};
    goals.forEach(g => { goalMap[g.id] = { ...g, children: [] }; });

    // 建立父子关系
    const roots = [];
    goals.forEach(g => {
      if (g.parent_id) {
        goalMap[g.parent_id]?.children.push(goalMap[g.id]);
      } else {
        roots.push(goalMap[g.id]);
      }
    });

    // 递归计算每个目标的累计耗时（自身任务耗时 + 所有子孙目标耗时）
    function calcTotalHours(node) {
      let total = goalTimeMap[node.id] || 0;
      if (node.children) {
        node.children.forEach(child => { total += calcTotalHours(child); });
      }
      node.total_hours = Math.round(total * 10) / 10;  // 保留1位小数
      return total;
    }
    roots.forEach(r => calcTotalHours(r));

    // 全局总耗时
    const globalTotal = Object.values(goalTimeMap).reduce((a, b) => a + b, 0);

    res.json({
      goals: roots,
      global_total_hours: Math.round(globalTotal * 10) / 10,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/stats/heatmap?start=&end= — 按日期聚合已完成任务时长
router.get('/stats/heatmap', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ message: '请传 start 和 end 参数' });

  try {
    const [rows] = await db.query(
      `SELECT task_date,
              ROUND(SUM(TIME_TO_SEC(TIMEDIFF(end_time, start_time))) / 3600, 1) AS hours
       FROM tasks
       WHERE completed_at IS NOT NULL
         AND task_date BETWEEN ? AND ?
       GROUP BY task_date
       ORDER BY task_date ASC`,
      [start, end]
    );
    res.json(rows.map(r => ({ date: r.task_date, hours: Number(r.hours) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
