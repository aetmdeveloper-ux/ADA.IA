/* ===========================
   ADA.IA — app.js
   - Fundo Matrix (canvas)
   - Chat + LocalStorage
   - TTS pt-BR (Web Speech)
   - Modo Local (sem API)
   - Modo OpenAI-compatível (opcional)
=========================== */

const $ = (sel) => document.querySelector(sel);

const els = {
  matrix: $("#matrix"),
  chat: $("#chat"),
  composer: $("#composer"),
  userInput: $("#userInput"),
  btnSend: $("#btnSend"),
  btnClear: $("#btnClear"),
  btnExit: $("#btnExit"),
  btnConfig: $("#btnConfig"),
  configModal: $("#configModal"),
  voiceSelect: $("#voiceSelect"),
  btnTestVoice: $("#btnTestVoice"),
  btnReloadVoices: $("#btnReloadVoices"),
  modeSelect: $("#modeSelect"),
  openaiFields: $("#openaiFields"),
  apiBase: $("#apiBase"),
  apiKey: $("#apiKey"),
  modelName: $("#modelName"),
  persona: $("#persona"),
  btnSaveConfig: $("#btnSaveConfig"),
  ada3d: $("#ada3d"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  assistantFrame: $("#assistantFrame"),
  chatMeta: $("#chatMeta"),
};

const STORAGE_KEYS = {
  config: "adaia_config_v1",
  messages: "adaia_messages_v1",
};

const defaultConfig = {
  mode: "local",                 // local | openai
  apiBase: "",                   // ex.: https://seu-proxy.../v1/chat/completions
  apiKey: "",                    // não recomendado no GitHub Pages
  model: "gpt-4o-mini",
  voiceURI: "",                  // selecionada no device
  persona:
    "Você é ADA.IA, um assistente virtual amigável, objetivo e prestativo. Responda sempre em português do Brasil, com tom masculino amigável, e faça perguntas quando faltar contexto. Evite respostas longas demais.",
};

let config = loadConfig();
let messages = loadMessages();

/* ---------------------------
   MATRIX BACKGROUND (Canvas)
--------------------------- */
function initMatrix() {
  const canvas = els.matrix;
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  const letters = "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズヅブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const fontSize = 16;
  let columns = Math.floor(window.innerWidth / fontSize);
  let drops = new Array(columns).fill(1);

  function refreshColumns() {
    columns = Math.floor(window.innerWidth / fontSize);
    drops = new Array(columns).fill(1);
  }
  window.addEventListener("resize", refreshColumns);

  function draw() {
    ctx.fillStyle = "rgba(2, 10, 5, 0.10)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.font = `${fontSize}px ui-monospace, monospace`;
    for (let i = 0; i < drops.length; i++) {
      const text = letters[Math.floor(Math.random() * letters.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // brilho na “cabeça”
      const head = Math.random() < 0.03;
      ctx.fillStyle = head ? "rgba(225,255,240,0.95)" : "rgba(53,255,134,0.85)";
      ctx.fillText(text, x, y);

      // reset
      if (y > window.innerHeight && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }

    requestAnimationFrame(draw);
  }

  draw();
}

/* ---------------------------
   UI Helpers
--------------------------- */
function setBusy(isBusy, text) {
  els.statusDot.classList.toggle("busy", isBusy);
  els.statusText.textContent = text || (isBusy ? "Processando..." : "Pronta para ajudar");
  els.assistantFrame.classList.toggle("speaking", isBusy);
}

function popADA3D() {
  const span = els.ada3d.querySelector(".ada3d__text");
  span.classList.remove("pop");
  // força reflow
  void span.offsetWidth;
  span.classList.add("pop");
}

function scrollChatToBottom() {
  els.chat.scrollTop = els.chat.scrollHeight;
}

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role === "user" ? "user" : "assistant"}`;

  const meta = document.createElement("div");
  meta.className = "bubble__meta";
  meta.textContent = `${role === "user" ? "VOCÊ" : "ADA.IA"} • ${nowTime()}`;

  const body = document.createElement("div");
  body.className = "bubble__text";
  body.textContent = text;

  div.appendChild(meta);
  div.appendChild(body);
  els.chat.appendChild(div);
  scrollChatToBottom();
}

/* ---------------------------
   Storage
--------------------------- */
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    return raw ? { ...defaultConfig, ...JSON.parse(raw) } : { ...defaultConfig };
  } catch {
    return { ...defaultConfig };
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
}

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.messages);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages() {
  localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
}

/* ---------------------------
   Web Speech (TTS)
--------------------------- */
let voices = [];

function getVoicesSafe() {
  return new Promise((resolve) => {
    let tries = 0;
    const timer = setInterval(() => {
      const v = window.speechSynthesis?.getVoices?.() || [];
      if (v.length || tries > 20) {
        clearInterval(timer);
        resolve(v);
      }
      tries++;
    }, 120);
  });
}

function pickDefaultVoiceURI() {
  // Prefer pt-BR
  const ptbr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("pt-br"));
  if (ptbr.length) return ptbr[0].voiceURI;

  // Any Portuguese
  const pt = voices.filter(v => (v.lang || "").toLowerCase().startsWith("pt"));
  if (pt.length) return pt[0].voiceURI;

  return voices[0]?.voiceURI || "";
}

function refreshVoiceSelect() {
  els.voiceSelect.innerHTML = "";
  const sorted = [...voices].sort((a, b) => (a.lang + a.name).localeCompare(b.lang + b.name));

  sorted.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} — ${v.lang}${v.default ? " (padrão)" : ""}`;
    els.voiceSelect.appendChild(opt);
  });

  if (!config.voiceURI) config.voiceURI = pickDefaultVoiceURI();
  els.voiceSelect.value = config.voiceURI || "";
}

