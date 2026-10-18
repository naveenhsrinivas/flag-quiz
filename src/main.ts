import "./style.css";
import { COUNTRIES, type Country, type Region } from "./data";
import type { WorldMap } from "./map";

// ---------- Types ----------
type ModeKey = "flag-country" | "country-capital" | "capital-country" | "map";
type ModeSetting = ModeKey | "mixed";
type RegionSetting = Region | "All";
type CountSetting = "10" | "20" | "50" | "all";

interface Settings {
  mode: ModeSetting;
  region: RegionSetting;
  count: CountSetting;
}

interface Mode {
  kind: "choice" | "map";
  text: string;
  showFlag: boolean;
  prompt: (c: Country) => string;
  answer: (c: Country) => string;
}

interface Question {
  country: Country;
  modeKey: ModeKey;
  mode: Mode;
  correct: string;
  options: string[];
  chosen?: string;
}

interface GameState {
  questions: Question[];
  index: number;
  score: number;
  streak: number;
  bestStreak: number;
  mistakes: Question[];
  seconds: number;
  isPractice: boolean;
  /** Country tapped on the map but not yet confirmed. */
  mapPick: string | null;
}

interface BestScore {
  score: number;
  total: number;
  percent: number;
}

// ---------- Helpers ----------
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function flagUrl(code: string, width: 80 | 320 | 640 = 320): string {
  return `https://flagcdn.com/w${width}/${code}.png`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

// ---------- Settings (chip groups) ----------
const settings: Settings = { mode: "flag-country", region: "All", count: "10" };

function setupChips<K extends keyof Settings>(groupId: string, key: K): void {
  const group = $(groupId);
  group.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".chip");
    if (!chip) return;
    group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    settings[key] = chip.dataset.value as Settings[K];
    showBestScore();
    // Start downloading the map as soon as a mode that needs it is picked.
    if (needsMap()) getMap().catch(() => {});
  });
}
setupChips("mode-chips", "mode");
setupChips("region-chips", "region");
setupChips("count-chips", "count");

// ---------- Best score (saved in the browser) ----------
function bestKey(): string {
  return `best:${settings.mode}:${settings.region}:${settings.count}`;
}

function loadBest(): BestScore | null {
  try {
    const raw = localStorage.getItem(bestKey());
    return raw ? (JSON.parse(raw) as BestScore) : null;
  } catch {
    return null;
  }
}

function saveBest(result: BestScore): void {
  try {
    localStorage.setItem(bestKey(), JSON.stringify(result));
  } catch {
    // Storage unavailable (e.g. private mode) – ignore.
  }
}

function showBestScore(): void {
  const best = loadBest();
  $("best-score").textContent = best
    ? `Best for this setup: ${best.score}/${best.total} (${best.percent}%)`
    : "";
}
showBestScore();

// ---------- Map (loaded on demand) ----------
let mapPromise: Promise<WorldMap> | null = null;
let worldMap: WorldMap | null = null;

function needsMap(): boolean {
  return settings.mode === "map" || settings.mode === "mixed";
}

function getMap(): Promise<WorldMap> {
  mapPromise ??= import("./map")
    .then(async ({ loadWorld, WorldMap }) => {
      const map = new WorldMap($("map"), await loadWorld(COUNTRIES));
      map.onSelect = onMapPick;
      worldMap = map;
      return map;
    })
    .catch((err: unknown) => {
      mapPromise = null; // allow a retry
      throw err;
    });
  return mapPromise;
}

// ---------- Question building ----------
const MODES: Record<ModeKey, Mode> = {
  "flag-country": {
    kind: "choice",
    text: "Which country does this flag belong to?",
    showFlag: true,
    prompt: () => "",
    answer: (c) => c.name,
  },
  "country-capital": {
    kind: "choice",
    text: "What is the capital of…",
    showFlag: false,
    prompt: (c) => c.name,
    answer: (c) => c.capital,
  },
  "capital-country": {
    kind: "choice",
    text: "Which country has this capital?",
    showFlag: false,
    prompt: (c) => c.capital,
    answer: (c) => c.name,
  },
  map: {
    kind: "map",
    text: "Find this country on the map",
    showFlag: false,
    prompt: (c) => c.name,
    answer: (c) => c.name,
  },
};

