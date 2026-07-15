# Банк заданий ЕГЭ ФИПИ — Infinita

Статическая страница банка заданий профильного ЕГЭ по математике для публикации через GitHub Pages и встраивания в Tilda.

Проект работает без постоянного сервера: задания, ответы, справочник тем и изображения лежат в репозитории, а проверка кратких ответов выполняется прямо в браузере.

## Что уже входит в проект

- 997 заданий из открытого банка ФГБНУ «ФИПИ».
- 19 экзаменационных разделов:
  - 1–12 — задания с кратким ответом;
  - 13–19 — задания с развёрнутым ответом.
- 578 кратких заданий с ответами.
- 497 ответов подтверждены через механизм проверки ФИПИ.
- 81 ответ сохранён как вычисленный, потому что ФИПИ не дал проверить его автоматически.
- Локальные изображения условий:
  - 453 вставки изображений;
  - 442 файла в `assets/fipi-images`;
  - внешних ссылок на изображения ФИПИ в условиях нет.
- Исправление маленьких формульных картинок ФИПИ: обозначения вроде `ABC`, `AB`, `3√2`, `135°` вставлены внутрь текста, а большие чертежи остаются отдельными рисунками.
- Генератор случайного варианта.
- Экспорт варианта:
  - автономный HTML с картинками, встроенными через base64;
  - PDF через печать браузера / «Сохранить как PDF».
- Справочник КЭС и подтем: `taxonomy.html`.

## Публикация на GitHub Pages

В репозиторий должны попасть минимум:

```text
index.html
app.js
styles.css
taxonomy.html
taxonomy.js
taxonomy.css
data/
assets/fipi-images/
.nojekyll
tilda-embed-snippet.html
```

Рабочие папки для анализа можно не публиковать:

```text
remaining_images/
remaining_images_white/
topic_images_current/
topic_images_current_sheets/
topic12_sheets/
__pycache__/
```

Включение GitHub Pages:

1. Откройте репозиторий на GitHub.
2. Перейдите в `Settings → Pages`.
3. Выберите:
   - `Source`: `Deploy from a branch`;
   - `Branch`: `main`;
   - `Folder`: `/ (root)`.
4. Нажмите `Save`.

После публикации страница будет доступна по адресу вида:

```text
https://USERNAME.github.io/ege-fipi-bank/
```

## Встраивание в Tilda

На странице Tilda добавьте блок `T123 HTML-код` и вставьте код из `tilda-embed-snippet.html`.

Для текущего репозитория пример iframe:

```html
<div id="infinita-bank-wrap" style="width:100%;overflow:hidden">
  <iframe
    id="infinita-bank-frame"
    src="https://nighty-99.github.io/ege-fipi-bank/?embed=1"
    title="Банк заданий ЕГЭ Infinita"
    loading="lazy"
    style="display:block;width:100%;height:1200px;border:0"
    allow="clipboard-write"
  ></iframe>
</div>

<script>
(function () {
  var frame = document.getElementById('infinita-bank-frame');
  window.addEventListener('message', function (event) {
    if (event.origin !== 'https://nighty-99.github.io') return;
    if (event.data && event.data.type === 'infinita-bank-height') {
      frame.style.height = Math.max(700, Number(event.data.height) || 0) + 'px';
    }
  });
}());
</script>
```

Если после обновления сайта Tilda или браузер показывают старую версию, поменяйте URL iframe, например:

```html
src="https://nighty-99.github.io/ege-fipi-bank/?embed=1&v=3"
```

## Экспорт варианта

После сборки случайного варианта доступны две кнопки:

- `Скачать HTML` — создаёт автономный HTML-файл. Картинки выбранных задач встроены внутрь файла через base64.
- `Печать / PDF` — открывает печатную версию. В окне печати выберите «Сохранить как PDF».

В экспортируемом варианте:

- не показываются коды ФИПИ;
- не показываются КЭС/подтемы;
- не пишется дата составления;
- в конце остаётся только надпись:

```text
Материалы заданий получены из открытого банка ФГБНУ «ФИПИ»
```

Если в PDF появляется `about:blank`, это колонтитул браузера. Отключите его в окне печати:

```text
Дополнительные настройки → Верхние и нижние колонтитулы → выкл.
```

