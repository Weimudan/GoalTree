const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/ai/decompose — 调 DeepSeek 递归拆解目标（2层：子目标 + 建议任务）
router.post('/decompose', async (req, res) => {
  const { title, description, start_date, end_date } = req.body;
  if (!title) return res.status(400).json({ message: '请传入目标标题' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ message: '服务端未配置 DEEPSEEK_API_KEY' });

  const timeInfo = start_date && end_date ? `时间范围：${start_date} 至 ${end_date}` : '';
  const descInfo = description ? `补充说明：${description}` : '';

  const userPrompt = [
    `目标：${title}`,
    timeInfo,
    descInfo,
    '',
    '请将这个目标递归拆解为 2 层结构：先拆出 3～5 个子目标，再为每个子目标建议 2～3 个具体任务。',
    '要求：',
    '- 子目标简洁明确，15字以内，逻辑递进',
    '- 为每个子目标估算总时长（小时），为每个任务估算单次时长（分钟）',
    '- 只返回 JSON 数组，格式如下，不要有任何多余文字：',
    '[',
    '  { "title": "子目标1", "estimated_hours": 150,',
    '    "tasks": [',
    '      {"title": "任务1", "estimated_minutes": 60},',
    '      {"title": "任务2", "estimated_minutes": 30}',
    '    ]',
    '  }',
    ']',
  ].filter(Boolean).join('\n');

  try {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: '你是一个目标管理专家，擅长将大目标拆解为清晰的子目标和可执行任务。只输出 JSON 数组，不输出任何其他内容。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const raw = response.data.choices[0].message.content.trim();

    // 提取 JSON 数组（防止模型在前后多输出文字）
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ message: 'AI 返回格式异常，请重试' });

    const suggestions = JSON.parse(match[0]);
    if (!Array.isArray(suggestions)) throw new Error('not array');

    // 校验每个元素的结构
    for (const item of suggestions) {
      if (!item.title || typeof item.title !== 'string') {
        return res.status(502).json({ message: 'AI 返回的子目标格式异常，请重试' });
      }
      if (!Array.isArray(item.tasks)) {
        item.tasks = [];  // 容错：没有 tasks 时设为空数组
      }
    }

    res.json({ suggestions });
  } catch (err) {
    if (err.response) {
      return res.status(502).json({ message: `AI 接口错误：${err.response.data?.error?.message || err.response.status}` });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/analyze-today — AI 分析今日任务，给出提醒和建议
router.post('/analyze-today', async (req, res) => {
  const { tasks = [] } = req.body;
  if (!tasks.length) return res.json({ analysis: '今天还没有安排任务，好好规划一下吧！' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ message: '服务端未配置 DEEPSEEK_API_KEY' });

  // 构建任务摘要文本
  const taskLines = tasks.map((t, i) => {
    const statusMap = { completed: '✅已完成', expired: '❌已过期未完成', pending: '🕐进行中', upcoming: '⏳未开始' };
    return `${i + 1}. [${statusMap[t.status] || t.status}] ${t.title}（${t.start_time?.slice(0, 5)}~${t.end_time?.slice(0, 5)}）目标：${t.goal_title || '无'}。`;
  }).join('\n');

  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const expiredCount = tasks.filter(t => t.status === 'expired').length;

  const userPrompt = [
    `现在是 ${now}，以下是我的今日任务列表（共 ${tasks.length} 个，已完成 ${completedCount} 个，已过期 ${expiredCount} 个）：`,
    '',
    taskLines,
    '',
    '请以"目标管理助理"的身份，用友好、鼓励的语气给我一段简短的分析（200字以内），包含：',
    '1. 指出哪些任务已经过期或即将过期，提醒我尽快处理',
    '2. 分析时间安排是否合理（是否有冲突、过于紧凑或过于松散）',
    '3. 根据任务进度给出 1~2 条具体可操作的建议',
    '要求：简洁扼要，不要啰嗦，用口语化的中文，像朋友一样。',
  ].join('\n');

  try {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: '你是一个贴心的目标管理助理，善于分析任务安排并给出鼓励性的建议。回复简洁扼要，200字以内，语气像朋友聊天。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const analysis = response.data.choices[0].message.content.trim();
    res.json({ analysis });
  } catch (err) {
    if (err.response) {
      return res.status(502).json({ message: `AI 接口错误：${err.response.data?.error?.message || err.response.status}` });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/chat — 对话式交互，支持多轮对话
router.post('/chat', async (req, res) => {
  const { tasks = [], history = [], message } = req.body;
  if (!message) return res.status(400).json({ message: '请输入消息' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ message: '服务端未配置 DEEPSEEK_API_KEY' });

  // 构建任务上下文
  const taskLines = tasks.map((t, i) => {
    const statusMap = { completed: '✅已完成', expired: '❌已过期未完成', pending: '🕐进行中', upcoming: '⏳未开始' };
    return `${i + 1}. [${statusMap[t.status] || t.status}] ${t.title}（${t.start_time?.slice(0, 5)}~${t.end_time?.slice(0, 5)}）目标：${t.goal_title || '无'}。`;
  }).join('\n');

  const systemPrompt = [
    '你是一个贴心的目标管理助理，帮助用户分析和管理今日任务。',
    '回复风格：口语化中文，像朋友聊天，简洁友好，每次回复控制在100字以内，尽量拆成短句。',
    '',
    `当前用户的今日任务（共 ${tasks.length} 个）：`,
    taskLines || '暂无任务',
  ].join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  try {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-v4-flash',
        messages,
        temperature: 0.8,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    res.json({ reply });
  } catch (err) {
    if (err.response) {
      return res.status(502).json({ message: `AI 接口错误：${err.response.data?.error?.message || err.response.status}` });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
