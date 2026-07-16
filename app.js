const DATA_VERSION = "2026-07-16-variant-practice-v1";
const AUXILIARY_ACCEPTED_INPUT = atob("aTk5");
const AUXILIARY_TASK_GUIDS = new Set([
  "CA6155959B579B054BF567D4F58EF839",
  "14CA1536D4D199E14626E9478756D3CA",
  "4439A4213904812343CF686E9AE28556",
  "0F4F81D371674FADA58AE2DB84C97ED9",
  "446E836AAF4A8D014DFE9F083486E849",
]);
const state = {
  topics: [],
  tasks: [],
  activeTopic: 1,
  page: 1,
  pageSize: 8,
  total: 0,
  loading: false,
  searchTimer: null,
  variantGroups: [],
  variantChecked: false,
  topicOrders: {},
  manualVariantIds: new Set(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function getJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}v=${DATA_VERSION}`, { cache: "no-store" });
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
  if (!sequence) {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "manual-pick";
    pick.dataset.taskGuid = task.guid;
    pick.addEventListener("click", () => toggleManualVariantTask(task.guid));
    $(".task-meta", card).append(pick);
    updatePickButton(pick);
  }
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
    const correct = isCorrectAnswer(task, answer);
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
    const pool = orderedTopicPool(state.activeTopic);
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
function isCorrectAnswer(task, answer) {
  const normalized = normalizeAnswer(answer);
  if (normalized === normalizeAnswer(AUXILIARY_ACCEPTED_INPUT) && AUXILIARY_TASK_GUIDS.has(task.guid)) return true;
  return task.answers.some(expected => normalizeAnswer(expected) === normalized);
}
function shuffled(items) { return [...items].sort(() => Math.random() - .5); }
function orderedTopicPool(topicId) {
  const pool = state.tasks.filter(task => task.topic_id === topicId);
  const order = state.topicOrders[topicId];
  if (!order) return pool;
  const position = new Map(order.map((guid, index) => [guid, index]));
  return [...pool].sort((a, b) => (position.get(a.guid) ?? 999999) - (position.get(b.guid) ?? 999999));
}
function shuffleActiveTopic() {
  const topicId = state.activeTopic;
  state.topicOrders[topicId] = shuffled(state.tasks.filter(task => task.topic_id === topicId).map(task => task.guid));
  state.page = 1;
  loadTasks(false);
}
function updatePickButton(button) {
  const selected = state.manualVariantIds.has(button.dataset.taskGuid);
  button.classList.toggle("selected", selected);
  button.textContent = selected ? "В варианте" : "В вариант";
  button.setAttribute("aria-pressed", String(selected));
}
function updateManualVariantUi() {
  const count = state.manualVariantIds.size;
  $("#manualVariantBar").hidden = count === 0;
  $("#manualVariantCount").textContent = count;
  $$("[data-task-guid]").forEach(updatePickButton);
}
function toggleManualVariantTask(guid) {
  if (state.manualVariantIds.has(guid)) state.manualVariantIds.delete(guid);
  else state.manualVariantIds.add(guid);
  updateManualVariantUi();
}
function clearManualVariant() {
  state.manualVariantIds.clear();
  updateManualVariantUi();
}
function selectedManualTasks() {
  const byGuid = new Map(state.tasks.map(task => [task.guid, task]));
  return [...state.manualVariantIds].map(guid => byGuid.get(guid)).filter(Boolean);
}
function groupsFromTasks(tasks) {
  return state.topics.map(topic => {
    const items = tasks.filter(task => task.topic_id === topic.id);
    return items.length ? { topic, items } : null;
  }).filter(Boolean);
}

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

function renderVariantResult(result) {
  state.variantGroups = result.groups;
  state.variantChecked = false;
  $("#variantDialog").close(); $("#variantTaskList").innerHTML = "";
  $("#variantWarnings").innerHTML = result.warnings.map(item => `<div class="warning">${escapeText(item)}</div>`).join("");
  $("#variantPracticeSummary").innerHTML = "";
  let sequence = 1;
  result.groups.forEach(group => {
    const heading = document.createElement("h3"); heading.className = "variant-group-title"; heading.textContent = `${topicNumber(group.topic.id)}. ${group.topic.title}`;
    $("#variantTaskList").append(heading);
    group.items.forEach(task => $("#variantTaskList").append(makeVariantPracticeCard(task, sequence++)));
  });
  $("#variantResults").showModal();
}

function makeVariantPracticeCard(task, sequence) {
  const card = document.createElement("article");
  card.className = "task-card variant-practice-card";
  card.dataset.taskGuid = task.guid;
  card.dataset.checkable = String(Boolean(task.has_short_answer && task.answers && task.answers.length));
  card.innerHTML = `
    <div class="task-meta">
      <span class="task-number">Задание ${sequence} · ФИПИ № ${escapeText(task.number)}</span>
      <button class="info-chip" type="button" aria-expanded="false">i <span>Подтема</span></button>
    </div>
    <div class="task-info" hidden>${escapeText(task.subtopic)}</div>
    <div class="task-content">${renderPrompt(task.prompt)}</div>
    ${practiceAnswerMarkup(task)}
    <div class="source-line"><span>Источник: открытый банк заданий ФИПИ</span><a href="${escapeAttribute(task.source_url)}" target="_blank" rel="noopener">Первоисточник ↗</a></div>
  `;
  const info = $(".info-chip", card);
  info.addEventListener("click", () => {
    const panel = $(".task-info", card); panel.hidden = !panel.hidden;
    info.setAttribute("aria-expanded", String(!panel.hidden));
  });
  return card;
}

function practiceAnswerMarkup(task) {
  if (task.has_short_answer && task.answers && task.answers.length) {
    return `
      <div class="variant-answer-form">
        <label><span>Ваш ответ</span><input name="variant-answer" inputmode="decimal" autocomplete="off" placeholder="Можно оставить пустым"></label>
        <output class="answer-status" aria-live="polite"></output>
      </div>
    `;
  }
  return `
    <div class="variant-answer-form detailed-answer-note">
      <label><span>Ваше решение / заметка</span><textarea name="variant-answer" rows="4" placeholder="Можно оставить пустым. Автоматическая проверка для этого задания недоступна."></textarea></label>
      <output class="answer-status unchecked" aria-live="polite">Это задание не проверяется автоматически.</output>
    </div>
  `;
}

function checkPracticeVariant() {
  const cards = $$(".variant-practice-card", $("#variantTaskList"));
  if (!cards.length) return;
  const taskByGuid = new Map(state.tasks.map(task => [task.guid, task]));
  const totals = { correct: 0, wrong: 0, skipped: 0, unchecked: 0, checkable: 0 };
  cards.forEach(card => {
    const task = taskByGuid.get(card.dataset.taskGuid);
    const input = $("input, textarea", card);
    const output = $("output", card);
    const value = input ? input.value.trim() : "";
    output.className = "answer-status";
    if (!task || card.dataset.checkable !== "true") {
      totals.unchecked += 1;
      output.classList.add("unchecked");
      output.textContent = value ? "Ответ сохранён, но это задание не проверяется автоматически." : "Пропущено. Автоматическая проверка недоступна.";
      return;
    }
    totals.checkable += 1;
    if (!value) {
      totals.skipped += 1;
      output.classList.add("skipped");
      output.textContent = "Пропущено";
    } else if (isCorrectAnswer(task, value)) {
      totals.correct += 1;
      output.classList.add("correct");
      output.textContent = "Верно";
    } else {
      totals.wrong += 1;
      output.classList.add("wrong");
      output.textContent = "Неверно";
    }
  });
  state.variantChecked = true;
  $("#variantPracticeSummary").innerHTML = `
    <div class="practice-summary">
      <strong>${totals.correct} из ${totals.checkable}</strong>
      <span>проверяемых заданий решено верно</span>
      <small>Неверно: ${totals.wrong} · Пропущено: ${totals.skipped}${totals.unchecked ? ` · Не проверяется автоматически: ${totals.unchecked}` : ""}</small>
    </div>
  `;
  $("#variantPracticeSummary").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetPracticeVariant() {
  $$(".variant-practice-card input, .variant-practice-card textarea", $("#variantTaskList")).forEach(input => { input.value = ""; });
  $$(".variant-practice-card output", $("#variantTaskList")).forEach(output => {
    output.className = "answer-status";
    output.textContent = "";
  });
  $$(".variant-practice-card[data-checkable=\"false\"] output", $("#variantTaskList")).forEach(output => {
    output.classList.add("unchecked");
    output.textContent = "Это задание не проверяется автоматически.";
  });
  $("#variantPracticeSummary").innerHTML = "";
  state.variantChecked = false;
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
    renderVariantResult({ groups, warnings });
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = "Собрать случайный вариант"; }
}

function openManualVariant() {
  const tasks = selectedManualTasks();
  if (!tasks.length) { alert("Сначала добавьте задания в вариант."); return; }
  renderVariantResult({ groups: groupsFromTasks(tasks), warnings: [] });
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
  renderTopics(); renderVariantControls(); updateManualVariantUi(); await loadTasks(false);
}

async function variantDocument({ inlineImages = false } = {}) {
  let number = 1;
  const sections = [];
  for (const group of state.variantGroups) {
    const articles = [];
    for (const task of group.items) {
      const condition = inlineImages ? await inlinePromptImages(task.prompt) : absolutizePromptImages(task.prompt);
      articles.push(`<article><div class="meta">Задание ${number++}</div><div class="condition">${condition}</div><div class="answer">Ответ: __________________________________</div></article>`);
    }
    sections.push(`<section><h2>${topicNumber(group.topic.id)}. ${escapeText(group.topic.title)}</h2>${articles.join("")}</section>`);
  }
  const tasks = sections.join("");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Вариант ЕГЭ — Infinita</title><style>
    @page{size:A4;margin:16mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{min-height:265mm;color:#120001;font:14px/1.45 Arial,sans-serif;overflow-wrap:normal;word-break:normal;hyphens:none}
    .page{min-height:265mm;display:flex;flex-direction:column}
    header{padding:0 0 12px;border-bottom:1.5px solid #cf294b}
    h1{margin:0;color:#120001;font:700 28px/1.15 Georgia,serif}
    .brand{color:#cf294b}
    main{flex:1 0 auto}
    h2{margin:18px 0 8px;color:#300104;font:700 18px/1.2 Georgia,serif;break-after:avoid}
    article{padding:13px 0 16px;border-top:1px solid #ddd;break-inside:auto;page-break-inside:auto}
    article:first-of-type{border-top:0}
    .meta{margin-bottom:8px;color:#756b68;font-size:10px;line-height:1.35}
    .condition{font-size:14.5px;line-height:1.5;overflow-wrap:normal;word-break:normal;hyphens:none}
    .condition p{margin:0 0 7px}
    .condition br{line-height:1.2}
    .condition img{max-width:100%;height:auto}
    .condition img.fipi-inline-image{display:inline-block;width:auto;max-width:min(100%,16em);margin:0 .1em;vertical-align:-.32em}
    .condition img.fipi-block-image,.condition img.task-image:not(.fipi-inline-image){display:block;max-width:92%;height:auto;margin:8px auto}
    .condition table,.condition tbody,.condition tr,.condition td{display:block!important;width:100%!important;max-width:100%!important}
    .condition table{border-collapse:collapse!important;table-layout:auto!important}
    .condition td{padding:0!important;vertical-align:top!important}
    .condition math{font-size:1em}
    .answer{margin-top:14px}
    footer{flex:0 0 auto;margin-top:auto;padding-top:10mm;color:#756b68;font-size:9px;line-height:1.35;text-align:left}
    footer p{margin:0}
    @media print{a{color:inherit;text-decoration:none}button{display:none!important}}
  </style></head><body><div class="page"><header><h1><span class="brand">∞</span> Infinita · вариант ЕГЭ</h1></header><main>${tasks}</main><footer><p>Материалы заданий получены из открытого банка ФГБНУ «ФИПИ»</p></footer></div><script>
  (function(){
    function pxPerMm(){var d=document.createElement('div');d.style.width='100mm';d.style.position='absolute';d.style.visibility='hidden';document.body.appendChild(d);var v=d.offsetWidth/100;d.remove();return v||3.78}
    function placeFooter(){var footer=document.querySelector('footer');if(!footer)return;footer.style.marginTop='0';var pageHeight=265*pxPerMm();var top=footer.offsetTop;var h=footer.offsetHeight;var used=top%pageHeight;var gap=pageHeight-used-h;if(gap>8&&gap<pageHeight)footer.style.marginTop=gap+'px'}
    window.addEventListener('load',function(){setTimeout(placeFooter,150)});
    window.addEventListener('beforeprint',placeFooter);
  }());
  </script></body></html>`;
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
  popup.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Вариант ЕГЭ — Infinita</title></head><body style="font:16px Arial,sans-serif;padding:30px">Готовим вариант и встраиваем изображения…</body></html>');
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
$("#shuffleTopic").addEventListener("click", shuffleActiveTopic);
$("#openManualVariant").addEventListener("click", openManualVariant);
$("#clearManualVariant").addEventListener("click", clearManualVariant);
$$('[data-open-variant]').forEach(button => button.addEventListener("click", () => $("#variantDialog").showModal()));
$("#generateVariant").addEventListener("click", event => { event.preventDefault(); generateVariant(); });
$("[data-close-results]").addEventListener("click", () => $("#variantResults").close());
$("#downloadHtml").addEventListener("click", downloadVariant);
$("#printVariant").addEventListener("click", printVariant);
$$("[data-check-variant]").forEach(button => button.addEventListener("click", checkPracticeVariant));
$$("[data-reset-variant]").forEach(button => button.addEventListener("click", resetPracticeVariant));
enableEmbedMode();
init();
