/* ============================================================
   TROLLEY — Game Logic (Ranking Mechanic)
   
   For each product: player drags store rows to rank them
   1st (cheapest) → 2nd → 3rd (most expensive).
   All prices hidden during ranking.
   Confirm reveals all 3 products simultaneously.
   3×3 grid scoring: green = correct position, red = wrong.
   ============================================================ */

const STORE_NAMES = { aldi:'ALDI', coles:'Coles', woolworths:'Woolworths' };

/* ---- State ---- */
const G = {
  puzzle:   null,
  rankings: {},   // { productIdx: ['aldi','coles','woolworths'] } ordered 1st→3rd
  results:  null,
};

/* ---- Drag state ---- */
let drag = {
  active: false,
  el: null,         // the row being dragged
  pIdx: null,       // product index
  startY: 0,
  currentY: 0,
  originIndex: 0,   // original position in list
  placeholder: null,
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getSavedTheme());
  wireThemeToggles();

  // Inject real logos into all screens
  document.querySelectorAll('.top-bar-logo').forEach(el => { el.src = LOGOS.shelfie; });
  document.getElementById('introGameLogo').src  = LOGOS.shelfie;
  document.getElementById('introAldi').src       = LOGOS.aldi;
  document.getElementById('introColes').src      = LOGOS.coles;
  document.getElementById('introWoolworths').src = LOGOS.woolworths;

  G.puzzle = getTodayPuzzle();

  const dateStr = formatDate(G.puzzle.date);
  document.querySelectorAll('.date-pill').forEach(el => el.textContent = dateStr);
  document.getElementById('introPill').textContent = dateStr;
  document.getElementById('introPuzzleNum').textContent = `#${G.puzzle.puzzleNum}`;
  document.getElementById('introDisclaimer').textContent =
    `Prices as of ${G.puzzle.date} — for entertainment purposes.`;

  renderIntroStreak();

  const saved = loadTodayResult();
  if (saved) {
    G.rankings = saved.rankings;
    G.results  = saved.results;
    showScreen('screenResults');
    renderResults();
    return;
  }

  document.getElementById('btnPlay').addEventListener('click', () => {
    showScreen('screenPicks');
    renderPicks();
  });

  document.getElementById('btnConfirm').addEventListener('click', confirmPicks);
  document.getElementById('btnResults').addEventListener('click', () => {
    showScreen('screenResults');
    renderResults();
  });
});

/* ============================================================
   SCREENS
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

/* ============================================================
   PICKS SCREEN — Drag-to-rank
   ============================================================ */
function renderPicks() {
  const body = document.getElementById('picksBody');
  body.innerHTML = '';
  updateProgress();

  G.puzzle.products.forEach((product, pIdx) => {
    // Initial order: seeded shuffle so it's not always Aldi/Coles/Woolies
    const initOrder = seededShuffle(
      product.stores.map(s => s.id),
      seededRng(dateToSeed(G.puzzle.date) + pIdx * 997)
    );
    G.rankings[pIdx] = [...initOrder]; // start with shuffled order

    const card = document.createElement('div');
    card.className = 'product-card slide-up';
    card.style.animationDelay = `${pIdx * 80}ms`;

    const flashBadge = product.isFlash
      ? `<span class="flash-pick-badge">⚡ Flash Special</span>` : '';

    card.innerHTML = `
      <div class="product-header">
        <span class="product-emoji">${product.emoji}</span>
        <div>
          <div class="product-name">${product.name}${flashBadge}</div>
          <div class="product-unit">Rank cheapest → most expensive</div>
        </div>
      </div>
      <div class="rank-instruction">
        <span class="rank-arrow">↕</span> Drag to reorder — prices hidden
      </div>
      <div class="store-rank-list" id="rankList-${pIdx}" data-pid="${pIdx}">
        ${initOrder.map((sid, pos) => buildRankRow(sid, pos, product)).join('')}
      </div>
    `;
    body.appendChild(card);

    wireRankList(pIdx);
  });

  updateProgress();
  checkConfirmReady();
}

