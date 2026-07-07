import axios from 'axios'

export const decomposeGoal = (goal) =>
  axios.post('/api/ai/decompose', {
    title: goal.title,
    description: goal.description,
    start_date: goal.start_date,
    end_date: goal.end_date,
  }).then(r => r.data.suggestions)

export const analyzeTodayTasks = (tasks) =>
  axios.post('/api/ai/analyze-today', { tasks }).then(r => r.data.analysis)

export const chatWithAI = (tasks, history, message) =>
  axios.post('/api/ai/chat', { tasks, history, message }).then(r => r.data.reply)
