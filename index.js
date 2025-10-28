"use strict";

/* =========================
 * Config & Constantes
 * ========================= */
const ACRO_WORD = "NOSOTROS";
const BASE_ACROSTIC_COL = 8;

// Mensaje verde cuando está todo OK (banner)
const FINAL_MESSAGE = "¡Perfecto! La columna destaca dice: NOSOTROS ♥";

// Share Card: copy, fecha fija y foto
const SHARE_CARD_COPY = {
  title: "¡FELIZ ANIVERSARIO, amor!",
  subtitle: "Completamos nuestro crucigrama del amor.",
  body: "Te elijo todos los días, te amo con locura!!!\nSiempre NOSOTROS 💖",
  footerText: "31 de octubre de 2025", // <- solo esta fecha
  photoUrl: "./Subir/Frawens.jpeg", // <- foto para la tarjeta
  photoSize: 160,
  fonts: {
    title: "700 50px Georgia, Times, serif",
    subtitle: "25px Georgia, Times, serif",
    body: "500 35px Georgia, Times, serif",
    footer: "20px Georgia, Times, serif, solid",
  },
};

const LS_KEYS = {
  SIZE_MODE: "love-crossword.size",
  GRID_STYLE: "love-crossword.style",
  THEME: "ui.theme",
  SHARE_URL: "love-crossword.shareUrl",
};
const SHARE_FILENAME = "nosotros.png";
const SHARE_CANVAS_SELECTOR = "#shareCanvas";
// URL por defecto para el QR/Share (URL pública de Netlify)
const DEFAULT_SHARE_URL = "https://crucigrama-del-amor.netlify.app/";
const NAV_KEY_DELTAS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
const EMOJIS = ["🌐", "🥰", "⛪", "😘", "🏠", "🍷", "🧣", "🔥"];

/* =========================
 * Sonidos: WebAudio (sin archivos)
 * ========================= */
const Sound = {
  ctx: null,
  unlocked: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  },
  unlock() {
    this.init();
    if (!this.ctx || this.unlocked) return;
    // “beep” silencioso para ganar permiso de autoplay
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
    this.ctx.resume?.();
    this.unlocked = true;
  },
  tone(freq = 440, dur = 0.06, type = "sine", gain = 0.035) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(this.ctx.destination);
    // pequeña envolvente
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  },
  click() {
    this.tone(420, 0.05, "square", 0.02);
  },
  type() {
    this.tone(650, 0.03, "triangle", 0.018);
  },
  success() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.09, "sine", 0.05), i * 90);
    });
  },
};
// desbloqueo en primer gesto del usuario (mobile/desktop)
window.addEventListener("pointerdown", () => Sound.unlock(), { once: true });

/* =========================
 * Estado global (pistas.json)
 * ========================= */
let acrosticWords = [];
let syllablesByWord = [];
let puzzleWords = [];
let GRID_ROWS = 0,
  GRID_COLS = 0;
let LETTER_MAP = new Map();
const toastedWords = new Set();

/* =========================
 * Utils
 * ========================= */
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
const toPosKey = (r, c) => `${r},${c}`;
const storageGet = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ?? f;
  } catch {
    return f;
  }
};
const storageSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

// Reusable helpers to avoid selector duplication
function inputAt(r, c) {
  return qs(`input[data-pos='${toPosKey(r, c)}']`);
}
function cellAt(r, c) {
  return qs(`#crosswordGrid .cell[aria-rowindex='${r}'][aria-colindex='${c}']`);
}
function focusInputAt(r, c) {
  const el = inputAt(r, c);
  if (el) el.focus();
}
function downloadCanvasPng(canvas, filename) {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
function getShareCanvas() {
  return qs(SHARE_CANVAS_SELECTOR);
}

function normalizeForCompare(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/* =========================
 * Carga de pistas.json
 * ========================= */
async function loadPistas() {
  const res = await fetch(`pistas.json?cache=${Date.now()}`, {
    cache: "no-store",
  });
  const data = await res.json();

  acrosticWords = data.words.map((w) => ({
    answer: String(w.answer || "")
      .toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚÜÑ]/g, ""),
    hint: w.hint || "",
    note: w.note || "",
    photo: w.photo || null,
  }));
  syllablesByWord = data.syllables;

  for (let i = 0; i < ACRO_WORD.length; i++) {
    const required = ACRO_WORD[i];
    const w = acrosticWords[i];
    if (!w) continue;
    const idx = normalizeForCompare(w.answer).indexOf(required);
    w.keyIndex =
      idx !== -1 ? idx : typeof w.keyIndex === "number" ? w.keyIndex : 0;
  }

  puzzleWords = buildPuzzle(acrosticWords);
  const size = computeGridSize(puzzleWords);
  GRID_ROWS = size.rows;
  GRID_COLS = size.cols;
  LETTER_MAP = buildLetterMap(puzzleWords);

  renderAll();
}