function buildRankRow(sid, pos, product) {
  const store = product.stores.find(s => s.id === sid);
  return `
    <div class="rank-row" data-sid="${sid}" draggable="false">
      <div class="rank-badge">${pos + 1}</div>
      <img class="store-logo-img" src="${LOGOS[sid]}" alt="${STORE_NAMES[sid]}"/>
      <div class="store-info">
        <div class="store-brand">${store.brand}</div>
        <div class="store-size">${store.size}</div>
      </div>
      <div class="rank-handle" aria-label="Drag to reorder">⠿</div>
    </div>
  `;
}

/* ---- Wire drag-to-reorder for a product list ---- */
function wireRankList(pIdx) {
  const list = document.getElementById(`rankList-${pIdx}`);
  const rows = () => [...list.querySelectorAll('.rank-row')];

  let draggingEl = null;
  let startY = 0;
  let startScrollY = 0;
  let originRect = null;
  let placeholder = null;

  function getRowHeight() {
    const r = list.querySelector('.rank-row');
    return r ? r.offsetHeight : 64;
  }

  function buildPlaceholder(h) {
    const p = document.createElement('div');
    p.className = 'rank-placeholder';
    p.style.height = h + 'px';
    return p;
  }

  function getInsertIndex(clientY) {
    const siblings = rows().filter(r => r !== draggingEl && !r.classList.contains('rank-placeholder'));
    let idx = siblings.length;
    for (let i = 0; i < siblings.length; i++) {
      const rect = siblings[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { idx = i; break; }
    }
    return idx;
  }

  function insertPlaceholderAt(idx) {
    const siblings = rows().filter(r => r !== draggingEl);
    placeholder.remove();
    if (idx >= siblings.length) {
      list.appendChild(placeholder);
    } else {
      list.insertBefore(placeholder, siblings[idx]);
    }
  }

  function updateRankBadges() {
    rows().forEach((row, i) => {
      const badge = row.querySelector('.rank-badge');
      if (badge) badge.textContent = i + 1;
    });
  }

  function startDrag(el, clientY) {
    draggingEl = el;
    startY = clientY;
    startScrollY = window.scrollY;
    originRect = el.getBoundingClientRect();

    const h = el.offsetHeight;
    placeholder = buildPlaceholder(h);

    // Float the element
    el.style.cssText = `
      position: fixed;
      z-index: 999;
      left: ${originRect.left}px;
      top: ${originRect.top}px;
      width: ${originRect.width}px;
      opacity: 0.95;
      transform: scale(1.02);
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
      pointer-events: none;
      transition: box-shadow 0ms;
    `;
    list.insertBefore(placeholder, el);
    document.body.appendChild(el);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);
  }

  function onMove(e) {
    if (!draggingEl) return;
    const dy = e.clientY - startY;
    draggingEl.style.top = (originRect.top + dy) + 'px';
    insertPlaceholderAt(getInsertIndex(e.clientY));
  }

  function onTouchMove(e) {
    if (!draggingEl) return;
    e.preventDefault();
    const t = e.touches[0];
    const dy = t.clientY - startY;
    draggingEl.style.top = (originRect.top + dy) + 'px';
    insertPlaceholderAt(getInsertIndex(t.clientY));
  }

  function endDrag() {
    if (!draggingEl) return;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
    document.removeEventListener('touchcancel', endDrag);

    // Drop back into list at placeholder position
    draggingEl.style.cssText = '';
    list.insertBefore(draggingEl, placeholder);
    placeholder.remove();
    placeholder = null;

    updateRankBadges();

    // Save ranking state
    G.rankings[pIdx] = rows().map(r => r.dataset.sid);
    checkConfirmReady();
    updateProgress();

    draggingEl = null;
  }

  // Wire each row's handle
  list.addEventListener('mousedown', e => {
    const handle = e.target.closest('.rank-handle');
    if (!handle) return;
    e.preventDefault();
    startDrag(handle.closest('.rank-row'), e.clientY);
  });

  list.addEventListener('touchstart', e => {
    const handle = e.target.closest('.rank-handle');
    if (!handle) return;
    startDrag(handle.closest('.rank-row'), e.touches[0].clientY);
  }, { passive: true });
}

