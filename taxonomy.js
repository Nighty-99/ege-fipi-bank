const body = document.querySelector("#taxonomyBody");
let data = { items: [], topics: [] };
const esc = value => { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; };

function draw() {
  const search = document.querySelector("#taxonomySearch").value.trim().toLowerCase();
  const topic = Number(document.querySelector("#taxonomyTopic").value) || 0;
  const rows = data.items.filter(item => (!search || `${item.code} ${item.title}`.toLowerCase().includes(search)) && (!topic || item.topic_ids.includes(topic)));
  body.innerHTML = rows.map(item => `<tr><td>${esc(item.code)}</td><td>${esc(item.title)}</td><td><div class="topic-tags">${item.topic_ids.map(id => {
    const current = data.topics.find(topicItem => topicItem.id === id);
    return current ? `<span class="topic-tag">${String(id).padStart(2, "0")} · ${esc(current.title)}</span>` : "";
  }).join("") || '<span class="topic-tag">Вне 12 тем первой части</span>'}</div></td></tr>`).join("") || '<tr><td colspan="3">Ничего не найдено</td></tr>';
}

Promise.all([fetch("data/topics.json").then(response => response.json()), fetch("data/taxonomy.json").then(response => response.json())]).then(([topics, taxonomy]) => {
  data = { topics, items: taxonomy.items };
  document.querySelector("#taxonomyTopic").innerHTML = '<option value="">Все 19 заданий ЕГЭ</option>' + data.topics.map(topic => `<option value="${topic.id}">${String(topic.id).padStart(2, "0")} · ${esc(topic.title)}</option>`).join("");
  draw();
}).catch(error => { body.innerHTML = `<tr><td colspan="3">Не удалось загрузить справочник: ${esc(error.message)}</td></tr>`; });
document.querySelector("#taxonomySearch").addEventListener("input", draw);
document.querySelector("#taxonomyTopic").addEventListener("change", draw);
