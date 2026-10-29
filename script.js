const $ = s => document.querySelector(s);
const TYPES = { article: "Статья", list: "Список", mention: "Упоминание" };

let cfg = { limit: 12, examples: [], noise: [] };   // подменяется данными из data/data.json
let items = [], filter = "all", view = "search", query = "", searched = false, favs = {};

try { favs = JSON.parse(localStorage.getItem("eduapp_favs") || "{}"); } catch (e) {}
const saveFavs = () => { try { localStorage.setItem("eduapp_favs", JSON.stringify(favs)); } catch (e) {} };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function setStatus(text, cls = "") {
  $("#status").className = cls;
  $("#status").textContent = text;
}

// убираем служебные пометки и обрывы на полуслове
function clean(text) {
  let t = (text || "").replace(/\[\d+\]/g, "").replace(/\s+/g, " ");
  cfg.noise.forEach(n => { t = t.replace(new RegExp(n, "gi"), ""); });
  t = t.trim();
  if (!t) return "Описание недоступно.";
  if (t.length <= 220) return t;
  const cut = t.slice(0, 220);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return dot > 90 ? cut.slice(0, dot + 1) : cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:(—-]+$/, "") + "…";
}

// тип: статья / список / упоминание
function classify(title, q) {
  const t = title.toLowerCase(), qn = q.toLowerCase().trim();
  if (/^(список|перечень|категория)\b|\(значения\)/.test(t)) return "list";
  if (t.includes(qn)) return "article";
  const words = qn.split(/\s+/).filter(w => w.length > 2);
  return words.length && words.every(w => t.includes(w.slice(0, Math.max(3, w.length - 2)))) ? "article" : "mention";
}

async function search(q) {
  q = q.trim();
  if (!q) return;
  query = q; searched = true; view = "search"; filter = "all";
  $("#go").disabled = true;
  setStatus("Ищем статьи по запросу «" + q + "»…");

  const url = "https://ru.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrsearch=" + encodeURIComponent(q) + "&gsrlimit=" + cfg.limit +
    "&prop=extracts|info&exintro=1&explaintext=1&exlimit=max&exchars=600&inprop=url";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => a.index - b.index);
    items = pages.map(p => ({
      id: String(p.pageid), title: p.title, snippet: clean(p.extract),
      type: classify(p.title, q), url: p.fullurl, main: false
    }));
    // основная статья — самое короткое название среди статей, ставим первой
    const main = items.filter(i => i.type === "article").sort((a, b) => a.title.length - b.title.length)[0];
    if (main) { main.main = true; items = [main, ...items.filter(i => i !== main)]; }
  } catch (e) {
    items = [];
    setStatus("Не удалось загрузить данные. Проверьте интернет и нажмите «Найти» ещё раз.", "err");
    $("#go").disabled = false;
    return;
  }
  $("#go").disabled = false;
  render();
}

function card(it) {
  const c = el("article", "card" + (it.main ? " main" : ""));

  const top = el("div", "top");
  const heart = el("button", "heart", favs[it.id] ? "♥" : "♡");
  heart.type = "button";
  heart.setAttribute("aria-pressed", !!favs[it.id]);
  heart.setAttribute("aria-label", "В избранное: " + it.title);
  heart.onclick = () => { favs[it.id] ? delete favs[it.id] : (favs[it.id] = it); saveFavs(); render(); };
  top.append(el("h2", null, it.title), heart);

  const tags = el("div", "tags");
  if (it.main) tags.append(el("span", "tag main", "Основная статья"));
  tags.append(el("span", "tag " + it.type, TYPES[it.type]));

  const link = el("a", "read", "Читать статью в Википедии");
  link.href = it.url; link.target = "_blank"; link.rel = "noopener noreferrer";

  c.append(top, tags, el("p", null, it.snippet), link);
  return c;
}

// заглушка с иллюстрацией, когда показывать нечего
function emptyBlock(fav) {
  const box = el("div", "empty");
  const img = el("img");
  img.src = fav ? "assets/images/favorites.svg" : "assets/images/empty.svg";
  img.alt = "";
  img.width = 220; img.height = 183;
  box.append(img, el("p", null, fav
    ? "Здесь появятся статьи, которые вы отметите ♡"
    : "По этому запросу ничего нет. Попробуйте другое слово или другую категорию."));
  return box;
}

function render() {
  const fav = view === "fav";
  const base = fav ? Object.values(favs) : items;
  const list = filter === "all" ? base : base.filter(i => i.type === filter);

  $("#search").hidden = fav;
  $("#navSearch").classList.toggle("active", !fav);
  $("#navFav").classList.toggle("active", fav);
  $("#favCount").textContent = Object.keys(favs).length;

  // фильтры по типу со счётчиком
  const filters = $("#filters");
  filters.hidden = !base.length;
  filters.replaceChildren(...[["all", "Все"], ["article", "Статьи"], ["list", "Списки"], ["mention", "Упоминания"]].map(([key, name]) => {
    const n = key === "all" ? base.length : base.filter(i => i.type === key).length;
    const b = el("button", "chip", name + " (" + n + ")");
    b.type = "button";
    b.setAttribute("aria-pressed", filter === key);
    b.onclick = () => { filter = key; render(); };
    return b;
  }));

  if (fav) setStatus(base.length ? "В избранном: " + base.length : "В избранном пока пусто. Нажмите ♡ на карточке.", base.length ? "ok" : "");
  else if (!searched) setStatus("Готов к работе");
  else if (!items.length) setStatus("Ничего не найдено. Попробуйте другое слово.");
  else setStatus("Найдено статей: " + list.length + " · запрос «" + query + "»", "ok");

  if (!list.length && (fav || searched)) {
    $("#results").replaceChildren(emptyBlock(fav));
    return;
  }
  $("#results").replaceChildren(...list.map(card));
}

// события
$("#form").onsubmit = e => { e.preventDefault(); search($("#q").value); };
$("#navSearch").onclick = () => { view = "search"; filter = "all"; render(); };
$("#navFav").onclick = () => { view = "fav"; filter = "all"; render(); };

// запуск: примеры тем берём из data/data.json (если файл не загрузился — работаем без них)
fetch("data/data.json").then(r => r.json()).then(d => { cfg = { ...cfg, ...d }; }).catch(() => {}).finally(() => {
  $("#examples").replaceChildren(...cfg.examples.map(q => {
    const b = el("button", "chip", q);
    b.type = "button";
    b.onclick = () => { $("#q").value = q; search(q); };
    return b;
  }));
  render();
});
