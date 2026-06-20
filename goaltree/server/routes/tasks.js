const express = require('express');
const router = express.Router();
const db = require('../db');

// 动态计算任务状态（不存库，读取时算）
// status: 'upcoming' | 'pending' | 'completed' | 'expired'
//   upcoming  — 还没到开始时间
//   pending   — 在 [start_time, end_time+10min] 窗口内，可点完成
//   completed — 已完成
//   expired   — 超过 end_time+10min 仍未完成
function calcStatus(task) {
  if (task.completed_at) return 'completed';
  const now = new Date();
  const start = new Date(`${task.task_date}T${task.start_time}+08:00`);
  const deadline = new Date(`${task.task_date}T${task.end_time}+08:00`);
  deadline.setMinutes(deadline.getMinutes() + 10);
  if (now < start) return 'upcoming';
  if (now > deadline) return 'expired';
  return 'pending';
}

function formatTask(task) {
  return { ...task, status: calcStatus(task) };
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
    res.json(rows.map(formatTask));
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

module.exports = router;
