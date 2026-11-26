// Browser side of /wordangle: board, keyboard, dialogs and sharing. Ported
// from https://github.com/rasen68/triangdle (src/main.js, src/data.js); the
// rules themselves live in ./game.ts.
import {
  ROW_LENGTHS,
  evaluateGuess,
  isValidGuess,
  mergeKeyboardStatuses,
  isGameOver,
  isWin,
  dailyDate,
  chooseRandomTarget,
  typeLetter,
  eraseLetter,
  type Dictionaries,
  type GuessMode,
  type KeyboardStatuses,
  type Row,
  type ScheduledWord,
  type TileResult,
} from "./game";

interface GameRow extends Row {
  evaluation: TileResult[];
  // One entry per tile ("" when empty); `guess` is these joined, kept for the
  // rules in game.ts. `caret` is the tile the next letter lands on.
  letters: string[];
  caret: number;
  // True when a click or arrow key put the caret here, so backspace clears
  // the tile under it rather than the one before it.
  caretPlaced: boolean;
}

interface WordLists {
  dictionaries: Dictionaries;
  targets: string[];
}

const MAX_SCORE = ROW_LENGTHS.reduce((total, length) => total + length, 0);
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
// The lists live in the CMS; Scalene proxies them (src/pages/api/wordangle).
const WORDS_BASE = "/api/wordangle/lists";
const HELP_SEEN_KEY = "wordangle-help-seen";
const CONTRAST_KEY = "wordangle-high-contrast";
const SHARE_URL = "thetriangle.org/wordangle";
const SVG_NS = "http://www.w3.org/2000/svg";

// Module scope outlives ClientRouter navigations, so coming back to the page
// reuses the lists already downloaded instead of fetching ~250 KB again.
let wordListsPromise: Promise<WordLists> | undefined;

function loadWordLists(): Promise<WordLists> {
  wordListsPromise ??= fetchWordLists().catch((error) => {
    wordListsPromise = undefined; // let the next visit retry
    throw error;
  });
  return wordListsPromise;
}

async function fetchWordLists(): Promise<WordLists> {
  const fetchWords = async (name: string) => {
    const response = await fetch(`${WORDS_BASE}/${name}`);
    if (!response.ok) throw new Error(`Could not load ${name}`);
    return parseWords(await response.text());
  };
  const lengths = [2, 3, 4, 5, 6];
  const [targets, ...lists] = await Promise.all([
    fetchWords("targets.txt"),
    ...lengths.map((length) => fetchWords(`allowed-${length}.txt`)),
  ]);
  const dictionaries: Dictionaries = {};
  lengths.forEach((length, i) => {
    dictionaries[length] = new Set(lists[i]);
  });
  return { dictionaries, targets: targets.filter((word) => word.length === 6) };
}

// Today's word from the CMS queue. There is no local pick to fall back on:
// undefined means the daily puzzle is unavailable, and only Random plays.
async function fetchScheduledWord(): Promise<ScheduledWord | undefined> {
  const date = dailyDate();
  try {
    const response = await fetch(`/api/wordangle/today?date=${date}`);
    if (!response.ok) return undefined;
    const body = await response.json();
    const word = typeof body?.word === "string" ? body.word.trim().toLowerCase() : "";
    const number = typeof body?.number === "number" ? body.number : NaN;
    return word && Number.isFinite(number) ? { date, number, word } : undefined;
  } catch {
    return undefined;
  }
}

function parseWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function readHelpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markHelpSeen() {
  try {
    localStorage.setItem(HELP_SEEN_KEY, "1");
  } catch {
    // Private mode or blocked storage: the help just shows again next time.
  }
}

function part<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const el = root.querySelector<T>(`[data-wordangle="${name}"]`);
  if (!el) throw new Error(`Wordangle markup is missing [data-wordangle="${name}"]`);
  return el;
}

