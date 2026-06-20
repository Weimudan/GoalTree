import axios from 'axios'

const base = '/api/tasks'

export const getTasksByDate = (date) => axios.get(base, { params: { date } }).then(r => r.data)
export const createTask = (data) => axios.post(base, data).then(r => r.data)
export const updateTask = (id, data) => axios.put(`${base}/${id}`, data).then(r => r.data)
export const deleteTask = (id) => axios.delete(`${base}/${id}`).then(r => r.data)
export const completeTask = (id) => axios.post(`${base}/${id}/complete`).then(r => r.data)
export const getStatsRange = (start, end) =>
  axios.get(`${base}/stats/range`, { params: { start, end } }).then(r => r.data)
export const saveSummary = (id, summary) =>
  axios.patch(`${base}/${id}/summary`, { summary }).then(r => r.data)