function speakPTBR(text) {
  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = 1.03;
    u.pitch = 0.92; // mais “grave” (mas isso varia por voz)
    u.volume = 1;

    const chosen = voices.find(v => v.voiceURI === config.voiceURI);
    if (chosen) u.voice = chosen;

    u.onstart = () => {
      setBusy(true, "Falando...");
      popADA3D();
    };
    u.onend = () => {
      setBusy(false, "Pronta para ajudar");
    };
    u.onerror = () => {
      setBusy(false, "Pronta para ajudar");
    };

    window.speechSynthesis.speak(u);
  } catch {
    // Se falhar, só não fala
  }
}

/* ---------------------------
   Local Mode (sem API)
--------------------------- */
function localBrain(userText) {
  const t = userText.trim().toLowerCase();

  if (!t) return "Me diga o que você precisa.";

  if (/(oi|olá|ola|e aí|eai|bom dia|boa tarde|boa noite)\b/.test(t)) {
    return "Olá! Eu sou a ADA.IA. Como posso te ajudar hoje?";
  }

  if (/(seu nome|quem é você|quem e voce)/.test(t)) {
    return "Eu sou a ADA.IA, sua assistente virtual. Posso responder dúvidas, criar ideias e te ajudar com tarefas.";
  }

  if (/(github|pages)/.test(t)) {
    return "Se você estiver usando GitHub Pages, lembre de colocar a imagem em /assets e configurar o modo de resposta em Configurações.";
  }

  if (/(obrigad|valeu)/.test(t)) {
    return "Por nada! Se quiser, me diga qual é seu objetivo e eu te ajudo a montar um passo a passo.";
  }

  // resposta genérica
  return (
    "Entendi. Para eu te ajudar melhor, me diga:\n" +
    "1) qual é o objetivo final,\n" +
    "2) o que você já tentou,\n" +
    "3) e se existe alguma restrição (prazo, plataforma, formato)."
  );
}

/* ---------------------------
   OpenAI-compatible Mode (opcional)
--------------------------- */
async function callOpenAICompatible(userText) {
  if (!config.apiBase) {
    return "Configure primeiro a URL do endpoint/proxy em Configurações.";
  }

  const payload = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: config.persona || defaultConfig.persona },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userText },
    ],
    temperature: 0.6,
  };

  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const res = await fetch(config.apiBase, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    return `Falha ao consultar a IA (HTTP ${res.status}). ${errTxt ? "Detalhes: " + errTxt : ""}`;
  }

  const data = await res.json();
  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";

  return content || "Não consegui gerar resposta agora. Tente novamente.";
}

/* ---------------------------
   Chat Flow
--------------------------- */
function renderHistory() {
  els.chat.innerHTML = "";
  for (const m of messages) addBubble(m.role, m.content);
  scrollChatToBottom();
}

