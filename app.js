const state = { topics: [], tasks: [], activeTopic: 1, page: 1, pageSize: 8, total: 0, loading: false, searchTimer: null, variantGroups: [] };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
}

function topicNumber(value) { return String(value).padStart(2, "0"); }

function renderTopics() {
  const grid = $("#topicGrid");
  grid.innerHTML = state.topics.map(topic => `
    <button class="topic-card ${topic.id === state.activeTopic ? "active" : ""}" data-topic="${topic.id}">
      <span class="topic-index">${topic.id <= 12 ? "ЧАСТЬ 1" : "ЧАСТЬ 2"} · ${topicNumber(topic.id)}</span>
      <h3>${topic.title}</h3><p>${topic.short}</p><span class="topic-arrow">↘</span>
    </button>`).join("");
  $$(".topic-card", grid).forEach(button => button.addEventListener("click", () => selectTopic(Number(button.dataset.topic))));
}

async function selectTopic(id) {
  state.activeTopic = id; state.page = 1;
  const topic = state.topics.find(item => item.id === id);
  $("#activeTopicTitle").textContent = topic.title;
  $("#activeTopicDescription").textContent = topic.short;
  $("#searchInput").value = ""; $("#subtopicSelect").innerHTML = '<option value="">Все подтемы</option>';
  renderTopics(); await loadTasks(false);
  $("#bank").scrollIntoView({ behavior: "smooth", block: "start" });
}

function makeTaskCard(task, sequence = null) {
  const card = $("#taskTemplate").content.firstElementChild.cloneNode(true);
  $(".task-number", card).textContent = sequence ? `Задание ${sequence} · ФИПИ № ${task.number}` : `ФИПИ · № ${task.number}`;
  $(".task-content", card).innerHTML = renderPrompt(task.prompt);
  $(".task-info", card).textContent = task.subtopic;
  $(".source-line a", card).href = task.source_url;
  const info = $(".info-chip", card);
  info.addEventListener("click", () => {
    const panel = $(".task-info", card); panel.hidden = !panel.hidden;
    info.setAttribute("aria-expanded", String(!panel.hidden));
  });
  const form = $(".answer-form", card);
  if (!task.has_short_answer) {
    form.classList.add("detailed-answer-note");
    form.innerHTML = '<p><strong>Задание с развёрнутым ответом.</strong><br>Запишите полное обоснованное решение на бумаге или в отдельном документе.</p>';
    return card;
  }
  if (!task.answers || !task.answers.length) {
    form.classList.add("detailed-answer-note");
    form.innerHTML = '<p><strong>Ответ пока готовится.</strong><br>Задание уже доступно для практики, автоматическая проверка будет добавлена после подтверждения ответа в ФИПИ.</p>';
    return card;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("input", form), button = $("button", form), output = $("output", form);
    const answer = input.value.trim();
    if (!answer) { input.focus(); return; }
    button.disabled = true; output.className = "answer-status"; output.textContent = "Проверяем…";
    const correct = task.answers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
    output.className = `answer-status ${correct ? "correct" : "wrong"}`;
    output.textContent = correct ? "Верно — отличная работа" : "Пока неверно. Попробуйте ещё раз";
    button.disabled = false;
  });
  return card;
}

