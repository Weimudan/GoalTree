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

module.exports = router;
