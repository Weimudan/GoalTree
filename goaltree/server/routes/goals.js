const express = require('express');
const router = express.Router();
const db = require('../db');

// 把扁平数组组装成树
function buildTree(nodes) {
  const map = {};
  const roots = [];
  nodes.forEach(n => { map[n.id] = { ...n, children: [] }; });
  nodes.forEach(n => {
    if (n.parent_id) {
      map[n.parent_id]?.children.push(map[n.id]);
    } else {
      roots.push(map[n.id]);
    }
  });
  return roots;
}

// GET /api/goals — 返回完整目标树
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM goals ORDER BY created_at ASC'
    );
    res.json(buildTree(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/goals/:id — 获取单个目标（含子目标）
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM goals WHERE id = ? OR parent_id = ?',
      [req.params.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: '目标不存在' });
    res.json(buildTree(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals — 新建目标
router.post('/', async (req, res) => {
  const { title, description, parent_id, start_date, end_date, estimated_hours } = req.body;
  if (!title) return res.status(400).json({ message: 'title 不能为空' });

  try {
    // 如果指定了父目标，校验父目标存在
    if (parent_id) {
      const [parent] = await db.query('SELECT id FROM goals WHERE id = ?', [parent_id]);
      if (!parent.length) return res.status(400).json({ message: '父目标不存在' });
    }

    const [result] = await db.query(
      'INSERT INTO goals (title, description, parent_id, start_date, end_date, estimated_hours) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description || null, parent_id || null, start_date || null, end_date || null, estimated_hours || null]
    );
    const [rows] = await db.query('SELECT * FROM goals WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/goals/:id — 修改目标
router.put('/:id', async (req, res) => {
  const { title, description, parent_id, start_date, end_date, estimated_hours, completed_at } = req.body;
  if (!title) return res.status(400).json({ message: 'title 不能为空' });

  try {
    // 防止把自己设成自己的子目标（循环引用）
    if (parent_id && Number(parent_id) === Number(req.params.id)) {
      return res.status(400).json({ message: '不能将自己设为自己的父目标' });
    }

    const [result] = await db.query(
      'UPDATE goals SET title=?, description=?, parent_id=?, start_date=?, end_date=?, estimated_hours=?, completed_at=? WHERE id=?',
      [title, description || null, parent_id || null, start_date || null, end_date || null, estimated_hours || null, completed_at || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: '目标不存在' });

    const [rows] = await db.query('SELECT * FROM goals WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals/:id/complete — 切换目标完成状态
router.post('/:id/complete', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM goals WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '目标不存在' });

    const goal = rows[0];
    if (goal.completed_at) {
      // 已完成的 → 取消完成
      await db.query('UPDATE goals SET completed_at = NULL WHERE id = ?', [req.params.id]);
    } else {
      // 未完成 → 标记完成
      await db.query('UPDATE goals SET completed_at = NOW() WHERE id = ?', [req.params.id]);
    }

    const [updated] = await db.query('SELECT * FROM goals WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/goals/:id — 删除目标（子目标随外键级联删除）
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM goals WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: '目标不存在' });
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
