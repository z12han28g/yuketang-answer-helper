// popup.js —— 设置界面逻辑
const DEFAULT_SETTINGS = {
  mode: 'local',        // 'local' 不用API | 'api' 用API
  submitMode: 'semi',   // 'semi' 半自动 | 'full' 全自动
  apiKey: '',
  model: 'deepseek-chat',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  sound: true           // 声音提醒开关，默认开
};

const $apiKey = document.getElementById('apiKey');
const $model = document.getElementById('model');
const $apiUrl = document.getElementById('apiUrl');
const $save = document.getElementById('save');
const $status = document.getElementById('status');
const $toggleKey = document.getElementById('toggleKey');
const $apiConfig = document.getElementById('apiConfig');
const $fullAutoHint = document.getElementById('fullAutoHint');

const $modeLocal = document.getElementById('modeLocal');
const $modeApi = document.getElementById('modeApi');
const $semiAuto = document.getElementById('semiAuto');
const $fullAuto = document.getElementById('fullAuto');
const $sound = document.getElementById('soundOn');

// 根据第一步选择，显示/隐藏 API 配置区
function updateApiConfigVisibility() {
  const useApi = $modeApi.checked;
  $apiConfig.classList.toggle('hidden', !useApi);
}

// 根据第二步选择，显示/隐藏全自动提示
function updateFullAutoHint() {
  const full = $fullAuto.checked;
  $fullAutoHint.classList.toggle('hidden', !full);
}

$modeLocal.addEventListener('change', updateApiConfigVisibility);
$modeApi.addEventListener('change', updateApiConfigVisibility);
$semiAuto.addEventListener('change', updateFullAutoHint);
$fullAuto.addEventListener('change', updateFullAutoHint);

// 加载已保存的设置
async function load() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const mode = data.mode || 'local';
  const submitMode = data.submitMode || 'semi';

  if (mode === 'api') $modeApi.checked = true;
  else $modeLocal.checked = true;

  if (submitMode === 'full') $fullAuto.checked = true;
  else $semiAuto.checked = true;

  $apiKey.value = data.apiKey || '';
  $model.value = data.model || 'deepseek-chat';
  $apiUrl.value = data.apiUrl || DEFAULT_SETTINGS.apiUrl;
  $sound.checked = data.sound !== false; // 默认开

  updateApiConfigVisibility();
  updateFullAutoHint();
}

// 显示/隐藏 Key
$toggleKey.addEventListener('click', () => {
  const isPwd = $apiKey.type === 'password';
  $apiKey.type = isPwd ? 'text' : 'password';
  $toggleKey.textContent = isPwd ? '隐藏' : '显示';
});

// 保存
$save.addEventListener('click', async () => {
  const mode = $modeApi.checked ? 'api' : 'local';
  const submitMode = $fullAuto.checked ? 'full' : 'semi';

  // 校验：选了"使用 API"则必须填 Key
  if (mode === 'api' && !$apiKey.value.trim()) {
    showStatus('使用 API 需填写 API Key', 'err');
    return;
  }

  await chrome.storage.sync.set({
    mode,
    submitMode,
    apiKey: $apiKey.value.trim(),
    model: $model.value,
    apiUrl: $apiUrl.value.trim() || DEFAULT_SETTINGS.apiUrl,
    sound: $sound.checked,
    autoSubmit: (mode === 'api' && submitMode === 'full') // 兼容旧字段
  });

  const desc = mode === 'local' ? '纯本地模式' : (submitMode === 'full' ? 'API 全自动' : 'API 半自动');
  showStatus('✅ 已保存：' + desc, 'ok');
});

function showStatus(text, type) {
  $status.textContent = text;
  $status.className = 'status ' + (type || '');
  setTimeout(() => { $status.textContent = ''; $status.className = 'status'; }, 3000);
}

load();
