const gameDateEl = document.getElementById("game-date");
const slotEls = Array.from(document.querySelectorAll(".shelf-slot"));
const priceStripEls = Array.from(
  document.querySelectorAll(".price-strip")
);
const traySlotEls = Array.from(
  document.querySelectorAll(".tray-slot")
);
const turnsEl = document.getElementById("turns");
const statusEl = document.getElementById("status-message");
const submitButton = document.getElementById("submit-button");

const state = {
  maxAttempts: 6,
  attempt: 1,
  puzzleDate: "",
  puzzleLabel: "",
  items: [],
  // slots[index] = item or null, where index is shelf row (0–6)
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
      statusEl.textContent =
        "No Shelfie puzzle is scheduled for today yet.";
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

    // items have fixed homeRow 0–6 for tray alignment
    state.items = puzzle.items.map((item, index) => ({
      id: `${slugify(item.name)}-${index}`,
      name: item.name,
      store: item.store,
      price: Number(item.price),
      image: item.image,
      homeRow: index
    }));

    state.slots = new Array(state.items.length).fill(null);

    gameDateEl.textContent = `Game: ${state.puzzleLabel}`;
    turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
    statusEl.textContent =
      "Drag all 7 items onto the shelf, then press submit.";

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

/**
 * TRAY RENDERING
 * Each tray-row shows its "homeRow" item if that item is NOT locked and NOT currently on the shelf.
 */
function renderTray() {
  traySlotEls.forEach((trayEl, row) => {
    trayEl.innerHTML = "";
    trayEl.className = "tray-slot";

    const item = state.items[row];
    if (!item) return;

    const onShelfIndex = state.slots.findIndex(
      s => s && s.id === item.id
    );
    const isLocked = state.lockedIds.has(item.id);

    if (onShelfIndex !== -1 || isLocked) {
      // This row's item is on shelf or locked => tray row empty
      return;
    }

    const card = createCard(item, /* inTray */ true);
    trayEl.appendChild(card);
  });
}

/**
 * SHELF RENDERING
 */
function renderSlots() {
  slotEls.forEach((slotEl, index) => {
    slotEl.innerHTML = "";
    slotEl.classList.remove(
      "is-correct",
      "is-wrong",
      "is-drop-target"
    );

    const item = state.slots[index];
    if (!item) return;

    const card = createCard(item, /* inTray */ false);
    if (state.lockedIds.has(item.id)) {
      card.classList.add("is-locked");
      card.disabled = true;
    }
    slotEl.appendChild(card);
  });
}

/**
 * CARD CREATION
 * inTray = true => hover tooltip with name
 */
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

  // Tray-only name tooltip (no price)
  if (inTray) {
    button.title = item.name; // native fallback
    button.addEventListener("mouseenter", () =>
      showNameTooltip(button, item)
    );
    button.addEventListener("mouseleave", () =>
      hideNameTooltip(button)
    );
    button.addEventListener("focus", () =>
      showNameTooltip(button, item)
    );
    button.addEventListener("blur", () =>
      hideNameTooltip(button)
    );
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

/**
 * POINTER DRAG
 * Keeps track of:
 * - startLocation: "tray" or "shelf"
 * - startShelfIndex: if started on shelf
 */
function attachPointerDrag(element, item) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  // Where the drag began
  let startLocation = null; // "tray" or "shelf"
  let startShelfIndex = -1;

  element.style.position = "relative";

  element.addEventListener("pointerdown", event => {
    if (state.lockedIds.has(item.id)) return;

    pointerId = event.pointerId;
    dragging = true;
    state.draggingId = item.id;
    startX = event.clientX;
    startY = event.clientY;

    // Figure out if this card started in tray or shelf
    const trayWrapper = element.closest(".tray-slot");
    if (trayWrapper) {
      startLocation = "tray";
      startShelfIndex = -1;
    } else {
      const shelfIndex = state.slots.findIndex(
        s => s && s.id === item.id
      );
      startLocation = "shelf";
      startShelfIndex = shelfIndex;
    }

    element.setPointerCapture(pointerId);
    element.classList.add("is-dragging");
    hideNameTooltip(element);
  });

  element.addEventListener("pointermove", event => {
    if (!dragging || event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    element.style.transform = `translate(${dx}px, ${dy}px)`;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    highlightSlotAt(centerX, centerY);
  });

  const finish = event => {
    if (!dragging || event.pointerId !== pointerId) return;

    dragging = false;
    state.draggingId = null;
    clearSlotHighlights();

    element.classList.remove("is-dragging");
    element.style.transform = "";

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dropIndex = getSlotIndexFromPoint(centerX, centerY);

    // If we dropped on a shelf row:
    if (dropIndex !== -1) {
      // Make room if needed (swap out non-locked item)
      const occupyingItem = state.slots[dropIndex];
      if (
        occupyingItem &&
        !state.lockedIds.has(occupyingItem.id)
      ) {
        // If drag started on shelf somewhere else, put the occupying item back there.
        if (startLocation === "shelf" && startShelfIndex !== -1) {
          state.slots[startShelfIndex] = occupyingItem;
        } else {
          // Otherwise occupying item returns to its tray row (we simply remove it from shelf)
          const occIndex = state.slots.findIndex(
            s => s && s.id === occupyingItem.id
          );
          if (occIndex !== -1) {
            state.slots[occIndex] = null;
          }
        }
      }

      // Remove this item from any shelf row it previously occupied
      const prevIndex = state.slots.findIndex(
        s => s && s.id === item.id
      );
      if (prevIndex !== -1) {
        state.slots[prevIndex] = null;
      }

      // Place item into new shelf row
      state.slots[dropIndex] = item;
    } else {
      // Not dropped on shelf: return to original place
      if (startLocation === "shelf" && startShelfIndex !== -1) {
        state.slots[startShelfIndex] = item;
      } else {
        // started in tray => ensure it's not left in any shelf row
        const prevIndex = state.slots.findIndex(
          s => s && s.id === item.id
        );
        if (prevIndex !== -1) {
          state.slots[prevIndex] = null;
        }
      }
    }

    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    renderTray();
    renderSlots();
    updateSubmitState();

    pointerId = null;
  };

  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

/**
 * DROP TARGET HELPERS
 */
function highlightSlotAt(x, y) {
  clearSlotHighlights();
  const index = getSlotIndexFromPoint(x, y);
  if (index > -1) {
    slotEls[index].classList.add("is-drop-target");
  }
}

function clearSlotHighlights() {
  slotEls.forEach(slot =>
    slot.classList.remove("is-drop-target")
  );
}

function getSlotIndexFromPoint(x, y) {
  return slotEls.findIndex(slot => {
    const rect = slot.getBoundingClientRect();
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  });
}

/**
 * SUBMIT / GAME LOGIC
 */
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
    statusEl.textContent =
      "Drag all 7 items onto the shelf before submitting.";
    return;
  }

  const correctOrder = [...state.items].sort(
    (a, b) => b.price - a.price
  );
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
      // wrong slots cleared; their items will show back in tray rows
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

/**
 * PRICE STRIP FOR CORRECT ITEMS
 */
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
  strip.style.background =
    "linear-gradient(180deg, #ffffff 0%, #f6fff9 100%)";
  strip.style.boxShadow =
    "0 3px 8px rgba(0, 0, 0, 0.14)";
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

/**
 * SHARE STRING
 */
async function shareResults() {
  const solved = state.lockedIds.size === state.items.length;
  const headline = solved
    ? `Shelfie ${state.puzzleDate} ${state.history.length}/${state.maxAttempts}`
    : `Shelfie ${state.puzzleDate} X/${state.maxAttempts}`;

  const text = [headline, ...state.history, window.location.href].join(
    "\n"
  );

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

/**
 * UTILITIES
 */
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