const MODE_KEYS = Object.keys(MODES) as ModeKey[];

function buildQuestion(country: Country): Question {
  const modeKey: ModeKey =
    settings.mode === "mixed" ? shuffle(MODE_KEYS)[0] : settings.mode;
  const mode = MODES[modeKey];
  const correct = mode.answer(country);

  if (mode.kind === "map") {
    return { country, modeKey, mode, correct, options: [] };
  }

  // Prefer distractors from the same region so it's not too easy.
  const sameRegion = COUNTRIES.filter(
    (c) => c.region === country.region && c !== country
  );
  const others = COUNTRIES.filter(
    (c) => c.region !== country.region && c !== country
  );
  const candidates = [...shuffle(sameRegion), ...shuffle(others)];

  const options = [correct];
  for (const c of candidates) {
    const value = mode.answer(c);
    if (!options.includes(value)) options.push(value);
    if (options.length === 4) break;
  }

  return { country, modeKey, mode, correct, options: shuffle(options) };
}

// ---------- Game state ----------
let state: GameState | null = null;
let timerId: number | undefined;

async function startQuiz(countries?: Country[]): Promise<void> {
  const startBtn = $<HTMLButtonElement>("start-btn");
  const error = $("start-error");
  error.classList.add("hidden");

  if (needsMap()) {
    const label = startBtn.textContent;
    startBtn.disabled = true;
    startBtn.textContent = "Loading map…";
    try {
      const map = await getMap();
      map.setRegion(settings.region);
    } catch {
      error.textContent = "Couldn't load the map. Check your connection and try again.";
      error.classList.remove("hidden");
      showScreen("start-screen");
      return;
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = label;
    }
  }

  const pool =
    countries ??
    COUNTRIES.filter((c) => settings.region === "All" || c.region === settings.region);
  const picked = shuffle(pool);
  const total =
    settings.count === "all" || countries
      ? picked.length
      : Math.min(Number(settings.count), picked.length);

  const game: GameState = {
    questions: picked.slice(0, total).map(buildQuestion),
    index: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    mistakes: [],
    seconds: 0,
    isPractice: Boolean(countries),
    mapPick: null,
  };
  state = game;

  window.clearInterval(timerId);
  timerId = window.setInterval(() => {
    game.seconds++;
    $("timer").textContent = formatTime(game.seconds);
  }, 1000);

  $("timer").textContent = "0:00";
  // Map games get a wider card so the map has room.
  app().classList.toggle("wide", game.questions.some((q) => q.mode.kind === "map"));
  showScreen("quiz-screen");
  renderQuestion(game);
}

