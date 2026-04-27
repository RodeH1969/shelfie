const gameDateEl = document.getElementById("game-date");
const slotEls = Array.from(document.querySelectorAll(".shelf-slot"));
const priceStripEls = Array.from(document.querySelectorAll(".price-strip"));
const traySlotEls = Array.from(document.querySelectorAll(".tray-slot"));
const turnsEl = document.getElementById("turns");
const statusEl = document.getElementById("status-message");
const submitButton = document.getElementById("submit-button");

const DRAG_THRESHOLD = 10;
const RESULT_FLASH_MS = 2000;

const state = {
  maxAttempts: 6,
  attempt: 1,
  puzzleDate: "",
  puzzleLabel: "",
  items: [],
  trayOrder: [],
  slots: new Array(7).fill(null),
  lockedIds: new Set(),              // permanent anchors already won
  history: [],
  draggingId: null,
  openTooltipId: null,
  alreadyPlayedToday: false,
  selectedLockIds: new Set(),        // locks chosen for this turn
  resolvingTurn: false
};

function getDailyPlayKey(dateString) {
  return `shelfie-played-${dateString}`;
}

function hasPlayedToday(dateString) {
  try {
    return localStorage.getItem(getDailyPlayKey(dateString)) !== null;
  } catch (error) {
    console.warn("localStorage unavailable:", error);
    return false;
  }
}

function savePlayedToday(dateString, data = {}) {
  try {
    localStorage.setItem(
      getDailyPlayKey(dateString),
      JSON.stringify({
        playedAt: new Date().toISOString(),
        ...data
      })
    );
  } catch (error) {
    console.warn("Could not save daily play lock:", error);
  }
}

function lockGameForToday(message = "You’ve already played today’s Shelfie. Come back tomorrow.") {
  state.alreadyPlayedToday = true;
  state.lockedIds = new Set(state.items.map(item => item.id));
  state.draggingId = null;
  state.selectedLockIds = new Set();

  clearAllPriceStrips();
  renderTray();
  renderSlots();

  submitButton.disabled = true;
  submitButton.textContent = "played";
  submitButton.onclick = null;

  statusEl.textContent = message;
}

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

    state.items = puzzle.items.map((item, index) => ({
      id: `${slugify(item.name)}-${index}`,
      name: item.name,
      store: item.store,
      price: Number(item.price),
      image: item.image,
      lockAvailable: true
    }));

    state.trayOrder = [...state.items];
    shuffleArray(state.trayOrder);

    state.slots = new Array(state.items.length).fill(null);

    gameDateEl.textContent = `Game: ${state.puzzleLabel}`;
    turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
    statusEl.textContent = "Drag all 7 items onto the shelf, then press submit.";

    clearAllPriceStrips();
    ensureImageViewer();
    ensureRulesModal();
    wireSubmit();
    wireGlobalTapClose();

    if (hasPlayedToday(state.puzzleDate)) {
      lockGameForToday("You’ve already played today’s Shelfie. Come back tomorrow.");
      return;
    }

    renderTray();
    renderSlots();
    updateSubmitState();
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

    const item = state.trayOrder[row];
    if (!item) return;

    const onShelfIndex = state.slots.findIndex(s => s && s.id === item.id);
    const isPermanent = state.lockedIds.has(item.id);

    if (onShelfIndex !== -1 || isPermanent) {
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

  if (
    !inTray &&
    state.selectedLockIds.has(item.id) &&
    !state.lockedIds.has(item.id)
  ) {
    const lockBadge = document.createElement("div");
    lockBadge.className = "item-lock-button is-selected item-lock-badge";
    lockBadge.setAttribute("aria-hidden", "true");
    lockBadge.textContent = "🔒";
    button.appendChild(lockBadge);
  }

  if (
    inTray &&
    !state.lockedIds.has(item.id) &&
    !state.alreadyPlayedToday &&
    !state.resolvingTurn &&
    item.lockAvailable
  ) {
    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = "item-lock-button";
    lockButton.setAttribute("aria-label", `Lock ${item.name} this turn`);
    lockButton.setAttribute(
      "aria-pressed",
      state.selectedLockIds.has(item.id) ? "true" : "false"
    );
    lockButton.textContent = "🔒";

    if (state.selectedLockIds.has(item.id)) {
      lockButton.classList.add("is-selected");
    }

    lockButton.addEventListener("pointerdown", event => {
      event.stopPropagation();
    });

    lockButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectLock(item.id);
    });

    button.appendChild(lockButton);
  }

  if (!state.lockedIds.has(item.id) && !state.alreadyPlayedToday && !state.resolvingTurn) {
    attachPointerDrag(button, item, inTray);
  } else if (state.lockedIds.has(item.id) || state.alreadyPlayedToday || state.resolvingTurn) {
    if (state.lockedIds.has(item.id)) {
      button.classList.add("is-locked");
    }
    if (state.alreadyPlayedToday || state.resolvingTurn || state.lockedIds.has(item.id)) {
      button.disabled = !!state.lockedIds.has(item.id);
    }
  }

  if (inTray && !state.alreadyPlayedToday) {
    button.title = item.name;

    button.addEventListener("mouseenter", () => {
      if (!isTouchLike()) showNameTooltip(button, item);
    });
    button.addEventListener("mouseleave", () => {
      if (!isTouchLike()) hideNameTooltip(button);
    });
    button.addEventListener("focus", () => showNameTooltip(button, item));
    button.addEventListener("blur", () => hideNameTooltip(button));
  }

  return button;
}