/* =========================
 * Construcción puzzle
 * ========================= */
function buildPuzzle(words) {
  const rows = [];
  const effectiveCol = Math.max(
    BASE_ACROSTIC_COL,
    Math.max(0, ...words.map((w) => w.keyIndex || 0)) + 1
  );
  for (let i = 0; i < words.length; i++) {
    const rowIndex = i + 1;
    const ans = words[i].answer;
    const safeKeyIndex = Math.min(
      Math.max(0, words[i].keyIndex | 0),
      ans.length - 1
    );
    const startCol = Math.max(1, effectiveCol - safeKeyIndex);
    rows.push({
      number: i + 1,
      direction: "across",
      row: rowIndex,
      col: startCol,
      answer: ans,
      hint: words[i].hint,
      note: words[i].note,
      photo: words[i].photo,
      keyIndex: safeKeyIndex,
    });
  }
  return rows;
}
function computeGridSize(words) {
  let maxRow = 0,
    maxCol = 0;
  for (const w of words) {
    const len = w.answer.length;
    const endRow = w.direction === "down" ? w.row + len - 1 : w.row;
    const endCol = w.direction === "across" ? w.col + len - 1 : w.col;
    maxRow = Math.max(maxRow, endRow);
    maxCol = Math.max(maxCol, endCol);
  }
  return { rows: Math.max(maxRow, 8), cols: Math.max(maxCol, 8) };
}
function buildLetterMap(words) {
  const map = new Map();
  for (const w of words) {
    const chars = [...w.answer];
    for (let i = 0; i < chars.length; i++) {
      const r = w.row;
      const c = w.col + i;
      map.set(toPosKey(r, c), chars[i]);
    }
  }
  return map;
}

/* =========================
 * Render principal
 * ========================= */
let $grid, $colIndex, $rowIndex, $acrossList, $status;
let $progress, $progressBar, $progressLabel;

function renderAll() {
  $grid = qs("#crosswordGrid");
  $colIndex = qs("#colIndex");
  $rowIndex = qs("#rowIndex");
  $acrossList = qs("#acrossList");
  $status = qs("#status");
  $progress = qs("#progress");
  $progressBar = qs("#progress .bar");
  $progressLabel = qs("#progress .label");

  renderGrid();
  renderClues();
  renderSyllables();
  initGridStyleSelector();
  initSizeToggle();
  updateProgress();
}

function renderGrid() {
  $grid.innerHTML = "";
  $grid.style.gridTemplateColumns = `repeat(${GRID_COLS}, var(--cell))`;
  $colIndex.style.gridTemplateColumns = `repeat(${GRID_COLS}, var(--cell))`;
  $colIndex.innerHTML = "";
  $rowIndex.innerHTML = "";

  for (let c = 1; c <= GRID_COLS; c++) {
    const t = document.createElement("div");
    t.className = "index-cell";
    t.textContent = String(c);
    $colIndex.appendChild(t);
  }
  for (let r = 1; r <= GRID_ROWS; r++) {
    const t = document.createElement("div");
    t.className = "index-cell";
    t.textContent = String(r);
    $rowIndex.appendChild(t);
  }

  const acCol = puzzleWords.length
    ? puzzleWords[0].col + puzzleWords[0].keyIndex
    : BASE_ACROSTIC_COL;

  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const k = toPosKey(r, c);
      const isPlayable = LETTER_MAP.has(k);
      const cell = document.createElement("div");
      cell.className = "cell" + (isPlayable ? "" : " block");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(c));
      cell.setAttribute("aria-rowindex", String(r));

      if (isPlayable) {
        const input = document.createElement("input");
        input.maxLength = 1;
        input.inputMode = "text";
        input.autocomplete = "off";
        input.dataset.pos = k;
        input.dataset.row = r;
        input.dataset.col = c;
        input.setAttribute("aria-label", `fila ${r}, columna ${c}`);
        input.addEventListener("input", onGridInput);
        input.addEventListener("keydown", onGridKeydown);
        input.addEventListener("focus", onGridFocus);
        cell.appendChild(input);
      }
      if (c === acCol) cell.classList.add("acrostic");
      $grid.appendChild(cell);
    }
  }

  applyGridStyle(storageGet(LS_KEYS.GRID_STYLE, "contrast"));
}

function renderClues() {
  $acrossList.innerHTML = "";
  for (const w of puzzleWords) {
    const i = w.number - 1;
    const li = document.createElement("li");
    li.id = `clue-across-${w.number}`;
    // Usamos el número automático del <ol>. Metemos el contenido en un span
    // para que el background no tape el número (marker) cuando esté ok.
    li.innerHTML = `<span class="chip">${EMOJIS[i] || ""} ${w.hint}</span>`;
    $acrossList.appendChild(li);
  }
}