function renderQuestion(game: GameState): void {
  const q = game.questions[game.index];
  const total = game.questions.length;
  const isMap = q.mode.kind === "map";

  $("progress").textContent = `${game.index + 1} / ${total}`;
  $("progress-fill").style.width = `${(game.index / total) * 100}%`;
  $("score").textContent = String(game.score);
  $("streak").textContent = String(game.streak);

  $("question-text").textContent = q.mode.text;
  $("prompt-text").textContent = q.mode.prompt(q.country);
  $("question-prompt").classList.toggle("hidden", q.mode.showFlag);

  // In map mode a small flag sits next to the country name.
  const promptFlag = $<HTMLImageElement>("prompt-flag");
  promptFlag.classList.toggle("hidden", !isMap);
  if (isMap) promptFlag.src = flagUrl(q.country.code, 80);

  // Layout hooks for the CSS: map questions fill the screen, and the stage
  // (flag or map) gets its own column on short landscape screens.
  const hasStage = q.mode.showFlag || isMap;
  $("quiz-stage").classList.toggle("hidden", !hasStage);
  $("quiz-body").classList.toggle("has-stage", hasStage);
  app().classList.toggle("map-q", isMap);

  $("flag-stage").classList.toggle("hidden", !q.mode.showFlag);
  if (q.mode.showFlag) setFlag($<HTMLImageElement>("question-flag"), q.country.code);

  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  optionsEl.classList.toggle("hidden", isMap);
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerHTML = `<span class="key">${i + 1}</span><span></span>`;
    btn.lastChild!.textContent = opt;
    btn.addEventListener("click", () => choose(game, opt, btn));
    optionsEl.appendChild(btn);
  });

  $("map-panel").classList.toggle("hidden", !isMap);
  $("map-hint").classList.toggle("hidden", !isMap);
  $("confirm-btn").classList.toggle("hidden", !isMap);
  $("feedback").classList.add("hidden");
  if (isMap) {
    game.mapPick = null;
    updateConfirm(game);
    worldMap?.newQuestion();
  }

  $("next-btn").classList.add("hidden");

  // Preload the next flag so it appears instantly.
  const nextQ = game.questions[game.index + 1];
  if (nextQ) {
    const img = new Image();
    if (nextQ.mode.showFlag) setFlag(img, nextQ.country.code);
    else if (nextQ.mode.kind === "map") img.src = flagUrl(nextQ.country.code, 80);
  }
}

function setFlag(img: HTMLImageElement, code: string): void {
  img.srcset = `${flagUrl(code, 320)} 320w, ${flagUrl(code, 640)} 640w`;
  img.sizes = "(max-width: 480px) 90vw, 360px";
  img.src = flagUrl(code, 320);
}

/** Scores an answer and updates the stats; returns whether it was right. */
function recordAnswer(game: GameState, q: Question, value: string): boolean {
  q.chosen = value;
  const right = value === q.correct;
  if (right) {
    game.score++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
  } else {
    game.streak = 0;
    game.mistakes.push(q);
  }

  $("score").textContent = String(game.score);
  $("streak").textContent = String(game.streak);
  const nextBtn = $("next-btn");
  nextBtn.classList.remove("hidden");
  nextBtn.textContent =
    game.index === game.questions.length - 1 ? "See results" : "Next →";
  nextBtn.focus({ preventScroll: true });
  return right;
}

function choose(game: GameState, value: string, btn: HTMLButtonElement): void {
  const q = game.questions[game.index];
  if (q.chosen !== undefined) return;

  const buttons = [...$("options").children] as HTMLButtonElement[];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.lastChild?.textContent === q.correct) b.classList.add("correct");
  });

  if (!recordAnswer(game, q, value)) btn.classList.add("wrong");
}

// ---------- Map answers ----------
function onMapPick(code: string): void {
  if (!state) return;
  state.mapPick = code;
  updateConfirm(state);
}

function updateConfirm(game: GameState): void {
  const btn = $<HTMLButtonElement>("confirm-btn");
  btn.disabled = !game.mapPick;
  btn.textContent = game.mapPick ? "Confirm answer" : "Tap a country on the map";
}

function confirmMap(game: GameState): void {
  const q = game.questions[game.index];
  if (q.chosen !== undefined || !game.mapPick) return;

  const picked = COUNTRY_BY_CODE.get(game.mapPick)!;
  const right = recordAnswer(game, q, picked.name);
  worldMap?.reveal(q.country.code, picked.code);

  $("confirm-btn").classList.add("hidden");
  $("map-hint").classList.add("hidden");
  const feedback = $("feedback");
  feedback.classList.remove("hidden");
  feedback.classList.toggle("good", right);
  feedback.classList.toggle("bad", !right);
  feedback.textContent = right
    ? `Correct! That's ${q.country.name}.`
    : `Not quite. You picked ${picked.name}. ${q.country.name} is shown in green.`;
}

function next(): void {
  if (!state) return;
  if (state.index < state.questions.length - 1) {
    state.index++;
    renderQuestion(state);
  } else {
    finish(state);
  }
}