function showNameTooltip(button, item) {
  hideAllTooltips();

  const wrapper = button.closest(".tray-slot");
  if (!wrapper) return;

  const tip = document.createElement("div");
  tip.className = "product-tooltip";
  tip.textContent = item.name;
  wrapper.appendChild(tip);
  state.openTooltipId = item.id;
}

function hideNameTooltip(button) {
  const wrapper = button.closest(".tray-slot");
  if (!wrapper) return;

  const tip = wrapper.querySelector(".product-tooltip");
  if (tip) tip.remove();

  if (button.dataset.itemId === state.openTooltipId) {
    state.openTooltipId = null;
  }
}

function hideAllTooltips() {
  document.querySelectorAll(".product-tooltip").forEach(tip => tip.remove());
  state.openTooltipId = null;
}

function wireGlobalTapClose() {
  document.addEventListener("pointerdown", event => {
    const insideCard = event.target.closest(".product-card");
    const insideTooltip = event.target.closest(".product-tooltip");
    const insideViewer = event.target.closest(".image-viewer-dialog");
    const insideRules = event.target.closest(".rules-modal-dialog");
    if (!insideCard && !insideTooltip && !insideViewer && !insideRules) {
      hideAllTooltips();
    }
  });
}

function attachPointerDrag(element, item, inTray) {
  let pointerId = null;
  let startLocation = null;
  let startShelfIndex = -1;
  let ghost = null;
  let shiftX = 0;
  let shiftY = 0;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let pointerType = "mouse";
  let dragging = false;
  let movedEnough = false;

  element.style.touchAction = "none";

  element.addEventListener("pointerdown", event => {
    if (state.lockedIds.has(item.id) || state.alreadyPlayedToday || state.resolvingTurn) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest(".item-lock-button")) return;

    const rect = element.getBoundingClientRect();

    pointerId = event.pointerId;
    pointerType = event.pointerType || "mouse";
    dragging = true;
    movedEnough = false;
    state.draggingId = item.id;

    startX = currentX = event.clientX;
    startY = currentY = event.clientY;
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

    element.setPointerCapture(pointerId);
    event.preventDefault();
  });

  element.addEventListener("pointermove", event => {
    if (!dragging || event.pointerId !== pointerId) return;

    currentX = event.clientX;
    currentY = event.clientY;

    const dx = currentX - startX;
    const dy = currentY - startY;
    const distance = Math.hypot(dx, dy);

    if (!movedEnough && distance >= DRAG_THRESHOLD) {
      movedEnough = true;
      hideAllTooltips();

      const rect = element.getBoundingClientRect();

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

      const ghostLock = ghost.querySelector(".item-lock-button");
      if (ghostLock) {
        ghostLock.remove();
      }

      document.body.appendChild(ghost);

      element.classList.add("is-drag-origin");
    }

    if (!movedEnough) return;

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

    if (!movedEnough) {
      if (pointerType === "touch" && inTray) {
        openImageViewer(item);
      } else if (pointerType === "mouse" && inTray) {
        showNameTooltip(element, item);
      }

      cleanupDrag(element, ghost, pointerId);
      ghost = null;
      resetTracking();
      return;
    }

    const dropIndex = getSlotIndexFromPoint(currentX, currentY);

    clearSlotHighlights();
    moveItem(item, startLocation, startShelfIndex, dropIndex);

    cleanupDrag(element, ghost, pointerId);
    ghost = null;

    renderTray();
    renderSlots();
    updateSubmitState();

    resetTracking();
  };

  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);

  function cleanupDrag(elementRef, ghostRef, activePointerId) {
    clearSlotHighlights();

    if (ghostRef) {
      ghostRef.remove();
    }

    elementRef.classList.remove("is-drag-origin");

    if (elementRef.hasPointerCapture(activePointerId)) {
      elementRef.releasePointerCapture(activePointerId);
    }
  }

  function resetTracking() {
    pointerId = null;
    startLocation = null;
    startShelfIndex = -1;
    movedEnough = false;
  }
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
  if (state.alreadyPlayedToday || state.resolvingTurn) {
    submitButton.disabled = true;
    return;
  }

  const allFilled = state.slots.every(Boolean);
  submitButton.disabled = !allFilled;
}