function renderSyllables() {
  const host = qs("#syllGrid");
  host.innerHTML = "";
  const counter = new Map();
  for (const list of syllablesByWord)
    for (const s of list) counter.set(s, (counter.get(s) || 0) + 1);
  const sorted = [...counter.keys()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  for (const key of sorted) {
    const times = counter.get(key);
    for (let i = 0; i < times; i++) {
      const btn = document.createElement("button");
      btn.className = "sy";
      btn.type = "button";
      btn.textContent = key;
      btn.dataset.syll = key;
      btn.setAttribute("aria-pressed","false");
      btn.title = "Insertar esta sílaba (clic = usar / clic de nuevo = desmarcar)";
      btn.addEventListener("click", () => {
        handleSyllableClick(btn, key);
        Sound.click();
      });
      host.appendChild(btn);
    }
  }
}

/* =========================
 * Interacción Grid
 * ========================= */
function onGridInput(e) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  const prev = input.value;
  input.value = input.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "");
  if (input.value && input.value !== prev) Sound.type();

  const r = Number(input.dataset.row);
  const c = Number(input.dataset.col);
  const next = inputAt(r, c + 1);
  if (next) next.focus();

  // Resalta la palabra activa y valida sin marcar celdas
  highlightActiveRow(r);
  validateSingleWordAtRow(r, /*quiet*/ true);
  updateProgress();
}

function onGridKeydown(e) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;

  const r = Number(input.dataset.row);
  const c = Number(input.dataset.col);

  // Atajo: Ctrl+Backspace limpia toda la palabra de la fila
  if (e.key === "Backspace" && e.ctrlKey) {
    e.preventDefault();
    const w = puzzleWords.find((p) => p.row === r);
    if (w) {
      for (let j = 0; j < w.answer.length; j++) {
        const t = inputAt(r, w.col + j);
        if (t) t.value = "";
      }
      focusInputAt(r, c);
      validateSingleWordAtRow(r, /*quiet*/ true);
      highlightActiveRow(r);
      updateProgress();
    }
    return;
  }

  // Atajo: Shift+Backspace limpia desde el inicio hasta la celda actual
  if (e.key === "Backspace" && e.shiftKey) {
    e.preventDefault();
    const w = puzzleWords.find((p) => p.row === r);
    if (w) {
      const max = Math.max(0, c - w.col);
      for (let j = 0; j <= max; j++) {
        const t = inputAt(r, w.col + j);
        if (t) t.value = "";
      }
      focusInputAt(r, c);
      validateSingleWordAtRow(r, /*quiet*/ true);
      highlightActiveRow(r);
      updateProgress();
    }
    return;
  }

  // Atajo: Alt+Backspace limpia desde la celda actual hasta el final de la palabra
  if (e.key === "Backspace" && e.altKey) {
    e.preventDefault();
    const w = puzzleWords.find((p) => p.row === r);
    if (w) {
      const from = Math.max(0, c - w.col);
      for (let j = from; j < w.answer.length; j++) {
        const t = inputAt(r, w.col + j);
        if (t) t.value = "";
      }
      focusInputAt(r, c);
      validateSingleWordAtRow(r, /*quiet*/ true);
      highlightActiveRow(r);
      updateProgress();
    }
    return;
  }

  // Borrar letra actual sin mover el cursor
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    input.value = "";
    validateSingleWordAtRow(r, /*quiet*/ true);
    highlightActiveRow(r);
    updateProgress();
    return;
  }

  // Enter valida solo la palabra actual
  if (e.key === "Enter") {
    e.preventDefault();
    validateSingleWordAtRow(r, /*quiet*/ false);
    updateProgress();
    return;
  }

  const nav = NAV_KEY_DELTAS[e.key];
  if (nav) {
    e.preventDefault();
    const nr = r + nav[0];
    const nc = c + nav[1];
    focusInputAt(nr, nc);
    highlightActiveRow(nr);
  }
}

function onGridFocus(e) {
  Sound.click();
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  const r = Number(input.dataset.row);
  highlightActiveRow(r);
}

function highlightActiveRow(row) {
  // Quita resaltado anterior
  qsa("#crosswordGrid .cell.active-word").forEach((el) =>
    el.classList.remove("active-word")
  );
  const w = puzzleWords.find((p) => p.row === row);
  if (!w) return;
  for (let j = 0; j < w.answer.length; j++) {
    const cell = cellAt(row, w.col + j);
    cell?.classList.add("active-word");
  }
}

