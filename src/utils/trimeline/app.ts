// Browser side of /trimeline: drag-to-reorder, submit, reveal and sharing.
// The rules live in ./game.ts.
import {
  dailyDate,
  formatDate,
  parseSavedResult,
  checkOrder,
  shareText,
  SLOT_COUNT,
  type Headline,
  type Puzzle,
} from './game';

const STORAGE_PREFIX = 'trimeline-result-';

// Articles live at /article/<slug> (see [sections]/[article].astro and the
// Section-Related-Row cards), not /news/<slug>.
function articleHref(slug: string): string {
  return `/article/${slug}`;
}

function storageKey(puzzleNumber: number): string {
  return `${STORAGE_PREFIX}${puzzleNumber}`;
}

function readSaved(puzzleNumber: number) {
  try {
    return parseSavedResult(localStorage.getItem(storageKey(puzzleNumber)));
  } catch {
    return undefined;
  }
}

function writeSaved(puzzleNumber: number, order: number[], slotCorrect: boolean[], score: number) {
  try {
    localStorage.setItem(
      storageKey(puzzleNumber),
      JSON.stringify({ order, score, slotCorrect }),
    );
  } catch {
    // Blocked storage: the game still plays for this page view.
  }
}

function part<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const el = root.querySelector<T>(`[data-trimeline="${name}"]`);
  if (!el) throw new Error(`Tri-meline markup is missing [data-trimeline="${name}"]`);
  return el;
}