function updateProgress() {
  // Progress = number of products that have been ranked (all start ranked, so always 100%)
  // We use it to show "all ranked" state — check if user has deliberately reordered
  // Since we pre-populate rankings, progress bar fills as user interacts (touch count)
  // Simplify: always show 100% since all are pre-ranked — confirm just needs all filled
  const total  = G.puzzle.products.length;
  const filled = Object.keys(G.rankings).length;
  document.getElementById('progressFill').style.width = (filled / total * 100) + '%';
}

function checkConfirmReady() {
  const total  = G.puzzle.products.length;
  const filled = Object.keys(G.rankings).length;
  const btn = document.getElementById('btnConfirm');
  btn.disabled = filled < total;
  if (filled >= total) {
    document.getElementById('picksHint').textContent = 'Happy with your rankings? Lock them in!';
  }
}

/* ============================================================
   CONFIRM → COMPUTE RESULTS
   ============================================================ */
function confirmPicks() {
  G.results = computeResults();
  saveTodayResult();
  renderReveal();
  showScreen('screenReveal');

  setTimeout(() => {
    document.querySelectorAll('.reveal-card').forEach((card, i) => {
      setTimeout(() => card.classList.add('visible'), i * 220);
    });
  }, 80);
}

function computeResults() {
  return G.puzzle.products.map((product, pIdx) => {
    const userRanking = G.rankings[pIdx]; // ['aldi','coles','woolworths'] user's order

    // Correct ranking by pricePer ascending
    const correctRanking = [...product.stores]
      .sort((a, b) => a.pricePer - b.pricePer)
      .map(s => s.id);

    // Handle ties: stores with identical pricePer can be in any order
    // Build a position-correctness map
    const posCorrect = userRanking.map((sid, pos) => {
      return isPositionCorrect(sid, pos, correctRanking, product.stores);
    });

    const correctCount = posCorrect.filter(Boolean).length;
    const pickedWinner = userRanking[0]; // who player ranked 1st
    const actualWinner = correctRanking[0];
    const isWinnerCorrect = posCorrect[0]; // position 0 correct = cheapest right

    // Overspend: compare player's 1st pick price vs actual cheapest price
    const pickedStore  = product.stores.find(s => s.id === pickedWinner);
    const winnerStore  = product.stores.find(s => s.id === actualWinner);

    return {
      product,
      userRanking,
      correctRanking,
      posCorrect,       // [bool, bool, bool]
      correctCount,     // 0-3
      isWinnerCorrect,
      pickedStore,
      winnerStore,
    };
  });
}

/* Position is correct if the store at that rank has the same pricePer
   as the store that SHOULD be at that rank (handles ties fairly) */
function isPositionCorrect(sid, pos, correctRanking, stores) {
  const userPrice   = stores.find(s => s.id === sid).pricePer;
  const correctId   = correctRanking[pos];
  const correctPrice = stores.find(s => s.id === correctId).pricePer;
  return userPrice === correctPrice;
}

/* ============================================================
   REVEAL SCREEN — all 3 products simultaneously
   ============================================================ */
