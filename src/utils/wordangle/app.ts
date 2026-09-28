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
    random: part<HTMLButtonElement>(root, "random"),
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

  const state = {
    dictionaries: {} as Dictionaries,
    targets: [] as string[],
    target: "",
    puzzleNumber: null as number | null,
    randomGame: false,
    rows: newRows(),
    activeRow: 0,
    score: 0,
    gameOver: false,
    won: false,
    keyboard: {} as KeyboardStatuses,
  };

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
      els.random.addEventListener("click", () => startGame(true));
      els.result.addEventListener("click", openResult);
      els.share.addEventListener("click", shareResult);
      els.random.disabled = false;
    })
    .catch((error) => {
      console.error(error);
      setMessage("Could not load the word list. Try refreshing the page.", true);
    });

  function startGame(randomGame: boolean) {
    const selection = randomGame ? chooseRandomTarget(state.targets) : chooseDailyTarget(state.targets);
    state.target = selection.target;
    state.puzzleNumber = selection.number;
    state.randomGame = randomGame;
    state.rows = newRows();
    state.activeRow = 0;
    state.score = 0;
    state.gameOver = false;
    state.won = false;
    state.keyboard = {};
    if (els.resultDialog.open) els.resultDialog.close();
    render();
    setMessage(randomGame ? "Random puzzle — have fun." : "Choose any row to begin.");
  }

  function render() {
    renderStats();
    renderBoard();
    renderKeyboard();
    els.result.hidden = !state.gameOver;
  }

  function renderStats() {
    els.puzzleId.textContent = state.randomGame ? "Random" : `#${state.puzzleNumber}`;
    els.score.textContent = `${state.score}`;
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
      els.board.appendChild(rowEl);
    });
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
    if (state.gameOver || state.rows[index].submitted) return;
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

  function moveActiveRow(delta: number) {
    if (state.gameOver) return;
    let index = state.activeRow;
    for (let steps = 0; steps < state.rows.length; steps += 1) {
      index = (index + delta + state.rows.length) % state.rows.length;
      if (!state.rows[index].submitted) {
        selectRow(index);
        return;
      }
    }
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
    const word = state.target.toUpperCase();
    const spent = `${state.score}/${MAX_SCORE} letters`;
    const summary = won ? `You found ${word} in ${spent}.` : `The word was ${word}. You spent ${spent}.`;
    render();
    setMessage(summary, !won, won);

    els.resultDialog.classList.toggle("won", won);
    els.resultDialog.classList.toggle("lost", !won);
    els.resultTitle.textContent = won ? "You got it" : "No match";
    els.resultSummary.textContent = summary;
    els.resultDetail.textContent = state.randomGame ? "Random puzzle" : `Wordangle #${state.puzzleNumber}`;
    openResult();
  }

  function openResult() {
    if (!state.gameOver || els.resultDialog.open) return;
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
