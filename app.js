const gameDateEl = document.getElementById("game-date");
const slotEls = Array.from(document.querySelectorAll(".shelf-slot"));
const priceStripEls = Array.from(document.querySelectorAll(".price-strip"));
const traySlotEls = Array.from(document.querySelectorAll(".tray-slot"));
const turnsEl = document.getElementById("turns");
const statusEl = document.getElementById("status-message");
const submitButton = document.getElementById("submit-button");

const state = {
  maxAttempts: 6,
  attempt: 1,
  puzzleDate: "",
  puzzleLabel: "",
  items: [],
  slots: new Array(7).fill(null),
  lockedIds: new Set(),
  history: [],
  draggingId: null
};

init();

async function init() {
  try {
    const today = getBrisbaneDateString();
    const schedule = await loadSchedule();

    if (!schedule.includes(today)) {
      gameDateEl.textContent = "Game: Coming soon";
      statusEl.textContent = "No Shelfie puzzle is scheduled for today yet.";
      submitButton.disabled = true;
      return;
    }

    const puzzleText = await fetch(`./data/${today}.txt`)
      .then(assertOk)
      .then(r => r.text());

    const puzzle = parsePuzzleText(puzzleText);

    state.puzzleDate = puzzle.date;
    state.puzzleLabel = puzzle.label;
    state.maxAttempts = Number(puzzle.maxAttempts) || 6;

    // Build canonical items list used for scoring (kept in natural order)
    state.items = puzzle.items.map((item, index) => ({
      id: `${slugify(item.name)}-${index}`,
      name: item.name,
      store: item.store,
      price: Number(item.price),
      image: item.image,
      homeRow: index // will be remapped just for tray visual order
    }));

    // Create a shuffled list of row indices ONLY so tray order is randomized
    const rowIndices = [...state.items.keys()]; // [0, 1, 2, ...]
    shuffleArray(rowIndices);

    // Reassign homeRow from shuffled indices so the tray rows are scrambled
    state.items.forEach((item, idx) => {
      item.homeRow = rowIndices[idx];
    });

    state.slots = new Array(state.items.length).fill(null);

    gameDateEl.textContent = `Game: ${state.puzzleLabel}`;
    turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
    statusEl.textContent = "Drag all 7 items onto the shelf, then press submit.";

    clearAllPriceStrips();
    renderTray();
    renderSlots();
    wireSubmit();
  } catch (error) {
    console.error(error);
    gameDateEl.textContent = "Game: Error";
    statusEl.textContent = "Could not load today's Shelfie puzzle.";
    submitButton.disabled = true;
  }
}

async function loadSchedule() {
  const text = await fetch("./data/schedule.txt")
    .then(assertOk)
    .then(r => r.text());

  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function assertOk(response) {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response;
}

function parsePuzzleText(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const result = {
    date: "",
    label: "",
    maxAttempts: 6,
    items: []
  };

  let currentItem = null;

  for (const line of lines) {
    if (!line) continue;

    if (line === "ITEM") {
      if (currentItem && currentItem.name && currentItem.image) {
        result.items.push(currentItem);
      }
      currentItem = { name: "", store: "", price: "", image: "" };
      continue;
    }

    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim();
    const value = rawValue.join(":").trim();

    if (key === "DATE") result.date = value;
    if (key === "LABEL") result.label = value;
    if (key === "MAX_ATTEMPTS") result.maxAttempts = value;

    if (currentItem) {
      if (key === "NAME") currentItem.name = value;
      if (key === "STORE") currentItem.store = value;
      if (key === "PRICE") currentItem.price = value;
      if (key === "IMAGE") currentItem.image = value;
    }
  }

  if (currentItem && currentItem.name && currentItem.image) {
    result.items.push(currentItem);
  }

  if (!result.items.length) {
    throw new Error("Puzzle file contains no items.");
  }

  return result;
}

function clearAllPriceStrips() {
  priceStripEls.forEach(strip => {
    strip.innerHTML = "";
    strip.className = "price-strip";
    strip.style = "";
  });
}

function renderTray() {
  traySlotEls.forEach((trayEl, row) => {
    trayEl.innerHTML = "";
    trayEl.className = "tray-slot";

    const item = state.items[row];
    if (!item) return;

    const onShelfIndex = state.slots.findIndex(s => s && s.id === item.id);
    const isLocked = state.lockedIds.has(item.id);

    if (onShelfIndex !== -1 || isLocked) {
      return;
    }

    const card = createCard(item, true);
    trayEl.appendChild(card);
  });
}

function renderSlots() {
  slotEls.forEach((slotEl, index) => {
    slotEl.innerHTML = "";
    slotEl.classList.remove("is-correct", "is-wrong", "is-drop-target");

    const item = state.slots[index];
    if (!item) return;

    const card = createCard(item, false);
    if (state.lockedIds.has(item.id)) {
      card.classList.add("is-locked");
      card.disabled = true;
    }

    slotEl.appendChild(card);
  });
}

function createCard(item, inTray) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-card";
  button.dataset.itemId = item.id;
  button.setAttribute("aria-label", item.name);

  const img = document.createElement("img");
  img.src = item.image;
  img.alt = item.name;
  img.draggable = false;
  button.appendChild(img);

  if (!state.lockedIds.has(item.id)) {
    attachPointerDrag(button, item);
  } else {
    button.classList.add("is-locked");
    button.disabled = true;
  }

  if (inTray) {
    button.title = item.name;
    button.addEventListener("mouseenter", () => showNameTooltip(button, item));
    button.addEventListener("mouseleave", () => hideNameTooltip(button));
    button.addEventListener("focus", () => showNameTooltip(button, item));
    button.addEventListener("blur", () => hideNameTooltip(button));
  }

  return button;
}