// Wires one rendered page. Everything bound outside the root (the document
// keydown listener) is tied to `signal`, which the page aborts on navigation.
export function mountWordangle(root: HTMLElement, signal: AbortSignal) {
  const els = {
    board: part(root, "board"),
    keyboard: part(root, "keyboard"),
    puzzleId: part(root, "puzzle-id"),
    score: part(root, "score"),
    message: part(root, "message"),
    share: part<HTMLButtonElement>(root, "share"),
    result: part<HTMLButtonElement>(root, "result"),
    modeDaily: part<HTMLButtonElement>(root, "mode-daily"),
    modeRandom: part<HTMLButtonElement>(root, "mode-random"),
    newRandom: part<HTMLButtonElement>(root, "new-random"),
    help: part<HTMLButtonElement>(root, "help"),
    settings: part<HTMLButtonElement>(root, "settings"),
    reverseMode: part<HTMLInputElement>(root, "reverse-mode"),
    highContrast: part<HTMLInputElement>(root, "high-contrast"),
    helpDialog: part<HTMLDialogElement>(root, "help-dialog"),
    settingsDialog: part<HTMLDialogElement>(root, "settings-dialog"),
    resultDialog: part<HTMLDialogElement>(root, "result-dialog"),
    resultTitle: part(root, "result-title"),
    resultSummary: part(root, "result-summary"),
    resultDetail: part(root, "result-detail"),
    resultNote: part(root, "result-note"),
  };

  try {
    els.highContrast.checked = localStorage.getItem(CONTRAST_KEY) === "1";
  } catch {
    els.highContrast.checked = false;
  }
  const applyContrast = () => root.toggleAttribute("data-high-contrast", els.highContrast.checked);
  applyContrast();
  els.highContrast.addEventListener("change", () => {
    applyContrast();
    try {
      localStorage.setItem(CONTRAST_KEY, els.highContrast.checked ? "1" : "0");
    } catch {
      // Blocked storage: the switch still works for this page view
    }
  });
  els.settings.addEventListener("click", () => els.settingsDialog.showModal());

  const newRows = (): GameRow[] =>
    ROW_LENGTHS.map((length) => ({
      length,
      guess: "",
      submitted: false,
      evaluation: [],
      letters: Array.from({ length }, () => ""),
      caret: 0,
      caretPlaced: false,
    }));

  let guessPreference: { date: string; mode: GuessMode } = { date: dailyDate(), mode: "classic" };
  const newGame = () => ({
    target: "",
    puzzleNumber: null as number | null,
    randomGame: false,
    guessMode: guessPreference.date === dailyDate() ? guessPreference.mode : "classic" as GuessMode,
    rows: newRows(),
    activeRow: 0,
    score: 0,
    gameOver: false,
    won: false,
    keyboard: {} as KeyboardStatuses,
  });
  type Game = ReturnType<typeof newGame>;

  const state = {
    dictionaries: {} as Dictionaries,
    targets: [] as string[],
    scheduled: undefined as ScheduledWord | undefined,
    ...newGame(),
  };
  // The daily game, parked while the reader plays random words, so switching
  // back to Daily picks up where they left off instead of starting over.
  let parkedDaily: Game | undefined;

  els.reverseMode.addEventListener("change", () => {
    if (!els.reverseMode.disabled) {
      state.guessMode = els.reverseMode.checked ? "reverse" : "classic";
      guessPreference = { date: dailyDate(), mode: state.guessMode };
    }
    renderGuessMode();
  });

  els.help.addEventListener("click", () => els.helpDialog.showModal());
  if (!readHelpSeen()) {
    els.helpDialog.showModal();
    markHelpSeen();
  }

  setMessage("Loading words…");
  Promise.all([loadWordLists(), fetchScheduledWord()])
    .then(([data, scheduled]) => {
      if (signal.aborted) return;
      state.dictionaries = data.dictionaries;
      state.targets = data.targets;
      if (scheduled && data.dictionaries[6]?.has(scheduled.word)) state.scheduled = scheduled;
      if (state.scheduled) {
        startGame(false);
      } else {
        els.modeDaily.disabled = true;
        startGame(true);
        setMessage("Today's puzzle couldn't be loaded. Try Random, or refresh later.", true);
      }
      document.addEventListener("keydown", onKeydown, { signal });
      els.modeRandom.addEventListener("click", () => switchMode(true));
      els.modeDaily.addEventListener("click", () => switchMode(false));
      els.newRandom.addEventListener("click", () => startGame(true));
      els.result.addEventListener("click", openResult);
      els.share.addEventListener("click", shareResult);
      els.modeRandom.disabled = false;
    })
    .catch((error) => {
      console.error(error);
      setMessage("Could not load the word list. Try refreshing the page.", true);
    });

  function startGame(randomGame: boolean) {
    const selection = randomGame
      ? chooseRandomTarget(state.targets)
      : state.scheduled && { target: state.scheduled.word, number: state.scheduled.number };
    if (!selection) return; // no daily word; the Daily button is disabled
    Object.assign(state, newGame(), {
      target: selection.target,
      puzzleNumber: selection.number,
      randomGame,
    });
    if (els.resultDialog.open) els.resultDialog.close();
    render();
    setMessage("");
  }

  function switchMode(randomGame: boolean) {
    if (randomGame === state.randomGame) return;
    if (randomGame) {
      const { dictionaries: _d, targets: _t, scheduled: _s, ...daily } = state;
      parkedDaily = daily;
      startGame(true);
      return;
    }
    if (!parkedDaily) {
      startGame(false);
      return;
    }
    Object.assign(state, parkedDaily);
    parkedDaily = undefined;
    if (els.resultDialog.open) els.resultDialog.close();
    render();
    setMessage(state.gameOver ? resultSummary() : "", state.gameOver && !state.won, state.won);
  }

  function render() {
    renderGuessMode();
    renderStats();
    renderBoard();
    renderKeyboard();
    els.result.hidden = !state.gameOver;
  }

  function renderGuessMode() {
    const reverse = state.guessMode === "reverse";
    els.reverseMode.checked = reverse;
    els.reverseMode.disabled = !state.target || state.rows.some((row) => row.submitted);
    els.board.toggleAttribute("data-reverse", reverse);
    els.board.setAttribute("aria-label", reverse ? "Guess board, aligned with the end of the answer" : "Guess board");
  }

  function renderStats() {
    // The daily number stays on its button in random mode, from the parked game.
    const dailyNumber = state.randomGame ? parkedDaily?.puzzleNumber : state.puzzleNumber;
    els.puzzleId.textContent = dailyNumber == null ? "" : `#${dailyNumber}`;
    els.score.textContent = `${state.score}`;
    els.modeDaily.setAttribute("aria-pressed", `${!state.randomGame}`);
    els.modeRandom.setAttribute("aria-pressed", `${state.randomGame}`);
    els.newRandom.hidden = !state.randomGame;
    root.dataset.mode = state.randomGame ? "random" : "daily";
  }

  function renderBoard() {
    // Suppress the slide while replacing rows and measuring their positions
    els.board.classList.add("is-settling");
    els.board.replaceChildren();
    state.rows.forEach((row, index) => {
      const rowEl = document.createElement("div");
      const active = index === state.activeRow && !state.gameOver && !row.submitted;
      const inert = state.gameOver && !row.submitted;
      rowEl.className = "tr-row";
      rowEl.classList.toggle("active", active);
      rowEl.classList.toggle("locked", row.submitted);
      rowEl.classList.toggle("inert", inert);
      rowEl.tabIndex = row.submitted || state.gameOver ? -1 : 0;
      rowEl.setAttribute("role", "button");
      rowEl.setAttribute("aria-label", `${row.length}-letter row${row.submitted ? ", submitted" : ""}`);
      if (inert) rowEl.setAttribute("aria-disabled", "true");
      rowEl.addEventListener("click", () => selectRow(index));
      rowEl.addEventListener("focus", () => selectRow(index));

      for (let tileIndex = 0; tileIndex < row.length; tileIndex += 1) {
        const tile = document.createElement("div");
        const letter = row.letters[tileIndex];
        const evaluation = row.evaluation[tileIndex];
        tile.className = "tr-tile";
        if (letter) tile.classList.add("filled");
        if (evaluation) tile.classList.add(evaluation.status);
        if (active) {
          // Marked only after a click (or arrow key) put the caret here. While
          // typing, the next tile is obvious and the mark would just follow along.
          tile.classList.toggle("caret", row.caretPlaced && tileIndex === row.caret);
          // Put the caret on this tile so the next letter replaces it. The row
          // click would only re-select the already active row.
          tile.addEventListener("click", (event) => {
            event.stopPropagation();
            row.caret = tileIndex;
            row.caretPlaced = true;
            renderBoard();
          });
        }
        const glyph = document.createElement("span");
        glyph.className = "tr-tile-letter";
        glyph.textContent = letter.toUpperCase();
        tile.appendChild(glyph);

        if (evaluation && evaluation.status !== "absent") {
          addArrowStack(tile, "left", evaluation.arrows.left);
          addArrowStack(tile, "right", evaluation.arrows.right);
        }
        rowEl.appendChild(tile);
      }
      if (active) addRowNav(rowEl, index);
      els.board.appendChild(rowEl);
    });
    setRowShifts();
    void els.board.offsetWidth;
    requestAnimationFrame(() => els.board.classList.remove("is-settling"));
  }

  function setRowShifts() {
    const rows = els.board.querySelectorAll<HTMLElement>(".tr-row");
    const fullRowWidth = rows[rows.length - 1]?.offsetWidth ?? 0;
    for (const row of rows) {
      row.style.setProperty("--tr-shift", `${fullRowWidth - row.offsetWidth}px`);
    }
  }
  window.addEventListener("resize", setRowShifts, { signal });

  // Decorative for screen readers: the rows themselves are focusable and the
  // arrow keys move between them, so these are pointer shortcuts plus a hint.
  function addRowNav(rowEl: HTMLElement, index: number) {
    const nav = document.createElement("span");
    nav.className = "tr-row-nav";
    nav.setAttribute("aria-hidden", "true");
    for (const [direction, delta] of [["up", -1], ["down", 1]] as const) {
      const arrow = document.createElement("span");
      const target = openRowFrom(index, delta);
      arrow.className = `tr-row-nav-arrow ${direction}`;
      arrow.classList.toggle("off", target === undefined);
      arrow.title = direction === "up" ? "Previous open row" : "Next open row";
      // Keep the mousedown from focusing the row: its focus handler rebuilds
      // the board, which would drop this arrow before the click lands.
      arrow.addEventListener("mousedown", (event) => event.preventDefault());
      arrow.addEventListener("click", (event) => {
        event.stopPropagation();
        if (target !== undefined) selectRow(target);
      });
      nav.appendChild(arrow);
    }
    rowEl.appendChild(nav);
  }

  function openRowFrom(index: number, delta: number): number | undefined {
    for (let i = index + delta; i >= 0 && i < state.rows.length; i += delta) {
      if (!state.rows[i].submitted) return i;
    }
    return undefined;
  }

  function addArrowStack(tile: HTMLElement, direction: "left" | "right", count: number) {
    const n = Math.min(count, 4);
    if (!n) return;
    const stack = document.createElement("span");
    stack.className = `tr-arrows ${direction}`;
    stack.setAttribute("aria-hidden", "true");
    for (let i = 0; i < n; i += 1) {
      const arrow = document.createElementNS(SVG_NS, "svg");
      arrow.setAttribute("class", `tr-arrow ${direction}`);
      const shape = document.createElementNS(SVG_NS, "use");
      shape.setAttribute("href", "#wordangle-arrow");
      arrow.appendChild(shape);
      stack.appendChild(arrow);
    }
    tile.appendChild(stack);
  }

  function renderKeyboard() {
    els.keyboard.replaceChildren();
    KEYBOARD_ROWS.forEach((letters, rowIndex) => {
      const row = document.createElement("div");
      row.className = "tr-keyboard-row";
      if (rowIndex === 2) row.appendChild(keyButton("Enter", "enter", "wide enter"));
      for (const letter of letters) row.appendChild(keyButton(letter, letter));
      if (rowIndex === 2) row.appendChild(keyButton("⌫", "backspace", "wide"));
      els.keyboard.appendChild(row);
    });
  }

  function keyButton(label: string, key: string, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tr-key ${extraClass} ${state.keyboard[key] ?? ""}`.trim();
    button.textContent = label.toUpperCase();
    button.setAttribute("aria-label", label === "⌫" ? "Backspace" : label);
    button.disabled = state.gameOver;
    button.addEventListener("click", () => handleKey(key));
    return button;
  }

  function selectRow(index: number) {
    if (state.gameOver || state.rows[index].submitted || index === state.activeRow) return;
    state.activeRow = index;
    renderBoard();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Leave typing alone in the header's search box, and keys meant for an
    // open dialog (Enter on its buttons) to the dialog.
    const target = event.target as HTMLElement | null;
    if (els.helpDialog.open || els.settingsDialog.open || els.resultDialog.open) return;
    const key = event.key.toLowerCase();
    if (target === els.reverseMode) {
      if (!/^(arrow(up|down|left|right)|backspace|[a-z])$/.test(key)) return;
      els.board.focus({ preventScroll: true });
    } else if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (target === els.settings) {
      if (key === "enter") return;
      if (!state.gameOver && /^(arrow(up|down|left|right)|backspace|[a-z])$/.test(key)) {
        els.board.focus({ preventScroll: true });
      }
    }

    if (key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      moveActiveRow(key === "arrowup" ? -1 : 1);
      return;
    }
    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      moveCaret(key === "arrowleft" ? -1 : 1);
      return;
    }
    if (key === "enter" || key === "backspace" || /^[a-z]$/.test(key)) {
      event.preventDefault();
      handleKey(key);
    }
  }

  // Stops at the ends rather than wrapping, so the arrow keys agree with
  // the up/down hints drawn beside the row.
  function moveActiveRow(delta: number) {
    if (state.gameOver) return;
    const index = openRowFrom(state.activeRow, delta);
    if (index !== undefined) selectRow(index);
  }

  // The keyboard moves the caret too, for anyone who cannot click a tile.
  function moveCaret(delta: number) {
    if (state.gameOver) return;
    const row = state.rows[state.activeRow];
    if (row.submitted) return;
    // `length` is the position past the last tile, where typing a full row leaves it.
    row.caret = Math.max(0, Math.min(row.length, row.caret + delta));
    row.caretPlaced = true;
    renderBoard();
  }

  function handleKey(key: string) {
    if (state.gameOver) return;
    const row = state.rows[state.activeRow];
    if (row.submitted) return;

    if (key === "enter") {
      submitActiveRow();
      return;
    }

    if (key === "backspace") {
      editRow(row, eraseLetter(row.letters, row.caret, row.caretPlaced));
    } else if (/^[a-z]$/.test(key)) {
      editRow(row, typeLetter(row.letters, row.caret, key));
    }
  }

  function editRow(row: GameRow, edit: { letters: string[]; caret: number }) {
    row.letters = edit.letters;
    row.caret = edit.caret;
    row.caretPlaced = false;
    row.guess = row.letters.join("");
    renderBoard();
  }

  function submitActiveRow() {
    const row = state.rows[state.activeRow];
    if (!isValidGuess(row.guess, row.length, state.dictionaries)) {
      setMessage(
        row.guess.length !== row.length
          ? `Enter exactly ${row.length} letter${row.length === 1 ? "" : "s"}.`
          : `"${row.guess.toUpperCase()}" is not in the dictionary.`,
        true,
      );
      shakeRow();
      return;
    }

    row.evaluation = evaluateGuess(row.guess, state.target, state.guessMode);
    row.submitted = true;
    state.score += row.length;
    state.keyboard = mergeKeyboardStatuses(state.keyboard, row.evaluation, row.guess);

    if (isGameOver(state.rows, state.target)) {
      endGame(isWin(state.rows, state.target));
      return;
    }

    state.activeRow = findNextOpenRow(state.activeRow);
    setMessage("");
    render();
  }

  function endGame(won: boolean) {
    state.gameOver = true;
    state.won = won;
    render();
    setMessage(resultSummary(), !won, won);
    openResult();
  }

  function resultSummary() {
    const word = state.target.toUpperCase();
    const spent = `${state.score}/${MAX_SCORE} letters`;
    return state.won ? `You found ${word} in ${spent}.` : `The word was ${word}. You spent ${spent}.`;
  }

  // Filled on every open, since a parked daily game can come back finished
  // after the dialog last showed a random game's result.
  function openResult() {
    if (!state.gameOver || els.resultDialog.open) return;
    els.resultDialog.classList.toggle("won", state.won);
    els.resultDialog.classList.toggle("lost", !state.won);
    els.resultTitle.textContent = state.won ? "You got it" : "No match";
    els.resultSummary.textContent = resultSummary();
    const puzzle = state.randomGame ? "Random practice word" : `Wordangle #${state.puzzleNumber}`;
    els.resultDetail.textContent = puzzle + guessModeLabel();
    els.resultNote.textContent = "";
    els.resultDialog.showModal();
  }

  function findNextOpenRow(from: number) {
    for (let offset = 1; offset <= state.rows.length; offset += 1) {
      const index = (from + offset) % state.rows.length;
      if (!state.rows[index].submitted) return index;
    }
    return from;
  }

  function shakeRow() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The individual translate property leaves the row's alignment transform intact
    els.board.children[state.activeRow]?.animate(
      [{ translate: "0" }, { translate: "-5px" }, { translate: "5px" }, { translate: "0" }],
      { duration: 180 },
    );
  }

  function setMessage(text: string, bad = false, good = false) {
    els.message.textContent = text;
    els.message.classList.toggle("bad", bad);
    els.message.classList.toggle("good", good);
  }

  function guessModeLabel() {
    return state.guessMode === "reverse" ? " · Reverse" : "";
  }

  async function shareResult() {
    if (!state.gameOver) return;
    const puzzleId = state.randomGame ? "Wordangle (random)" : `Wordangle #${state.puzzleNumber}`;
    const score = state.won ? `${state.score} letters` : "Loss";
    const squares = els.highContrast.checked
      ? { exact: "🟧", present: "🟦", absent: "⬜" }
      : { exact: "🟩", present: "🟨", absent: "⬜" };
    const grid = state.rows
      .filter((row) => row.submitted)
      .map((row) => row.evaluation.map((item) => squares[item.status]).join(""))
      .join("\n");
    const text = `${puzzleId}${guessModeLabel()}\nScore: ${score}\n\n${grid}\n\n${SHARE_URL}`;

    try {
      await navigator.clipboard.writeText(text);
      els.resultNote.textContent = "Result copied to clipboard.";
    } catch {
      window.prompt("Copy your result:", text);
    }
  }
}