function renderReveal() {
  const body = document.getElementById('revealBody');
  body.innerHTML = '';

  G.results.forEach((r) => {
    const { product, userRanking, correctRanking, posCorrect } = r;
    const card = document.createElement('div');
    card.className = 'reveal-card';

    // Build rows in USER's ranking order (so they see their choices top-to-bottom)
    const storeRows = userRanking.map((sid, pos) => {
      const store    = product.stores.find(s => s.id === sid);
      const correct  = posCorrect[pos];
      const rowClass = correct ? 'reveal-row-correct' : 'reveal-row-wrong';
      const icon     = correct ? '✅' : '❌';

      // What should have been here
      const shouldBe = correctRanking[pos];
      const wrongHint = !correct
        ? `<div class="reveal-should-be">Should be: ${STORE_NAMES[shouldBe]}</div>` : '';

      const specialTag = store.flash
        ? `<div class="special-tag flash-tag">⚡ Flash Special</div>`
        : store.special ? `<div class="special-tag">🔥 On special</div>` : '';

      return `
        <div class="reveal-store-row ${rowClass}">
          <div class="rank-badge-reveal">${pos + 1}</div>
          <img class="store-logo-img" src="${LOGOS[sid]}" alt="${STORE_NAMES[sid]}"/>
          <div class="store-info">
            <div class="store-brand">${store.brand}</div>
            <div class="store-size">${store.size}</div>
            ${specialTag}
            ${wrongHint}
          </div>
          <div class="reveal-price-col">
            <div class="reveal-price">$${store.price.toFixed(2)}</div>
            <div class="reveal-price-per">${formatPricePer(store.pricePer, product.unit)}</div>
          </div>
          <div class="reveal-icon">${icon}</div>
        </div>
      `;
    }).join('');

    // Mini score dots for this product
    const dots = posCorrect.map(c => c ? '🟩' : '🟥').join('');
    const flashHeaderTag = product.isFlash
      ? `<span class="flash-header-tag">⚡</span>` : '';

    card.innerHTML = `
      <div class="reveal-product-header">
        <span class="product-emoji">${product.emoji}${flashHeaderTag}</span>
        <div style="flex:1">
          <div class="product-name">${product.name}</div>
          <div class="product-unit">${r.correctCount}/3 positions correct</div>
        </div>
        <div class="reveal-dots">${dots}</div>
      </div>
      ${storeRows}
    `;
    body.appendChild(card);
  });
}

function formatPricePer(val, unit) {
  if (val < 100) return `${val.toFixed(1)}¢ ${unit}`;
  return `$${(val / 100).toFixed(2)} ${unit}`;
}

/* ============================================================
   RESULTS SCREEN
   ============================================================ */