function handleSyllableClick(button, syll) {
  if (button.classList.contains("used")) {
    button.classList.remove("used");
    button.setAttribute("aria-pressed","false");
    return;
  }
  const active = document.activeElement;
  if (!active || active.tagName !== "INPUT") return;
  let [r, c] = active.dataset.pos.split(",").map(Number);
  for (const ch of syll) {
    const t = inputAt(r, c);
    if (!t) break;
    t.value = ch.toUpperCase();
    c++;
  }
  Sound.type();
  validateSingleWordAtRow(r, /*quiet*/ true);
  button.classList.add("used");
  button.setAttribute("aria-pressed","true");
}

/* =========================
 * Validación por palabra y global
 * ========================= */
function wordFilled(w) {
  for (let j = 0; j < w.answer.length; j++) {
    const inp = inputAt(w.row, w.col + j);
    if (!inp?.value) return false;
  }
  return true;
}
function focusFirstCellOfWord(w) {
  focusInputAt(w.row, w.col);
}

function validateSingleWordAtRow(row, quiet = false) {
  const w = puzzleWords.find((p) => p.row === row);
  if (!w) return false;

  // Limpia marca de "palabra correcta" para recalcular
  for (let j = 0; j < w.answer.length; j++) {
    const cell = cellAt(row, w.col + j);
    cell?.classList.remove("word-ok");
  }

  const expected = [...w.answer];
  let anyEmpty = false;
  let allGood = true;

  for (let j = 0; j < expected.length; j++) {
    const inp = inputAt(row, w.col + j);
    const val = (inp?.value || "").toUpperCase();

    if (!val) {
      anyEmpty = true;
      allGood = false;
      continue;
    }

    const ok = normalizeForCompare(val) === normalizeForCompare(expected[j]);
    if (!ok) allGood = false;
  }

  const clue = qs(`#clue-across-${w.number}`);
  if (allGood) {
    clue?.classList.add("ok");
    markSyllablesForCorrectWord(w.number - 1);
    // Marca la palabra completa como correcta (suave, sin flash)
    for (let j = 0; j < w.answer.length; j++) {
      const cell = cellAt(row, w.col + j);
      cell?.classList.add("word-ok");
    }
    // Toast de palabra correcta (una sola vez)
    if (!toastedWords.has(w.number)) {
      showWordToast(w);
      toastedWords.add(w.number);
    }
    if (!quiet) {
      $status.textContent = `¡Bien! La palabra ${w.number} está perfecta.`;
      $status.className = "status ok";
    }
    if (!quiet) Sound.success();
    const next = puzzleWords.find((p) => p.row > row && !wordFilled(p));
    if (next) focusFirstCellOfWord(next);
  } else {
    clue?.classList.remove("ok");
    if (!quiet) {
      $status.textContent = anyEmpty
        ? "Hay letras por completar en esa palabra."
        : "Hay letras por revisar en esa palabra.";
      $status.className = "status err";
    }
  }
  return allGood;
}

function validateAll() {
  let allCorrect = true;
  let correct = 0;
  let incorrect = 0;
  let incomplete = 0;

  qsa("#crosswordGrid .cell").forEach((c) =>
    c.classList.remove("good", "bad", "empty-hint", "word-ok", "active-word")
  );

  for (const w of puzzleWords) {
    if (!wordFilled(w)) {
      allCorrect = false;
      incomplete++;
      continue;
    }
    const ok = validateSingleWordAtRow(w.row, /*quiet*/ true);
    if (ok) {
      correct++;
    } else {
      allCorrect = false;
      incorrect++;
    }
  }

  if (allCorrect) {
    $status.textContent = FINAL_MESSAGE;
    $status.className = "status ok";
    showFinalModal();
    Sound.success();
  } else if (incorrect > 0) {
    $status.textContent = `Hay letras por revisar en ${incorrect} palabra(s).`;
    $status.className = "status err";
  } else {
    // Solo faltan completar, no marcamos error
    $status.textContent = `Verificadas: ${correct} correctas. Faltan ${incomplete} por completar.`;
    $status.className = "status";
  }
  updateProgress();
}

function markSyllablesForCorrectWord(wordIdx) {
  const host = qs("#syllGrid");
  if (!host) return;
  const need = (syllablesByWord[wordIdx] || []).slice().sort();
  const pool = qsa(".sy", host);
  for (const s of need) {
    const btn = pool.find(
      (b) => b.textContent === s && !b.classList.contains("correct")
    );
    if (btn) btn.classList.add("correct");
  }
}

function flashRow(row) {
  for (let c = 1; c <= GRID_COLS; c++) {
    const box = cellAt(row, c);
    if (box) {
      box.classList.add("row-ok");
      setTimeout(() => box.classList.remove("row-ok"), 950);
    }
  }
}

/* =========================
 * UI Prefs
 * ========================= */