function handleSubmit() {
  if (state.alreadyPlayedToday) {
    statusEl.textContent = "You’ve already played today’s Shelfie. Come back tomorrow.";
    submitButton.disabled = true;
    return;
  }

  if (state.resolvingTurn) {
    return;
  }

  if (!state.slots.every(Boolean)) {
    statusEl.textContent = "Drag all 7 items onto the shelf before submitting.";
    return;
  }

  const correctOrder = [...state.items].sort((a, b) => b.price - a.price);
  const rowResult = [];
  let correctCount = 0;

  const selectedLockIds = new Set(state.selectedLockIds);
  const lockCorrectMap = new Map();
  const lockSlotMap = new Map();

  clearAllPriceStrips();
  state.resolvingTurn = true;
  updateSubmitState();

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

    rowResult.push(isCorrect ? "🟩" : "🟥");

    if (isCorrect) {
      correctCount += 1;
    }

    if (selectedLockIds.has(item.id)) {
      lockCorrectMap.set(item.id, isCorrect);
      lockSlotMap.set(item.id, index);
    }
  });

  state.history.push(buildShareRow(rowResult, lockSlotMap, lockCorrectMap));

  setTimeout(() => {
    const keptLockedIds = new Set(state.lockedIds);

    lockCorrectMap.forEach((wasCorrect, id) => {
      const lockedItem = state.items.find(i => i.id === id);
      if (!lockedItem) return;

      lockedItem.lockAvailable = false;

      if (wasCorrect) {
        keptLockedIds.add(id);
      }
    });

    const solved = correctCount === state.items.length;

    if (solved) {
      state.lockedIds = new Set(state.items.map(item => item.id));

      state.slots.forEach((item, index) => {
        if (item) {
          showPriceStrip(index, item);
        }
      });

      turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;
      statusEl.textContent = `Perfect shelf! You solved today's Shelfie in ${state.attempt} turn${
        state.attempt === 1 ? "" : "s"
      }.`;
      submitButton.textContent = "share";
      submitButton.disabled = false;
      submitButton.onclick = shareResults;

      savePlayedToday(state.puzzleDate, {
        result: "solved",
        attemptsUsed: state.attempt,
        history: state.history
      });

      clearTurnLocks();
      state.resolvingTurn = false;
      renderTray();
      renderSlots();
      return;
    }

    const newSlots = new Array(state.items.length).fill(null);

    state.slots.forEach((item, index) => {
      if (!item) return;

      if (keptLockedIds.has(item.id)) {
        newSlots[index] = item;
        showPriceStrip(index, item);
      }
    });

    state.lockedIds = keptLockedIds;
    state.slots = newSlots;

    if (state.attempt >= state.maxAttempts) {
      turnsEl.textContent = `Turn ${state.maxAttempts} of ${state.maxAttempts}`;
      statusEl.textContent = `No more turns. You got ${correctCount} of ${state.items.length} correct. Come back tomorrow for a new Shelfie.`;
      submitButton.textContent = "share";
      submitButton.disabled = false;
      submitButton.onclick = shareResults;

      savePlayedToday(state.puzzleDate, {
        result: "failed",
        attemptsUsed: state.maxAttempts,
        history: state.history
      });

      clearTurnLocks();
      state.resolvingTurn = false;
      renderTray();
      renderSlots();
      return;
    }

    state.attempt += 1;
    turnsEl.textContent = `Turn ${state.attempt} of ${state.maxAttempts}`;

    const locksUsed = selectedLockIds.size;
    const locksHeld = Array.from(lockCorrectMap.values()).filter(Boolean).length;
    const locksLost = locksUsed - locksHeld;

    if (locksUsed > 0) {
      statusEl.textContent = `${locksHeld} locked item${locksHeld === 1 ? "" : "s"} held, ${locksLost} lock${locksLost === 1 ? "" : "s"} lost.`;
    } else {
      statusEl.textContent = "No locks used. All unresolved items return to the pool.";
    }

    clearTurnLocks();
    state.resolvingTurn = false;
    renderTray();
    renderSlots();
    updateSubmitState();
  }, RESULT_FLASH_MS);
}

