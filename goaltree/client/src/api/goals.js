import axios from 'axios'

const base = '/api/goals'

export const getGoalTree = () => axios.get(base).then(r => r.data)
export const createGoal = (data) => axios.post(base, data).then(r => r.data)
export const updateGoal = (id, data) => axios.put(`${base}/${id}`, data).then(r => r.data)
export const deleteGoal = (id) => axios.delete(`${base}/${id}`).then(r => r.data)