async function loadTasks(append = false) {
  if (state.loading) return;
  state.loading = true;
  const list = $("#taskList");
  if (!append) list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  $("#resultCount").textContent = "Загружаем задания из ФИПИ…"; $("#loadMore").hidden = true;
  try {
    const search = $("#searchInput").value.trim().toLocaleLowerCase("ru");
    const subtopic = $("#subtopicSelect").value;
    const pool = state.tasks.filter(task => task.topic_id === state.activeTopic);
    const filtered = pool.filter(task => (!search || `${task.number} ${task.subtopic} ${plainText(task.prompt)}`.toLocaleLowerCase("ru").includes(search)) && (!subtopic || task.subtopic === subtopic));
    const start = (state.page - 1) * state.pageSize;
    const data = { items: filtered.slice(start, start + state.pageSize), total: filtered.length, subtopics: [...new Set(pool.map(task => task.subtopic))].sort() };
    if (!append) list.innerHTML = "";
    data.items.forEach(task => list.append(makeTaskCard(task)));
    state.total = data.total;
    $("#resultCount").textContent = `${data.total} ${plural(data.total, ["задание", "задания", "заданий"])} в загруженной выборке`;
    $("#loadMore").hidden = state.page * state.pageSize >= data.total;
    if (state.page === 1 && !$("#subtopicSelect").value) {
      $("#subtopicSelect").innerHTML = '<option value="">Все подтемы</option>' + data.subtopics.map(item => `<option value="${escapeAttribute(item)}">${item}</option>`).join("");
    }
    if (!data.items.length && !append) list.innerHTML = '<div class="error-box">По выбранным условиям заданий не найдено.</div>';
  } catch (error) {
    if (!append) list.innerHTML = `<div class="error-box"><strong>Не удалось открыть банк.</strong><br>${escapeText(error.message)}<br><br>Проверьте интернет-соединение и попробуйте обновить страницу.</div>`;
    $("#resultCount").textContent = "Ошибка загрузки";
  } finally { state.loading = false; }
}

function plural(number, words) {
  const n = Math.abs(number) % 100, n1 = n % 10;
  if (n > 10 && n < 20) return words[2];
  if (n1 > 1 && n1 < 5) return words[1];
  if (n1 === 1) return words[0];
  return words[2];
}
function escapeText(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function escapeAttribute(value) { return escapeText(value).replaceAll('"', "&quot;"); }
function plainText(value) { const div = document.createElement("div"); div.innerHTML = value; return div.textContent || ""; }
function renderPrompt(value) {
  return String(value || "").replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
}
function absolutizePromptImages(value) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderPrompt(value);
  $$("img", wrapper).forEach(img => {
    const src = img.getAttribute("src");
    if (src) img.src = new URL(src, document.baseURI).href;
  });
  return wrapper.innerHTML;
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error || new Error("Не удалось прочитать изображение")));
    reader.readAsDataURL(blob);
  });
}
const inlineImageCache = new Map();
async function imageToDataUrl(src) {
  const absolute = new URL(src, document.baseURI).href;
  if (absolute.startsWith("data:")) return absolute;
  if (!inlineImageCache.has(absolute)) {
    inlineImageCache.set(absolute, fetch(absolute).then(response => {
      if (!response.ok) throw new Error(`Не удалось загрузить изображение ${src}`);
      return response.blob();
    }).then(blobToDataUrl));
  }
  return inlineImageCache.get(absolute);
}
async function inlinePromptImages(value) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderPrompt(value);
  await Promise.all($$("img", wrapper).map(async img => {
    const src = img.getAttribute("src");
    if (!src) return;
    try {
      img.src = await imageToDataUrl(src);
    } catch (error) {
      img.src = new URL(src, document.baseURI).href;
      img.setAttribute("data-inline-error", "true");
    }
  }));
  return wrapper.innerHTML;
}
function normalizeAnswer(value) { return String(value).trim().toLocaleLowerCase("ru").replaceAll("−", "-").replaceAll(",", ".").replace(/\s+/g, ""); }

function renderVariantControls() {
  $("#variantCounts").innerHTML = state.topics.map(topic => `
    <div class="count-row"><label><small>${topicNumber(topic.id)}</small><span>${topic.title}</span></label>
      <div class="stepper"><button type="button" data-step="-1">−</button><input type="number" name="${topic.id}" min="0" max="20" value="${topic.id <= 12 ? 1 : 0}" aria-label="Количество: ${topic.title}"><button type="button" data-step="1">+</button></div>
    </div>`).join("");
  $$("[data-step]", $("#variantCounts")).forEach(button => button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    input.value = Math.min(20, Math.max(0, Number(input.value) + Number(button.dataset.step))); updateVariantTotal();
  }));
  $$("input", $("#variantCounts")).forEach(input => input.addEventListener("input", updateVariantTotal));
  updateVariantTotal();
}

