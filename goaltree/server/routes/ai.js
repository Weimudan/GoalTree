const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/ai/decompose — 调 DeepSeek 拆解目标
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
    '请将这个目标拆解为 3～5 个具体可执行的子目标。',
    '要求：',
    '- 每个子目标简洁明确，15字以内',
    '- 子目标之间逻辑递进，覆盖完成主目标的关键步骤',
    '- 只返回 JSON 数组，格式如下，不要有任何多余文字：',
    '["子目标1", "子目标2", "子目标3"]',
  ].filter(Boolean).join('\n');

  try {
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: '你是一个目标管理专家，擅长将大目标拆解为清晰可执行的子目标。只输出 JSON 数组，不输出任何其他内容。',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
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

    const raw = response.data.choices[0].message.content.trim();

    // 提取 JSON 数组（防止模型在前后多输出文字）
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ message: 'AI 返回格式异常，请重试' });

    const suggestions = JSON.parse(match[0]);
    if (!Array.isArray(suggestions)) throw new Error('not array');

    res.json({ suggestions });
  } catch (err) {
    if (err.response) {
      // DeepSeek API 返回错误
      return res.status(502).json({ message: `AI 接口错误：${err.response.data?.error?.message || err.response.status}` });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
