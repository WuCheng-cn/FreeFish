/* FreeFish - 摸鱼悬浮 txt 阅读器 前端逻辑 */
"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

/* ---------------- 状态 ---------------- */

const DEFAULT_REGEX = String.raw`^\s*(?:第\s*[0-9零一二三四五六七八九十百千万两〇]+\s*[章回节卷部篇集话].{0,30}|(?:序章|序言|楔子|引子|前言|后记|尾声|终章|番外|大结局).{0,20})\s*$`;

const DEFAULT_SHORTCUTS = {
  boss: "Ctrl+Shift+H",   // 老板键(Rust 侧处理,窗口隐藏时也有效)
  prev: "Ctrl+Alt+Left",
  next: "Ctrl+Alt+Right",
  ghost: "Ctrl+Shift+M",
  top: "Ctrl+Shift+T",
  line: "Ctrl+Shift+L",
};

let settings = {
  fontFamily: "",
  fontSize: 15,
  lineHeight: 1.8,
  textColor: "#c8ccd4",
  bgColor: "#16181d",
  bgOpacity: 92,
  disguise: false,
  openLast: true,
  alwaysOnTop: true,
  chapterRegex: DEFAULT_REGEX,
  lastBookId: null,
  lineMode: false,
  lineRestore: null,   // 进入单行模式前的窗口尺寸
  autoHide: true,      // 无操作自动隐藏
  autoHideSecs: 10,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

let shelf = [];      // [{id, path, title, progress:{ch, ratio}}]
let book = null;     // {meta, text, chapters:[{title,start,end}], ch}
let ghost = false;
let searchResults = [];
let segStart = 0, segEnd = 0; // 单行模式:当前行在本章内的字符区间

const $ = (id) => document.getElementById(id);
const scrollEl = () => $("readerScroll");

/* ---------------- 工具 ---------------- */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hexToRgba(hex, opacityPct) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${(opacityPct / 100).toFixed(3)})`;
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
let toastTimer = null;
function toast(msg, ms = 2200) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

/* ---------------- 持久化 ---------------- */

async function loadJson(name) {
  try { return JSON.parse(await invoke("load_data", { name })); }
  catch { return null; }
}
const saveSettings = debounce(() => invoke("save_data", { name: "settings", data: JSON.stringify(settings) }), 300);
const saveShelf = debounce(() => invoke("save_data", { name: "shelf", data: JSON.stringify(shelf) }), 500);

/* ---------------- 章节解析 ---------------- */

function parseChapters(text, regexStr) {
  let re;
  try { re = new RegExp(regexStr || DEFAULT_REGEX); }
  catch { re = new RegExp(DEFAULT_REGEX); toast("章节正则无效,已用默认规则"); }

  const chapters = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const t = line.replace(/\r/g, "").trim();
    if (t && t.length <= 60 && re.test(t)) {
      chapters.push({ title: t.slice(0, 50), start: offset });
    }
    offset += line.length + 1;
  }

  // 降级:识别不到章节时按固定长度分段
  if (chapters.length < 2) {
    chapters.length = 0;
    const SIZE = 6000;
    for (let i = 0, n = 1; i < text.length; i += SIZE, n++) {
      chapters.push({ title: `第 ${n} 部分`, start: i });
    }
  } else if (chapters[0].start > 0) {
    chapters.unshift({ title: "(开头)", start: 0 });
  }

  for (let i = 0; i < chapters.length; i++) {
    chapters[i].end = i + 1 < chapters.length ? chapters[i + 1].start : text.length;
  }
  return chapters;
}

/* ---------------- 单行模式 ---------------- */

let _mctx = null;
function mctx() {
  if (!_mctx) _mctx = document.createElement("canvas").getContext("2d");
  return _mctx;
}
function contentFont() {
  const cs = getComputedStyle($("content"));
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}
function contentWidth() {
  return Math.max(40, scrollEl().clientWidth - 26);
}
/* 从头开始最多能放下多少字(二分,按真实字宽) */
function fitCount(text, width, font) {
  const ctx = mctx(); ctx.font = font;
  const max = Math.min(text.length, 400);
  if (max <= 0) return 0;
  if (ctx.measureText(text.slice(0, max)).width <= width) return max;
  let lo = 1, hi = max;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid)).width <= width) lo = mid; else hi = mid - 1;
  }
  return lo;
}
/* 以结尾对齐最多能放下多少字(用于向前翻行) */
function fitCountFromEnd(text, width, font) {
  const ctx = mctx(); ctx.font = font;
  const max = Math.min(text.length, 400);
  if (max <= 0) return 0;
  if (ctx.measureText(text.slice(-max)).width <= width) return max;
  let lo = 1, hi = max;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(-mid)).width <= width) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function chapterText() {
  const c = book.chapters[book.ch];
  return book.text.slice(c.start, c.end);
}

/* 渲染本章内 off 处开始的一行;off 越界则显示章末最后一行 */
function renderLine(off = 0, hl = null) {
  if (!book) return;
  const text = chapterText();
  const width = contentWidth();
  const font = contentFont();

  off = Math.max(0, Math.min(off, text.length));
  while (off < text.length && /\s/.test(text[off])) off++;

  if (off >= text.length) {
    let end = text.length;
    while (end > 0 && /\s/.test(text[end - 1])) end--;
    if (end === 0) {
      segStart = segEnd = 0;
      $("content").innerHTML = "<p class='oneline'>&nbsp;</p>";
      return;
    }
    const ls = text.lastIndexOf("\n", end - 1) + 1;
    off = end - Math.max(1, fitCountFromEnd(text.slice(ls, end), width, font));
  }

  const nl = text.indexOf("\n", off);
  const chunk = text.slice(off, nl === -1 ? text.length : nl);
  const n = Math.max(1, fitCount(chunk, width, font));
  segStart = off;
  segEnd = off + Math.min(n, chunk.length);

  let h = esc(chunk.slice(0, n));
  if (hl) h = h.replace(new RegExp(escRe(hl), "gi"), (m) => `<mark>${m}</mark>`);
  $("content").innerHTML = `<p class="oneline">${h || "&nbsp;"}</p>`;
  saveProgressSoon();
}

function lineNext() {
  if (!book) return;
  const text = chapterText();
  if (segEnd >= text.length || text.slice(segEnd).trim() === "") {
    if (book.ch < book.chapters.length - 1) renderChapter(book.ch + 1, { off: 0 });
  } else {
    renderLine(segEnd);
  }
  markTocActive();
}

function linePrev() {
  if (!book) return;
  const text = chapterText();
  let end = segStart;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  if (end <= 0) {
    if (book.ch > 0) renderChapter(book.ch - 1, { off: Infinity });
  } else {
    const ls = text.lastIndexOf("\n", end - 1) + 1;
    const n = Math.max(1, fitCountFromEnd(text.slice(ls, end), contentWidth(), contentFont()));
    renderLine(end - n);
  }
  markTocActive();
}

function lineWindowHeight() {
  return Math.max(24, Math.round(settings.fontSize * 1.2) + 14);
}

async function resizeWindow(w, h) {
  try {
    const ns = window.__TAURI__.dpi || window.__TAURI__.window;
    await appWindow.setSize(new ns.LogicalSize(Math.round(w), Math.round(h)));
  } catch (e) { console.error("resize failed:", e); }
}

async function setLineMode(on) {
  settings.lineMode = on;
  document.body.classList.toggle("linemode", on);
  $("btnLine").classList.toggle("on", on);
  closePanels();
  if (on) {
    settings.lineRestore = { w: window.innerWidth, h: window.innerHeight };
    await resizeWindow(window.innerWidth, lineWindowHeight());
    await new Promise((r) => setTimeout(r, 60));
    if (book) {
      const c = book.chapters[book.ch];
      renderLine(Math.round(currentRatio() * (c.end - c.start)));
    }
    toast(`单行模式:${settings.shortcuts.line || "快捷键"} 退出,←/→ 或滚轮逐行`, 3200);
  } else {
    const r = settings.lineRestore;
    await resizeWindow(r ? r.w : window.innerWidth, r ? Math.max(r.h, 160) : 380);
    await new Promise((res) => setTimeout(res, 60));
    if (book) {
      const c = book.chapters[book.ch];
      renderChapter(book.ch, { ratio: segStart / Math.max(1, c.end - c.start) });
    }
  }
  saveSettings();
}

/* ---------------- 阅读渲染 ---------------- */

function renderChapter(chIdx, opts = {}) {
  if (!book) return;
  chIdx = Math.max(0, Math.min(chIdx, book.chapters.length - 1));
  book.ch = chIdx;

  if (settings.lineMode) {
    const c = book.chapters[chIdx];
    let off = opts.off;
    if (off == null) off = opts.pos != null ? opts.pos : Math.round((opts.ratio || 0) * (c.end - c.start));
    renderLine(off, opts.highlight || null);
    markTocActive();
    return;
  }
  const c = book.chapters[chIdx];
  const raw = book.text.slice(c.start, c.end);
  const paras = raw.split("\n").map((l) => l.trim()).filter((l) => l);

  const q = opts.highlight;
  const hlRe = q ? new RegExp(escRe(q), "gi") : null;
  const mk = (s) => {
    let h = esc(s);
    if (hlRe) h = h.replace(hlRe, (m) => `<mark>${m}</mark>`);
    return h;
  };

  let html;
  if (settings.disguise) {
    html = paras.map((p, i) => `<div class="cl"><span class="ln">${i + 1}</span><span class="cd">${mk(p)}</span></div>`).join("");
  } else {
    html = paras.map((p) => `<p>${mk(p)}</p>`).join("");
  }
  $("content").innerHTML = html || "<p class='muted'>(本章为空)</p>";

  const el = scrollEl();
  if (opts.markIndex != null) {
    const marks = $("content").querySelectorAll("mark");
    const m = marks[Math.min(opts.markIndex, marks.length - 1)];
    if (m) m.scrollIntoView({ block: "center" });
    else el.scrollTop = 0;
  } else {
    el.scrollTop = (opts.ratio || 0) * Math.max(0, el.scrollHeight - el.clientHeight);
  }

  updatePageInfo();
  markTocActive();
  saveProgressSoon();
}

function updatePageInfo() {
  if (!book) return;
  const el = scrollEl();
  const denom = Math.max(1, el.scrollHeight - el.clientHeight);
  const pct = el.scrollHeight <= el.clientHeight ? 100 : Math.round((el.scrollTop / denom) * 100);
  $("pageinfo").textContent =
    `${book.chapters[book.ch].title} · ${book.ch + 1}/${book.chapters.length} 章 · ${pct}%`;
}

function pageTurn(dir) {
  if (!book || !$("reader") || $("reader").classList.contains("hidden")) return;
  if (settings.lineMode) { dir > 0 ? lineNext() : linePrev(); return; }
  const el = scrollEl();
  const page = Math.max(40, el.clientHeight - 30);
  if (dir > 0) {
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      if (book.ch < book.chapters.length - 1) renderChapter(book.ch + 1, { ratio: 0 });
    } else {
      el.scrollTop += page;
    }
  } else {
    if (el.scrollTop <= 4) {
      if (book.ch > 0) renderChapter(book.ch - 1, { ratio: 1 });
    } else {
      el.scrollTop -= page;
    }
  }
  updatePageInfo();
  saveProgressSoon();
}

/* ---------------- 进度记忆 ---------------- */

const saveProgressSoon = debounce(() => {
  if (!book) return;
  if (settings.lineMode) {
    const c = book.chapters[book.ch];
    const len = Math.max(1, c.end - c.start);
    book.meta.progress = { ch: book.ch, ratio: Math.min(1, segStart / len), off: segStart };
  } else {
    const el = scrollEl();
    const denom = Math.max(1, el.scrollHeight - el.clientHeight);
    book.meta.progress = { ch: book.ch, ratio: Math.min(1, el.scrollTop / denom), off: null };
  }
  saveShelf();
}, 400);

/* ---------------- 书架 ---------------- */

function renderShelf() {
  const list = $("shelfList");
  list.innerHTML = "";
  $("shelfEmpty").classList.toggle("hidden", shelf.length > 0);
  for (const b of shelf) {
    const div = document.createElement("div");
    div.className = "book";
    const pct = b.progress ? Math.round(((b.progress.ch + (b.progress.ratio || 0)) / Math.max(1, b.chapterCount || 1)) * 100) : 0;
    div.innerHTML =
      `<span class="bk-title">${esc(b.title)}</span>` +
      `<span class="bk-prog">${b.progress ? `第${b.progress.ch + 1}章 · ${Math.min(100, pct)}%` : "未读"}</span>` +
      `<button class="bk-del" title="移出书架">×</button>`;
    div.querySelector(".bk-del").addEventListener("click", (e) => {
      e.stopPropagation();
      shelf = shelf.filter((x) => x.id !== b.id);
      saveShelf();
      renderShelf();
    });
    div.addEventListener("click", () => openBook(b));
    list.appendChild(div);
  }
}

async function addBooks() {
  const paths = await invoke("pick_txt");
  let added = 0;
  for (const p of paths) {
    if (shelf.some((b) => b.path === p)) continue;
    const fname = p.split(/[\\/]/).pop().replace(/\.txt$/i, "");
    shelf.unshift({ id: Date.now() + "_" + Math.random().toString(36).slice(2, 7), path: p, title: fname, progress: null });
    added++;
  }
  if (added) { saveShelf(); renderShelf(); toast(`已添加 ${added} 本`); }
}

async function openBook(meta) {
  let text;
  try {
    text = await invoke("read_book", { path: meta.path });
  } catch (e) {
    toast("打开失败: " + e);
    return;
  }
  book = { meta, text, ch: 0 };
  book.chapters = parseChapters(text, settings.chapterRegex);
  meta.chapterCount = book.chapters.length;
  settings.lastBookId = meta.id;
  saveSettings();

  showView("reader");
  renderToc();
  const p = meta.progress || { ch: 0, ratio: 0 };
  renderChapter(p.ch, { ratio: p.ratio || 0, off: p.off != null ? p.off : undefined });
}

/* ---------------- 视图/面板 ---------------- */

function showView(name) {
  $("shelf").classList.toggle("hidden", name !== "shelf");
  $("reader").classList.toggle("hidden", name !== "reader");
  if (name === "shelf") renderShelf();
}

async function togglePanel(id) {
  // 单行模式窗口太矮放不下面板,先退出
  if (settings.lineMode && $(id).classList.contains("hidden")) {
    await setLineMode(false);
  }
  const target = $(id);
  const wasHidden = target.classList.contains("hidden");
  for (const p of document.querySelectorAll(".panel")) p.classList.add("hidden");
  if (wasHidden) target.classList.remove("hidden");
  document.body.classList.toggle("panels-open", wasHidden);
  if (wasHidden && id === "searchPanel") $("searchInput").focus();
  if (wasHidden && id === "tocPanel") $("tocFilter").focus();
}
function closePanels() {
  for (const p of document.querySelectorAll(".panel")) p.classList.add("hidden");
  document.body.classList.remove("panels-open");
}

/* ---------------- 目录(章节跳转) ---------------- */

function renderToc(filter = "") {
  if (!book) { $("tocList").innerHTML = "<div class='muted'>先打开一本书</div>"; return; }
  const kw = filter.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  book.chapters.forEach((c, i) => {
    if (kw && !c.title.toLowerCase().includes(kw)) return;
    const div = document.createElement("div");
    div.className = "toc-item" + (i === book.ch ? " active" : "");
    div.textContent = c.title;
    div.dataset.ch = i;
    div.addEventListener("click", () => { renderChapter(i, { ratio: 0, off: 0 }); closePanels(); });
    frag.appendChild(div);
  });
  const list = $("tocList");
  list.innerHTML = "";
  list.appendChild(frag);
}
function markTocActive() {
  const list = $("tocList");
  if (!list) return;
  for (const el of list.querySelectorAll(".toc-item")) {
    el.classList.toggle("active", Number(el.dataset.ch) === (book ? book.ch : -1));
  }
}

/* ---------------- 全文搜索(搜索跳转) ---------------- */

function doSearch(q) {
  searchResults = [];
  const info = $("searchInfo");
  const list = $("searchList");
  list.innerHTML = "";
  if (!book) { info.textContent = "先打开一本书再搜索"; return; }
  if (!q.trim()) { info.textContent = ""; return; }

  const re = new RegExp(escRe(q), "gi");
  const LIMIT = 300;
  outer:
  for (let ci = 0; ci < book.chapters.length; ci++) {
    const c = book.chapters[ci];
    const seg = book.text.slice(c.start, c.end);
    re.lastIndex = 0;
    let m, k = 0;
    while ((m = re.exec(seg))) {
      searchResults.push({
        ch: ci,
        idx: k++,
        pos: m.index,
        snippet: seg.slice(Math.max(0, m.index - 16), m.index + q.length + 20).replace(/\s+/g, " "),
      });
      if (searchResults.length >= LIMIT) break outer;
      if (m.index === re.lastIndex) re.lastIndex++; // 防空匹配死循环
    }
  }

  info.textContent = searchResults.length
    ? `共 ${searchResults.length}${searchResults.length >= LIMIT ? "+" : ""} 处,点击跳转`
    : "未找到匹配内容";

  const hlRe = new RegExp(escRe(q), "gi");
  const frag = document.createDocumentFragment();
  searchResults.forEach((r) => {
    const div = document.createElement("div");
    div.className = "sr-item";
    div.innerHTML =
      `<div class="sr-ch">${esc(book.chapters[r.ch].title)}</div>` +
      `<div>${esc(r.snippet).replace(hlRe, (mm) => `<mark>${mm}</mark>`)}</div>`;
    div.addEventListener("click", () => {
      renderChapter(r.ch, { highlight: q, markIndex: r.idx, pos: r.pos });
      closePanels();
    });
    frag.appendChild(div);
  });
  list.appendChild(frag);
}

/* ---------------- 外观 ---------------- */

function applyAppearance() {
  const r = document.documentElement.style;
  r.setProperty("--font", settings.fontFamily ? `"${settings.fontFamily}", system-ui, sans-serif` : `system-ui, "Microsoft YaHei", "PingFang SC", sans-serif`);
  r.setProperty("--size", settings.fontSize + "px");
  r.setProperty("--lh", settings.lineHeight);
  r.setProperty("--fg", settings.textColor);
  r.setProperty("--bg", hexToRgba(settings.bgColor, settings.bgOpacity));
  document.body.classList.toggle("disguise", !!settings.disguise);
}

/* ---------------- 全局快捷键 ---------------- */

async function applyShortcuts(showResult = false) {
  const res = await invoke("set_shortcuts", { bindings: settings.shortcuts });
  const NAMES = { boss: "老板键", prev: "上一页", next: "下一页", ghost: "鼠标穿透", top: "切换置顶", line: "单行模式" };
  const problems = [];
  for (const [action, r] of Object.entries(res)) {
    if (r !== "ok" && r !== "disabled") problems.push(`${NAMES[action] || action}: ${r}`);
  }
  const box = $("scResult");
  if (problems.length) {
    box.innerHTML = problems.map((p) => `<span class="err">⚠ ${esc(p)}</span>`).join("\n");
    if (!showResult) toast("部分全局快捷键注册失败,请在设置中调整");
  } else {
    box.textContent = showResult ? "✓ 全部快捷键已生效" : "";
  }
}

/* ---------------- 无操作自动隐藏 ---------------- */

let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!settings.autoHide) return;
  idleTimer = setTimeout(async () => {
    try { await appWindow.hide(); } catch (e) { console.error(e); }
  }, Math.max(3, +settings.autoHideSecs || 10) * 1000);
}

function handleHotkey(action) {
  resetIdleTimer(); // 全局快捷键操作也算活跃
  switch (action) {
    case "prev": pageTurn(-1); break;
    case "next": pageTurn(1); break;
    case "ghost": toggleGhost(); break;
    case "top": toggleTop(); break;
    case "line": setLineMode(!settings.lineMode); break;
  }
}

async function toggleGhost() {
  ghost = !ghost;
  document.body.classList.toggle("ghost", ghost);
  try { await appWindow.setIgnoreCursorEvents(ghost); } catch (e) { console.error(e); }
  if (ghost) toast(`鼠标穿透已开启,按 ${settings.shortcuts.ghost || "快捷键"} 退出`, 3500);
  else toast("鼠标穿透已关闭");
}

async function toggleTop() {
  settings.alwaysOnTop = !settings.alwaysOnTop;
  try { await appWindow.setAlwaysOnTop(settings.alwaysOnTop); } catch (e) { console.error(e); }
  $("btnTop").classList.toggle("on", settings.alwaysOnTop);
  toast(settings.alwaysOnTop ? "已置顶" : "已取消置顶");
  saveSettings();
}

/* 快捷键录制 */
function accFromEvent(e) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const MAP = {
    ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down",
    " ": "Space", Escape: "Escape", Enter: "Enter", Tab: "Tab",
    PageUp: "PageUp", PageDown: "PageDown", Home: "Home", End: "End",
    Backspace: "Backspace", Delete: "Delete",
  };
  let k = MAP[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return [...mods, k].join("+");
}

/* ---------------- 设置面板 ---------------- */

function fillSettings() {
  $("setFont").value = settings.fontFamily;
  $("setFontSize").value = settings.fontSize;
  $("valFontSize").textContent = settings.fontSize;
  $("setLineHeight").value = settings.lineHeight;
  $("valLineHeight").textContent = settings.lineHeight;
  $("setTextColor").value = settings.textColor;
  $("setBgColor").value = settings.bgColor;
  $("setBgOpacity").value = settings.bgOpacity;
  $("valBgOpacity").textContent = settings.bgOpacity;
  $("setDisguise").checked = !!settings.disguise;
  $("setOpenLast").checked = !!settings.openLast;
  $("setAutoHide").checked = !!settings.autoHide;
  $("setAutoHideSecs").value = settings.autoHideSecs;
  $("setRegex").value = settings.chapterRegex;
  for (const inp of document.querySelectorAll("input.sc")) {
    inp.value = settings.shortcuts[inp.dataset.action] || "(禁用)";
  }
}

function bindSettings() {
  $("setFont").addEventListener("input", (e) => { settings.fontFamily = e.target.value.trim(); applyAppearance(); saveSettings(); });
  $("setFontSize").addEventListener("input", (e) => {
    settings.fontSize = +e.target.value; $("valFontSize").textContent = e.target.value;
    applyAppearance(); saveSettings();
    if (settings.lineMode) { resizeWindow(window.innerWidth, lineWindowHeight()); if (book) renderLine(segStart); }
  });
  $("setLineHeight").addEventListener("input", (e) => { settings.lineHeight = +e.target.value; $("valLineHeight").textContent = e.target.value; applyAppearance(); saveSettings(); });
  $("setTextColor").addEventListener("input", (e) => { settings.textColor = e.target.value; applyAppearance(); saveSettings(); });
  $("setBgColor").addEventListener("input", (e) => { settings.bgColor = e.target.value; applyAppearance(); saveSettings(); });
  $("setBgOpacity").addEventListener("input", (e) => { settings.bgOpacity = +e.target.value; $("valBgOpacity").textContent = e.target.value; applyAppearance(); saveSettings(); });
  $("setDisguise").addEventListener("change", (e) => {
    settings.disguise = e.target.checked;
    applyAppearance(); saveSettings();
    if (book) renderChapter(book.ch, { ratio: currentRatio() });
  });
  $("setOpenLast").addEventListener("change", (e) => { settings.openLast = e.target.checked; saveSettings(); });
  $("setAutoHide").addEventListener("change", (e) => { settings.autoHide = e.target.checked; saveSettings(); resetIdleTimer(); });
  $("setAutoHideSecs").addEventListener("change", (e) => {
    settings.autoHideSecs = Math.max(3, Math.min(600, +e.target.value || 10));
    e.target.value = settings.autoHideSecs;
    saveSettings(); resetIdleTimer();
  });
  $("setRegex").addEventListener("change", (e) => { settings.chapterRegex = e.target.value || DEFAULT_REGEX; saveSettings(); });
  $("btnReparse").addEventListener("click", () => {
    if (!book) { toast("先打开一本书"); return; }
    book.chapters = parseChapters(book.text, settings.chapterRegex);
    book.meta.chapterCount = book.chapters.length;
    renderToc();
    renderChapter(0, { ratio: 0 });
    toast(`解析出 ${book.chapters.length} 章`);
  });

  // 快捷键录制
  for (const inp of document.querySelectorAll("input.sc")) {
    inp.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Backspace" || e.key === "Delete") {
        settings.shortcuts[inp.dataset.action] = "";
        inp.value = "(禁用)";
        saveSettings();
        return;
      }
      const acc = accFromEvent(e);
      if (acc) {
        settings.shortcuts[inp.dataset.action] = acc;
        inp.value = acc;
        saveSettings();
      }
    });
  }
  $("btnApplySc").addEventListener("click", () => applyShortcuts(true));
}

function currentRatio() {
  const el = scrollEl();
  const denom = Math.max(1, el.scrollHeight - el.clientHeight);
  return Math.min(1, el.scrollTop / denom);
}

/* ---------------- 事件绑定 ---------------- */

function bindUI() {
  $("btnShelf").addEventListener("click", async () => {
    if (settings.lineMode) await setLineMode(false);
    closePanels();
    showView("shelf");
  });
  $("btnLine").addEventListener("click", () => setLineMode(!settings.lineMode));
  $("btnToc").addEventListener("click", () => togglePanel("tocPanel"));
  $("btnSearch").addEventListener("click", () => togglePanel("searchPanel"));
  $("btnSettings").addEventListener("click", () => { fillSettings(); togglePanel("settingsPanel"); });
  $("btnTop").addEventListener("click", toggleTop);
  $("btnGhost").addEventListener("click", toggleGhost);
  $("btnMin").addEventListener("click", () => appWindow.minimize());
  $("btnClose").addEventListener("click", () => appWindow.close());
  $("btnAddBook").addEventListener("click", addBooks);

  for (const btn of document.querySelectorAll(".panel-close")) {
    btn.addEventListener("click", closePanels);
  }

  $("tocFilter").addEventListener("input", (e) => renderToc(e.target.value));
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(e.target.value);
  });

  // 本地按键(窗口聚焦时)
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      togglePanel("searchPanel");
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      const open = document.querySelector(".panel:not(.hidden)");
      if (open) closePanels();
      else appWindow.hide(); // 本地老板键,全局老板键唤回
      e.preventDefault();
      return;
    }
    if (!book || $("reader").classList.contains("hidden")) return;
    switch (e.key) {
      case "ArrowRight": case "PageDown": case " ":
        pageTurn(1); e.preventDefault(); break;
      case "ArrowLeft": case "PageUp":
        pageTurn(-1); e.preventDefault(); break;
      case "ArrowDown":
        if (settings.lineMode) lineNext(); else scrollEl().scrollTop += 48;
        e.preventDefault(); break;
      case "ArrowUp":
        if (settings.lineMode) linePrev(); else scrollEl().scrollTop -= 48;
        e.preventDefault(); break;
    }
  });

  scrollEl().addEventListener("scroll", () => { updatePageInfo(); saveProgressSoon(); });
  window.addEventListener("blur", () => { if (book) saveProgressSoon(); });

  // 单行模式:滚轮逐行,窗口宽度变化时重排当前行
  scrollEl().addEventListener("wheel", (e) => {
    if (!settings.lineMode || !book) return;
    e.preventDefault();
    e.deltaY > 0 ? lineNext() : linePrev();
  }, { passive: false });
  window.addEventListener("resize", debounce(() => {
    if (settings.lineMode && book) renderLine(segStart);
  }, 150));

  // 单行模式:点击正文翻行(左 1/4 上一行,其余下一行)
  scrollEl().addEventListener("click", (e) => {
    if (!settings.lineMode || !book) return;
    const rect = scrollEl().getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.25) linePrev(); else lineNext();
  });

  // 无操作自动隐藏:任何鼠标/键盘活动都重置计时
  for (const ev of ["mousemove", "mousedown", "keydown", "wheel"]) {
    document.addEventListener(ev, resetIdleTimer, { passive: true });
  }
  window.addEventListener("focus", resetIdleTimer);
}

/* ---------------- 启动 ---------------- */

async function init() {
  const s = await loadJson("settings");
  if (s) {
    settings = { ...settings, ...s, shortcuts: { ...DEFAULT_SHORTCUTS, ...(s.shortcuts || {}) } };
  }
  shelf = (await loadJson("shelf")) || [];

  applyAppearance();
  bindUI();
  bindSettings();
  renderShelf();
  $("btnTop").classList.toggle("on", !!settings.alwaysOnTop);
  // 上次退出时处于单行模式:恢复样式(窗口尺寸由 window-state 插件恢复)
  document.body.classList.toggle("linemode", !!settings.lineMode);
  $("btnLine").classList.toggle("on", !!settings.lineMode);

  try { await appWindow.setAlwaysOnTop(!!settings.alwaysOnTop); } catch (e) { console.error(e); }

  await listen("hotkey", (e) => handleHotkey(e.payload));
  await applyShortcuts(false);
  resetIdleTimer();

  if (settings.openLast && settings.lastBookId) {
    const b = shelf.find((x) => x.id === settings.lastBookId);
    if (b) { openBook(b); return; }
  }
  showView("shelf");
}

window.addEventListener("DOMContentLoaded", init);
/* v0.2 */
