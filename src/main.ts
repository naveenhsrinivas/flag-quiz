import "./style.css";
import { COUNTRIES, type Country, type Region } from "./data";

// ---------- Types ----------
type ModeKey = "flag-country" | "country-capital" | "capital-country";
type ModeSetting = ModeKey | "mixed";
type RegionSetting = Region | "All";
type CountSetting = "10" | "20" | "50" | "all";

interface Settings {
  mode: ModeSetting;
  region: RegionSetting;
  count: CountSetting;
}

interface Mode {
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

function flagUrl(code: string): string {
  return `https://flagcdn.com/w320/${code}.png`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

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

// ---------- Question building ----------
const MODES: Record<ModeKey, Mode> = {
  "flag-country": {
    text: "Which country does this flag belong to?",
    showFlag: true,
    prompt: () => "",
    answer: (c) => c.name,
  },
  "country-capital": {
    text: "What is the capital of…",
    showFlag: false,
    prompt: (c) => c.name,
    answer: (c) => c.capital,
  },
  "capital-country": {
    text: "Which country has this capital?",
    showFlag: false,
    prompt: (c) => c.capital,
    answer: (c) => c.name,
  },
};

const MODE_KEYS = Object.keys(MODES) as ModeKey[];

function buildQuestion(country: Country): Question {
  const modeKey: ModeKey =
    settings.mode === "mixed" ? shuffle(MODE_KEYS)[0] : settings.mode;
  const mode = MODES[modeKey];
  const correct = mode.answer(country);

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

function startQuiz(countries?: Country[]): void {
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
  };
  state = game;

  window.clearInterval(timerId);
  timerId = window.setInterval(() => {
    game.seconds++;
    $("timer").textContent = formatTime(game.seconds);
  }, 1000);

  $("timer").textContent = "0:00";
  showScreen("quiz-screen");
  renderQuestion(game);
}

function renderQuestion(game: GameState): void {
  const q = game.questions[game.index];
  const total = game.questions.length;

  $("progress").textContent = `${game.index + 1} / ${total}`;
  $("progress-fill").style.width = `${(game.index / total) * 100}%`;
  $("score").textContent = String(game.score);
  $("streak").textContent = String(game.streak);

  $("question-text").textContent = q.mode.text;
  $("question-prompt").textContent = q.mode.prompt(q.country);
  $("question-prompt").classList.toggle("hidden", q.mode.showFlag);

  const flag = $<HTMLImageElement>("question-flag");
  flag.classList.toggle("hidden", !q.mode.showFlag);
  if (q.mode.showFlag) flag.src = flagUrl(q.country.code);

  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerHTML = `<span class="key">${i + 1}</span><span></span>`;
    btn.lastChild!.textContent = opt;
    btn.addEventListener("click", () => choose(game, opt, btn));
    optionsEl.appendChild(btn);
  });

  $("next-btn").classList.add("hidden");

  // Preload the next flag so it appears instantly.
  const nextQ = game.questions[game.index + 1];
  if (nextQ) new Image().src = flagUrl(nextQ.country.code);
}

function choose(game: GameState, value: string, btn: HTMLButtonElement): void {
  const q = game.questions[game.index];
  if (q.chosen !== undefined) return;
  q.chosen = value;

  const buttons = [...$("options").children] as HTMLButtonElement[];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.lastChild?.textContent === q.correct) b.classList.add("correct");
  });

  if (value === q.correct) {
    game.score++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
  } else {
    btn.classList.add("wrong");
    game.streak = 0;
    game.mistakes.push(q);
  }

  $("score").textContent = String(game.score);
  $("streak").textContent = String(game.streak);
  const nextBtn = $("next-btn");
  nextBtn.classList.remove("hidden");
  nextBtn.textContent =
    game.index === game.questions.length - 1 ? "See results" : "Next →";
  nextBtn.focus();
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
    game.mistakes.forEach((q) => {
      const row = document.createElement("div");
      row.className = "mistake";
      row.innerHTML = `<img alt=""><div><div><strong></strong> — <span class="cap"></span></div><div class="you"></div></div>`;
      row.querySelector("img")!.src = flagUrl(q.country.code);
      row.querySelector("strong")!.textContent = q.country.name;
      row.querySelector(".cap")!.textContent = q.country.capital;
      row.querySelector(".you")!.textContent = `You answered: ${q.chosen}`;
      list.appendChild(row);
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
}

// ---------- Events ----------
$("start-btn").addEventListener("click", () => startQuiz());
$("next-btn").addEventListener("click", next);
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

// Keyboard: 1–4 to answer, Enter for next.
document.addEventListener("keydown", (e) => {
  if ($("quiz-screen").classList.contains("hidden")) return;
  const buttons = [...$("options").children] as HTMLButtonElement[];
  const n = Number(e.key);
  if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) {
    buttons[n - 1].click();
  } else if (e.key === "Enter" && !$("next-btn").classList.contains("hidden")) {
    e.preventDefault();
    next();
  }
});
