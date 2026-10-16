// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function flagUrl(code) {
  return `https://flagcdn.com/w320/${code}.png`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- Settings (chip groups) ----------
const settings = { mode: "flag-country", region: "All", count: "10" };

function setupChips(groupId, key) {
  const group = $(groupId);
  group.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    settings[key] = chip.dataset.value;
    showBestScore();
  });
}
setupChips("mode-chips", "mode");
setupChips("region-chips", "region");
setupChips("count-chips", "count");

// ---------- Best score (saved in the browser) ----------
function bestKey() {
  return `best:${settings.mode}:${settings.region}:${settings.count}`;
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(bestKey()));
  } catch {
    return null;
  }
}

function saveBest(result) {
  try {
    localStorage.setItem(bestKey(), JSON.stringify(result));
  } catch {
    // Storage unavailable (e.g. private mode) – ignore.
  }
}

function showBestScore() {
  const best = loadBest();
  $("best-score").textContent = best
    ? `Best for this setup: ${best.score}/${best.total} (${best.percent}%)`
    : "";
}
showBestScore();

// ---------- Question building ----------
const MODES = {
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

function buildQuestion(country, pool) {
  const modeKey =
    settings.mode === "mixed"
      ? shuffle(Object.keys(MODES))[0]
      : settings.mode;
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
let state = null;
let timerId = null;

function startQuiz(countries) {
  const pool =
    countries ||
    COUNTRIES.filter((c) => settings.region === "All" || c.region === settings.region);
  const picked = shuffle(pool);
  const total = settings.count === "all" || countries ? picked.length : Math.min(Number(settings.count), picked.length);

  state = {
    questions: picked.slice(0, total).map((c) => buildQuestion(c, pool)),
    index: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    mistakes: [],
    seconds: 0,
    isPractice: Boolean(countries),
  };

  clearInterval(timerId);
  timerId = setInterval(() => {
    state.seconds++;
    $("timer").textContent = formatTime(state.seconds);
  }, 1000);

  $("timer").textContent = "0:00";
  showScreen("quiz-screen");
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.index];
  const total = state.questions.length;

  $("progress").textContent = `${state.index + 1} / ${total}`;
  $("progress-fill").style.width = `${(state.index / total) * 100}%`;
  $("score").textContent = state.score;
  $("streak").textContent = state.streak;

  $("question-text").textContent = q.mode.text;
  $("question-prompt").textContent = q.mode.prompt(q.country);
  $("question-prompt").classList.toggle("hidden", q.mode.showFlag);

  const flag = $("question-flag");
  flag.classList.toggle("hidden", !q.mode.showFlag);
  if (q.mode.showFlag) flag.src = flagUrl(q.country.code);

  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerHTML = `<span class="key">${i + 1}</span><span></span>`;
    btn.lastChild.textContent = opt;
    btn.addEventListener("click", () => choose(opt, btn));
    optionsEl.appendChild(btn);
  });

  $("next-btn").classList.add("hidden");

  // Preload the next flag so it appears instantly.
  const next = state.questions[state.index + 1];
  if (next) new Image().src = flagUrl(next.country.code);
}

function choose(value, btn) {
  const q = state.questions[state.index];
  if (q.chosen !== undefined) return;
  q.chosen = value;

  const buttons = [...$("options").children];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.lastChild.textContent === q.correct) b.classList.add("correct");
  });

  if (value === q.correct) {
    state.score++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    btn.classList.add("wrong");
    state.streak = 0;
    state.mistakes.push(q);
  }

  $("score").textContent = state.score;
  $("streak").textContent = state.streak;
  $("next-btn").classList.remove("hidden");
  $("next-btn").textContent =
    state.index === state.questions.length - 1 ? "See results" : "Next →";
  $("next-btn").focus();
}

function next() {
  if (state.index < state.questions.length - 1) {
    state.index++;
    renderQuestion();
  } else {
    finish();
  }
}

function finish() {
  clearInterval(timerId);
  const total = state.questions.length;
  const percent = Math.round((state.score / total) * 100);

  $("result-summary").textContent = `${state.score} / ${total} (${percent}%)`;
  $("result-detail").textContent =
    `Time ${formatTime(state.seconds)} · Best streak ${state.bestStreak}`;

  if (!state.isPractice) {
    const best = loadBest();
    if (!best || percent > best.percent) {
      saveBest({ score: state.score, total, percent });
      $("result-detail").textContent += " · 🏆 New best!";
    }
  }

  const list = $("mistakes");
  list.innerHTML = "";
  if (state.mistakes.length) {
    const h = document.createElement("h3");
    h.textContent = "Review your mistakes";
    list.appendChild(h);
    state.mistakes.forEach((q) => {
      const row = document.createElement("div");
      row.className = "mistake";
      row.innerHTML = `<img alt=""><div><div><strong></strong> — <span class="cap"></span></div><div class="you"></div></div>`;
      row.querySelector("img").src = flagUrl(q.country.code);
      row.querySelector("strong").textContent = q.country.name;
      row.querySelector(".cap").textContent = q.country.capital;
      row.querySelector(".you").textContent = `You answered: ${q.chosen}`;
      list.appendChild(row);
    });
  } else {
    list.innerHTML = "<p>Perfect score! 🎉</p>";
  }

  $("retry-mistakes-btn").classList.toggle("hidden", !state.mistakes.length);
  showScreen("results-screen");
}

function showScreen(id) {
  ["start-screen", "quiz-screen", "results-screen"].forEach((s) =>
    $(s).classList.toggle("hidden", s !== id)
  );
}

// ---------- Events ----------
$("start-btn").addEventListener("click", () => startQuiz());
$("next-btn").addEventListener("click", next);
$("again-btn").addEventListener("click", () => {
  showBestScore();
  showScreen("start-screen");
});
$("retry-mistakes-btn").addEventListener("click", () =>
  startQuiz(state.mistakes.map((q) => q.country))
);
$("quit-btn").addEventListener("click", () => {
  clearInterval(timerId);
  showBestScore();
  showScreen("start-screen");
});

// Keyboard: 1–4 to answer, Enter for next.
document.addEventListener("keydown", (e) => {
  if ($("quiz-screen").classList.contains("hidden")) return;
  const buttons = [...$("options").children];
  const n = Number(e.key);
  if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) {
    buttons[n - 1].click();
  } else if (e.key === "Enter" && !$("next-btn").classList.contains("hidden")) {
    e.preventDefault();
    next();
  }
});