function updateVariantTotal() {
  $("#variantTotal").textContent = $$("#variantCounts input").reduce((sum, input) => sum + (Number(input.value) || 0), 0);
}

async function generateVariant() {
  const button = $("#generateVariant"); button.disabled = true; button.textContent = "Собираем задания…";
  const counts = Object.fromEntries($$("#variantCounts input").map(input => [input.name, Number(input.value) || 0]));
  try {
    const warnings = [];
    const groups = state.topics.map(topic => {
      const count = counts[topic.id] || 0;
      if (!count) return null;
      const pool = state.tasks.filter(task => task.topic_id === topic.id);
      const shuffled = [...pool].sort(() => Math.random() - .5);
      if (pool.length < count) warnings.push(`${topic.title}: доступно ${pool.length} из ${count}`);
      return { topic, items: shuffled.slice(0, count) };
    }).filter(Boolean);
    const result = { groups, warnings };
    state.variantGroups = result.groups;
    $("#variantDialog").close(); $("#variantTaskList").innerHTML = "";
    $("#variantWarnings").innerHTML = result.warnings.map(item => `<div class="warning">${escapeText(item)}</div>`).join("");
    let sequence = 1;
    result.groups.forEach(group => {
      const heading = document.createElement("h3"); heading.className = "variant-group-title"; heading.textContent = `${topicNumber(group.topic.id)}. ${group.topic.title}`;
      $("#variantTaskList").append(heading);
      group.items.forEach(task => $("#variantTaskList").append(makeTaskCard(task, sequence++)));
    });
    $("#variantResults").showModal();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = "Собрать случайный вариант"; }
}

async function init() {
  try {
    const [topics, database, answerBank] = await Promise.all([getJson("data/topics.json"), getJson("data/tasks.json"), getJson("data/answers.json")]);
    state.topics = topics;
    state.tasks = database.tasks.map(task => ({ ...task, answers: answerBank[task.guid]?.answers || [] }));
  } catch (error) {
    $("#taskList").innerHTML = `<div class="error-box">${escapeText(error.message)}. Открывайте страницу через GitHub Pages или локальный HTTP-сервер.</div>`;
    return;
  }
  renderTopics(); renderVariantControls(); await loadTasks(false);
}

