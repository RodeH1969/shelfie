/* ============================================================
   TROLLEY — Data Model v3
   
   STRUCTURE:
   - PRODUCT_POOL: 20 staples. Each has weekly prices per store.
   - WEEKLY_PRICES: updated every Tuesday. Maps productId → store prices.
   - DAILY_OVERRIDES: flash specials (⚡ today-only prices), keyed by date.
   - PUZZLE_LAUNCH_DATE: used to calculate puzzle number.
   
   DAILY ROTATION:
   - 3 products drawn from pool each day using date-seeded RNG.
   - Same 3 products for all players on a given date.
   - Product order also seeded (determines which is the Flash Special slot).
   ============================================================ */

const PUZZLE_LAUNCH_DATE = '2026-04-23'; // Day #1

/* ---- 20-product pool ---- */
const PRODUCT_POOL = [
  { id: 'milk',         name: 'Full Cream Milk',       emoji: '🥛', unit: 'per 100mL' },
  { id: 'eggs',         name: 'Free Range Eggs',        emoji: '🥚', unit: 'per egg'   },
  { id: 'cheese',       name: 'Tasty Cheddar',          emoji: '🧀', unit: 'per 100g'  },
  { id: 'bread',        name: 'White Sandwich Bread',   emoji: '🍞', unit: 'per 100g'  },
  { id: 'pasta',        name: 'Spaghetti',              emoji: '🍝', unit: 'per 100g'  },
  { id: 'blueberries',  name: 'Frozen Blueberries',     emoji: '🫐', unit: 'per 100g'  },
  { id: 'toilet_paper', name: 'Toilet Paper',           emoji: '🧻', unit: 'per 100 sheets' },
  { id: 'butter',       name: 'Unsalted Butter',        emoji: '🧈', unit: 'per 100g'  },
  { id: 'yoghurt',      name: 'Natural Yoghurt',        emoji: '🍶', unit: 'per 100g'  },
  { id: 'mince',        name: 'Beef Mince',             emoji: '🥩', unit: 'per 100g'  },
  { id: 'chicken',      name: 'Chicken Breast',         emoji: '🍗', unit: 'per 100g'  },
  { id: 'rice',         name: 'White Rice',             emoji: '🍚', unit: 'per 100g'  },
  { id: 'oats',         name: 'Rolled Oats',            emoji: '🥣', unit: 'per 100g'  },
  { id: 'orange_juice', name: 'Orange Juice',           emoji: '🍊', unit: 'per 100mL' },
  { id: 'tuna',         name: 'Canned Tuna',            emoji: '🐟', unit: 'per 100g'  },
  { id: 'cones',        name: 'Vanilla Cones 4pk',      emoji: '🍦', unit: 'per cone'  },
  { id: 'dishwashing',  name: 'Dishwashing Liquid',     emoji: '🧴', unit: 'per 100mL' },
  { id: 'chips',        name: 'Potato Chips',           emoji: '🥔', unit: 'per 100g'  },
  { id: 'tinned_tom',   name: 'Diced Tomatoes 400g',    emoji: '🍅', unit: 'per 100g'  },
  { id: 'washing_pwd',  name: 'Laundry Powder',         emoji: '🫧', unit: 'per 100g'  },
];

/* ---- Weekly prices (update every Tuesday) ---- */
/* pricePer: cents per unit (e.g. ¢/100g). Used for ranking & overspend calc.
   price: full pack $ price. Used for "perfect shop" vs "my shop" totals.
   special: true = on special this week (🔥, revealed after confirm)           */
