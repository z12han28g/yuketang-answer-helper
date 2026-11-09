// content.js —— 雨课堂 AI 答题助手 页面注入脚本
// 职责：检测课堂练习、抓取题干和选项、调用 background 获取 AI 答案、悬浮面板展示。

(function () {
  'use strict';

  if (window.__yktAI) return;
  window.__yktAI = true;

  let lastSig = '';
  const notified = new Set();
  let analyzing = false;
  let soundOn = true; // 声音提醒开关（默认开，实际以设置为准）

  // 语音播报（受声音开关控制）
  function speak(text) {
    if (!soundOn) return;
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
    } catch (e) {}
  }

  // ============ 抓题 ============
  function pickText(el, maxLen) {
    const t = (el && el.innerText ? el.innerText : '').trim();
    return t ? t.slice(0, maxLen || 400) : '';
  }

  function extractQuestion() {
    const info = { type: '', score: '', stem: '', options: [], blank: '' };
    const bodyText = document.body ? document.body.innerText : '';

    if (/单选题/.test(bodyText)) info.type = '单选题';
    else if (/多选题/.test(bodyText)) info.type = '多选题';
    else if (/判断题/.test(bodyText)) info.type = '判断题';
    else if (/填空题/.test(bodyText)) info.type = '填空题';
    else if (/简答题|主观题/.test(bodyText)) info.type = '简答题';

    const scoreM = bodyText.match(/(\d+(?:\.\d+)?)\s*分/);
    if (scoreM) info.score = scoreM[1] + ' 分';

    const blankM = bodyText.match(/\[(填空\d*|空\d*)\]/);
    if (blankM) info.blank = blankM[0];

    const optionEls = document.querySelectorAll(
      '.option, .option-item, .choice, [class*="option"], [class*="choice"], li[class*="opt"]'
    );
    const seen = new Set();
    optionEls.forEach(o => {
      const t = pickText(o, 200);
      if (t && !seen.has(t) && /^[A-Ha-h][\.\、\)]|^[A-Ha-h]\s/.test(t)) {
        seen.add(t); info.options.push(t);
      }
    });
    if (info.options.length === 0) {
      const optTexts = bodyText.match(/[A-H]\s*[\.\、\)]\s*[^\n]{1,120}/g);
      if (optTexts) optTexts.forEach(t => { if (!seen.has(t)) { seen.add(t); info.options.push(t); } });
    }

    const qContainers = document.querySelectorAll(
      '[class*="question"], [class*="exercise"], [class*="quiz"], [class*="stem"]'
    );
    for (const q of qContainers) {
      const t = pickText(q, 600);
      if (t && t.length > info.stem.length) info.stem = t;
    }
    // 兜底：如果没有题目容器，从整个页面文本里过滤出真正的题目（排除章节标题）
    if (!info.stem) {
      info.stem = extractStemFallback(bodyText);
    }
    return info;
  }

  // 从页面文本中提取题干（排除章节标题、页脚等干扰）
  function extractStemFallback(bodyText) {
    if (!bodyText) return '';
    const lines = bodyText.split('\n').map(s => s.trim()).filter(Boolean);
    // 过滤掉明显的章节标题/页脚/版权信息
    const noise = /^(第[一二三四五六七八九十\d]+章|第\d+章|Chapter\s*\d+|ALWAYS LEARNING|Copyright|PEARSON|Slide\s*\d+)/i;
    const candidates = lines.filter(l => l.length > 10 && !noise.test(l));
    // 取最像题目的一段（包含疑问词或较长陈述）
    return candidates[0] || '';
  }

  // ============ 悬浮面板 ============
  // kind: 'answer' 绿色 | 'loading' 深色 | 'alert' 红色 | 'welcome' 蓝色 | 'warn' 橙色
  function panelBg(kind) {
    switch (kind) {
      case 'answer': return 'linear-gradient(135deg,#16a34a,#15803d)';
      case 'loading': return 'linear-gradient(135deg,#334155,#1e293b)';
      case 'welcome': return 'linear-gradient(135deg,#1677ff,#0958d9)';
      case 'warn': return 'linear-gradient(135deg,#f59e0b,#d97706)';
      default: return 'linear-gradient(135deg,#e11d48,#be123c)';
    }
  }

  function showPanel(kind, title, text, autoCloseMs) {
    let panel = document.getElementById('__yktAIPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = '__yktAIPanel';
      document.body.appendChild(panel);
    }

    panel.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:2147483647',
      'max-width:440px', 'min-width:280px',
      'background:' + panelBg(kind),
      'color:#fff', 'border-radius:14px',
      'box-shadow:0 10px 40px rgba(0,0,0,.35)',
      'padding:18px 20px', 'font-family:-apple-system,"Microsoft YaHei",sans-serif',
      'animation:__yktPop .35s ease',
      'max-height:70vh', 'overflow:auto'
    ].join(';');

    let style = document.getElementById('__yktStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = '__yktStyle';
      style.textContent = '@keyframes __yktPop{0%{transform:translateX(120%);opacity:0}100%{transform:translateX(0);opacity:1}}';
      document.head.appendChild(style);
    }

    panel.innerHTML = '';

    // 关闭按钮
    const close = document.createElement('div');
    close.style.cssText = 'position:absolute;top:10px;right:12px;font-size:18px;line-height:1;cursor:pointer;opacity:.8';
    close.textContent = '×';
    close.onclick = (e) => { e.stopPropagation(); panel.remove(); };
    panel.style.position = 'fixed';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:8px;padding-right:20px';
    titleEl.textContent = title;

    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word';
    textEl.textContent = text;

    panel.appendChild(close);
    panel.appendChild(titleEl);
    panel.appendChild(textEl);

    panel.onclick = () => panel.remove();

    // 自动关闭
    if (autoCloseMs) {
      setTimeout(() => { if (panel.parentNode) panel.remove(); }, autoCloseMs);
    }
    return panel;
  }

  // ============ 进入页面自动弹出的欢迎面板 ============
  async function showWelcome() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      const mode = resp && resp.ok ? resp.mode : 'local';
      const hasKey = resp && resp.ok && resp.hasKey;
      const autoSubmit = resp && resp.ok && resp.autoSubmit;
      if (resp && resp.ok) soundOn = resp.sound !== false;

      if (mode === 'local') {
        showPanel('welcome', '雨课堂 AI 助手（纯本地模式）',
          '当前为「不使用 API」模式，只抓题、不生成答案。\n\n👉 如需 AI 作答或 💡 声音播报（默认开启）：\n点击浏览器右上角的扩展图标 → 选择「使用 API」→ 填写 DeepSeek API Key。\n\n（点击右上角 × 或面板任意处可关闭本提示）', 30000);
      } else if (!hasKey) {
        showPanel('warn', '雨课堂 AI 助手（未配置）',
          '已选择「使用 API」模式，但还未填写 API Key。\n\n请点击浏览器右上角的扩展图标，填入你的 DeepSeek API Key 后保存。\n（点击右上角 × 或面板任意处可关闭本提示）', 60000);
      } else if (autoSubmit) {
        showPanel('welcome', '雨课堂 AI 助手已就绪（全自动）',
          '当前为「使用 API · 全自动」模式。\n\n老师一发布练习，我会自动抓题、AI 作答并提交。\n（点击右上角 × 或面板任意处可关闭本提示）', 30000);
      } else {
        showPanel('welcome', '雨课堂 AI 助手已就绪（半自动）',
          '当前为「使用 API · 半自动」模式。\n\n老师一发布练习，我会自动抓题并给出答案，由你手动填答。\n（点击右上角 × 或面板任意处可关闭本提示）', 30000);
      }
    } catch (e) {
      showPanel('warn', '雨课堂 AI 助手', '正在初始化…\n（点击任意处可关闭）', 6000);
    }
  }

  function notifyDetected(info) {
    const msg = `检测到课堂练习【${info.type || '题目'}${info.score ? ' ' + info.score : ''}】`;

    // 组装题干 + 选项展示
    let detail = info.stem || '请尽快查看！';
    if (info.options && info.options.length) {
      detail += '\n\n【选项】\n' + info.options.join('\n');
    }

    showPanel('alert', msg, detail);

    speak('检测到新的课堂练习，请尽快作答');
  }

  function notifyAnswer(content, info) {
    let answer = content, explain = '';
    const am = content.match(/【答案】([\s\S]*?)(?:【解析】|$)/);
    const em = content.match(/【解析】([\s\S]*)/);
    if (am) answer = am[1].trim();
    if (em) explain = em[1].trim();

    showPanel('answer', '✅ AI 答案', '【答案】' + answer + '\n\n【解析】' + explain);

    speak('答案：' + answer);

    // 如果开启了自动作答，尝试自动填答案
    return { answer, explain };
  }

  function notifyError(msg, info) {
    if (msg === 'MODE_LOCAL') {
      // 纯本地模式：展示抓到的题干，不生成答案
      let detail = (info && info.stem) ? info.stem : '';
      if (info && info.options && info.options.length) {
        detail += '\n\n【选项】\n' + info.options.join('\n');
      }
      detail += '\n\n— 当前为「不使用 API」模式，仅抓题不生成答案 —\n👉 如需 AI 作答：点击浏览器右上角扩展图标 → 选「使用 API」→ 填 Key。';
      showPanel('welcome', '检测到课堂练习（纯本地）', detail, 30000);
      return;
    }
    showPanel('alert', '⚠️ ' + msg, msg === 'NO_API_KEY'
      ? '尚未配置 API Key。\n请点击浏览器右上角的扩展图标，填入你的 DeepSeek API Key。'
      : msg);
  }

  // ============ 自动填答 ============
  function autoFill(info, answer) {
    try {
      const type = info.type;
      const normalized = answer.replace(/[。，、\s]/g, '').toUpperCase();

      if (type === '单选题' || type === '多选题') {
        // 提取答案里的选项字母
        const letters = normalized.match(/[A-H]/g);
        if (!letters) { console.log('[自动作答] 未识别出选项字母'); return false; }

        // 找到页面上对应的选项元素并点击
        let clicked = 0;
        letters.forEach(letter => {
          const optEls = document.querySelectorAll('[class*="option"], [class*="choice"], [class*="opt"], li');
          for (const el of optEls) {
            const text = (el.innerText || '').trim();
            // 匹配 "A." "A、" "A)" 或 "A " 开头的选项
            if (new RegExp('^' + letter + '[.、\\)\\s]', 'i').test(text)) {
              el.click();
              clicked++;
              break;
            }
          }
        });
        console.log('[自动作答] 已点击', clicked, '个选项');
        return clicked > 0;
      }

      if (type === '判断题') {
        // 找"对/错/正确/错误/是/否"按钮
        const judgeBtns = document.querySelectorAll('button, [class*="option"], [class*="choice"], [class*="judge"], li, span');
        const isTrue = /^对|^正确|^是|^√|^T|^True/i.test(normalized);
        const target = isTrue ? /(^对$|^正确$|^是$|^√$|^T$|^True$)/i : /(^错$|^错误$|^否$|^×$|^F$|^False$)/i;
        for (const el of judgeBtns) {
          const t = (el.innerText || '').trim();
          if (t && t.length <= 4 && target.test(t)) {
            el.click();
            console.log('[自动作答] 判断题已选:', t);
            return true;
          }
        }
      }

      if (type === '填空题') {
        // 找填空输入框填入答案
        const inputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]');
        if (inputs.length) {
          const clean = answer.replace(/^答案[:：]?/, '').trim();
          const input = inputs[0];
          if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = clean;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            input.textContent = clean;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          console.log('[自动作答] 填空题已填入:', clean);
          return true;
        }
      }

      console.log('[自动作答] 该题型暂不支持自动填写:', type);
      return false;
    } catch (e) {
      console.error('[自动作答] 出错:', e);
      return false;
    }
  }

  function autoSubmit() {
    // 尝试点击提交按钮
    const submitBtns = document.querySelectorAll('button, [class*="submit"], [class*="confirm"], [role="button"]');
    for (const el of submitBtns) {
      const t = (el.innerText || '').trim();
      if (/^(提交|提交答案|确定提交|确认提交|交卷|确定)$/.test(t)) {
        el.click();
        console.log('[自动作答] 已点击提交按钮:', t);
        return true;
      }
    }
    console.log('[自动作答] 未找到提交按钮');
    return false;
  }

  // ============ 调用 background 分析 ============
  async function analyze(info) {
    if (analyzing) return;
    analyzing = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'ANALYZE_QUESTION', question: info });
      if (resp && resp.ok) {
        const { answer, explain } = notifyAnswer(resp.content, info);
        // 根据用户设置决定是否自动作答
        if (resp.autoSubmit) {
          const filled = autoFill(info, answer);
          if (filled) {
            // 稍等后自动提交
            setTimeout(() => { autoSubmit(); }, 800);
          } else {
            showPanel('warn', '自动作答未完成', '已生成答案，但未能自动填入（可能题型不支持或页面结构变化）。\n请手动作答。', 8000);
          }
        }
      } else {
        notifyError(resp ? resp.error : '未知错误', info);
      }
    } catch (err) {
      notifyError('分析失败：' + (err && err.message || err), info);
    } finally {
      analyzing = false;
    }
  }

  // ============ 轮询检测 ============
  function scan() {
    const bodyText = document.body ? document.body.innerText : '';
    const ended = /作答已结束|答题已结束|已结束/.test(bodyText);

    // 强答题信号：必须出现这些"正在答题"的标志才判定为有练习
    // （避免被章节标题、历史题目列表等误触发）
    const strongSignal = /请作答|提交答案|答题卡|作答已结束|答题已结束|正在作答|提交$|确定提交/.test(bodyText);
    // 题型关键词（辅助）
    const hasType = /单选题|多选题|判断题|填空题|简答题/.test(bodyText);

    // 只有当"题型 + 强答题信号"同时满足时，才认为是真正的课堂练习
    const hasQ = hasType && strongSignal;

    const exEls = document.querySelectorAll('[class*="exercise"], [class*="question"], [class*="quiz"], [class*="exam"], [class*="answer"]');

    const stem = (exEls[0] && exEls[0].innerText ? exEls[0].innerText : '').slice(0, 200);
    const sig = (exEls.length || 0) + '|' + hasQ + '|' + ended + '|' + stem;

    if (sig !== lastSig) {
      lastSig = sig;
      if (hasQ && !ended) {
        const info = extractQuestion();
        // 二次校验：确实抓到了像样的题干才触发
        if (info.stem && info.stem.length > 5) {
          if (!notified.has(stem)) {
            notified.add(stem);
            notifyDetected(info);
            analyze(info);
          }
        } else {
          console.log('[雨课堂AI助手] 检测到答题信号，但未抓到有效题干，跳过。');
        }
      }
    }
  }

  console.log('%c🛡️ 雨课堂 AI 答题助手已注入，每3秒检测一次。',
    'color:#1677ff;font-weight:bold');
  setInterval(scan, 3000);
  scan();

  // 进入页面自动弹出助手状态面板
  showWelcome();
})();
