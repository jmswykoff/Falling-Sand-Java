// --- CONFIG ---
const CELL_SIZE = 4;
const GRID_WIDTH = 150;   // 600 / 4
const GRID_HEIGHT = 150;  // 600 / 4

const EMPTY = 0;
const SAND = 1;
const WATER = 2;
const ROCK = 3;
const LAVA = 4;

// --- GLOBAL SLOWDOWN ---
let UPDATE_RATE = 3;   // Higher = slower simulation
let updateCounter = 0;

// --- RANDOM COLOR RANGES ---
function randomColorRange(r1, g1, b1, r2, g2, b2) {
  const r = r1 + Math.floor(Math.random() * (r2 - r1 + 1));
  const g = g1 + Math.floor(Math.random() * (g2 - g1 + 1));
  const b = b1 + Math.floor(Math.random() * (b2 - b1 + 1));

  return "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0");
}

const RANDOM_COLORS = {
  [SAND]: () => randomColorRange(180, 150, 60, 220, 190, 90),
  [WATER]: () => randomColorRange(20, 60, 180, 40, 120, 255),
  [ROCK]: () => randomColorRange(80, 80, 80, 140, 140, 140),
  [LAVA]: () => randomColorRange(200, 60, 0, 255, 120, 20)
};

// --- STATE ---
const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

let grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
let gridColors = createGrid(GRID_WIDTH, GRID_HEIGHT);

let currentElement = SAND;
let brushSize = 3;
let isMouseDown = false;
let isRightButton = false;
let paused = false;

let lastTime = performance.now();
let fps = 0;

// --- GRID HELPERS ---
function createGrid(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(EMPTY));
}

function inBounds(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function swap(x1, y1, x2, y2) {
  let t = grid[y1][x1];
  grid[y1][x1] = grid[y2][x2];
  grid[y2][x2] = t;

  let c = gridColors[y1][x1];
  gridColors[y1][x1] = gridColors[y2][x2];
  gridColors[y2][x2] = c;
}

// --- DRAWING ---
function drawCell(x, y, type) {
  if (type === EMPTY) return; // transparent
  ctx.fillStyle = gridColors[y][x];
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      drawCell(x, y, grid[y][x]);
    }
  }
}

// --- SIMULATION LOOP WITH RANDOMIZED X DIRECTION + SLOWDOWN ---
function update() {
  if (paused) return;

  updateCounter++;
  if (updateCounter % UPDATE_RATE !== 0) return;

  const leftToRight = Math.random() < 0.5;

  for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
    if (leftToRight) {
      for (let x = 0; x < GRID_WIDTH; x++) stepCell(x, y);
    } else {
      for (let x = GRID_WIDTH - 1; x >= 0; x--) stepCell(x, y);
    }
  }
}

function stepCell(x, y) {
  const cell = grid[y][x];

  if (cell === SAND) updateSand(x, y);
  else if (cell === WATER) updateWater(x, y);
  else if (cell === LAVA) updateLava(x, y);
}

function tryMove(x, y, nx, ny) {
  if (!inBounds(nx, ny)) return false;
  if (grid[ny][nx] === EMPTY) {
    swap(x, y, nx, ny);
    return true;
  }
  return false;
}

function canMove(x, y, nx, ny) {
    if (!inBounds(nx, ny)) return false;
    return grid[ny][nx] === EMPTY;
}

// --- ELEMENT LOGIC ---
function updateSand(x, y) {
  if (tryMove(x, y, x, y + 1)) return;
  if (tryMove(x, y, x - 1, y + 1)) return;
  if (tryMove(x, y, x + 1, y + 1)) return;
}