const WEEKLY_PRICES = {
  milk:         {
    aldi:       { brand: 'Farmdale Full Cream',          size: '2L',    price: 3.19, pricePer: 15.95, special: false },
    coles:      { brand: 'Coles Full Cream',             size: '2L',    price: 3.50, pricePer: 17.50, special: false },
    woolworths: { brand: 'Woolworths Full Cream',        size: '2L',    price: 3.20, pricePer: 16.00, special: false },
  },
  eggs:         {
    aldi:       { brand: 'Leckford Farm Free Range',     size: '12pk',  price: 5.99, pricePer: 49.9,  special: false },
    coles:      { brand: 'Coles Free Range',             size: '12pk',  price: 7.00, pricePer: 58.3,  special: false },
    woolworths: { brand: 'Woolworths Free Range',        size: '12pk',  price: 6.50, pricePer: 54.2,  special: true  },
  },
  cheese:       {
    aldi:       { brand: 'Westacre Tasty Cheddar',       size: '500g',  price: 4.99, pricePer: 99.8,  special: false },
    coles:      { brand: 'Coles Brand Tasty',            size: '500g',  price: 6.00, pricePer: 120.0, special: false },
    woolworths: { brand: 'WW Essentials Tasty',          size: '1kg',   price: 9.00, pricePer: 90.0,  special: true  },
  },
  bread:        {
    aldi:       { brand: 'L\'Oven Fresh White',          size: '700g',  price: 1.49, pricePer: 21.3,  special: false },
    coles:      { brand: 'Coles White Sandwich',         size: '650g',  price: 2.20, pricePer: 33.8,  special: false },
    woolworths: { brand: 'Wonder White Classic',         size: '650g',  price: 2.00, pricePer: 30.8,  special: true  },
  },
  pasta:        {
    aldi:       { brand: 'Remano Spaghetti',             size: '500g',  price: 0.99, pricePer: 19.8,  special: false },
    coles:      { brand: 'Coles Brand Spaghetti',        size: '500g',  price: 1.30, pricePer: 26.0,  special: false },
    woolworths: { brand: 'San Remo Spaghetti',           size: '500g',  price: 1.00, pricePer: 20.0,  special: true  },
  },
  blueberries:  {
    aldi:       { brand: "Nature's Pick Blueberries",    size: '500g',  price: 5.99, pricePer: 119.8, special: false },
    coles:      { brand: 'Coles Frozen Blueberries',     size: '300g',  price: 4.50, pricePer: 150.0, special: false },
    woolworths: { brand: 'WW Frozen Blueberries',        size: '500g',  price: 5.00, pricePer: 100.0, special: true  },
  },
  toilet_paper: {
    aldi:       { brand: 'Confidence Ultra',             size: '12pk',  price: 5.99, pricePer: 19.97, special: false },
    coles:      { brand: 'Coles Ultra Soft',             size: '12pk',  price: 5.00, pricePer: 16.67, special: true  },
    woolworths: { brand: 'Woolworths Essentials',        size: '12pk',  price: 5.99, pricePer: 19.97, special: false },
  },
  butter:       {
    aldi:       { brand: 'Beautifully Butterfully',      size: '250g',  price: 3.49, pricePer: 139.6, special: false },
    coles:      { brand: 'Coles Unsalted Butter',        size: '250g',  price: 4.00, pricePer: 160.0, special: false },
    woolworths: { brand: 'Mainland Unsalted',            size: '250g',  price: 3.50, pricePer: 140.0, special: true  },
  },
  yoghurt:      {
    aldi:       { brand: 'Brooklea Natural Yoghurt',     size: '1kg',   price: 2.99, pricePer: 29.9,  special: false },
    coles:      { brand: 'Coles Natural Yoghurt',        size: '1kg',   price: 3.50, pricePer: 35.0,  special: false },
    woolworths: { brand: 'Chobani Plain',                size: '907g',  price: 4.50, pricePer: 49.6,  special: false },
  },
  mince:        {
    aldi:       { brand: 'Beef Mince 3 Star',            size: '500g',  price: 5.99, pricePer: 119.8, special: false },
    coles:      { brand: 'Coles 3 Star Beef Mince',      size: '500g',  price: 7.00, pricePer: 140.0, special: true  },
    woolworths: { brand: 'Woolworths Beef Mince',        size: '500g',  price: 6.00, pricePer: 120.0, special: false },
  },
  chicken:      {
    aldi:       { brand: 'Aldi Chicken Breast Fillet',   size: '600g',  price: 7.99, pricePer: 133.2, special: false },
    coles:      { brand: 'Coles RSPCA Chicken Breast',   size: '500g',  price: 9.00, pricePer: 180.0, special: false },
    woolworths: { brand: 'Woolworths Chicken Breast',    size: '600g',  price: 8.00, pricePer: 133.3, special: true  },
  },
  rice:         {
    aldi:       { brand: 'Remano Long Grain Rice',       size: '1kg',   price: 1.49, pricePer: 14.9,  special: false },
    coles:      { brand: 'Coles Long Grain White Rice',  size: '1kg',   price: 1.80, pricePer: 18.0,  special: false },
    woolworths: { brand: 'SunRice Long Grain',           size: '1kg',   price: 2.00, pricePer: 20.0,  special: true  },
  },
  oats:         {
    aldi:       { brand: 'Harvest Morn Rolled Oats',     size: '1kg',   price: 1.49, pricePer: 14.9,  special: false },
    coles:      { brand: 'Coles Rolled Oats',            size: '1kg',   price: 1.70, pricePer: 17.0,  special: false },
    woolworths: { brand: 'Uncle Tobys Traditional',      size: '1kg',   price: 3.50, pricePer: 35.0,  special: false },
  },
  orange_juice: {
    aldi:       { brand: 'Nature\'s Pick OJ',            size: '2L',    price: 3.49, pricePer: 17.45, special: false },
    coles:      { brand: 'Coles Orange Juice',           size: '2L',    price: 3.80, pricePer: 19.0,  special: false },
    woolworths: { brand: 'Tropicana Original',           size: '1.75L', price: 5.00, pricePer: 28.6,  special: true  },
  },
  tuna:         {
    aldi:       { brand: 'Beautifully Butterfully Tuna', size: '95g',   price: 0.99, pricePer: 104.2, special: false },
    coles:      { brand: 'Coles Tuna in Springwater',    size: '95g',   price: 1.20, pricePer: 126.3, special: false },
    woolworths: { brand: 'Sirena Tuna in Oil',           size: '95g',   price: 1.50, pricePer: 157.9, special: false },
  },
  cones:        {
    aldi:       { brand: 'Sundae Shoppe Vanilla Cones',  size: '4pk',   price: 2.99, pricePer: 74.75, special: false },
    coles:      { brand: 'Coles Vanilla Cones',          size: '4pk',   price: 4.00, pricePer: 100.0, special: false },
    woolworths: { brand: 'Streets Golden Gaytime',       size: '4pk',   price: 6.00, pricePer: 150.0, special: true  },
  },
  dishwashing:  {
    aldi:       { brand: 'Morning Fresh Ultra',          size: '500mL', price: 2.49, pricePer: 49.8,  special: false },
    coles:      { brand: 'Coles Dishwashing Liquid',     size: '500mL', price: 2.00, pricePer: 40.0,  special: true  },
    woolworths: { brand: 'Palmolive Original',           size: '500mL', price: 3.00, pricePer: 60.0,  special: false },
  },
  chips:        {
    aldi:       { brand: 'Clancy\'s Ridged Chips',       size: '200g',  price: 1.99, pricePer: 99.5,  special: false },
    coles:      { brand: 'Coles Potato Chips',           size: '175g',  price: 2.00, pricePer: 114.3, special: false },
    woolworths: { brand: 'Smith\'s Crinkle Cut',         size: '170g',  price: 3.00, pricePer: 176.5, special: true  },
  },
  tinned_tom:   {
    aldi:       { brand: 'Remano Diced Tomatoes',        size: '400g',  price: 0.79, pricePer: 19.75, special: false },
    coles:      { brand: 'Coles Diced Tomatoes',         size: '400g',  price: 0.90, pricePer: 22.5,  special: false },
    woolworths: { brand: 'Mutti Diced Tomatoes',         size: '400g',  price: 2.50, pricePer: 62.5,  special: false },
  },
  washing_pwd:  {
    aldi:       { brand: 'Almat Laundry Powder',         size: '2kg',   price: 5.99, pricePer: 29.95, special: false },
    coles:      { brand: 'Coles Laundry Powder',         size: '2kg',   price: 7.00, pricePer: 35.0,  special: false },
    woolworths: { brand: 'OMO Active Clean',             size: '2kg',   price: 9.00, pricePer: 45.0,  special: true  },
  },
};