function renderResults() {
  const body = document.getElementById('resultsBody');
  body.innerHTML = '';

  // Overspend = based on winner pick (position 0) only
  const perfectShopTotal = G.results.reduce((sum, r) => sum + r.winnerStore.price, 0);
  const myShopTotal      = G.results.reduce((sum, r) => sum + r.pickedStore.price, 0);
  const totalOverspend   = Math.max(0, myShopTotal - perfectShopTotal);
  const isPerfect        = totalOverspend < 0.01;

  const totalPositions  = G.results.length * 3;
  const correctPositions = G.results.reduce((sum, r) => sum + r.correctCount, 0);
  const winnerCorrect    = G.results.filter(r => r.isWinnerCorrect).length;

  const streak = updateStreak(winnerCorrect, G.puzzle.products.length);

  // 1. Overspend hero
  const hero = document.createElement('div');
  hero.className = 'overspend-hero slide-up';
  hero.innerHTML = `
    <div class="overspend-label">You overpaid</div>
    <div class="overspend-amount ${isPerfect ? 'perfect' : ''}">
      ${isPerfect ? '$0.00 🎉' : '-$' + totalOverspend.toFixed(2)}
    </div>
    <div class="shop-compare">
      <div class="shop-compare-row">
        <span class="shop-compare-label">Perfect shop</span>
        <span class="shop-compare-value perfect">$${perfectShopTotal.toFixed(2)}</span>
      </div>
      <div class="shop-compare-row">
        <span class="shop-compare-label">My shop</span>
        <span class="shop-compare-value ${isPerfect ? 'perfect' : 'wrong'}">$${myShopTotal.toFixed(2)}</span>
      </div>
    </div>
    <div class="overspend-sublabel">
      ${correctPositions}/${totalPositions} rankings correct
    </div>
  `;
  body.appendChild(hero);

  // 2. Score grid — 3×3 squares
  const grid = document.createElement('div');
  grid.className = 'score-grid slide-up';
  G.results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'score-grid-row';
    row.innerHTML = `
      <span class="score-grid-emoji">${r.product.emoji}</span>
      <div class="score-grid-squares">
        ${r.posCorrect.map(c => `<div class="score-sq ${c ? 'sq-correct' : 'sq-wrong'}"></div>`).join('')}
      </div>
      <span class="score-grid-tally">${r.correctCount}/3</span>
    `;
    grid.appendChild(row);
  });
  body.appendChild(grid);

  // 3. Breakdown
  const breakdown = document.createElement('div');
  breakdown.className = 'breakdown-card slide-up';
  const rows = G.results.map(r => {
    const os = Math.max(0, r.pickedStore.price - r.winnerStore.price);
    return `
      <div class="breakdown-row">
        <div class="breakdown-emoji">${r.product.emoji}${r.product.isFlash ? '⚡' : ''}</div>
        <div class="breakdown-info">
          <div class="breakdown-name">${r.product.name}</div>
          <div class="breakdown-pick">You ranked: ${r.userRanking.map(id => STORE_NAMES[id]).join(' → ')}</div>
          ${!r.isWinnerCorrect
            ? `<div class="breakdown-pick" style="color:var(--green-500)">Cheapest was: ${STORE_NAMES[r.correctRanking[0]]} — $${r.winnerStore.price.toFixed(2)}</div>`
            : ''}
        </div>
        <div class="breakdown-result">
          <div class="breakdown-overspend ${os < 0.01 ? 'zero' : ''}">
            ${os < 0.01 ? '✅' : '-$' + os.toFixed(2)}
          </div>
        </div>
      </div>
    `;
  }).join('');
  breakdown.innerHTML = `<div class="breakdown-title">Breakdown</div>${rows}`;
  body.appendChild(breakdown);

  // 4. Streak
  const streakCard = document.createElement('div');
  streakCard.className = 'streak-card slide-up';
  streakCard.innerHTML = `
    <div class="streak-icon">${streak > 0 ? '🔥' : '💸'}</div>
    <div class="streak-text">
      <div class="streak-num">${streak} day${streak !== 1 ? 's' : ''}</div>
      <div class="streak-desc">${streak > 0 ? 'Current streak — cheapest right 2+ times' : 'Start a streak by getting 2+ cheapest right!'}</div>
    </div>
  `;
  body.appendChild(streakCard);

  // 5. Share card — exactly as per design doc
  const shareLines = buildShareLines(totalOverspend, perfectShopTotal, myShopTotal, streak);
  const shareText  = shareLines.join('\n');

  const sharePreview = document.createElement('div');
  sharePreview.className = 'share-preview slide-up';
  sharePreview.innerHTML = `
    <div class="share-preview-title">🛒 SHELFIE <span class="share-puzzle-num">#${G.puzzle.puzzleNum}</span></div>
    <div class="share-preview-date">${formatDate(G.puzzle.date)}</div>
    <div class="share-grid-rows">
      ${G.results.map(r => `
        <div class="share-grid-line">
          <span>${r.product.emoji}</span>
          <span class="share-squares">${r.posCorrect.map(c => c ? '🟩' : '🟥').join('')}</span>
          <span class="share-tally">${r.correctCount}/3 ${rankLabel(r.correctCount)}</span>
        </div>
      `).join('')}
    </div>
    <div class="share-preview-shops">
      <div>Perfect shop: $${perfectShopTotal.toFixed(2)}</div>
      <div>My shop: $${myShopTotal.toFixed(2)}</div>
    </div>
    <div class="share-preview-overpaid">Overpaid $${totalOverspend.toFixed(2)} 💸</div>
    <div class="share-preview-streak">Streak: ${streak} 🔥</div>
    <div class="share-preview-url">shelfie.game</div>
  `;
  body.appendChild(sharePreview);

  // 6. Share button
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn-share slide-up';
  shareBtn.textContent = '📋 Copy & Share';
  shareBtn.addEventListener('click', () => {
    const copy = () => {
      shareBtn.textContent = '✅ Copied!';
      setTimeout(() => shareBtn.textContent = '📋 Copy & Share', 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(copy).catch(() => fallbackCopy(shareText, copy));
    } else {
      fallbackCopy(shareText, copy);
    }
  });
  body.appendChild(shareBtn);

  // 7. Countdown
  const countdown = document.createElement('div');
  countdown.className = 'countdown-row slide-up';
  countdown.innerHTML = `Next puzzle in: <strong>${nextPuzzleCountdown()}</strong>`;
  body.appendChild(countdown);
  setInterval(() => {
    countdown.innerHTML = `Next puzzle in: <strong>${nextPuzzleCountdown()}</strong>`;
  }, 1000);
}

