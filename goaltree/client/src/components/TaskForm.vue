<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑任务' : '新建任务'"
    width="480px"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="任务名称" prop="title">
        <el-input v-model="form.title" placeholder="例如：背单词 Unit 5" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item label="所属目标" prop="goal_id">
        <el-select v-model="form.goal_id" placeholder="选择目标" filterable style="width:100%">
          <el-option v-for="g in goalStore.flatList" :key="g.id" :label="g.title" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期" prop="task_date">
        <el-date-picker v-model="form.task_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
      </el-form-item>
      <el-form-item label="时间段" prop="start_time">
        <div class="time-range">
          <el-input
            v-model="form.start_time"
            placeholder="09:00"
            maxlength="5"
            class="time-input"
            @input="onTimeInput('start_time', $event)"
            @blur="validateTimeField('start_time')"
          />
          <span class="time-sep">至</span>
          <el-input
            v-model="form.end_time"
            placeholder="10:00"
            maxlength="5"
            class="time-input"
            @input="onTimeInput('end_time', $event)"
            @blur="validateTimeField('end_time')"
          />
        </div>
        <div v-if="timeError" class="time-error">{{ timeError }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useGoalStore } from '../stores/goals'
import { createTask, updateTask } from '../api/tasks'
import { errorHandler } from '../utils/errorHandler'

const props = defineProps({
  modelValue: Boolean,
  editData: { type: Object, default: null },
  defaultDate: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const goalStore = useGoalStore()
const formRef = ref(null)
const submitting = ref(false)
const timeError = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const isEdit = computed(() => !!props.editData)

const form = ref({ title: '', goal_id: null, task_date: '', start_time: '', end_time: '' })

watch(() => props.editData, (val) => {
  if (val) {
    form.value = {
      title: val.title,
      goal_id: val.goal_id,
      task_date: val.task_date,
      start_time: val.start_time?.slice(0, 5) || '',
      end_time: val.end_time?.slice(0, 5) || '',
    }
  }
}, { immediate: true })

watch(() => props.defaultDate, (val) => {
  if (val && !props.editData) form.value.task_date = val
}, { immediate: true })

// 自动补冒号：输入两位数字后插入 ":"
function onTimeInput(field, val) {
  let v = val.replace(/[^\d:]/g, '')
  if (v.length === 2 && !v.includes(':')) v = v + ':'
  form.value[field] = v
  timeError.value = ''
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function validateTimeField(field) {
  const v = form.value[field]
  if (v && !TIME_RE.test(v)) {
    timeError.value = '格式错误，请输入 HH:mm，例如 09:00'
  }
}

function validateTimes() {
  if (!form.value.start_time || !form.value.end_time) {
    timeError.value = '请填写开始和结束时间'
    return false
  }
  if (!TIME_RE.test(form.value.start_time) || !TIME_RE.test(form.value.end_time)) {
    timeError.value = '格式错误，请输入 HH:mm，例如 09:00'
    return false
  }
  if (form.value.start_time >= form.value.end_time) {
    timeError.value = '开始时间必须早于结束时间'
    return false
  }
  return true
}

const rules = {
  title: [
    { required: true, message: '请输入任务名称', trigger: 'blur' },
    { min: 2, max: 100, message: '任务名称长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  goal_id: [
    { required: true, message: '请选择所属目标', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (!value) {
          callback(new Error('请选择所属目标'));
        } else {
          callback();
        }
      },
      trigger: 'change'
    }
  ],
  task_date: [
    { required: true, message: '请选择日期', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (value) {
          // 将日期字符串按本地日期解析，避免 UTC 时区偏移导致今天也被判为"过去"
          const [year, month, day] = value.split('-').map(Number);
          const selected = new Date(year, month - 1, day);
          const today = new Date();
          // 只比较日期部分（年月日），忽略时间
          const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          if (selected < todayDate) {
            callback(new Error('不能选择过去的日期'));
          } else {
            callback();
          }
        } else {
          callback();
        }
      },
      trigger: 'change'
    }
  ],
}

async function submit() {
  try {
    await formRef.value.validate()

    // 验证时间逻辑
    if (!validateTimes()) {
      throw new Error(timeError.value || '时间格式错误');
    }

    // 验证日期逻辑（按本地日期解析，避免 UTC 时区偏移）
    if (form.value.task_date) {
      const [year, month, day] = form.value.task_date.split('-').map(Number);
      const selected = new Date(year, month - 1, day);
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (selected < todayDate) {
        throw new Error('不能选择过去的日期');
      }
    }

    submitting.value = true
    const payload = {
      ...form.value,
      start_time: form.value.start_time + ':00',
      end_time: form.value.end_time + ':00',
    }

    if (isEdit.value) {
      await updateTask(props.editData.id, payload)
      errorHandler.showSuccess('任务已更新')
    } else {
      await createTask(payload)
      errorHandler.showSuccess('任务已创建')
    }
    emit('saved')
    visible.value = false
  } catch (e) {
    let errorMsg = '';
    if (e.response?.data?.message) {
      errorMsg = e.response.data.message;
    } else if (e.message) {
      errorMsg = e.message;
    } else {
      errorMsg = '操作失败';
    }

    // 显示更友好的错误信息
    if (e.message?.includes('不能选择过去的日期')) {
      errorMsg = '不能选择过去的日期';
    } else if (e.message?.includes('开始时间必须早于结束时间')) {
      errorMsg = '开始时间必须早于结束时间';
    } else if (e.message?.includes('格式错误')) {
      errorMsg = '时间格式错误，请输入 HH:mm';
    }

    errorHandler.showError(errorMsg);
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.value = { title: '', goal_id: null, task_date: props.defaultDate || '', start_time: '', end_time: '' }
  timeError.value = ''
  formRef.value?.resetFields()
}
</script>

<style scoped>
.time-range { display: flex; align-items: center; gap: 8px; width: 100%; }
.time-input { width: 120px; }
.time-sep { color: #909399; flex-shrink: 0; }
.time-error { color: #f56c6c; font-size: 12px; margin-top: 4px; }
</style>