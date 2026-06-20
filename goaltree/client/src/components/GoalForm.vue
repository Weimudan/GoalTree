<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑目标' : '新建目标'"
    width="480px"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="目标名称" prop="title">
        <el-input v-model="form.title" placeholder="例如：雅思考到7分" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item label="父目标">
        <el-select v-model="form.parent_id" placeholder="不选则为顶层目标" clearable style="width:100%">
          <el-option
            v-for="g in availableParents"
            :key="g.id"
            :label="g.title"
            :value="g.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
      </el-form-item>
      <el-form-item label="时间范围">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width:100%"
        />
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

const props = defineProps({
  modelValue: Boolean,
  editData: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const goalStore = useGoalStore()
const formRef = ref(null)
const submitting = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isEdit = computed(() => !!props.editData)

const form = ref({ title: '', description: '', parent_id: null })
const dateRange = ref([])

// 编辑时回填数据
watch(() => props.editData, (val) => {
  if (val) {
    form.value = { title: val.title, description: val.description || '', parent_id: val.parent_id || null }
    dateRange.value = val.start_date && val.end_date ? [val.start_date, val.end_date] : []
  }
}, { immediate: true })

// 编辑时不允许选自己作父目标
const availableParents = computed(() =>
  goalStore.flatList.filter(g => g.id !== props.editData?.id)
)

const rules = {
  title: [{ required: true, message: '请输入目标名称', trigger: 'blur' }],
}

async function submit() {
  await formRef.value.validate()
  submitting.value = true
  try {
    const payload = {
      ...form.value,
      start_date: dateRange.value?.[0] || null,
      end_date: dateRange.value?.[1] || null,
    }
    if (isEdit.value) {
      await goalStore.update(props.editData.id, payload)
      ElMessage.success('目标已更新')
    } else {
      await goalStore.create(payload)
      ElMessage.success('目标已创建')
    }
    visible.value = false
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '网络错误，请检查后端是否运行'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.value = { title: '', description: '', parent_id: null }
  dateRange.value = []
  formRef.value?.resetFields()
}
</script>