function showNameTooltip(button, item) {
  hideNameTooltip(button);
  const wrapper = button.closest(".tray-slot");
  if (!wrapper) return;

  const tip = document.createElement("div");
  tip.className = "product-tooltip";
  tip.textContent = item.name;
  wrapper.appendChild(tip);
}

function hideNameTooltip(button) {
  const wrapper = button.closest(".tray-slot");
  if (!wrapper) return;

  const tip = wrapper.querySelector(".product-tooltip");
  if (tip) tip.remove();
}

function attachPointerDrag(element, item) {
  let pointerId = null;
  let startLocation = null;
  let startShelfIndex = -1;
  let ghost = null;
  let shiftX = 0;
  let shiftY = 0;
  let currentX = 0;
  let currentY = 0;
  let dragging = false;

  element.style.touchAction = "none";

  element.addEventListener("pointerdown", event => {
    if (state.lockedIds.has(item.id)) return;
    if (event.button !== undefined && event.button !== 0) return;

    const rect = element.getBoundingClientRect();

    pointerId = event.pointerId;
    dragging = true;
    state.draggingId = item.id;

    currentX = event.clientX;
    currentY = event.clientY;
    shiftX = event.clientX - rect.left;
    shiftY = event.clientY - rect.top;

    const trayWrapper = element.closest(".tray-slot");
    if (trayWrapper) {
      startLocation = "tray";
      startShelfIndex = -1;
    } else {
      startLocation = "shelf";
      startShelfIndex = state.slots.findIndex(s => s && s.id === item.id);
    }

    ghost = element.cloneNode(true);
    ghost.classList.add("is-dragging");
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.transform = "none";
    document.body.appendChild(ghost);

    element.classList.add("is-drag-origin");
    hideNameTooltip(element);

    element.setPointerCapture(pointerId);
    highlightSlotAt(currentX, currentY);

    event.preventDefault();
  });

  element.addEventListener("pointermove", event => {
    if (!dragging || event.pointerId !== pointerId) return;

    currentX = event.clientX;
    currentY = event.clientY;

    if (ghost) {
      ghost.style.left = `${currentX - shiftX}px`;
      ghost.style.top = `${currentY - shiftY}px`;
    }

    highlightSlotAt(currentX, currentY);
  });

  const finish = event => {
    if (!dragging || event.pointerId !== pointerId) return;

    dragging = false;
    state.draggingId = null;

    const dropIndex = getSlotIndexFromPoint(currentX, currentY);

    clearSlotHighlights();

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    element.classList.remove("is-drag-origin");

    moveItem(item, startLocation, startShelfIndex, dropIndex);

    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    renderTray();
    renderSlots();
    updateSubmitState();

    pointerId = null;
    startLocation = null;
    startShelfIndex = -1;
  };

  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

function moveItem(item, startLocation, startShelfIndex, dropIndex) {
  const prevIndex = state.slots.findIndex(s => s && s.id === item.id);

  if (dropIndex === -1) {
    if (prevIndex !== -1) {
      state.slots[prevIndex] = null;
    }

    if (startLocation === "shelf" && startShelfIndex !== -1) {
      state.slots[startShelfIndex] = item;
    }

    return;
  }

  const occupyingItem = state.slots[dropIndex];

  if (prevIndex !== -1) {
    state.slots[prevIndex] = null;
  }

  if (
    occupyingItem &&
    occupyingItem.id !== item.id &&
    !state.lockedIds.has(occupyingItem.id)
  ) {
    if (
      startLocation === "shelf" &&
      startShelfIndex !== -1 &&
      startShelfIndex !== dropIndex
    ) {
      state.slots[startShelfIndex] = occupyingItem;
    }
  }

  state.slots[dropIndex] = item;
}

function highlightSlotAt(x, y) {
  clearSlotHighlights();
  const index = getSlotIndexFromPoint(x, y);
  if (index !== -1) {
    slotEls[index].classList.add("is-drop-target");
  }
}

function clearSlotHighlights() {
  slotEls.forEach(slot => slot.classList.remove("is-drop-target"));
}

function getSlotIndexFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return -1;

  const slot = el.closest(".shelf-slot");
  if (slot) {
    return slotEls.indexOf(slot);
  }

  return slotEls.findIndex(slotEl => {
    const rect = slotEl.getBoundingClientRect();
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  });
}