## Обновление банка ФИПИ

Для полного обновления используйте единый сценарий:

```powershell
python scripts\update_static_bank.py
```

Он выполняет весь конвейер:

1. Загружает текущий банк ФИПИ.
2. Сохраняет существующие задания и ответы по GUID.
3. Добавляет новые задания.
4. Обновляет изменившиеся условия.
5. Обновляет `data/taxonomy.json`.
6. Скачивает новые изображения в `assets/fipi-images`.
7. Переписывает ссылки на изображения в `data/tasks.json` на локальные.
8. Классифицирует картинки:
   - `fipi-inline-image` — маленькие формулы;
   - `fipi-block-image` — чертежи и графики.
9. Возвращает маленькие формульные картинки в пустые места текста.
10. Запускает аудит статической базы.

После обновления внимательно смотрите вывод аудита. Особенно строки:

```text
missing_short_answers
external_image_refs
missing_image_files
inline_before_block_runs
trailing_inline_runs
```

Нормальное состояние для публикации:

```text
external_image_refs: 0
missing_image_files: 0
empty_image_files: 0
inline_before_block_runs: 0
trailing_inline_runs: 0
```

Если появились новые краткие задачи без ответов, аудит выведет их номера. Их нужно решить и сохранить отдельно.

## Проверка и сохранение ответов

Проверенный через ФИПИ ответ:

```powershell
python scripts\verify_answer.py FIPI_NUMBER ANSWER
```

Пример:

```powershell
python scripts\verify_answer.py 40B442 29
```

Если есть несколько допустимых форм записи, передайте их дополнительными аргументами:

```powershell
python scripts\verify_answer.py 123ABC 0,5 1/2
```

ФИПИ проверяет первый ответ, остальные сохраняются как допустимые варианты для браузера.

Если ФИПИ возвращает «Нет прав доступа», но ответ решён вручную:

```powershell
python scripts\record_calculated_answer.py FIPI_NUMBER ANSWER
```

Такие ответы получают статус:

```text
calculated_fipi_check_unavailable
```

## Аудит текущей базы

Проверить базу без загрузки новых заданий:

```powershell
python scripts\audit_static_bank.py
```

Постобработка уже скачанного `data/tasks.json` без запроса ФИПИ:

```powershell
python scripts\update_static_bank.py --skip-fetch
```

## Файлы проекта

- `index.html` — основная страница банка.
- `styles.css` — дизайн страницы.
- `app.js` — фильтры, проверка ответов, генератор варианта, HTML/PDF-экспорт.
- `taxonomy.html`, `taxonomy.js`, `taxonomy.css` — справочник КЭС/подтем.
- `data/tasks.json` — задания.
- `data/answers.json` — ответы краткой части.
- `data/topics.json` — темы интерфейса.
- `data/taxonomy.json` — официальные коды КЭС ФИПИ.
- `assets/fipi-images/` — локальные картинки условий.
- `scripts/update_static_bank.py` — полный сценарий обновления.
- `scripts/audit_static_bank.py` — проверка статической базы.
- `scripts/verify_answer.py` — проверка ответа через ФИПИ.
- `scripts/record_calculated_answer.py` — сохранение вручную вычисленного ответа.
- `scripts/localize_fipi_images.py` — скачивание и локализация картинок.
- `scripts/classify_task_images.py` — классификация inline/block изображений.
- `scripts/place_inline_images.py` — перенос маленьких формульных картинок в текст.

## Публикация изменений

После правок:

```powershell
git add index.html app.js styles.css taxonomy.html taxonomy.js taxonomy.css data assets .nojekyll tilda-embed-snippet.html README.md scripts
git commit -m "Update FIPI bank"
git push origin main
```

GitHub Pages обычно обновляется за 1–3 минуты.

Если браузер показывает старую версию:

- откройте страницу с новым query-параметром, например `?v=4`;
- нажмите `Ctrl + F5`;
- для Tilda поменяйте iframe URL на `?embed=1&v=4`.

## Юридическая атрибуция

На странице банка и в экспортируемых вариантах указано, что материалы заданий получены из открытого банка ФГБНУ «ФИПИ».

Перед массовой публикацией и регулярным обновлением рекомендуется самостоятельно проверить актуальные условия использования материалов ФИПИ.