function updateWater(x, y) {
    // --- COOLING: Water touching sand or lava ---
    const dirs = [
        [0,1], [0,-1], [1,0], [-1,0]
    ];

    for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;

        if (grid[ny][nx] === SAND || grid[ny][nx] === LAVA) {
            grid[ny][nx] = ROCK;
            gridColors[ny][nx] = RANDOM_COLORS[ROCK]();
            grid[y][x] = EMPTY;
            return;
        }
    }

    // --- WATER FLOW ---

    // 1. Down
    if (tryMove(x, y, x, y + 1)) return;

    // 2. Diagonal
    if (tryMove(x, y, x - 1, y + 1)) return;
    if (tryMove(x, y, x + 1, y + 1)) return;

    // Determine if water is blocked from moving downward
    const blocked =
        !canMove(x, y, x, y+1) &&
        !canMove(x, y, x-1, y+1) &&
        !canMove(x, y, x+1, y+1);

    // 3. Sideways only when blocked
    if (blocked) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (tryMove(x, y, x + dir, y)) return;
        if (tryMove(x, y, x - dir, y)) return;
    }

    // --- PRESSURE POOLING (STABLE VERSION) ---
    if (!blocked) return;

    let pressure = 2;  // <-- FIXED: must be here

    for (let py = y - 1; py >= 0; py--) {
        if (grid[py][x] === WATER) pressure++;
        else break;
    }

    if (pressure < -2) return;

    const maxPush = Math.min(pressure, 3);

    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let d = 2; d <= maxPush + 1; d++) {
        if (tryMove(x, y, x + dir * d, y)) return;
    }
}

function updateLava(x, y) {

  // WATER COOLS LAVA (lava → rock, water disappears)
  const dirs = [
    [0,1], [0,-1], [1,0], [-1,0]
  ];

  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) continue;

    if (grid[ny][nx] === WATER) {
      grid[y][x] = ROCK; // lava becomes rock
      gridColors[y][x] = RANDOM_COLORS[ROCK]();
      grid[ny][nx] = EMPTY; // water disappears
      return;
    }
  }

  // Lava burns sand (direct only)
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) continue;

    if (grid[ny][nx] === SAND) {
      grid[ny][nx] = LAVA;
      gridColors[ny][nx] = RANDOM_COLORS[LAVA]();
    }
  }

  // Lava flow
  if (tryMove(x, y, x, y + 1)) return;
  if (tryMove(x, y, x - 1, y + 1)) return;
  if (tryMove(x, y, x + 1, y + 1)) return;

  if (Math.random() < 0.4) {
    if (tryMove(x, y, x - 1, y)) return;
    if (tryMove(x, y, x + 1, y)) return;
  }
}

// --- INPUT ---
canvas.addEventListener("mousedown", e => {
  isMouseDown = true;
  isRightButton = e.button === 2;
});

canvas.addEventListener("mouseup", () => (isMouseDown = false));
canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("mousemove", e => {
  if (!isMouseDown) return;

  const rect = canvas.getBoundingClientRect();
  const mx = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const my = Math.floor((e.clientY - rect.top) / CELL_SIZE);

  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      if (dx * dx + dy * dy <= brushSize * brushSize) {
        const x = mx + dx, y = my + dy;
        if (!inBounds(x, y)) continue;

        if (isRightButton || currentElement === "erase") {
          grid[y][x] = EMPTY;
        } else {
          grid[y][x] = currentElement;
          gridColors[y][x] = RANDOM_COLORS[currentElement]();
        }
      }
    }
  }
});

// --- UI ---
document.querySelectorAll(".btn[data-element]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn[data-element]").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");

    const el = btn.dataset.element;
    currentElement =
      el === "erase" ? "erase" :
      el === "sand" ? SAND :
      el === "water" ? WATER :
      el === "rock" ? ROCK :
      el === "lava" ? LAVA :
      SAND;
  });
});

document.getElementById("brushSize").addEventListener("input", e => {
  brushSize = Number(e.target.value);
  document.getElementById("brushLabel").textContent = brushSize;
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  paused = !paused;
});

document.getElementById("clearBtn").addEventListener("click", () => {
  grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
  gridColors = createGrid(GRID_WIDTH, GRID_HEIGHT);
});

// --- MAIN LOOP ---
function loop() {
  const now = performance.now();
  fps = Math.round(1000 / (now - lastTime));
  lastTime = now;

  const fpsEl = document.getElementById("fps");
  if (fpsEl) fpsEl.textContent = fps;

  update();
  render();
  requestAnimationFrame(loop);
}

loop();