function wireSubmit() {
  submitButton.textContent = "submit";
  submitButton.disabled = true;
  submitButton.onclick = handleSubmit;
}

function updateSubmitState() {
  const allFilled = state.slots.every(Boolean);
  submitButton.disabled = !allFilled;
}

function handleSubmit() {
  if (!state.slots.every(Boolean)) {
    statusEl.textContent = "Drag all 7 items onto the shelf before submitting.";
    return;
  }

  const correctOrder = [...state.items].sort((a, b) => b.price - a.price);
  const rowResult = [];
  let correctCount = 0;

  clearAllPriceStrips();

  state.slots.forEach((item, index) => {
    const slotEl = slotEls[index];

    if (!item) {
      slotEl.classList.remove("is-correct", "is-wrong");
      rowResult.push("⬜");
      return;
    }

    const isCorrect = item.id === correctOrder[index].id;

    slotEl.classList.remove("is-correct", "is-wrong");
    slotEl.classList.add(isCorrect ? "is-correct" : "is-wrong");

    if (isCorrect) {
      state.lockedIds.add(item.id);
      rowResult.push("🟩");
      correctCount += 1;
      showPriceStrip(index, item);
    } else {
      rowResult.push("🟥");
      state.slots[index] = null;
    }
  });

  state.history.push(rowResult.join(""));

  const solved = state.lockedIds.size === state.items.length;

  if (solved) {
    turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
    statusEl.textContent = `Perfect shelf! You solved today's Shelfie in ${state.attempt} turn${
      state.attempt === 1 ? "" : "s"
    }.`;
    submitButton.textContent = "share";
    submitButton.disabled = false;
    submitButton.onclick = shareResults;
    renderTray();
    renderSlots();
    return;
  }

  if (state.attempt >= state.maxAttempts) {
    turnsEl.textContent = `Turn ${state.maxAttempts} of ${state.maxAttempts}`;
    statusEl.textContent = `No more turns. You got ${correctCount} of ${state.items.length} correct. Come back tomorrow for a new Shelfie.`;
    submitButton.textContent = "share";
    submitButton.disabled = false;
    submitButton.onclick = shareResults;
    renderTray();
    renderSlots();
    return;
  }

  state.attempt += 1;
  turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
  statusEl.textContent = `${correctCount} of ${state.items.length} correct. Green items are locked. Move the red ones and submit again.`;

  renderTray();
  renderSlots();
  updateSubmitState();
}

function showPriceStrip(index, item) {
  const strip = priceStripEls[index];
  if (!strip) return;

  strip.className = "price-strip";
  strip.style.display = "flex";
  strip.style.flexDirection = "column";
  strip.style.justifyContent = "center";
  strip.style.alignItems = "flex-start";
  strip.style.padding = "6px 8px";
  strip.style.marginLeft = "6px";
  strip.style.borderRadius = "12px";
  strip.style.background = "linear-gradient(180deg, #ffffff 0%, #f6fff9 100%)";
  strip.style.boxShadow = "0 3px 8px rgba(0, 0, 0, 0.14)";
  strip.style.minWidth = "120px";

  const nameEl = document.createElement("div");
  nameEl.textContent = item.name;
  nameEl.style.fontSize = "0.75rem";
  nameEl.style.fontWeight = "600";
  nameEl.style.marginBottom = "2px";

  const storeEl = document.createElement("div");
  storeEl.textContent = item.store;
  storeEl.style.fontSize = "0.7rem";
  storeEl.style.color = "#666";

  const priceEl = document.createElement("div");
  priceEl.textContent = `$${item.price.toFixed(2)}`;
  priceEl.style.fontSize = "1.1rem";
  priceEl.style.fontWeight = "800";
  priceEl.style.marginTop = "4px";
  priceEl.style.color = "#149c3a";

  strip.appendChild(nameEl);
  strip.appendChild(storeEl);
  strip.appendChild(priceEl);
}

async function shareResults() {
  const solved = state.lockedIds.size === state.items.length;
  const headline = solved
    ? `Shelfie ${state.puzzleDate} ${state.history.length}/${state.maxAttempts}`
    : `Shelfie ${state.puzzleDate} X/${state.maxAttempts}`;

  const text = [headline, ...state.history, window.location.href].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Shelfie",
        text
      });
      statusEl.textContent = "Shared.";
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      statusEl.textContent = "Result copied to clipboard.";
      return;
    }

    statusEl.textContent = text;
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Could not share right now.";
  }
}

function getBrisbaneDateString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Fisher–Yates shuffle to randomize tray order fairly
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}