function finish(game: GameState): void {
  window.clearInterval(timerId);
  const total = game.questions.length;
  const percent = Math.round((game.score / total) * 100);

  $("result-summary").textContent = `${game.score} / ${total} (${percent}%)`;
  $("result-detail").textContent =
    `Time ${formatTime(game.seconds)} · Best streak ${game.bestStreak}`;

  if (!game.isPractice) {
    const best = loadBest();
    if (!best || percent > best.percent) {
      saveBest({ score: game.score, total, percent });
      $("result-detail").textContent += " · 🏆 New best!";
    }
  }

  const list = $("mistakes");
  list.innerHTML = "";
  if (game.mistakes.length) {
    const h = document.createElement("h3");
    h.textContent = "Review your mistakes";
    list.appendChild(h);
    const rows = document.createElement("div");
    rows.className = "mistake-list";
    list.appendChild(rows);
    game.mistakes.forEach((q) => {
      const row = document.createElement("div");
      row.className = "mistake";
      row.innerHTML = `<img alt=""><div><div><strong></strong> — <span class="cap"></span></div><div class="you"></div></div>`;
      row.querySelector("img")!.src = flagUrl(q.country.code);
      row.querySelector("strong")!.textContent = q.country.name;
      row.querySelector(".cap")!.textContent = q.country.capital;
      row.querySelector(".you")!.textContent =
        q.mode.kind === "map" ? `You picked: ${q.chosen}` : `You answered: ${q.chosen}`;
      rows.appendChild(row);
    });
  } else {
    list.innerHTML = "<p>Perfect score! 🎉</p>";
  }

  $("retry-mistakes-btn").classList.toggle("hidden", !game.mistakes.length);
  showScreen("results-screen");
}

type ScreenId = "start-screen" | "quiz-screen" | "results-screen";

function showScreen(id: ScreenId): void {
  const screens: ScreenId[] = ["start-screen", "quiz-screen", "results-screen"];
  screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  const playing = id === "quiz-screen";
  app().classList.toggle("playing", playing);
  if (!playing) app().classList.remove("wide", "map-q");
  window.scrollTo({ top: 0 });
}

function app(): HTMLElement {
  return document.querySelector<HTMLElement>(".app")!;
}

// ---------- Events ----------
$("start-btn").addEventListener("click", () => startQuiz());
$("next-btn").addEventListener("click", next);
$("confirm-btn").addEventListener("click", () => state && confirmMap(state));
$("zoom-in").addEventListener("click", () => worldMap?.zoomBy(2));
$("zoom-out").addEventListener("click", () => worldMap?.zoomBy(0.5));
$("zoom-reset").addEventListener("click", () => worldMap?.resetView(true));
$("again-btn").addEventListener("click", () => {
  showBestScore();
  showScreen("start-screen");
});
$("retry-mistakes-btn").addEventListener("click", () => {
  if (state) startQuiz(state.mistakes.map((q) => q.country));
});
$("quit-btn").addEventListener("click", () => {
  window.clearInterval(timerId);
  showBestScore();
  showScreen("start-screen");
});

// Keyboard: 1–4 to answer, Enter to confirm / go next, +/- to zoom the map.
document.addEventListener("keydown", (e) => {
  if (!state || $("quiz-screen").classList.contains("hidden")) return;
  const q = state.questions[state.index];

  if (e.key === "Enter") {
    const confirm = $<HTMLButtonElement>("confirm-btn");
    if (!confirm.classList.contains("hidden") && !confirm.disabled) {
      e.preventDefault();
      confirmMap(state);
    } else if (!$("next-btn").classList.contains("hidden")) {
      e.preventDefault();
      next();
    }
    return;
  }

  if (q.mode.kind === "map") {
    if (e.key === "+" || e.key === "=") worldMap?.zoomBy(2);
    else if (e.key === "-") worldMap?.zoomBy(0.5);
    return;
  }

  const buttons = [...$("options").children] as HTMLButtonElement[];
  const n = Number(e.key);
  if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) {
    buttons[n - 1].click();
  }
});