function showPriceStrip(index, item) {
  const strip = priceStripEls[index];
  if (!strip) return;

  strip.className = "price-strip";
  strip.style.display = "flex";
  strip.style.flexDirection = "column";
  strip.style.justifyContent = "center";
  strip.style.alignItems = "flex-start";
  strip.style.padding = "3px 4px";
  strip.style.marginLeft = "1px";
  strip.style.borderRadius = "8px";
  strip.style.background = "linear-gradient(180deg, #ffffff 0%, #f6fff9 100%)";
  strip.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.12)";
  strip.style.minWidth = "0";

  const nameEl = document.createElement("div");
  nameEl.textContent = item.name;
  nameEl.style.fontSize = "0.52rem";
  nameEl.style.fontWeight = "700";
  nameEl.style.lineHeight = "1.05";
  nameEl.style.marginBottom = "1px";

  const storeEl = document.createElement("div");
  storeEl.textContent = item.store;
  storeEl.style.fontSize = "0.5rem";
  storeEl.style.color = "#666";
  storeEl.style.lineHeight = "1.05";

  const priceEl = document.createElement("div");
  priceEl.textContent = `$${item.price.toFixed(2)}`;
  priceEl.style.fontSize = "0.76rem";
  priceEl.style.fontWeight = "800";
  priceEl.style.marginTop = "2px";
  priceEl.style.color = "#149c3a";
  priceEl.style.lineHeight = "1";

  strip.appendChild(nameEl);
  strip.appendChild(storeEl);
  strip.appendChild(priceEl);
}

function ensureImageViewer() {
  if (document.getElementById("image-viewer")) return;

  const viewer = document.createElement("div");
  viewer.id = "image-viewer";
  viewer.className = "image-viewer";
  viewer.hidden = true;
  viewer.innerHTML = `
    <div class="image-viewer-backdrop" data-close-viewer="true"></div>
    <div class="image-viewer-dialog" role="dialog" aria-modal="true" aria-label="Product image viewer">
      <button type="button" class="image-viewer-close" aria-label="Close image viewer" data-close-viewer="true">×</button>
      <img class="image-viewer-img" alt="">
      <div class="image-viewer-meta">
        <div class="image-viewer-name"></div>
        <div class="image-viewer-store"></div>
      </div>
    </div>
  `;

  document.body.appendChild(viewer);

  viewer.addEventListener("click", event => {
    if (event.target.closest("[data-close-viewer='true']")) {
      closeImageViewer();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeImageViewer();
    }
  });
}

