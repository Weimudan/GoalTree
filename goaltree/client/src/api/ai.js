import axios from 'axios'

export const decomposeGoal = (goal) =>
  axios.post('/api/ai/decompose', {
    title: goal.title,
    description: goal.description,
    start_date: goal.start_date,
    end_date: goal.end_date,
  }).then(r => r.data.suggestions)
