require('dotenv').config()
const db = require('./db');

async function migrate() {
  try {
    await db.query(
      "ALTER TABLE tasks ADD COLUMN expected_result TEXT DEFAULT NULL COMMENT '预期结果/验收标准' AFTER completed_at"
    );
    console.log('expected_result 字段添加成功');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('expected_result 字段已存在');
    } else {
      console.log('错误:', e.message);
    }
  }
  process.exit(0);
}

migrate();