function openImageViewer(item) {
  const viewer = document.getElementById("image-viewer");
  if (!viewer) return;

  viewer.querySelector(".image-viewer-img").src = item.image;
  viewer.querySelector(".image-viewer-img").alt = item.name;
  viewer.querySelector(".image-viewer-name").textContent = item.name;
  viewer.querySelector(".image-viewer-store").textContent = item.store;

  viewer.hidden = false;
  document.body.classList.add("viewer-open");
}

function closeImageViewer() {
  const viewer = document.getElementById("image-viewer");
  if (!viewer) return;

  viewer.hidden = true;
  document.body.classList.remove("viewer-open");
}

function ensureRulesModal() {
  const rulesButton = document.getElementById("rules-button");
  const rulesModal = document.getElementById("rules-modal");

  if (!rulesButton || !rulesModal) return;

  rulesButton.addEventListener("click", () => {
    openRulesModal();
    rulesButton.setAttribute("aria-expanded", "true");
  });

  rulesModal.addEventListener("click", event => {
    if (event.target.closest("[data-close-rules='true']")) {
      closeRulesModal();
      rulesButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !rulesModal.hidden) {
      closeRulesModal();
      rulesButton.setAttribute("aria-expanded", "false");
    }
  });
}

function openRulesModal() {
  const rulesModal = document.getElementById("rules-modal");
  if (!rulesModal) return;
  rulesModal.hidden = false;
  document.body.classList.add("viewer-open");
}

function closeRulesModal() {
  const rulesModal = document.getElementById("rules-modal");
  if (!rulesModal) return;
  rulesModal.hidden = true;
  document.body.classList.remove("viewer-open");
}

function getShareHeadline(turnsUsed, gameDate) {
  if (turnsUsed === 1) {
    return `Shelfie ${gameDate}\nLEGENDary: Got it in 1 go! 🔥`;
  }
  if (turnsUsed === 2) {
    return `Shelfie ${gameDate}\nPretty Pretty Good: Got it 2nd attempt. 👑`;
  }
  if (turnsUsed === 3) {
    return `Shelfie ${gameDate}\nNot bad. 3 times a charm. 💐`;
  }
  if (turnsUsed === 4) {
    return `Shelfie ${gameDate}\nThanks for playing. 4 aint bad. 🫂`;
  }
  if (turnsUsed === 5) {
    return `Shelfie ${gameDate}\nDo you shop ever? Took you 5 goes. 🍋`;
  }
  return `Shelfie ${gameDate}\nGo see a doctor, right now? 6 tries. 🩺`;
}

async function shareResults() {
  const solved = state.lockedIds.size === state.items.length;
  const turnsUsed = solved ? state.history.length : state.maxAttempts;
  const headline = solved
    ? getShareHeadline(turnsUsed, state.puzzleDate)
    : `Shelfie ${state.puzzleDate}\nX/${state.maxAttempts}`;

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

function selectLock(itemId) {
  if (state.resolvingTurn || state.alreadyPlayedToday) return;
  if (state.lockedIds.has(itemId)) return;

  const item = state.items.find(i => i.id === itemId);
  if (!item || !item.lockAvailable) return;

  if (state.selectedLockIds.has(itemId)) {
    state.selectedLockIds.delete(itemId);
  } else {
    state.selectedLockIds.add(itemId);
  }

  renderTray();
  renderSlots();
  updateSubmitState();
}

function clearTurnLocks() {
  state.selectedLockIds = new Set();
}

/**
 * Build a single share row:
 *   - rowResult: array of "🟩"/"🟥"/"⬜"
 *   - lockSlotMap: Map(itemId -> slotIndex) for locks used this turn
 * We ignore right/wrong for locks in the emoji row and just mark the slots with "🔒".
 */
function buildShareRow(rowResult, lockSlotMap, lockCorrectMap) {
  const lockedSlots = new Set(lockSlotMap ? [...lockSlotMap.values()] : []);

  return rowResult
    .map((cell, index) => (lockedSlots.has(index) ? "🔒" : cell))
    .join("");
}

function isTouchLike() {
  return window.matchMedia("(hover: none)").matches;
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

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}