function rankLabel(n) {
  return n === 3 ? 'Perfect' : n === 0 ? 'All wrong' : '';
}

function buildShareLines(overspend, perfectTotal, myTotal, streak) {
  const productLines = G.results.map(r =>
    `${r.product.emoji} ${r.posCorrect.map(c => c ? '🟩' : '🟥').join('')}  ${r.correctCount}/3${r.correctCount === 3 ? ' right' : r.correctCount === 1 ? ' right' : ' right'}`
  );
  return [
    `🛒 SHELFIE #${G.puzzle.puzzleNum}`,
    formatDate(G.puzzle.date),
    '',
    ...productLines,
    '',
    `Perfect shop: $${perfectTotal.toFixed(2)}`,
    `My shop: $${myTotal.toFixed(2)}`,
    `Overpaid $${overspend.toFixed(2)} 💸`,
    `Streak: ${streak} 🔥`,
    'shelfie.game',
  ];
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); cb(); } catch {}
  document.body.removeChild(ta);
}

/* ============================================================
   INTRO STREAK
   ============================================================ */
function renderIntroStreak() {
  const streak = getStreak();
  const el = document.getElementById('introStreakRow');
  if (streak > 0) el.textContent = `🔥 ${streak}-day streak`;
}

/* ============================================================
   PERSISTENCE
   ============================================================ */
/* Storage — uses real localStorage when available (Render/prod),
   falls back to in-memory for restricted previews */
const _mem = {};
function lsGet(key) {
  try {
    const ls = Function('return typeof localStorage !== "undefined" ? localStorage : null')();
    if (ls) return ls.getItem(key);
  } catch {}
  return _mem[key] ?? null;
}
function lsSet(key, val) {
  try {
    const ls = Function('return typeof localStorage !== "undefined" ? localStorage : null')();
    if (ls) { ls.setItem(key, val); return; }
  } catch {}
  _mem[key] = val;
}

function saveTodayResult() {
  lsSet('shelfie_result_' + G.puzzle.date, JSON.stringify({ rankings: G.rankings, results: G.results }));
}
function loadTodayResult() {
  const raw = lsGet('shelfie_result_' + G.puzzle.date);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function getStreak() {
  return parseInt(lsGet('shelfie_streak') || '0', 10);
}
function updateStreak(correct, total) {
  const lastDate = lsGet('shelfie_last_date');
  const today    = G.puzzle.date;
  let streak = getStreak();
  if (lastDate !== today) {
    const qualified = correct >= Math.ceil(total * 0.67);
    streak = (lastDate === offsetDate(today, -1) && streak > 0)
      ? (qualified ? streak + 1 : 0)
      : (qualified ? 1 : 0);
    lsSet('shelfie_streak', streak);
    lsSet('shelfie_last_date', today);
  }
  return streak;
}
function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   THEME
   ============================================================ */
function getSavedTheme() {
  return lsGet('shelfie_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
  lsSet('shelfie_theme', theme);
}
function wireThemeToggles() {
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme');
      applyTheme(t === 'dark' ? 'light' : 'dark');
    });
  });
}

/* ============================================================
   UTILS
   ============================================================ */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
}
function nextPuzzleCountdown() {
  const now  = new Date();
  const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const next = new Date(aest);
  next.setHours(24, 0, 0, 0);
  const diff = next - aest;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