function initSizeToggle() {
  const toggle = qs("#sizeToggle");
  const saved = storageGet(LS_KEYS.SIZE_MODE, "comfy");
  applySize(saved);
  toggle.checked = saved === "compact";
  toggle.addEventListener("change", () => {
    const mode = toggle.checked ? "compact" : "comfy";
    applySize(mode);
    storageSet(LS_KEYS.SIZE_MODE, mode);
    Sound.click();
  });
}
function applySize(mode) {
  document.documentElement.classList.toggle("compact", mode === "compact");
}

function applyGridStyle(mode) {
  $grid.classList.remove("contrast-high", "clarin");
  if (mode === "clarin") $grid.classList.add("clarin");
  else $grid.classList.add("contrast-high");
}
function initGridStyleSelector() {
  const sel = qs("#gridStyle");
  const saved = storageGet(LS_KEYS.GRID_STYLE, "contrast");
  sel.value = saved;
  applyGridStyle(saved);
  sel.addEventListener("change", () => {
    storageSet(LS_KEYS.GRID_STYLE, sel.value);
    applyGridStyle(sel.value);
    Sound.click();
  });
}

/* =========================
 * Modal & Share Card (con foto)
 * ========================= */
function showFinalModal() {
  const modal = qs("#finalModal");
  const msg = qs("#finalMsg");
  if (msg)
    msg.textContent = `${SHARE_CARD_COPY.subtitle} ${SHARE_CARD_COPY.body}`;
  drawShareCard();
  modal.classList.add("show");
}
function hideFinalModal() {
  qs("#finalModal")?.classList.remove("show");
}
function openQrModal() {
  const c = qs("#qrContainer");
  if (!c) return;
  c.innerHTML = "";
  const url = getShareUrl();
  const inp = qs("#qrUrlInput");
  if (inp) inp.value = url;
  const link = qs("#qrLink");
  // Mostrar QR fijo con la URL preconfigurada
  const img = document.createElement("img");
  img.alt = "QR";
  img.width = 240; img.height = 240;
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  c.appendChild(img);
  const modal = qs("#qrModal");
  modal?.classList.add("show");
}
function getShareUrl() {
  // Usa URL guardada o la actual del navegador
  const saved = storageGet(LS_KEYS.SHARE_URL, null);
  return saved || DEFAULT_SHARE_URL || window.location.href;
}
function downloadQrImage() {
  const node = qs("#qrContainer canvas, #qrContainer img");
  if (!node) return;
  if (node.tagName === "CANVAS") {
    downloadCanvasPng(node, "qr-crucigrama.png");
    return;
  }
  const img = node;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 240;
  canvas.height = img.naturalHeight || 240;
  const ctx = canvas.getContext("2d");
  try {
    ctx.drawImage(img, 0, 0);
    downloadCanvasPng(canvas, "qr-crucigrama.png");
  } catch {}
}
async function shareQrImage() {
  const url = getShareUrl();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(qrUrl, { cache: "no-store" });
    const blob = await res.blob();
    const file = new File([blob], "qr-crucigrama.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Crucigrama del amor", text: `Abrir: ${url}` });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "qr-crucigrama.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }
  } catch {
    downloadQrImage();
  }
}

function showWordToast(w) {
  const host = qs("#toastHost");
  if (!host) return;
  // Elimina toasts no fijados (queremos que desaparezca al completar la siguiente)
  qsa(".toast", host).forEach((t) => {
    if (!t.classList.contains("pinned")) t.remove();
  });

  const el = createToastElement({
    answer: w.answer,
    note: w.note,
    photo: w.photo,
  });
  host.appendChild(el);
}

function createToastElement(data) {
  const { answer, note, photo } = data;
  const el = document.createElement("div");
  el.className = "toast";
  if (photo) {
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    el.appendChild(img);
  }
  const wrap = document.createElement("div");
  const text = document.createElement("div");
  text.className = "note";
  text.textContent = note && String(note).trim() ? note : `¡Correcto: ${answer}!`;
  wrap.appendChild(text);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `Primer aniversario • ${getShareYear()} <span class="heart" aria-hidden="true">❤</span>`;
  wrap.appendChild(meta);
  const actions = document.createElement("div");
  actions.className = "actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "secondary";
  saveBtn.textContent = "Guardar";
  const closeBtn = document.createElement("button");
  closeBtn.className = "secondary";
  closeBtn.textContent = "×";
  actions.appendChild(saveBtn);
  actions.appendChild(closeBtn);
  wrap.appendChild(actions);
  el.appendChild(wrap);

  // Eventos
  closeBtn.addEventListener("click", () => el.remove());
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    await generateAndDownloadNoteCard({ answer, note, photo });
    saveBtn.textContent = "Descargado";
    setTimeout(() => el.remove(), 800);
  });
  return el;
}