/* ---- Flash Special overrides (⚡ today-only prices) ----
   Key: 'YYYY-MM-DD', value: { productId, storeId, price, pricePer }
   This overrides the weekly price for that product/store on that date only.
   Mark which product index (0,1,2) is the flash slot via flashProductId.     */
const DAILY_OVERRIDES = {
  '2026-04-23': {
    flashProductId: 'eggs',
    overrides: {
      eggs: {
        woolworths: { brand: 'Woolworths Free Range', size: '12pk', price: 4.50, pricePer: 37.5, special: true, flash: true },
      }
    }
  },
  '2026-04-24': {
    flashProductId: 'pasta',
    overrides: {
      pasta: {
        coles: { brand: 'Coles Brand Spaghetti', size: '500g', price: 0.75, pricePer: 15.0, special: true, flash: true },
      }
    }
  },
};

/* ---- Date-seeded RNG ---- */
function seededRng(seed) {
  let s = (seed * 1664525 + 1013904223) & 0x7fffffff;
  return function() {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function dateToSeed(dateStr) {
  // Convert YYYY-MM-DD to a stable integer seed
  return dateStr.replace(/-/g, '').split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
}

/* ---- Fisher-Yates shuffle with seeded RNG ---- */
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---- Puzzle number (Day 1 = launch date) ---- */
function getPuzzleNumber(dateStr) {
  const launch = new Date(PUZZLE_LAUNCH_DATE + 'T00:00:00');
  const today  = new Date(dateStr + 'T00:00:00');
  return Math.floor((today - launch) / 86400000) + 1;
}

/* ---- Build today's puzzle ---- */
function getTodayPuzzle() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  return buildPuzzleForDate(today);
}

function buildPuzzleForDate(dateStr) {
  const rng     = seededRng(dateToSeed(dateStr));
  const ids     = PRODUCT_POOL.map(p => p.id);
  const shuffled = seededShuffle(ids, rng);
  const chosen  = shuffled.slice(0, 3); // pick 3

  const dailyOverride = DAILY_OVERRIDES[dateStr] || { flashProductId: null, overrides: {} };
  const puzzleNum = getPuzzleNumber(dateStr);

  const products = chosen.map(pid => {
    const meta   = PRODUCT_POOL.find(p => p.id === pid);
    const weekly = WEEKLY_PRICES[pid];
    const overrides = dailyOverride.overrides[pid] || {};
    const isFlash = dailyOverride.flashProductId === pid;

    const stores = ['aldi', 'coles', 'woolworths'].map(sid => {
      const base = { ...weekly[sid] };
      if (overrides[sid]) Object.assign(base, overrides[sid]);
      return { id: sid, ...base };
    });

    return { id: pid, name: meta.name, emoji: meta.emoji, unit: meta.unit, stores, isFlash };
  });

  return { date: dateStr, puzzleNum, products };
}
