// background.js —— 雨课堂 AI 答题助手 后台服务
// 职责：接收 content script 发来的题目，读取用户保存的 API Key，调用 DeepSeek，返回答案。

const DEFAULT_SETTINGS = {
  mode: 'local',        // 'local' 不用API | 'api' 用API
  submitMode: 'semi',   // 'semi' 半自动 | 'full' 全自动
  apiKey: '',
  model: 'deepseek-chat',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  autoSubmit: false,
  sound: true
};

// 读取设置
async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

// 调用 DeepSeek API
async function callDeepSeek(settings, prompt) {
  const body = {
    model: settings.model,
    messages: [
      { role: 'system', content: '你是一个严谨的学术助手，回答要准确、简洁。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 800,
    stream: false
  };

  const resp = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + settings.apiKey
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (HTTP ${resp.status})：${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) {
    throw new Error('API 返回为空，请检查 Key 是否有效、账户是否有额度。');
  }
  return content;
}

// 组装给 AI 的提示词
function buildPrompt(info) {
  const parts = [];
  parts.push('题型：' + (info.type || '未知'));
  if (info.stem) parts.push('题干：' + info.stem);
  if (info.blank) parts.push('填空位：' + info.blank);
  if (info.options && info.options.length) parts.push('选项：\n' + info.options.join('\n'));

  return '你是我的课堂练习助手。请根据下面这道题目，给出：\n' +
    '1. 答案（只给最终答案：选择题给选项字母，判断题给"对/错"，填空题给应填内容，简答题给要点）\n' +
    '2. 解析（简要说明为什么，80字以内）\n\n' +
    '题目信息：\n' + parts.join('\n') +
    '\n\n请严格按照以下格式回复：\n【答案】xxx\n【解析】xxx';
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_QUESTION') {
    (async () => {
      try {
        const settings = await getSettings();

        // 模式为"不使用 API"时，不调用 AI
        if (settings.mode === 'local') {
          sendResponse({ ok: false, error: 'MODE_LOCAL' });
          return;
        }

        if (!settings.apiKey) {
          sendResponse({ ok: false, error: 'NO_API_KEY' });
          return;
        }
        const prompt = buildPrompt(message.question);
        const content = await callDeepSeek(settings, prompt);
        const autoSubmit = (settings.mode === 'api' && settings.submitMode === 'full');
        sendResponse({ ok: true, content, autoSubmit, sound: settings.sound !== false });
      } catch (err) {
        console.error('[雨课堂AI助手] 分析失败：', err);
        sendResponse({ ok: false, error: String(err && err.message || err) });
      }
    })();
    return true; // 异步响应
  }

  if (message.type === 'GET_STATUS') {
    (async () => {
      try {
        const settings = await getSettings();
        sendResponse({
          ok: true,
          mode: settings.mode,
          hasKey: !!settings.apiKey,
          model: settings.model,
          autoSubmit: (settings.mode === 'api' && settings.submitMode === 'full'),
          sound: settings.sound !== false
        });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }
});

// 点击扩展图标时，若未配置 Key，可在此提示（popup 里处理）
