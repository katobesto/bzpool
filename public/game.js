/* ============================================================================
   BILLAR 8 · dos jugadores
   Motor: física 2D, reglas de 8-bolas (el tipo se define por la primera bola
   metida), efecto (giro) con panel, giro visual de las bolas en movimiento y
   apuntado + potencia con arrastre de ratón o táctil.
   ============================================================================ */
(function () {
  "use strict";

  /* ------------------------- DOM ------------------------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const spinCanvas = $("spin");
  const sctx = spinCanvas.getContext("2d");
  const el = {
    powerFill: $("power-fill"),
    msg: $("msg"),
    turnText: $("turn-text"),
    group0: $("group-0"), group1: $("group-1"),
    pocketed0: $("pocketed-0"), pocketed1: $("pocketed-1"),
    player0: $("player-0"), player1: $("player-1"),
    pname0: $("pname-0"), pname1: $("pname-1"),
    turnPopup: $("turn-popup"), turnPopupName: $("turn-popup-name"),
    spinDot: $("spin-dot"),
    modal: $("modal"), modalTitle: $("modal-title"), modalBody: $("modal-body"),
    btnNew: $("btn-new"), btnAgain: $("btn-again"),
    btnSound: $("btn-sound"), btnSpinReset: $("btn-spin-reset"),
    btnMusic: $("btn-music"), btnStart: $("btn-start"),
    chkGuide: $("chk-guide"), chkStartGuide: $("chk-start-guide"),
    name0: $("name-0"), name1: $("name-1"),
    musicSelect: $("music-select"), startScreen: $("start-screen"),
    hud: $("hud"), btnHud: $("btn-hud"),
    startVer: $("start-ver"),
    buildBadge: $("build-badge"),
  };
  // NB: el texto de la insignia se asigna tras declarar BUILD (sección Arranque)

  /* ------------------------- Constantes ------------------------- */
  const BUILD = "10"; // sube este número en cada deploy (se muestra en la pantalla de inicio)
  const W = canvas.width;   // 1120
  const H = canvas.height;  // 600
  const TABLE = { x: 58, y: 49, w: 1004, h: 502 };
  const R = 13.8;         // radio de bola (+15% sobre 12 para que no se vean tan pequeñas)
  const POCKET_R = 34.5;   // radio de captura (escalado con la bola)
  const POCKET_VIS = 35.5;  // radio visual del hueco

  const POCKETS = [
    { x: TABLE.x, y: TABLE.y },
    { x: TABLE.x + TABLE.w, y: TABLE.y },
    { x: TABLE.x, y: TABLE.y + TABLE.h },
    { x: TABLE.x + TABLE.w, y: TABLE.y + TABLE.h },
    { x: TABLE.x + TABLE.w / 2, y: TABLE.y - 2 },
    { x: TABLE.x + TABLE.w / 2, y: TABLE.y + TABLE.h + 2 },
  ];

  const MAXSPEED = 1400;
  const ROLL = 90;         // desaceleración por rodamiento (px/s²) — rodamiento largo
  const FRICTION = 0.35;   // amortiguación proporcional (por segundo)
  const STOP = 12;
  const E_BALL = 0.96;
  const E_CUSH = 0.78;
  const MAXPULL = 320;    // px de estirón (sling) = potencia 100%
  const STICK_LEN = 450; // 25% más largo que antes (360)
  const STICK_PULL = 170; // px que retrocede la punta del palo a potencia total

  const COLORS = {
    1: "#FFC800", 2: "#1653A6", 3: "#E2231A", 4: "#6A2C91",
    5: "#F07018", 6: "#1B9E4B", 7: "#8B2500", 8: "#151515",
    9: "#FFC800", 10: "#1653A6", 11: "#E2231A", 12: "#6A2C91",
    13: "#F07018", 14: "#1B9E4B", 15: "#8B2500",
  };
  const typeOf = (n) => (n === 8 ? "eight" : n < 8 ? "solid" : "stripe");
  const P = (i) => (players[i] && players[i].name) || ("Jugador " + (i + 1));

  /* ------------------------- Estado ------------------------- */
  let cue;
  let objectBalls = [];
  let players = [
    { group: null, name: "Jugador 1" },
    { group: null, name: "Jugador 2" },
  ];
  let currentPlayer = 0;
  let groupsAssigned = false;
  let isBreak = true;
  let state = "aiming";        // 'aiming' | 'shooting' | 'placing' | 'over'
  let spin = { x: 0, y: 0 };  // efecto: x lateral, y vertical (-1..1)
  let aiming = false;
  let aimPoint = null;         // punto de arrastre (coords lógicas)
  let pottedThisShot = { cue: false, balls: [] };
  let soundOn = true;
  let showGuide = false;     // checkbox "Mostrar ayudas de dirección" (por defecto: desactivado)
  let lastSound = 0;
  let cueValid = true;

  const allBalls = () => [cue, ...objectBalls];

  /* ------------------------- Sonido ------------------------- */
  let audio = null;
  function ensureAudio() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function beep(freq, dur, vol, type) {
    if (!soundOn || !audio) return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + dur);
  }
  function playThud(i) { const n = performance.now(); if (n - lastSound < 40) return; lastSound = n; beep(95, 0.08, Math.min(0.5, i), "sine"); }
  function playCushion(i) { const n = performance.now(); if (n - lastSound < 40) return; lastSound = n; beep(70, 0.08, Math.min(0.35, i), "sine"); }
  function playPocket() { beep(150, 0.12, 0.3, "sine"); beep(95, 0.18, 0.2, "sine"); }
  function playCueShot() { beep(240, 0.05, 0.15, "triangle"); }

  /* ------------------------- Rack ------------------------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildRackLayout() {
    const footX = TABLE.x + TABLE.w * 0.72;
    const cy = TABLE.y + TABLE.h / 2;
    const dx = R * 2 * Math.sin(Math.PI / 3) + 0.6;
    const slots = [];
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i <= r; i++) {
        slots.push({ x: footX + r * dx, y: cy + (i - r / 2) * (R * 2 + 0.6) });
      }
    }
    // [0] = vértice (1), [4] = centro de la fila de 3 (8), [10]/[14] esquinas traseras
    const numbers = shuffle([2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
    const assign = new Array(15);
    assign[0] = 1;
    assign[4] = 8;
    let k = 0;
    for (let i = 1; i < 15; i++) {
      if (i === 4) continue;
      assign[i] = numbers[k++];
    }
    if (typeOf(assign[10]) === typeOf(assign[14])) {
      const want = typeOf(assign[10]) === "solid" ? "stripe" : "solid";
      for (let j = 1; j < 10; j++) {
        if (typeOf(assign[j]) === want) {
          const tmp = assign[14]; assign[14] = assign[j]; assign[j] = tmp;
          break;
        }
      }
    }
    return { slots, assign };
  }

  function makeCue() {
    return {
      number: 0, type: "cue",
      x: TABLE.x + TABLE.w * 0.25, y: TABLE.y + TABLE.h / 2,
      vx: 0, vy: 0, active: true, rot: 0, spinX: 0, spinY: 0,
      dirx: 1, diry: 0, speed0: 0, hasHit: false,
    };
  }

  function repositionCueHead() {
    cue.x = TABLE.x + TABLE.w * 0.25;
    cue.y = TABLE.y + TABLE.h / 2;
    cue.vx = cue.vy = 0;
    cue.active = true;
    cue.dirx = 1; cue.diry = 0;
    aimPoint = null;
  }

  function rackBalls() {
    for (const b of objectBalls) {
      b.x = b.hx; b.y = b.hy; b.vx = b.vy = 0;
      b.active = true; b.rot = Math.random() * 6.28;
    }
  }

  function countOnTable(group) {
    return objectBalls.filter((b) => b.active && b.type === group).length;
  }

  function newGame() {
    // conserva los nombres elegidos en la pantalla de inicio
    const n0 = players[0] && players[0].name ? players[0].name : "Jugador 1";
    const n1 = players[1] && players[1].name ? players[1].name : "Jugador 2";
    players = [
      { group: null, name: n0 },
      { group: null, name: n1 },
    ];
    currentPlayer = Math.random() < 0.5 ? 0 : 1;
    groupsAssigned = false;
    isBreak = true;
    spin = { x: 0, y: 0 };
    aiming = false;
    aimPoint = null;
    state = "aiming";
    hideModal();
    updateSpinDot();

    cue = makeCue();
    const { slots, assign } = buildRackLayout();
    objectBalls = [];
    for (let i = 0; i < 15; i++) {
      const n = assign[i];
      objectBalls.push({
        number: n, type: typeOf(n), color: COLORS[n],
        hx: slots[i].x, hy: slots[i].y, x: slots[i].x, y: slots[i].y,
        vx: 0, vy: 0, active: true, rot: Math.random() * 6.28, spinX: 0, spinY: 0,
      });
    }
    repositionCueHead();
    setMsg(P(currentPlayer) + " rompe: estira el palo hacia el lado opuesto al disparo y suelta.");
    updateHUD();
    announceTurn(currentPlayer); // abre el turno del que rompe
  }

  /* ------------------------- Física ------------------------- */
  function integrate(sdt) {
    const AB = allBalls();
    for (const b of AB) {
      if (!b.active) continue;
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;

      if (isPocketed(b)) { pocketize(b); continue; }

      // Curva por efecto lateral (solo la blanca, en movimiento)
      if (b === cue && Math.abs(cue.spinX) > 0.02) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 12) {
          const px = -b.vy / sp, py = b.vx / sp;
          const c = cue.spinX * 240 * sdt;
          b.vx += px * c; b.vy += py * c;
          cue.spinX *= 1 - 0.6 * sdt;
        }
      }

      applyFriction(b, sdt);
      b.rot += (Math.hypot(b.vx, b.vy) * sdt) / R;
      cushion(b);
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < AB.length; i++) {
        for (let j = i + 1; j < AB.length; j++) collide(AB[i], AB[j]);
      }
    }
  }

  function applyFriction(b, sdt) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp <= 0) return;
    let nsp = sp - ROLL * sdt;
    nsp = nsp * (1 - FRICTION * sdt);
    if (nsp < STOP) nsp = 0;
    if (nsp === 0) { b.vx = 0; b.vy = 0; }
    else { const k = nsp / sp; b.vx *= k; b.vy *= k; }
  }

  function cushionSide(b, axis) {
    if (b === cue && Math.abs(cue.spinX) > 0.02) {
      if (axis === "h") b.vy += -cue.spinX * 45;
      else b.vx += cue.spinX * 45;
      cue.spinX *= 0.5;
    }
  }

  function cushion(b) {
    const L = TABLE.x + R, Rt = TABLE.x + TABLE.w - R;
    const T = TABLE.y + R, B = TABLE.y + TABLE.h - R;
    let hit = 0;
    if (b.x < L) { b.x = L; if (b.vx < 0) { b.vx = -b.vx * E_CUSH; b.vy *= 0.985; hit = Math.abs(b.vx); cushionSide(b, "h"); } }
    else if (b.x > Rt) { b.x = Rt; if (b.vx > 0) { b.vx = -b.vx * E_CUSH; b.vy *= 0.985; hit = -b.vx; cushionSide(b, "h"); } }
    if (b.y < T) { b.y = T; if (b.vy < 0) { b.vy = -b.vy * E_CUSH; b.vx *= 0.985; hit = Math.max(hit, Math.abs(b.vy)); cushionSide(b, "v"); } }
    else if (b.y > B) { b.y = B; if (b.vy > 0) { b.vy = -b.vy * E_CUSH; b.vx *= 0.985; hit = Math.max(hit, -b.vy); cushionSide(b, "v"); } }
    if (hit > 40) playCushion(Math.min(1, hit / 600));
  }

  function isPocketed(b) {
    for (const p of POCKETS) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R - 3) return true;
    }
    return false;
  }

  function pocketize(b) {
    b.active = false; b.vx = 0; b.vy = 0;
    if (b === cue) pottedThisShot.cue = true;
    else pottedThisShot.balls.push(b);
    playPocket();
  }

  function applyEnglish() {
    cue.hasHit = true;
    const sp = cue.speed0;
    if (cue.spinY > 0.04) {          // efecto arriba: la blanca "seguirá"
      cue.vx += cue.dirx * cue.spinY * 0.5 * sp;
      cue.vy += cue.diry * cue.spinY * 0.5 * sp;
    } else if (cue.spinY < -0.04) {  // efecto abajo: la blanca "dibuja" hacia atrás
      const k = Math.min(1, -cue.spinY);
      cue.vx = -cue.dirx * k * 0.55 * sp + (Math.random() - 0.5) * 12;
      cue.vy = -cue.diry * k * 0.55 * sp + (Math.random() - 0.5) * 12;
    }
  }

  function collide(a, b) {
    if (!a.active || !b.active) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = 2 * R;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    const overlap = min - d;
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2; b.y += ny * overlap / 2;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const rel = rvx * nx + rvy * ny;
    if (rel < 0) {
      const jimp = (-(1 + E_BALL) * rel) / 2;
      a.vx -= jimp * nx; a.vy -= jimp * ny;
      b.vx += jimp * nx; b.vy += jimp * ny;
      playThud(Math.min(1, Math.abs(rel) / 700));
      if (cue && (a === cue || b === cue) && !cue.hasHit) applyEnglish();
    }
  }

  function allStopped() {
    for (const b of allBalls()) {
      if (b.active && Math.hypot(b.vx, b.vy) >= STOP) return false;
    }
    return true;
  }
  function settle() {
    for (const b of allBalls()) { b.vx = 0; b.vy = 0; }
    cue.spinX = 0; cue.spinY = 0;
  }

  /* ------------------------- Reglas de 8-bolas ------------------------- */
  function resolveShot() {
    const shooter = currentPlayer;
    const opp = 1 - shooter;
    const cueP = pottedThisShot.cue;
    const eight = pottedThisShot.balls.find((b) => b.type === "eight");
    const ballsPotted = pottedThisShot.balls;
    const wasBreak = isBreak;
    isBreak = false;

    // 8 en la apertura
    if (eight && wasBreak) {
      if (cueP) { endGame(opp, "Baja y 8 en la apertura: pierde " + P(shooter) + "."); updateHUD(); return; }
      rackBalls();
      repositionCueHead();
      setMsg("¡8 en la apertura! Se vuelve a repartir, sigue " + P(shooter) + ".");
      state = "aiming";
      updateHUD();
      return;
    }

    // El tipo de cada jugador se decide por la primera bola (sólida/rayada) que meta
    if (!groupsAssigned) {
      const first = ballsPotted.find((b) => b.type === "solid" || b.type === "stripe");
      if (first) {
        players[shooter].group = first.type;
        players[opp].group = first.type === "solid" ? "stripe" : "solid";
        groupsAssigned = true;
      }
    }
    const S = players[shooter];
    const ownPotted = ballsPotted.filter((b) => S.group && b.type === S.group);

    // Resultados con la 8
    if (eight) {
      const cleared = S.group && countOnTable(S.group) === 0;
      if (cueP) endGame(opp, "Cayó la 8 con la blanca: pierde " + P(shooter) + ".");
      else if (cleared) endGame(shooter, "¡" + P(shooter) + " encaja la 8 y gana la partida!");
      else endGame(opp, P(shooter) + " metió la 8 antes de tiempo y pierde.");
      updateHUD();
      return;
    }

    // Bola blanca al hueco → ball in hand para el rival
    if (cueP) {
      currentPlayer = opp;
      cue.active = false;
      state = "placing";
      aimPoint = { x: TABLE.x + TABLE.w * 0.25, y: TABLE.y + TABLE.h / 2 };
      setMsg("¡Baja! " + P(opp) + " arrastra y suelta para colocar la blanca.");
      updateHUD();
      announceTurn(opp);
      return;
    }

    // ¿Continúa el turno?
    let cont;
    if (!groupsAssigned) cont = ballsPotted.some((b) => b.type !== "eight") || (wasBreak && ballsPotted.length > 0);
    else cont = ownPotted.length > 0;

    if (cont) {
      state = "aiming";
      aimPoint = null;
      const on8 = S.group && countOnTable(S.group) === 0;
      setMsg(ownPotted.length
        ? P(shooter) + " repite" + (on8 ? " (¡a por la 8!)" : " su turno.")
        : P(shooter) + " sigue.");
    } else {
      currentPlayer = opp;
      state = "aiming";
      aimPoint = null;
      const O = players[opp];
      const on8 = O.group && countOnTable(O.group) === 0;
      setMsg("Turno de " + P(opp) + (on8 ? " (¡a por la 8!)" : "."));
      announceTurn(opp);
    }
    updateHUD();
  }

  function endGame(winner, reason) {
    state = "over";
    showModal("🏆 " + players[winner].name + " gana", reason + " Pulsa «Jugar de nuevo» para una revancha.");
  }

  function groupLabel(g) { return g === "solid" ? "Sólidas (1-7)" : "Rayadas (9-15)"; }
  /* ------------------------- Apuntado y potencia ------------------------- */
  function aimPull() {
    const c = cue;
    let pt = aimPoint;
    // Slingshot: el punto de arrastre queda del lado OPUESTO al disparo
    if (!pt) pt = { x: c.x - (c.dirx || 1) * 150, y: c.y - (c.diry || 0) * 150 };
    const dx = c.x - pt.x, dy = c.y - pt.y; // desde el arrastre hacia la blanca (y más allá)
    const dist = Math.hypot(dx, dy);
    const power = Math.max(0, Math.min(1, dist / MAXPULL));
    let dir;
    if (dist < 1) dir = { x: c.dirx || 1, y: c.diry || 0 };
    else dir = { x: dx / dist, y: dy / dist };
    return { dist, power, dir };
  }

  function shoot() {
    const pr = aimPull();
    if (pr.power < 0.03) { el.powerFill.style.width = "0%"; return; }
    const sp = pr.power * MAXSPEED;
    cue.vx = pr.dir.x * sp;
    cue.vy = pr.dir.y * sp;
    cue.dirx = pr.dir.x; cue.diry = pr.dir.y;
    cue.speed0 = sp;
    cue.spinX = spin.x; cue.spinY = spin.y;
    cue.hasHit = false;
    pottedThisShot = { cue: false, balls: [] };
    state = "shooting";
    el.powerFill.style.width = "0%";
    playCueShot();
  }

  /* ------------------------- Ball in hand ------------------------- */
  function validCuePos(x, y) {
    if (x < TABLE.x + R || x > TABLE.x + TABLE.w - R) return false;
    if (y < TABLE.y + R || y > TABLE.y + TABLE.h - R) return false;
    for (const b of objectBalls) {
      if (b.active && Math.hypot(b.x - x, b.y - y) < 2 * R + 1) return false;
    }
    return true;
  }
  function moveCue(p) {
    const x = Math.max(TABLE.x + R, Math.min(TABLE.x + TABLE.w - R, p.x));
    const y = Math.max(TABLE.y + R, Math.min(TABLE.y + TABLE.h - R, p.y));
    cue.x = x; cue.y = y;
    cue.active = true;
    cueValid = validCuePos(x, y);
  }
  function dropCue() {
    if (cueValid) {
      state = "aiming";
      aimPoint = null;
      setMsg(P(currentPlayer) + " apunta: estira hacia el lado opuesto para fijar dirección y potencia.");
      updateHUD();
    } else {
      setMsg("Ahí no puedes soltar la blanca (sobre otra bola o fuera de la mesa).");
    }
  }

  /* ------------------------- Entrada: ratón y táctil ------------------------- */
  // mientras esté visible la pantalla de inicio, el juego no toma entradas
  const startOpen = () => !el.startScreen.classList.contains("hidden");
  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches && e.touches.length ? e.touches[0] : e;
    return {
      x: (t.clientX - rect.left) / rect.width * W,
      y: (t.clientY - rect.top) / rect.height * H,
    };
  }
  function onDown(e) {
    if (startOpen()) return;
    ensureAudio();
    const p = toLogical(e);
    if (state === "placing") {
      aimPoint = p;
      moveCue(p);
    } else if (state === "aiming") {
      aiming = true;
      aimPoint = p;
      const pr = aimPull();
      el.powerFill.style.width = (pr.power * 100) + "%";
    }
    if (e.cancelable) e.preventDefault();
  }
  function onMove(e) {
    if (startOpen()) return;
    if (state === "placing") {
      moveCue(toLogical(e));
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (aiming && state === "aiming") {
      aimPoint = toLogical(e);
      const pr = aimPull();
      el.powerFill.style.width = (pr.power * 100) + "%";
      if (e.cancelable) e.preventDefault();
    }
  }
  function onUp(e) {
    if (startOpen()) return;
    if (state === "placing") { dropCue(); if (e.cancelable) e.preventDefault(); return; }
    if (aiming && state === "aiming") {
      aiming = false;
      shoot();
    }
    if (e.cancelable) e.preventDefault();
  }
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp, { passive: false });

  /* ------------------------- Panel de efecto (giro) ------------------------- */
  function drawSpinPad() {
    const s = spinCanvas.width, c = s / 2, k = s / 120; // escala a cualquier tamaño
    sctx.clearRect(0, 0, s, s);
    const g = sctx.createRadialGradient(c - 14 * k, c - 16 * k, 4 * k, c, c, 52 * k);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.6, "#eef1f5");
    g.addColorStop(1, "#c9d2dd");
    sctx.beginPath(); sctx.arc(c, c, 52 * k, 0, 7); sctx.fillStyle = g; sctx.fill();
    sctx.lineWidth = 2 * k; sctx.strokeStyle = "#2b3a4e"; sctx.stroke();
    sctx.strokeStyle = "rgba(0,0,0,0.18)"; sctx.lineWidth = 1 * k;
    sctx.beginPath();
    sctx.moveTo(c - 48 * k, c); sctx.lineTo(c + 48 * k, c);
    sctx.moveTo(c, c - 48 * k); sctx.lineTo(c, c + 48 * k);
    sctx.stroke();
    sctx.beginPath(); sctx.arc(c, c, 40 * k, 0, 7); sctx.stroke();
  }
  function updateSpinDot() {
    el.spinDot.style.left = (50 + spin.x * 42) + "%";
    // spin.y > 0 = toque ARRIBA de la bola → el punto se pinta arriba (arriba en pantalla)
    el.spinDot.style.top = (50 - spin.y * 42) + "%";
  }
  function setSpinFromEvent(e) {
    const rect = spinCanvas.getBoundingClientRect();
    const t = e.touches && e.touches.length ? e.touches[0] : e;
    let dx = (t.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let dy = (t.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    dy = -dy; // arriba en la pantalla = efecto arriba (seguir)
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    spin.x = dx * 0.95; spin.y = dy * 0.95;
    updateSpinDot();
  }
  let spinDrag = false;
  spinCanvas.addEventListener("mousedown", (e) => { if (startOpen()) return; spinDrag = true; ensureAudio(); setSpinFromEvent(e); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => { if (spinDrag && !startOpen()) setSpinFromEvent(e); });
  window.addEventListener("mouseup", () => { spinDrag = false; });
  spinCanvas.addEventListener("touchstart", (e) => { if (startOpen()) return; spinDrag = true; ensureAudio(); setSpinFromEvent(e); e.preventDefault(); }, { passive: false });
  window.addEventListener("touchmove", (e) => { if (spinDrag && !startOpen()) setSpinFromEvent(e); }, { passive: false });
  window.addEventListener("touchend", () => { spinDrag = false; });

  /* ------------------------- Dibujo ------------------------- */
  function line(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function arrow(x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), s = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
    ctx.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }

  function drawTable() {
    ctx.clearRect(0, 0, W, H);
    // madera exterior
    ctx.fillStyle = "#3a2412";
    ctx.fillRect(0, 0, W, H);
    // bandas (cushions)
    const cw = 16;
    rr(TABLE.x - cw, TABLE.y - cw, TABLE.w + 2 * cw, TABLE.h + 2 * cw, 20);
    ctx.fillStyle = "#0a5230";
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#073821"; ctx.stroke();
    // tapete
    const g = ctx.createLinearGradient(0, TABLE.y, 0, TABLE.y + TABLE.h);
    g.addColorStop(0, "#0c7a44");
    g.addColorStop(0.5, "#0a6b3c");
    g.addColorStop(1, "#086136");
    ctx.fillStyle = g;
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);
    // sombra interior del tapete
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 4;
    ctx.strokeRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);
    // línea de cabeza y puntos
    const hx = TABLE.x + TABLE.w * 0.25;
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2;
    line(hx, TABLE.y, hx, TABLE.y + TABLE.h);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    for (const sx of [hx, TABLE.x + TABLE.w * 0.72]) {
      ctx.beginPath(); ctx.arc(sx, TABLE.y + TABLE.h / 2, 4, 0, 7); ctx.fill();
    }
    // huecos
    for (const p of POCKETS) {
      const pg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, POCKET_VIS);
      pg.addColorStop(0, "#000000");
      pg.addColorStop(0.72, "#050805");
      pg.addColorStop(1, "#1c3a28");
      ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_VIS, 0, 7);
      ctx.fillStyle = pg; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = "#2a1a0d"; ctx.stroke();
    }
  }

  function drawBall(b) {
    if (!b.active) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    // sombra
    ctx.beginPath(); ctx.ellipse(2.5, 4, R * 0.95, R * 0.7, 0, 0, 7);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fill();
    // base de la esfera
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7);
    if (b.type === "stripe") { ctx.fillStyle = "#f4f4f4"; ctx.fill(); }
    else if (b.type === "cue") { ctx.fillStyle = "#f6f4ef"; ctx.fill(); }
    else { ctx.fillStyle = b.color; ctx.fill(); }
    // textura que GIRA con el movimiento (banda rayada + marcadores)
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.clip();
    ctx.rotate(b.rot);
    if (b.type === "stripe") {
      ctx.fillStyle = b.color;
      ctx.fillRect(-R, -R * 0.55, R * 2, R * 1.1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.arc(R * 0.55, 0, R * 0.16, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-R * 0.55, 0, R * 0.16, 0, 7); ctx.fill();
    if (b.type === "cue") {
      ctx.fillStyle = "#d63b2f";
      ctx.beginPath(); ctx.arc(0, -R * 0.45, R * 0.14, 0, 7); ctx.fill();
    }
    ctx.restore();
    // número (siempre legible)
    if (b.type !== "cue") {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, 7);
      ctx.fillStyle = "#f4f4f4"; ctx.fill();
      ctx.fillStyle = "#141414";
      ctx.font = "bold " + (b.number > 9 ? R * 0.62 : R * 0.7) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.number, 0, 0.5);
    }
    // brillo especular (fuente de luz fija)
    const sh = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 1, -R * 0.35, -R * 0.4, R * 1.3);
    sh.addColorStop(0, "rgba(255,255,255,0.55)");
    sh.addColorStop(0.35, "rgba(255,255,255,0.10)");
    sh.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7);
    ctx.fillStyle = sh; ctx.fill();
    ctx.restore();
  }

  function raycast(o, dir, maxT) {
    let tHit = maxT, hitBall = null, hitWall = true;
    const ws = [];
    if (dir.x > 0) ws.push((TABLE.x + TABLE.w - R - o.x) / dir.x);
    if (dir.x < 0) ws.push((TABLE.x + R - o.x) / dir.x);
    if (dir.y > 0) ws.push((TABLE.y + TABLE.h - o.y) / dir.y);
    if (dir.y < 0) ws.push((TABLE.y + R - o.y) / dir.y);
    for (const t of ws) if (t > 0) tHit = Math.min(tHit, t);
    for (const b of objectBalls) {
      if (!b.active) continue;
      const ex = b.x - o.x, ey = b.y - o.y;
      const proj = ex * dir.x + ey * dir.y;
      if (proj < 0) continue;
      const d2 = ex * ex + ey * ey - proj * proj;
      const rad = 2 * R;
      if (d2 > rad * rad) continue;
      const t = proj - Math.sqrt(rad * rad - d2);
      if (t > 0 && t < tHit) { tHit = t; hitBall = b; hitWall = false; }
    }
    return { t: tHit, x: o.x + dir.x * tHit, y: o.y + dir.y * tHit, ball: hitWall ? null : hitBall };
  }

  function drawGuide(pr) {
    if (pr.power < 0.02) return;
    const hit = raycast({ x: cue.x, y: cue.y }, pr.dir, 4000);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    line(cue.x, cue.y, hit.x, hit.y);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hit.x, hit.y, R, 0, 7);
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
    if (hit.ball) {
      const obj = hit.ball;
      let ox = obj.x - hit.x, oy = obj.y - hit.y;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol; oy /= ol;
      arrow(hit.x, hit.y, hit.x + ox * 74, hit.y + oy * 74, "#ffd54a", 3);
      const dot = pr.dir.x * ox + pr.dir.y * oy;
      let cx = pr.dir.x - dot * ox, cy = pr.dir.y - dot * oy;
      const cl = Math.hypot(cx, cy);
      if (cl > 0.03) {
        cx /= cl; cy /= cl;
        arrow(hit.x, hit.y, hit.x + cx * 56, hit.y + cy * 56, "#bfe3ff", 2);
      }
    }
  }

  function drawStick(pr) {
    const gap = R + 5 + pr.power * STICK_PULL;
    const bx = cue.x - pr.dir.x * gap;
    const by = cue.y - pr.dir.y * gap;
    const ex = cue.x - pr.dir.x * (gap + STICK_LEN);
    const ey = cue.y - pr.dir.y * (gap + STICK_LEN);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 10;
    line(bx + 3, by + 4, ex + 3, ey + 4);
    const mx = (bx + ex) / 2, my = (by + ey) / 2;
    ctx.strokeStyle = "#5a3b22"; ctx.lineWidth = 9;
    line(ex, ey, mx, my);
    ctx.strokeStyle = "#8a5a30"; ctx.lineWidth = 6.5;
    line(mx, my, bx, by);
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, 7);
    ctx.fillStyle = "#eef3ff"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#2f6db0";
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, 7); ctx.stroke();
    // Línea de potencia: del borde de la blanca hasta la punta del palo (mismo vector)
    drawPowerLine(pr, gap);
  }

  // Línea de potencia: punteada y translúcida, del borde de la blanca hasta la punta del palo.
  // Blanca y fina con potencia leve → roja y más gruesa con potencia total.
  function drawPowerLine(pr, gap) {
    const p = pr.power;
    if (p < 0.02) return; // sin estirón no hay potencia que mostrar
    const x1 = cue.x - pr.dir.x * (R + 2);   // borde de la blanca (lado del estirón)
    const y1 = cue.y - pr.dir.y * (R + 2);
    const x2 = cue.x - pr.dir.x * (gap - 2); // hasta la punta del palo
    const y2 = cue.y - pr.dir.y * (gap - 2);
    // interpolación blanco (255,255,255) → rojo (255,64,64)
    const c = Math.round(255 - 191 * p);
    const alpha = 0.2 + 0.3 * p; // translúcida: ~0.2 leve → ~0.5 máxima
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255," + c + "," + c + "," + alpha + ")";
    ctx.lineWidth = 1.5 + 5 * p; // de 1.5px (leve) a 6.5px (máxima)
    ctx.setLineDash([9, 10]); // punteada
    line(x1, y1, x2, y2);
    ctx.setLineDash([]);
  }

  function render() {
    drawTable();
    for (const b of objectBalls) drawBall(b);
    if (cue.active) drawBall(cue);
    if (state === "aiming") {
      const pr = aimPull();
      if (showGuide) drawGuide(pr); // línea, bola fantasma y flechas de desviación
      drawStick(pr);                // el palo siempre se muestra (es la herramienta de puntería)
    }
    if (state === "placing" && cue.active) {
      ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 6, 0, 7);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cueValid ? "rgba(70,220,120,0.9)" : "rgba(240,80,70,0.9)";
      ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /* ------------------------- HUD ------------------------- */
  function setMsg(m) { el.msg.textContent = m; }
  function showModal(title, body) {
    el.modalTitle.textContent = title;
    el.modalBody.textContent = body;
    el.modal.classList.remove("hidden");
  }
  function hideModal() { el.modal.classList.add("hidden"); }

  /* Popup "Turno de X" en cada cambio de turno (2 s, no bloquea) */
  let announceTimer = 0;
  function announceTurn(i) {
    el.turnPopupName.textContent = P(i);
    el.turnPopup.classList.remove("show");
    void el.turnPopup.offsetWidth; // fuerza reflow para re-iniciar la animación
    el.turnPopup.classList.add("show");
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.turnPopup.classList.remove("show"), 2000);
  }

  function updateHUD() {
    for (let i = 0; i < 2; i++) {
      const pl = players[i];
      const panel = i === 0 ? el.player0 : el.player1;
      const nameEl = i === 0 ? el.pname0 : el.pname1;
      const groupEl = i === 0 ? el.group0 : el.group1;
      const chipsEl = i === 0 ? el.pocketed0 : el.pocketed1;
      panel.classList.toggle("is-turn", currentPlayer === i && state !== "over");
      nameEl.textContent = pl.name; // nombre elegido en la pantalla de inicio
      groupEl.textContent = pl.group ? groupLabel(pl.group) : "— (por definir)";
      groupEl.className = "player__group" + (pl.group ? " " + pl.group : "");
      let html = "";
      if (pl.group) {
        const nums = pl.group === "solid" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
        for (const n of nums) {
          const b = objectBalls.find((bb) => bb.number === n);
          const potted = b && !b.active;
          html += '<span class="ball-chip ' + pl.group + '" style="--c:' + COLORS[n] + ";opacity:" + (potted ? "1" : "0.35") + '"></span>';
        }
        if (countOnTable(pl.group) === 0) html += '<span class="ball-chip b8" title="¡A por la 8!"></span>';
      } else {
        html = '<span class="ball-chip" style="background:#333c4d;opacity:0.6"></span>';
      }
      chipsEl.innerHTML = html;
    }
    if (state === "over") el.turnText.textContent = "Partida terminada";
    else if (state === "placing") el.turnText.textContent = "Bola a mano · " + P(currentPlayer);
    else if (isBreak) el.turnText.textContent = "Rompe: " + P(currentPlayer);
    else {
      const g = players[currentPlayer].group;
      el.turnText.textContent = (g && countOnTable(g) === 0)
        ? P(currentPlayer) + " — ¡a por la 8!"
        : "Turno: " + P(currentPlayer);
    }
  }

  /* ------------------- Música de fondo (carpeta /music) ------------------- */
  const music = {
    audio: null,
    tracks: [],   // mp3 disponibles, leídos del servidor en /api/music
    queue: [],    // lista de reproducción (barajada) o pista única seleccionada
    idx: 0,
    muted: false,
    unlock() {
      if (typeof Audio === "undefined") return;
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.volume = 0.35;
        this.audio.addEventListener("ended", () => this.next());
      }
    },
    playFile(f) {
      if (!this.audio) return;
      this.audio.src = "/music/" + f;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {}); // autoplay bloqueado → ignorar
    },
    // selection = nombre de mp3 concreto, o "" para modo aleatorio (barajar)
    start(selection) {
      this.unlock();
      if (!this.audio) return;
      this.muted = false;
      if (el.btnMusic) {
        el.btnMusic.textContent = "🎶";
        el.btnMusic.setAttribute("aria-pressed", "true");
      }
      if (selection) {
        this.queue = [selection];          // pista elegida: se repite en bucle
        this.idx = 0;
      } else {
        this.queue = this.tracks.slice();  // aleatoria: barajar la lista completa
        for (let i = this.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        this.idx = this.queue.length ? Math.floor(Math.random() * this.queue.length) : 0;
      }
      if (!this.queue.length) return;    // no hay MP3 en /music
      this.playFile(this.queue[this.idx]);
    },
    next() {
      if (!this.queue.length || this.muted) return;
      const last = this.queue[this.idx];
      if (this.idx === this.queue.length - 1) {
        // fin de la lista: nuevo orden aleatorio antes de dar la vuelta
        for (let i = this.queue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        this.idx = 0;
        if (this.queue.length > 1 && this.queue[0] === last) {
          // no repetir la pista que acaba de terminar
          const j = this.queue.findIndex((f, k) => k > 0 && f !== last);
          [this.queue[0], this.queue[j]] = [this.queue[j], this.queue[0]];
        }
      } else {
        this.idx += 1;
      }
      this.playFile(this.queue[this.idx]);
    },
    toggle() {
      this.unlock();
      if (!this.audio || !this.queue.length) return;
      this.muted = !this.muted;
      if (this.muted) this.audio.pause();
      else {
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => {});
      }
      el.btnMusic.textContent = this.muted ? "⏸" : "🎶";
      el.btnMusic.setAttribute("aria-pressed", String(!this.muted));
    },
  };

  function refreshMusicList() {
    if (typeof fetch !== "function") return;
    fetch("/api/music")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        music.tracks = Array.isArray(list) ? list : [];
        const sel = el.musicSelect;
        if (!sel) return;
        sel.innerHTML = "";
        const opt = (v, t) => {
          const o = document.createElement("option");
          o.value = v; o.textContent = t; sel.appendChild(o);
        };
        opt("", "🎲 Aleatoria (barajar la lista)");
        for (const f of music.tracks) opt(f, "♫ " + f.replace(/\.mp3$/i, ""));
        if (!music.tracks.length) {
          opt("__none__", "Sin MP3 en la carpeta /music");
          sel.disabled = true;
        } else {
          sel.disabled = false;
          sel.value = "";
        }
      })
      .catch(() => {});
  }

  /* ------------------- Nombres en localStorage ------------------- */
  const NAMES_KEY = "billar8.nombres";
  function loadNames() {
    try {
      const v = JSON.parse(localStorage.getItem(NAMES_KEY));
      if (Array.isArray(v)) return [String(v[0] || ""), String(v[1] || "")];
    } catch (e) {}
    return ["", ""];
  }
  function saveNames(a, b) {
    try { localStorage.setItem(NAMES_KEY, JSON.stringify([a, b])); } catch (e) {}
  }

  /* --------------------- Pantalla de inicio --------------------- */
  function openStartScreen() {
    const [n0, n1] = loadNames();
    if (n0) el.name0.value = n0;
    if (n1) el.name1.value = n1;
    el.chkStartGuide.checked = showGuide;
    refreshMusicList();
    el.startScreen.classList.remove("hidden");
  }
  async function startGame() {
    try {
      // cierra el teclado móvil si un input lo tiene abierto (iOS)
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const n0 = (el.name0.value || "").trim() || "Jugador 1";
      const n1 = (el.name1.value || "").trim() || "Jugador 2";
      saveNames(n0, n1);
      players[0].name = n0;
      players[1].name = n1;
      showGuide = !!el.chkStartGuide.checked;   // repercute en el check de partida
      el.chkGuide.checked = showGuide;
      ensureAudio();
      // si la lista de canciones aún no llegó desde el servidor, pedirla ahora
      if (!music.tracks.length && typeof fetch === "function") {
        try {
          const r = await fetch("/api/music");
          const list = r.ok ? await r.json() : [];
          music.tracks = Array.isArray(list) ? list : [];
        } catch (e) {}
      }
      music.start(el.musicSelect.value || "");
      el.startScreen.classList.add("hidden");
      newGame();
      setMsg(n0 + " vs " + n1 + " · " + P(currentPlayer) + " rompe.");
    } catch (e) {
      // error visible en pantalla (en el móvil no hay consola a mano)
      console.error("[bzpool] startGame:", e);
      setMsg("⚠️ No se pudo empezar: " + (e && e.message ? e.message : e));
    }
  }

  /* ------------- Panel inferior (HUD): oculto para dar mesa a la pantalla ------------- */
  // En pantallas anchas (16:9) el alto manda: el panel (efecto/potencia/mensajes)
  // se oculta por defecto y se recupera con el botón 🎛️. En vertical (póster/retrato)
  // la mesa está limitada por el ancho, así que el panel se muestra.
  const HUD_KEY = "billar8.hud";
  const hudPref = (() => { try { return localStorage.getItem(HUD_KEY); } catch (e) { return null; } })();
  const isLandscape16x9 = () => {
    const w = window.innerWidth || 0, h = window.innerHeight || 0;
    return h > 0 && w / h > 1.15;
  };
  let hudVisible = hudPref !== null ? hudPref !== "0" : !isLandscape16x9();
  function applyHud() {
    if (!el.hud) return;
    el.hud.classList.toggle("hud--hidden", !hudVisible);
    if (el.btnHud) el.btnHud.setAttribute("aria-pressed", String(hudVisible));
  }
  function setHud(v, persist) {
    hudVisible = !!v;
    applyHud();
    if (persist !== false) {
      try { localStorage.setItem(HUD_KEY, hudVisible ? "1" : "0"); } catch (e) {}
    }
  }
  // si el usuario aún no eligió, sigue a la orientación al girar el dispositivo
  window.addEventListener("resize", () => {
    if (hudPref === null) { hudVisible = !isLandscape16x9(); applyHud(); }
  });

  /* ------------------------- Botones ------------------------- */
  // Toque robusto en móvil: en iOS, el primer toque tras escribir en un input
  // lo "absorbe" el navegador al cerrar el teclado (el click sintético no llega
  // al botón). Se usa touchend (siempre se dispara) y se suprime el click
  // duplicado; en escritorio solo actúa el click.
  let lastTouchTap = 0;
  function onTap(btn, fn) {
    btn.addEventListener("touchend", (e) => {
      e.preventDefault(); // evita el click sintético → sin doble disparo
      lastTouchTap = Date.now();
      fn();
    }, { passive: false });
    btn.addEventListener("click", () => {
      if (Date.now() - lastTouchTap < 600) return; // click derivado del touchend
      fn();
    });
  }
  onTap(el.btnNew, () => { ensureAudio(); openStartScreen(); });
  onTap(el.btnAgain, () => { ensureAudio(); openStartScreen(); });
  onTap(el.btnStart, () => startGame());
  onTap(el.btnMusic, () => music.toggle());
  onTap(el.btnSound, () => {
    soundOn = !soundOn;
    el.btnSound.textContent = soundOn ? "🔊" : "🔇";
    el.btnSound.setAttribute("aria-pressed", String(soundOn));
    ensureAudio();
  });
  onTap(el.btnSpinReset, () => {
    spin = { x: 0, y: 0 };
    updateSpinDot();
    setMsg("Efecto quitado: la blanca irá recta.");
  });
  onTap(el.btnHud, () => setHud(!hudVisible));
  el.chkGuide.addEventListener("change", () => {
    showGuide = el.chkGuide.checked;
    if (!showGuide) setMsg("Ayudas de dirección ocultas: solo el palo.");
  });

  /* ------------------------- Bucle principal ------------------------- */
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (state === "shooting") {
      const SUB = 8, sdt = dt / SUB;
      for (let s = 0; s < SUB; s++) {
        integrate(sdt);
        if (allStopped()) break;
      }
      if (allStopped()) {
        settle();
        resolveShot();
      }
    }
    render();
    requestAnimationFrame(loop);
  }

  /* ------------------------- Arranque ------------------------- */
  if (el.buildBadge) el.buildBadge.textContent = "build " + BUILD;
  if (el.startVer) el.startVer.textContent = "build " + BUILD;
  applyHud(); // estado inicial del panel inferior según orientación
  console.log("[bzpool] build " + BUILD);
  // Punto de depuración (consola del navegador): window.__billar
  if (typeof window !== "undefined") {
    window.__billar = {
      get state() { return state; },
      get currentPlayer() { return currentPlayer; },
      get isBreak() { return isBreak; },
      get cue() { return cue; },
      get balls() { return allBalls(); },
      get players() { return players; },
      get spin() { return spin; },
      get showGuide() { return showGuide; },
    };
  }
  drawSpinPad();
  updateSpinDot();
  newGame();          // mesa de fondo mientras se espera en la pantalla de inicio
  openStartScreen();
  requestAnimationFrame(loop);
})();
