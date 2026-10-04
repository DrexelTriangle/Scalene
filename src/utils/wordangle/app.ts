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
  chooseDailyTarget,
  chooseRandomTarget,
  type Dictionaries,
  type KeyboardStatuses,
  type Row,
  type TileResult,
} from "./game";

interface GameRow extends Row {
  evaluation: TileResult[];
}

interface WordLists {
  dictionaries: Dictionaries;
  targets: string[];
}

const MAX_SCORE = ROW_LENGTHS.reduce((total, length) => total + length, 0);
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const WORDS_BASE = "/wordangle";
const HELP_SEEN_KEY = "wordangle-help-seen";
const SHARE_URL = "thetriangle.org/wordangle";

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
    tagline: part(root, "tagline"),
    help: part<HTMLButtonElement>(root, "help"),
    helpDialog: part<HTMLDialogElement>(root, "help-dialog"),
    resultDialog: part<HTMLDialogElement>(root, "result-dialog"),
    resultTitle: part(root, "result-title"),
    resultSummary: part(root, "result-summary"),
    resultDetail: part(root, "result-detail"),
    resultNote: part(root, "result-note"),
  };

  const newRows = (): GameRow[] =>
    ROW_LENGTHS.map((length) => ({ length, guess: "", submitted: false, evaluation: [] }));

  const newGame = () => ({
    target: "",
    puzzleNumber: null as number | null,
    randomGame: false,
    rows: newRows(),
    activeRow: 0,
    score: 0,
    gameOver: false,
    won: false,
    keyboard: {} as KeyboardStatuses,
  });
  type Game = ReturnType<typeof newGame>;

  const state = { dictionaries: {} as Dictionaries, targets: [] as string[], ...newGame() };
  // The daily game, parked while the reader plays random words, so switching
  // back to Daily picks up where they left off instead of starting over.
  let parkedDaily: Game | undefined;

  els.help.addEventListener("click", () => els.helpDialog.showModal());
  if (!readHelpSeen()) {
    els.helpDialog.showModal();
    markHelpSeen();
  }

  setMessage("Loading words…");
  loadWordLists()
    .then((data) => {
      if (signal.aborted) return;
      state.dictionaries = data.dictionaries;
      state.targets = data.targets;
      startGame(false);
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
    const selection = randomGame ? chooseRandomTarget(state.targets) : chooseDailyTarget(state.targets);
    Object.assign(state, newGame(), {
      target: selection.target,
      puzzleNumber: selection.number,
      randomGame,
    });
    if (els.resultDialog.open) els.resultDialog.close();
    render();
    setMessage(randomGame ? "" : "Choose any row to begin.");
  }

  function switchMode(randomGame: boolean) {
    if (randomGame === state.randomGame) return;
    if (randomGame) {
      const { dictionaries: _d, targets: _t, ...daily } = state;
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
    renderStats();
    renderBoard();
    renderKeyboard();
    els.result.hidden = !state.gameOver;
  }

  function renderStats() {
    // The daily number stays on its button in random mode, from the parked game.
    const dailyNumber = state.randomGame ? parkedDaily?.puzzleNumber : state.puzzleNumber;
    els.puzzleId.textContent = dailyNumber == null ? "" : `#${dailyNumber}`;
    els.score.textContent = `${state.score}`;
    els.modeDaily.setAttribute("aria-pressed", `${!state.randomGame}`);
    els.modeRandom.setAttribute("aria-pressed", `${state.randomGame}`);
    els.newRandom.hidden = !state.randomGame;
    els.tagline.textContent = state.randomGame
      ? "Random practice word — not today's puzzle"
      : "A daily word puzzle from The Triangle";
    root.dataset.mode = state.randomGame ? "random" : "daily";
  }

  function renderBoard() {
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
        const letter = row.guess[tileIndex] ?? "";
        const evaluation = row.evaluation[tileIndex];
        tile.className = "tr-tile";
        if (letter) tile.classList.add("filled");
        if (evaluation) tile.classList.add(evaluation.status);
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
  }

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
      const arrow = document.createElement("span");
      arrow.className = `tr-arrow ${direction}`;
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
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (els.helpDialog.open || els.resultDialog.open) return;

    const key = event.key.toLowerCase();
    if (key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      moveActiveRow(key === "arrowup" ? -1 : 1);
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

  function handleKey(key: string) {
    if (state.gameOver) return;
    const row = state.rows[state.activeRow];
    if (row.submitted) return;

    if (key === "backspace") {
      row.guess = row.guess.slice(0, -1);
      renderBoard();
      return;
    }

    if (key === "enter") {
      submitActiveRow();
      return;
    }

    if (/^[a-z]$/.test(key) && row.guess.length < row.length) {
      row.guess += key;
      renderBoard();
    }
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

    row.evaluation = evaluateGuess(row.guess, state.target);
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
    els.resultDetail.textContent = state.randomGame ? "Random practice word" : `Wordangle #${state.puzzleNumber}`;
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
    els.board.children[state.activeRow]?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-5px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 180 },
    );
  }

  function setMessage(text: string, bad = false, good = false) {
    els.message.textContent = text;
    els.message.classList.toggle("bad", bad);
    els.message.classList.toggle("good", good);
  }

  async function shareResult() {
    if (!state.gameOver) return;
    const puzzleId = state.randomGame ? "Wordangle (random)" : `Wordangle #${state.puzzleNumber}`;
    const score = state.won ? `${state.score} letters` : "Loss";
    const grid = state.rows
      .filter((row) => row.submitted)
      .map((row) =>
        row.evaluation
          .map((item) => (item.status === "exact" ? "🟩" : item.status === "present" ? "🟨" : "⬜"))
          .join(""),
      )
      .join("\n");
    const text = `${puzzleId}\nScore: ${score}\n\n${grid}\n\n${SHARE_URL}`;

    try {
      await navigator.clipboard.writeText(text);
      els.resultNote.textContent = "Result copied to clipboard.";
    } catch {
      window.prompt("Copy your result:", text);
    }
  }
}