async function variantDocument({ inlineImages = false } = {}) {
  const date = new Intl.DateTimeFormat("ru-RU").format(new Date());
  let number = 1;
  const sections = [];
  for (const group of state.variantGroups) {
    const articles = [];
    for (const task of group.items) {
      const condition = inlineImages ? await inlinePromptImages(task.prompt) : absolutizePromptImages(task.prompt);
      articles.push(`<article><div class="meta">Задание ${number++} · ФИПИ № ${escapeText(task.number)} · ${escapeText(task.subtopic)}</div><div class="condition">${condition}</div><div class="answer">Ответ: __________________________________</div><div class="source">Источник: открытый банк заданий ФГБНУ «ФИПИ» · <a href="${task.source_url}">первоисточник</a></div></article>`);
    }
    sections.push(`<section><h2>${topicNumber(group.topic.id)}. ${escapeText(group.topic.title)}</h2>${articles.join("")}</section>`);
  }
  const tasks = sections.join("");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Вариант ЕГЭ — Infinita</title><style>
    @page{size:A4;margin:17mm}*{box-sizing:border-box}body{max-width:900px;margin:0 auto;color:#120001;font:15px/1.55 Arial,sans-serif}header{padding:0 0 25px;border-bottom:2px solid #cf294b}h1{margin:0;font:700 38px Georgia,serif}header p,.meta,.source{color:#756b68}.brand{color:#cf294b}h2{margin:34px 0 12px;color:#300104;font:700 24px Georgia,serif}article{padding:20px 0;border-top:1px solid #ddd;break-inside:avoid}.meta{margin-bottom:12px;font-size:11px}.condition{font-size:16px}.condition img{max-width:100%;height:auto}.condition img.fipi-inline-image{display:inline-block;width:auto;max-width:min(100%,16em);margin:0 .12em;vertical-align:-.35em}.condition img.fipi-block-image,.condition img.task-image:not(.fipi-inline-image){display:block;max-width:100%;height:auto;margin:12px auto}.condition table{max-width:100%!important}.answer{margin-top:24px}.source{margin-top:18px;font-size:9px}.source a{color:#cf294b}@media print{a{color:inherit;text-decoration:none}}
  </style></head><body><header><h1><span class="brand">∞</span> Infinita · вариант ЕГЭ</h1><p>Профильная математика · составлен ${date}</p></header>${tasks}<footer><p>Материалы заданий получены из открытого банка ФГБНУ «ФИПИ». Infinita не является официальным ресурсом ФИПИ.</p></footer></body></html>`;
}

async function downloadVariant() {
  if (!state.variantGroups.length) return;
  const button = $("#downloadHtml");
  const initialText = button.textContent;
  button.disabled = true; button.textContent = "Встраиваем картинки…";
  try {
    const blob = new Blob([await variantDocument({ inlineImages: true })], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `infinita-variant-${new Date().toISOString().slice(0, 10)}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (error) {
    alert(error.message || "Не удалось скачать вариант.");
  } finally {
    button.disabled = false; button.textContent = initialText;
  }
}

async function printVariant() {
  if (!state.variantGroups.length) return;
  const button = $("#printVariant");
  const initialText = button.textContent;
  const popup = window.open("", "_blank");
  if (!popup) { alert("Разрешите всплывающие окна, чтобы открыть печатную версию."); return; }
  button.disabled = true; button.textContent = "Готовим PDF…";
  popup.document.open();
  popup.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Готовим вариант…</title></head><body style="font:16px Arial,sans-serif;padding:30px">Готовим вариант и встраиваем изображения…</body></html>');
  popup.document.close();
  try {
    const html = await variantDocument({ inlineImages: true });
    popup.document.open(); popup.document.write(html); popup.document.close();
    setTimeout(() => popup.print(), 500);
  } catch (error) {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font:16px Arial,sans-serif;padding:30px"><h1>Не удалось подготовить вариант</h1><p>${escapeText(error.message || "Ошибка экспорта")}</p></body></html>`);
    popup.document.close();
  } finally {
    button.disabled = false; button.textContent = initialText;
  }
}

function enableEmbedMode() {
  if (new URLSearchParams(location.search).get("embed") !== "1") return;
  document.body.classList.add("embed-mode");
  const reportHeight = () => parent.postMessage({ type: "infinita-bank-height", height: document.documentElement.scrollHeight }, "*");
  if ("ResizeObserver" in window) new ResizeObserver(reportHeight).observe(document.body);
  window.addEventListener("load", reportHeight);
}

$("#searchInput").addEventListener("input", () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => { state.page = 1; loadTasks(false); }, 350); });
$("#subtopicSelect").addEventListener("change", () => { state.page = 1; loadTasks(false); });
$("#loadMore").addEventListener("click", () => { state.page += 1; loadTasks(true); });
$$('[data-open-variant]').forEach(button => button.addEventListener("click", () => $("#variantDialog").showModal()));
$("#generateVariant").addEventListener("click", event => { event.preventDefault(); generateVariant(); });
$("[data-close-results]").addEventListener("click", () => $("#variantResults").close());
$("#downloadHtml").addEventListener("click", downloadVariant);
$("#printVariant").addEventListener("click", printVariant);
enableEmbedMode();
init();