let cachedShareImg = null;
function loadShareImage() {
  return new Promise((resolve) => {
    if (cachedShareImg) return resolve(cachedShareImg);
    if (!SHARE_CARD_COPY.photoUrl) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cachedShareImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = SHARE_CARD_COPY.photoUrl + `?cache=${Date.now()}`;
  });
}

async function drawShareCard() {
  const canvas = qs("#shareCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;

  // Fondo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fff7fb");
  g.addColorStop(1, "#ffeef5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Pattern
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#e11d48";
  for (let y = 28; y < H; y += 48)
    for (let x = 28; x < W; x += 48) {
      heartPath(ctx, x, y, 10);
      ctx.fill();
    }
  ctx.restore();

  const pad = 60;
  const card = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2, r: 22 };

  // sombra + base
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.14)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fill();
  ctx.restore();

  // marco
  ctx.strokeStyle = "#f8c8d6";
  ctx.lineWidth = 2;
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.stroke();

  const cx = card.x + card.w / 2;

  // Foto circular
  const img = await loadShareImage();
  if (img) {
    const d = SHARE_CARD_COPY.photoSize;
    const ix = cx - d / 2;
    const iy = card.y + 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, iy + d / 2, d / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // cover
    const ar = img.width / img.height;
    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height;
    if (ar > 1) {
      sx = (img.width - img.height) / 2;
      sw = img.height;
    } else {
      sy = (img.height - img.width) / 2;
      sh = img.width;
    }
    ctx.drawImage(img, sx, sy, sw, sh, ix, iy, d, d);
    ctx.restore();
    ctx.strokeStyle = "#fbcfe8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, iy + d / 2, d / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Título
  ctx.fillStyle = "#2f2432";
  ctx.font = SHARE_CARD_COPY.fonts.title;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleY = card.y + (img ? SHARE_CARD_COPY.photoSize + 44 : 28);
  ctx.fillText(SHARE_CARD_COPY.title, cx, titleY);

  // separador ♥
  heartPath(ctx, cx, titleY + 56, 8, true);
  ctx.fillStyle = "#e11d48";
  ctx.fill();

  // Subtítulo
  ctx.fillStyle = "#6b5b72";
  ctx.font = SHARE_CARD_COPY.fonts.subtitle;
  drawMultilineCentered(
    ctx,
    SHARE_CARD_COPY.subtitle,
    cx,
    titleY + 78,
    card.w - 120,
    26
  );

  // Cuerpo
  ctx.fillStyle = "#2f2432";
  ctx.font = SHARE_CARD_COPY.fonts.body;
  drawMultilineCentered(
    ctx,
    SHARE_CARD_COPY.body,
    cx,
    titleY + 122,
    card.w - 120,
    34
  );

  // Footer (fecha fija)
  const fecha = SHARE_CARD_COPY.footerText;
  ctx.fillStyle = "#6b5b72";
  ctx.font = SHARE_CARD_COPY.fonts.footer;
  ctx.fillText(fecha, cx, card.y + card.h - 34);
}

/* helpers canvas */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function heartPath(ctx, x, y, r, centered = false) {
  const cx = centered ? x : x + r;
  const cy = centered ? y : y + r;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.bezierCurveTo(
    cx - r,
    cy + r * 0.6,
    cx - r,
    cy - r * 0.2,
    cx,
    cy - r * 0.6
  );
  ctx.bezierCurveTo(cx + r, cy - r * 0.2, cx + r, cy + r * 0.6, cx, cy + r);
  ctx.closePath();
}
function drawMultilineCentered(ctx, text, centerX, topY, maxW, lineH) {
  const words = text.split(/\s+/);
  let line = "";
  let y = topY;
  for (let i = 0; i < words.length; i++) {
    const test = (line ? line + " " : "") + words[i];
    const w = ctx.measureText(test).width;
    if (w > maxW && i > 0) {
      ctx.fillText(line, centerX, y);
      line = words[i];
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, centerX, y);
}

async function generateAndDownloadNoteCard({ answer, note, photo }) {
  const W = 700, H = 260;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  // Fondo suave
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fff7fb");
  g.addColorStop(1, "#ffeef5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Tarjeta
  const pad = 16;
  const card = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2, r: 16 };
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fill();
  ctx.strokeStyle = "#f8c8d6";
  ctx.lineWidth = 2;
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.stroke();

  // Foto opcional
  const box = { x: card.x + 16, y: card.y + 16, d: 160 };
  if (photo) {
    await new Promise((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.save();
        roundRect(ctx, box.x, box.y, box.d, box.d, 10);
        ctx.clip();
        const ar = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ar > 1) { sx = (img.width - img.height) / 2; sw = img.height; }
        else { sy = (img.height - img.width) / 2; sh = img.width; }
        ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.d, box.d);
        ctx.restore();
        ctx.strokeStyle = "#fbcfe8";
        ctx.lineWidth = 3;
        roundRect(ctx, box.x, box.y, box.d, box.d, 10);
        ctx.stroke();
        res();
      };
      img.onerror = () => res();
      img.src = photo;
    });
  }

  // Texto
  const textX = photo ? box.x + box.d + 18 : card.x + 18;
  const textW = photo ? card.x + card.w - textX - 18 : card.w - 36;
  ctx.fillStyle = "#0f172a";
  // Título con emoji de la palabra
  const emoji = getEmojiForAnswer(answer);
  ctx.font = "700 26px Georgia, Times, serif";
  ctx.fillText(`${emoji ? emoji + ' ' : ''}${answer}`, textX, card.y + 38);
  // Subtítulo: Primer aniversario + año + corazón (más legible y abajo, antes de la fecha)
  ctx.save();
  ctx.font = "700 16px Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillStyle = "#be123c"; // rojo más oscuro para mejor contraste
  const subText = `Primer aniversario ${getShareYear()} ❤`;
  const subY = card.y + card.h - 32; // bajamos un poco (más cerca de la fecha)
  const subW = ctx.measureText(subText).width;
  ctx.fillText(subText, card.x + card.w - 18 - subW, subY); // alineado a la derecha
  ctx.restore();
  // Cuerpo
  ctx.font = "500 20px Georgia, Times, serif";
  // Wrap manual
  const words = String(note && note.trim() ? note : `¡Correcto: ${answer}!`).split(/\s+/);
  let line = "", y = card.y + 86;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(t).width > textW && line) {
      ctx.fillText(line, textX, y);
      line = words[i];
      y += 26;
    } else {
      line = t;
    }
  }
  if (line) ctx.fillText(line, textX, y);

  // Fecha abajo a la derecha
  // Fecha: solo día y mes (sin año)
  const date = getShareDayMonth() || formatDayMonth(new Date());
  ctx.font = "500 17px Georgia, Times, serif";
  ctx.fillStyle = "#475569";
  const wdate = ctx.measureText(date).width;
  ctx.fillText(date, card.x + card.w - 18 - wdate, card.y + card.h - 14);

  const fname = `recuerdo-${answer.replace(/[^A-Za-z0-9_-]+/g, "_")}.png`;
  downloadCanvasPng(canvas, fname);
}

