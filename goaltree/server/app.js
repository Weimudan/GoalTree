require('dotenv').config()
const express = require('express');
const cors = require('cors');

const goalsRouter = require('./routes/goals');
const tasksRouter = require('./routes/tasks');
const aiRouter = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/goals', goalsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/ai', aiRouter);

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`GoalTree server running on http://localhost:${PORT}`);
});