// Wires one rendered page. Everything bound outside the root is tied to
// `signal`, which the page aborts on navigation.
export function mountTrimeline(root: HTMLElement, signal: AbortSignal) {
  const els = {
    list: part(root, 'list'),
    puzzleId: part(root, 'puzzle-id'),
    message: part(root, 'message'),
    submit: part<HTMLButtonElement>(root, 'submit'),
    share: part<HTMLButtonElement>(root, 'share'),
    help: part<HTMLButtonElement>(root, 'help'),
    helpDialog: part<HTMLDialogElement>(root, 'help-dialog'),
    resultDialog: part<HTMLDialogElement>(root, 'result-dialog'),
    resultTitle: part(root, 'result-title'),
    resultSummary: part(root, 'result-summary'),
    resultDetail: part(root, 'result-detail'),
    resultNote: part(root, 'result-note'),
    loading: part(root, 'loading'),
  };

  let puzzle: Puzzle | undefined;
  // The player's arrangement: headline indices, oldest slot first.
  let order: number[] = [];
  let revealed = false;
  let slotCorrect: boolean[] = [];
  let dragFrom = -1;

  els.help.addEventListener('click', () => els.helpDialog.showModal());

  setMessage('Loading today’s puzzle…');
  fetchPuzzle()
    .then((loaded) => {
      if (signal.aborted) return;
      if (!loaded) {
        els.loading.hidden = true;
        setMessage('No puzzle today. Check back tomorrow!', true);
        return;
      }
      puzzle = loaded;
      els.puzzleId.textContent = `#${loaded.number}`;
      order = loaded.headlines.map((_, index) => index);
      const saved = readSaved(loaded.number);
      if (saved) {
        order = saved.order;
        slotCorrect = saved.slotCorrect;
        revealed = true;
      }
      els.loading.hidden = true;
      render();
      if (revealed) openResult();
    })
    .catch(() => {
      if (signal.aborted) return;
      els.loading.hidden = true;
      setMessage('Could not load today’s puzzle. Try refreshing the page.', true);
    });

  els.submit.addEventListener('click', submit);
  els.share.addEventListener('click', share);

  async function fetchPuzzle(): Promise<Puzzle | undefined> {
    const date = dailyDate();
    try {
      const response = await fetch(`/api/trimeline/today?date=${date}`);
      if (!response.ok) return undefined;
      const body = await response.json();
      if (
        typeof body?.number !== 'number' ||
        !Array.isArray(body?.headlines) ||
        body.headlines.length !== SLOT_COUNT ||
        !body.headlines.every(
          (item: Headline) =>
            item &&
            typeof item.title === 'string' &&
            typeof item.slug === 'string' &&
            typeof item.pub_date === 'string',
        )
      ) {
        return undefined;
      }
      return { date, number: body.number, headlines: body.headlines };
    } catch {
      return undefined;
    }
  }

  function render() {
    els.list.replaceChildren();
    if (!puzzle) return;
    order.forEach((headlineIndex, slot) => {
      els.list.appendChild(rowEl(headlineIndex, slot));
    });
    els.submit.hidden = revealed;
    els.submit.disabled = revealed;
  }

  function rowEl(headlineIndex: number, slot: number) {
    if (!puzzle) throw new Error('render without a puzzle');
    const headline = puzzle.headlines[headlineIndex];
    const row = document.createElement('li');
    row.className = 'tl-row';
    row.dataset.slot = `${slot}`;
    row.setAttribute('role', 'listitem');

    const slotLabel = document.createElement('span');
    slotLabel.className = 'tl-slot';
    slotLabel.textContent = `${slot + 1}`;
    row.appendChild(slotLabel);

    const text = document.createElement('span');
    text.className = 'tl-text';
    text.textContent = headline.title;
    if (revealed) {
      const correct = slotCorrect[slot];
      row.classList.add('revealed', correct ? 'correct' : 'wrong');
      text.replaceChildren();
      const link = document.createElement('a');
      link.href = articleHref(headline.slug);
      link.textContent = headline.title;
      text.appendChild(link);
      const date = document.createElement('span');
      date.className = 'tl-date';
      date.textContent = formatDate(headline.pub_date);
      text.appendChild(date);
    }
    row.appendChild(text);

    const controls = document.createElement('span');
    controls.className = 'tl-controls';
    const move = (delta: -1 | 1, direction: 'up' | 'down') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tl-move ${direction}`;
      button.textContent = direction === 'up' ? '↑' : '↓';
      button.setAttribute('aria-label', `Move "${headline.title}" ${direction === 'up' ? 'up' : 'down'}`);
      button.disabled = revealed || (direction === 'up' ? slot === 0 : slot === order.length - 1);
      button.addEventListener('click', () => moveRow(slot, delta));
      return button;
    };
    controls.appendChild(move(-1, 'up'));
    controls.appendChild(move(1, 'down'));
    row.appendChild(controls);

    if (!revealed) {
      const handle = document.createElement('span');
      handle.className = 'tl-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-hidden', 'true');
      row.prepend(handle);
      row.tabIndex = 0;
      // Pointer events cover mouse and touch in one path; no dragstart or
      // scroll hijack. touch-action:none (set on the row in the page CSS)
      // keeps the browser from claiming the vertical gesture for scrolling.
      row.addEventListener('pointerdown', onPointerDown);
    }
    return row;
  }

  // Hand-rolled drag: on pointerdown capture the dragged headline, on
  // pointermove follow the finger with a transform and swap slots whenever the
  // finger crosses a neighbouring row's midpoint, on pointerup re-render from
  // the final order. render() rebuilds the rows, so after every swap the
  // dragged element is re-acquired by its current slot.
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('.tl-row');
    if (!row || revealed) return;
    const grabY = event.clientY;
    dragFrom = Number(row.dataset.slot);
    row.classList.add('dragging');
    document.body.classList.add('tl-dragging');
    // Rows re-render on each swap; find the live element for the dragged slot.
    const draggedRow = () =>
      Array.from(els.list.children).find(
        (item) => Number((item as HTMLElement).dataset.slot) === dragFrom,
      ) as HTMLElement | undefined;

    const onMove = (moveEvent: PointerEvent) => {
      const live = draggedRow();
      if (!live) return;
      const translateY = moveEvent.clientY - grabY;
      live.style.transform = `translateY(${translateY}px)`;
      // Swap with the neighbour whose midpoint the finger has crossed.
      const delta = translateY > 0 ? 1 : -1;
      const neighbour =
        delta > 0
          ? Array.from(els.list.children).find(
              (item) => Number((item as HTMLElement).dataset.slot) === dragFrom + 1,
            ) as HTMLElement | undefined
          : Array.from(els.list.children).find(
              (item) => Number((item as HTMLElement).dataset.slot) === dragFrom - 1,
            ) as HTMLElement | undefined;
      if (!neighbour) return;
      const crossed =
        delta > 0
          ? moveEvent.clientY > neighbour.offsetTop + neighbour.offsetHeight / 2
          : moveEvent.clientY < neighbour.offsetTop + neighbour.offsetHeight / 2;
      if (!crossed) return;
      const moved = order[dragFrom];
      order.splice(dragFrom, 1);
      order.splice(dragFrom + delta, 0, moved);
      dragFrom += delta;
      render();
      const next = draggedRow();
      if (next) {
        next.classList.add('dragging');
        next.style.transform = `translateY(${translateY}px)`;
      }
    };
    const onUp = () => {
      document.body.classList.remove('tl-dragging');
      Array.from(els.list.children).forEach((item) => {
        (item as HTMLElement).classList.remove('dragging');
        (item as HTMLElement).style.transform = '';
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function moveRow(slot: number, delta: -1 | 1) {
    if (revealed) return;
    const target = slot + delta;
    if (target < 0 || target >= order.length) return;
    const moved = order[slot];
    order[slot] = order[target];
    order[target] = moved;
    render();
    // Keep focus on the same headline's button after the re-render.
    const row = Array.from(els.list.children).find(
      (item) => Number((item as HTMLElement).dataset.slot) === target,
    );
    const button = row?.querySelector<HTMLButtonElement>(`.tl-move.${delta === -1 ? 'up' : 'down'}`);
    button?.focus();
  }

  function submit() {
    if (!puzzle || revealed) return;
    const result = checkOrder(puzzle.headlines, order);
    slotCorrect = result.slotCorrect;
    revealed = true;
    writeSaved(puzzle.number, order, slotCorrect, result.score);
    render();
    openResult();
  }

  function resultSummary(): string {
    if (!puzzle) return '';
    const score = slotCorrect.filter(Boolean).length;
    return score === puzzle.headlines.length
      ? `Perfect! All ${score} in order.`
      : `You got ${score} of ${puzzle.headlines.length} in the right place.`;
  }

  function openResult() {
    if (!puzzle || !revealed || els.resultDialog.open) return;
    const score = slotCorrect.filter(Boolean).length;
    const perfect = score === puzzle.headlines.length;
    els.resultDialog.classList.toggle('won', perfect);
    els.resultDialog.classList.toggle('lost', !perfect);
    els.resultTitle.textContent = perfect ? 'You got it' : 'Not quite';
    els.resultSummary.textContent = resultSummary();
    els.resultDetail.textContent = `Tri-meline #${puzzle.number}`;
    els.resultNote.textContent = '';
    els.resultDialog.showModal();
  }

  async function share() {
    if (!puzzle || !revealed) return;
    const text = shareText(puzzle, slotCorrect);
    try {
      await navigator.clipboard.writeText(text);
      els.resultNote.textContent = 'Result copied to clipboard.';
    } catch {
      window.prompt('Copy your result:', text);
    }
  }

  function setMessage(text: string, bad = false) {
    els.message.textContent = text;
    els.message.classList.toggle('bad', bad);
  }
}