async function assistantReply(userText) {
  setBusy(true, "Pensando...");
  popADA3D();

  let reply = "";
  try {
    if (config.mode === "openai") reply = await callOpenAICompatible(userText);
    else reply = localBrain(userText);
  } catch (e) {
    reply = "Houve um erro ao gerar a resposta. Verifique as configurações e tente de novo.";
  }

  messages.push({ role: "assistant", content: reply });
  saveMessages();

  addBubble("assistant", reply);
  speakPTBR(reply);

  setBusy(false, "Pronta para ajudar");
}

/* ---------------------------
   Events
--------------------------- */
els.composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.userInput.value.trim();
  if (!text) return;

  messages.push({ role: "user", content: text });
  saveMessages();

  addBubble("user", text);
  els.userInput.value = "";
  els.userInput.focus();

  // fala/efeito ADA.IA quando responder
  await assistantReply(text);
});

els.btnClear.addEventListener("click", () => {
  const ok = confirm("Deseja limpar toda a conversa?");
  if (!ok) return;
  messages = [];
  saveMessages();
  els.chat.innerHTML = "";
  setBusy(false, "Conversa limpa");
  speakPTBR("Conversa limpa. Como posso te ajudar agora?");
  popADA3D();
});

els.btnExit.addEventListener("click", () => {
  // Em abas normais, window.close() geralmente é bloqueado.
  // Então oferecemos uma “saída segura”.
  const ok = confirm("Deseja sair? Isso tentará fechar a aba (pode ser bloqueado) ou redirecionar para uma página em branco.");
  if (!ok) return;

  try {
    window.close();
  } catch {}

  // Fallback
  setTimeout(() => {
    window.location.href = "about:blank";
  }, 300);
});

els.btnConfig.addEventListener("click", async () => {
  els.configModal.showModal();
});

els.btnSaveConfig.addEventListener("click", () => {
  config.mode = els.modeSelect.value;
  config.apiBase = els.apiBase.value.trim();
  config.apiKey = els.apiKey.value.trim();
  config.model = els.modelName.value.trim() || "gpt-4o-mini";
  config.voiceURI = els.voiceSelect.value;
  config.persona = els.persona.value.trim() || defaultConfig.persona;

  saveConfig();
  syncConfigUI();
  els.configModal.close();

  speakPTBR("Configurações salvas com sucesso.");
  popADA3D();
});

els.modeSelect.addEventListener("change", () => {
  els.openaiFields.style.display = els.modeSelect.value === "openai" ? "block" : "none";
});

els.btnReloadVoices.addEventListener("click", async () => {
  voices = await getVoicesSafe();
  refreshVoiceSelect();
});

els.btnTestVoice.addEventListener("click", () => {
  speakPTBR("Olá! Eu sou a ADA.IA. Voz de teste em português do Brasil.");
  popADA3D();
});

els.voiceSelect.addEventListener("change", () => {
  config.voiceURI = els.voiceSelect.value;
  saveConfig();
});

/* ---------------------------
   Sync UI
--------------------------- */
function syncConfigUI() {
  els.modeSelect.value = config.mode;
  els.apiBase.value = config.apiBase || "";
  els.apiKey.value = config.apiKey || "";
  els.modelName.value = config.model || "gpt-4o-mini";
  els.persona.value = config.persona || defaultConfig.persona;

  els.openaiFields.style.display = config.mode === "openai" ? "block" : "none";

  // Meta
  els.chatMeta.textContent =
    `pt-BR • TTS: ${config.voiceURI ? "selecionada" : "automático"} • modo: ${config.mode === "openai" ? "API" : "Local"}`;
}

/* ---------------------------
   Boot
--------------------------- */
(async function boot() {
  initMatrix();
  syncConfigUI();
  renderHistory();

  voices = await getVoicesSafe();
  if (voices.length) {
    refreshVoiceSelect();
    // garante que o select mostre a atual
    els.voiceSelect.value = config.voiceURI || pickDefaultVoiceURI();
  } else {
    els.voiceSelect.innerHTML = `<option value="">(Vozes não disponíveis no momento)</option>`;
  }

  // Saudação inicial (somente se não tiver histórico)
  if (!messages.length) {
    const greet = "Olá! Eu sou a ADA.IA. Como posso te ajudar hoje?";
    messages.push({ role: "assistant", content: greet });
    saveMessages();
    addBubble("assistant", greet);
    speakPTBR(greet);
    popADA3D();
  }
})();