function getEmojiForAnswer(answer) {
  const w = puzzleWords.find((p) => normalizeForCompare(p.answer) === normalizeForCompare(answer));
  if (!w) return "";
  return EMOJIS[(w.number - 1) % EMOJIS.length] || "";
}
function formatLongDate(d) {
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function getShareYear() {
  const fixed = SHARE_CARD_COPY?.footerText || "";
  const m = String(fixed).match(/(\d{4})/);
  if (m) return m[1];
  return String(new Date().getFullYear());
}

function getShareDayMonth() {
  const fixed = SHARE_CARD_COPY?.footerText || ""; // ejemplo: "31 de octubre de 2025"
  const m = String(fixed).match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  if (m) return `${m[1]} de ${m[2]}`;
  return "";
}
function formatDayMonth(d) {
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

/* =========================
 * Init + Eventos
 * ========================= */
function initStaticEvents() {
  qs("#checkBtn")?.addEventListener("click", () => {
    Sound.click();
    validateAll();
  });
  qs("#clearBtn")?.addEventListener("click", () => {
    Sound.click();
    clearGrid();
  });
  qs("#revealBtn")?.addEventListener("click", () => {
    Sound.click();
    revealNextLetter();
  });
  qs("#qrBtn")?.addEventListener("click", () => {
    Sound.click();
    openQrModal();
  });

  const modal = qs("#finalModal");
  const closeModal = () => {
    Sound.click();
    hideFinalModal();
  };
  qs("#closeModal")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  qs("#downloadCard")?.addEventListener("click", () => {
    const canvas = getShareCanvas();
    if (canvas) downloadCanvasPng(canvas, SHARE_FILENAME);
  });

  qs("#shareCard")?.addEventListener("click", async () => {
    const canvas = getShareCanvas();
    if (!canvas) return;
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (navigator.canShare && blob) {
      const file = new File([blob], SHARE_FILENAME, { type: "image/png" });
      try {
        await navigator.share({
          files: [file],
          title: "Nosotros 💖",
          text: "Nuestro crucigrama del amor",
        });
      } catch {}
    } else {
      downloadCanvasPng(canvas, SHARE_FILENAME);
    }
  });

  // QR Modal events
  const qrModal = qs("#qrModal");
  qs("#closeQr")?.addEventListener("click", () => qrModal?.classList.remove("show"));
  qrModal?.addEventListener("click", (e) => { if (e.target === qrModal) qrModal.classList.remove("show"); });
  qs("#copyUrl")?.addEventListener("click", async () => {
    const url = getShareUrl();
    try { await navigator.clipboard?.writeText(url); } catch {}
  });
  qs("#shareQr")?.addEventListener("click", async () => {
    Sound.click();
    await shareQrImage();
  });
  qs("#downloadQr")?.addEventListener("click", () => downloadQrImage());
  // Removed editable URL; QR es fijo con la URL preconfigurada

  // Theme toggle
  (function themeInit() {
    const KEY = LS_KEYS.THEME;
    const root = document.documentElement;
    const btn = qs("#themeToggle");
    const icon = btn?.querySelector(".theme-icon");
    const label = btn?.querySelector(".theme-text");

    const prefersDark = () =>
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    function applyTheme(mode) {
      const next = mode === "dark" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      if (btn) {
        btn.setAttribute("aria-pressed", String(next === "dark"));
        if (icon) icon.textContent = next === "dark" ? "☀️" : "🌙";
        if (label)
          label.textContent = next === "dark" ? "Modo claro" : "Modo oscuro";
      }
    }

    const saved = storageGet(KEY, null);
    applyTheme(saved ?? (prefersDark() ? "dark" : "light"));

    btn?.addEventListener("click", () => {
      const current =
        root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      storageSet(KEY, next);
      applyTheme(next);
      Sound.click();
    });
  })();

  // Click en una pista: enfoca el inicio de esa palabra
  const list = qs("#acrossList");
  list?.addEventListener("click", (ev) => {
    const li = ev.target.closest("li");
    if (!li) return;
    const num = Number(String(li.id).replace("clue-across-", ""));
    const w = puzzleWords.find((p) => p.number === num);
    if (w) {
      focusFirstCellOfWord(w);
      highlightActiveRow(w.row);
      updateProgress();
    }
  });
}

/* =========================
 * Progreso y ayudas
 * ========================= */
function getWordStatus(w) {
  let anyEmpty = false;
  let allGood = true;
  for (let j = 0; j < w.answer.length; j++) {
    const inp = inputAt(w.row, w.col + j);
    const val = (inp?.value || "").toUpperCase();
    if (!val) {
      anyEmpty = true;
      allGood = false;
      continue;
    }
    if (normalizeForCompare(val) !== normalizeForCompare(w.answer[j])) {
      allGood = false;
    }
  }
  return { filled: !anyEmpty, correct: allGood && !anyEmpty };
}

function updateProgress() {
  if (!$progress) return;
  const total = puzzleWords.length || 0;
  let filled = 0,
    correct = 0;
  for (const w of puzzleWords) {
    const st = getWordStatus(w);
    if (st.filled) filled++;
    if (st.correct) correct++;
  }
  const pct = total ? Math.round((correct / total) * 100) : 0;
  if ($progressBar) $progressBar.style.width = `${pct}%`;
  if ($progressLabel)
    $progressLabel.textContent = `Correctas ${correct}/${total} · Completas ${filled}/${total}`;
}

function revealNextLetter() {
  // Usa la palabra de la fila del input activo; si no hay, toma la primera incompleta/incorrecta
  const active = document.activeElement;
  let row = null;
  if (active && active.tagName === "INPUT") {
    const [r] = active.dataset.pos.split(",").map(Number);
    row = r;
  }
  let w = row ? puzzleWords.find((p) => p.row === row) : null;
  if (!w) w = puzzleWords.find((p) => !getWordStatus(p).correct);
  if (!w) return; // nada para revelar
  for (let j = 0; j < w.answer.length; j++) {
    const t = inputAt(w.row, w.col + j);
    if (!t || t.value) continue;
    t.value = w.answer[j].toUpperCase();
    validateSingleWordAtRow(w.row, /*quiet*/ true);
    highlightActiveRow(w.row);
    t.focus();
    updateProgress();
    return;
  }
}

function clearGrid() {
  qsa("#crosswordGrid input").forEach((i) => (i.value = ""));
  $status.textContent = "";
  $status.className = "status";
  qsa(".clues li").forEach((li) => li.classList.remove("ok"));
  qsa(".sy").forEach((b) => b.classList.remove("used", "correct"));
  qsa("#crosswordGrid .cell").forEach((c) =>
    c.classList.remove("word-ok", "active-word", "good", "bad", "empty-hint")
  );
  updateProgress();
}

/* Boot */
document.addEventListener("DOMContentLoaded", async () => {
  initStaticEvents();
  // Preconfigura la URL compartida si hay un valor por defecto definido
  if (DEFAULT_SHARE_URL && !storageGet(LS_KEYS.SHARE_URL, null)) {
    storageSet(LS_KEYS.SHARE_URL, DEFAULT_SHARE_URL);
  }
  await loadPistas();
});
