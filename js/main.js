/* =====================================================================
   main.js — 케이크 쌓기 게임 + 엔딩(촛불/손편지)
   순수 JS. 외부 의존성 없음. config.js 의 window.CONFIG 값을 사용.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- config 정리 & 기본값 채우기 ---------- */
  var C = window.CONFIG || {};
  var TARGET = Math.max(3, C.target || 22);

  var DEFAULT_MESSAGES = [
    "생일 축하해 🤍", "한 칸 더!", "잘하고 있어", "조금만 더!",
    "거의 다 왔어 ✨", "최고야", "두근두근", "행복하자 우리",
  ];
  var MESSAGES = (C.messages && C.messages.length ? C.messages.slice() : []);
  for (var mi = MESSAGES.length; mi < TARGET; mi++) {
    MESSAGES.push(DEFAULT_MESSAGES[mi % DEFAULT_MESSAGES.length]);
  }

  var CAKE_COLORS = (C.cakeColors && C.cakeColors.length)
    ? C.cakeColors
    : ["#FF9EC4", "#FFC857", "#FFD8E4", "#B5EAD7", "#C7CEEA", "#FFB7B2"];

  var PHOTOS = (C.photos || []).filter(function (p) { return !!p; });

  // 사진이 없을 때 쓰는 파스텔 그라데이션 배경들
  var PLACEHOLDER_BGS = [
    "linear-gradient(135deg,#FFE9C2,#FFC36B)",  // 옐로우-오렌지
    "linear-gradient(135deg,#CDEBFF,#7CCBFF)",  // 블루
    "linear-gradient(135deg,#CFF6E7,#7BE3C0)",  // 민트
    "linear-gradient(135deg,#FFD9E4,#FF9DBC)",  // 핑크
    "linear-gradient(135deg,#E6DBFF,#BFA3FF)",  // 퍼플
    "linear-gradient(135deg,#FFE2C2,#FFB07C)",  // 살구
  ];

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- DOM 참조 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var titleScreen = $("title-screen");
  var gameScreen = $("game-screen");
  var endingScreen = $("ending-screen");
  var canvas = $("game-canvas");
  var ctx = canvas.getContext("2d");
  var floorCountEl = $("floor-count");
  var comboTag = $("combo-tag");
  var messageBubble = $("message-bubble");
  var dropBtn = $("drop-btn");
  var photoA = document.querySelector(".photo-a");
  var photoB = document.querySelector(".photo-b");

  /* ---------- 타이틀 텍스트 채우기 ---------- */
  (function fillTitle() {
    $("title-name-text").textContent = C.name || "친구";
    if (C.tagline) $("title-tagline").textContent = C.tagline;
    if (C.startLabel) $("start-btn").textContent = C.startLabel;
    $("title-date").textContent = C.date || "";
    $("title-from").textContent = C.from ? ("from. " + C.from) : "";
    $("floor-target").textContent = TARGET;
  })();

  /* =====================================================================
     사운드 (Web Audio API) — 음정이 한 음씩 올라감
     ===================================================================== */
  var audioCtx = null;
  // 펜타토닉 스케일(듣기 편함) Hz
  var SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function playNote(step, opts) {
    if (!audioCtx) return;
    opts = opts || {};
    var freq = opts.freq || SCALE[Math.min(step, SCALE.length - 1)];
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = opts.type || "triangle";
    osc.frequency.setValueAtTime(freq, t);
    var vol = opts.vol == null ? 0.18 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.28));
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + (opts.dur || 0.3));
  }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  /* =====================================================================
     배경 사진 크로스페이드
     ===================================================================== */
  var photoToggle = false;
  function setBackground(index) {
    var bgVal, isImage;
    if (PHOTOS.length) {
      bgVal = "url('" + PHOTOS[index % PHOTOS.length] + "')";
      isImage = true;
    } else {
      bgVal = PLACEHOLDER_BGS[index % PLACEHOLDER_BGS.length];
      isImage = false;
    }
    var next = photoToggle ? photoA : photoB;
    var cur = photoToggle ? photoB : photoA;
    next.style.backgroundImage = bgVal;
    // 그라데이션은 background-image 로도 동작
    next.classList.add("is-on");
    cur.classList.remove("is-on");
    photoToggle = !photoToggle;
  }

  /* =====================================================================
     게임 상태 & 캔버스
     ===================================================================== */
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;            // CSS 픽셀 기준 캔버스 크기
  var BLOCK_H = 38;           // 칸 높이(px)
  var MIN_W = 30;             // 최소 칸 너비
  var FAIL_MIN = 12;          // 겹친 폭이 이보다 작으면 다음 칸이 못 올라감 → 실패
  var groundY = 0;            // 1층이 놓이는 바닥 y
  var baseBlock = null;       // 맨 아래 받침
  var stack = [];             // 쌓인 칸들 {x,width,color,gfx}
  var current = null;         // 움직이는 칸
  var cameraY = 0, cameraTarget = 0;
  var combo = 0;
  var fallingPieces = [];     // 잘려 떨어지는 조각
  var failingBlock = null;    // 실패해서 옆으로 떨어지는 칸
  var gameOverShown = false;  // 게임오버 오버레이 표시 여부
  var playing = false;
  var rafId = null;

  // 게임오버 응원 멘트 (부정적/조롱 금지, 무조건 다정하게)
  var CHEERS = [
    "괜찮아, 한 번 더 해보자! 🤍",
    "지금도 충분히 멋졌어!",
    "아쉽다~ 바로 다시 도전!",
    "거의 다 왔는데! 한 번 더!",
    "연습이라 생각하고 또 가보자 😊",
    "케이크는 천천히 쌓는 맛이지 🍰",
  ];

  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    groundY = H - 90;
  }
  window.addEventListener("resize", function () {
    if (gameScreen.classList.contains("is-active")) resize();
  });

  // initGame: 0층부터 모든 상태를 깨끗이 초기화하고 시작
  function startGame() {
    showScreen(gameScreen);
    resize();
    stack = [];
    fallingPieces = [];
    failingBlock = null;
    gameOverShown = false;
    $("game-over").hidden = true;
    dropBtn.classList.remove("tapped");
    cameraY = cameraTarget = 0;
    combo = 0;
    floorCountEl.textContent = "0";

    var baseW = Math.min(W * 0.46, 230);
    baseBlock = { x: (W - baseW) / 2, width: baseW, color: "#F2E2C4" };
    buildBlockGfx(baseBlock, 0);
    setBackground(0);
    spawnCurrent();
    playing = true;
    if (rafId) cancelAnimationFrame(rafId);
    loop();
  }

  function spawnCurrent() {
    var prev = stack.length ? stack[stack.length - 1] : baseBlock;
    var floor = stack.length;            // 0-based, 다음에 놓일 층
    var color = CAKE_COLORS[floor % CAKE_COLORS.length];
    // 속도는 층이 올라갈수록 살짝 빨라짐
    var speed = 2.0 + Math.min(floor * 0.07, 2.2);
    var fromLeft = floor % 2 === 0;
    current = {
      x: fromLeft ? 0 : W - prev.width,
      width: prev.width,
      color: color,
      dir: fromLeft ? 1 : -1,
      speed: speed,
    };
    buildBlockGfx(current, floor);
  }

  // 층 i 의 칸이 그려질 (카메라 반영된) 화면상의 위쪽 y
  function blockTopY(floorIndex) {
    var bottom = groundY - floorIndex * BLOCK_H + cameraY;
    return bottom - BLOCK_H;
  }

  function loop() {
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function update() {
    // 움직이는 칸 좌우 이동
    if (current && playing) {
      current.x += current.dir * current.speed;
      if (current.x <= 0) { current.x = 0; current.dir = 1; }
      if (current.x + current.width >= W) { current.x = W - current.width; current.dir = -1; }
    }
    // 카메라: 현재 층이 화면 위쪽 35% 근처에 오도록
    var focusFloor = stack.length;
    var desired = (H * 0.38) - (groundY - focusFloor * BLOCK_H) + BLOCK_H;
    cameraTarget = Math.max(0, desired);
    cameraY += (cameraTarget - cameraY) * (REDUCED ? 1 : 0.12);

    // 떨어지는 조각
    for (var i = fallingPieces.length - 1; i >= 0; i--) {
      var p = fallingPieces[i];
      p.vy += 0.8; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      if (p.life <= 0 || p.y > H + 100) fallingPieces.splice(i, 1);
    }

    // 실패한 칸: 균형을 잃고 회전하며 화면 밖으로 낙하
    if (failingBlock) {
      var fb = failingBlock;
      fb.vy += 0.9;
      fb.x += fb.vx;
      fb.y += fb.vy;
      fb.rot += fb.vr;
      if (!gameOverShown && fb.y > H + 140) showGameOver();
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 색을 밝게(+)/어둡게(-) 보정. p: -1 ~ 1
  function shade(hex, p) {
    var h = ("" + hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.substr(0, 2), 16),
        g = parseInt(h.substr(2, 2), 16),
        b = parseInt(h.substr(4, 2), 16);
    var t = p < 0 ? 0 : 255, a = Math.abs(p);
    r = Math.round((t - r) * a + r);
    g = Math.round((t - g) * a + g);
    b = Math.round((t - b) * a + b);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // 블록 생성 시 1회만 계산 → 그릴 때 재사용 (성능)
  function buildBlockGfx(b, floorIndex) {
    var w = b.width;
    // 윗면 아이싱: sin 곡선 기반 부드러운 웨이브
    var bumps = Math.max(2, Math.round(w / 26));
    var amp = 3.2;
    var steps = bumps * 6;
    var icing = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      icing.push({
        x: t * w,
        y: Math.sin(t * bumps * Math.PI * 2 + floorIndex * 0.7) * amp,
      });
    }
    // 아래 가장자리 크림 방울
    var dots = [];
    var dn = Math.max(2, Math.round(w / 22));
    for (var d = 0; d < dn; d++) dots.push((d + 0.5) / dn * w);
    // 데코: 매 3번째 층마다 (체리 또는 스프링클)
    var deco = [];
    if (floorIndex % 3 === 2) {
      if (Math.random() < 0.5) {
        var n = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (var c = 0; c < n; c++) {
          deco.push({ type: "cherry", x: w * (0.32 + 0.36 * Math.random()) });
        }
      } else {
        var cols = ["#FF6FA5", "#FFC857", "#B5EAD7", "#C7CEEA", "#fff"];
        var sc = 3 + (Math.random() * 3 | 0);
        for (var s = 0; s < sc; s++) {
          deco.push({
            type: "sprinkle",
            x: w * (0.15 + 0.7 * Math.random()),
            col: cols[(Math.random() * cols.length) | 0],
            a: Math.random() * Math.PI,
          });
        }
      }
    }
    b.gfx = { icing: icing, dots: dots, deco: deco };
  }

  // 케이크 한 층을 (ox,oy) 좌상단 기준으로 그림
  function paintCake(b, ox, oy) {
    var w = b.width, h = BLOCK_H - 4, r = 9;
    var g = b.gfx;
    // 본체: 위는 밝게 아래는 진하게 세로 그라데이션
    var grad = ctx.createLinearGradient(0, oy, 0, oy + h);
    grad.addColorStop(0, shade(b.color, 0.20));
    grad.addColorStop(1, shade(b.color, -0.16));
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.fillStyle = grad;
    roundRect(ox, oy, w, h, r);
    ctx.fill();
    ctx.restore();

    if (!g) return;

    // 윗면 아이싱(크림) — 부드러운 웨이브, 모서리 밖으로 안 삐져나오게 클립
    ctx.save();
    roundRect(ox, oy, w, h, r);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(ox, oy + 11);
    for (var i = 0; i < g.icing.length; i++) {
      ctx.lineTo(ox + g.icing[i].x, oy + 5 + g.icing[i].y);
    }
    ctx.lineTo(ox + w, oy + 11);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.fill();
    ctx.restore();

    // 아래 가장자리 크림 방울
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (var d = 0; d < g.dots.length; d++) {
      ctx.beginPath();
      ctx.arc(ox + g.dots[d], oy + h - 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 윗 데코 (체리 / 스프링클)
    for (var k = 0; k < g.deco.length; k++) {
      var dec = g.deco[k];
      if (dec.type === "cherry") {
        ctx.strokeStyle = "#6BBF59"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ox + dec.x, oy - 4);
        ctx.lineTo(ox + dec.x + 3, oy - 8);
        ctx.stroke();
        ctx.fillStyle = "#E84C86";
        ctx.beginPath();
        ctx.arc(ox + dec.x, oy - 1, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(ox + dec.x - 1.4, oy - 2.4, 1.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(ox + dec.x, oy + 6);
        ctx.rotate(dec.a);
        ctx.fillStyle = dec.col;
        ctx.fillRect(-2.5, -1, 5, 2);
        ctx.restore();
      }
    }
  }

  function drawBlock(b, floorIndex) {
    var y = blockTopY(floorIndex);
    if (y > H + BLOCK_H || y < -BLOCK_H * 2) return; // 화면 밖
    if (!b.gfx) buildBlockGfx(b, Math.max(0, floorIndex));
    paintCake(b, b.x, y);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // 받침
    drawBlock(baseBlock, -1);
    // 쌓인 칸
    for (var i = 0; i < stack.length; i++) drawBlock(stack[i], i);
    // 움직이는 칸
    if (current && playing) drawBlock(current, stack.length);
    // 떨어지는 조각
    for (var j = 0; j < fallingPieces.length; j++) {
      var p = fallingPieces[j];
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + BLOCK_H / 2);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 40);
      roundRect(-p.w / 2, -BLOCK_H / 2, p.w, BLOCK_H - 4, 8);
      ctx.fill();
      ctx.restore();
    }
    // 실패해서 떨어지는 칸 (회전)
    if (failingBlock && failingBlock.y < H + 200) {
      var fb = failingBlock, fh = BLOCK_H - 4;
      ctx.save();
      ctx.translate(fb.x + fb.width / 2, fb.y + fh / 2);
      ctx.rotate(fb.rot);
      paintCake(fb, -fb.width / 2, -fh / 2);
      ctx.restore();
    }
  }

  /* ---------- 칸 떨어뜨리기 ---------- */
  function drop() {
    if (!playing || !current) return;
    var prev = stack.length ? stack[stack.length - 1] : baseBlock;

    var curLeft = current.x;
    var curRight = current.x + current.width;
    var prevLeft = prev.x;
    var prevRight = prev.x + prev.width;

    var overlapLeft = Math.max(curLeft, prevLeft);
    var overlapRight = Math.min(curRight, prevRight);
    var overlap = overlapRight - overlapLeft;

    var diff = curLeft - prevLeft;

    // --- 실패 판정: 아예 못 걸쳤거나(overlap<=0) 너무 조금 걸침(<FAIL_MIN) ---
    if (overlap < FAIL_MIN) {
      return failDrop(diff);
    }

    var placed;
    var perfect = false;

    if (Math.abs(diff) <= 6) {
      // PERFECT — 안 잘리고 이전 칸에 딱 맞춤
      perfect = true;
      combo++;
      placed = { x: prevLeft, width: prev.width, color: current.color };
      showCombo();
    } else {
      // 겹친 부분만 남기고 어긋난 만큼 잘림 (stack.io 룰)
      combo = 0;
      addFallingPiece(diff > 0 ? overlapRight : curLeft, current.color,
        diff > 0 ? (curRight - overlapRight) : (overlapLeft - curLeft));
      placed = { x: overlapLeft, width: overlap, color: current.color };
    }

    buildBlockGfx(placed, stack.length); // 잘린 최종 폭으로 장식 재계산
    stack.push(placed);
    var floorNo = stack.length;
    floorCountEl.textContent = floorNo;

    // 피드백: 진동 + 사운드 + 메시지 + 사진교체
    vibrate(perfect ? [12, 30, 18] : 22);
    playNote(floorNo - 1, perfect ? { type: "square", vol: 0.16, dur: 0.4 } : {});
    if (perfect) playNote(floorNo + 2, { vol: 0.1, dur: 0.4 });
    showMessage(MESSAGES[(floorNo - 1) % MESSAGES.length]);
    setBackground(floorNo);

    if (floorNo >= TARGET) {
      playing = false;
      setTimeout(goEnding, 700);
      return;
    }
    spawnCurrent();
  }

  // 실패 처리: 현재 칸을 빗나간 쪽으로 넘어뜨리고 게임오버 오버레이로
  function failDrop(diff) {
    playing = false;
    combo = 0;
    var side = diff >= 0 ? 1 : -1;   // 빗나간 방향으로 쓰러짐
    failingBlock = {
      gfx: current.gfx, color: current.color, width: current.width,
      x: current.x, y: blockTopY(stack.length),
      vx: side * 2.4, vy: -2.2, rot: 0, vr: side * 0.13,
    };
    current = null;
    gameOverShown = false;
    vibrate(80);
    playFailSound();
    // 낙하가 길어져도 0.8초 뒤엔 오버레이를 띄움
    setTimeout(showGameOver, 800);
  }

  function playFailSound() {
    if (!audioCtx) return;
    // 살짝 내려가는 두 음 — 부담스럽지 않게
    playNote(0, { freq: 330, type: "sine", vol: 0.12, dur: 0.18 });
    setTimeout(function () {
      playNote(0, { freq: 247, type: "sine", vol: 0.12, dur: 0.3 });
    }, 120);
  }

  function showGameOver() {
    if (gameOverShown) return;
    gameOverShown = true;
    $("go-floors").textContent = stack.length;
    $("go-cheer").textContent = CHEERS[(Math.random() * CHEERS.length) | 0];
    $("game-over").hidden = false;
  }

  function addFallingPiece(x, color, w) {
    if (w < 2) return;
    fallingPieces.push({
      x: x, y: blockTopY(stack.length), w: w, color: color,
      vy: 0, vr: (Math.random() - 0.5) * 0.3, rot: 0, life: 40,
    });
  }

  /* ---------- 게임 중 메시지 / 콤보 ---------- */
  var bubbleTimer = null;
  function showMessage(text) {
    messageBubble.textContent = text;
    messageBubble.classList.remove("show");
    void messageBubble.offsetWidth; // 리플로우로 애니메이션 재시작
    messageBubble.classList.add("show");
  }
  function showCombo() {
    comboTag.textContent = combo > 1 ? ("PERFECT ×" + combo) : "PERFECT!";
    comboTag.classList.remove("pop");
    void comboTag.offsetWidth;
    comboTag.classList.add("pop");
  }

  /* =====================================================================
     입력 (탭 + 스페이스바)
     ===================================================================== */
  dropBtn.addEventListener("click", function () {
    dropBtn.classList.add("tapped");
    drop();
  });
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.key === " ") {
      // 게임오버 중에는 가로채지 않음 → '다시하기' 버튼의 스페이스 동작 유지
      if (gameScreen.classList.contains("is-active") && playing) {
        e.preventDefault();
        dropBtn.classList.add("tapped");
        drop();
      } else if (titleScreen.classList.contains("is-active")) {
        e.preventDefault();
        $("start-btn").click();
      }
    }
  });

  $("start-btn").addEventListener("click", function () {
    ensureAudio();
    playNote(0, { vol: 0.12, dur: 0.4 });
    startGame();
  });

  // 다시하기: 0층부터 완전히 새로 시작
  $("restart-btn").addEventListener("click", function () {
    ensureAudio();
    startGame();
  });

  /* =====================================================================
     화면 전환 헬퍼
     ===================================================================== */
  function showScreen(el) {
    [titleScreen, gameScreen, endingScreen].forEach(function (s) {
      s.classList.toggle("is-active", s === el);
    });
  }

  /* =====================================================================
     엔딩: 케이크 조립 → 소원 → 촛불 → 손편지
     ===================================================================== */
  function goEnding() {
    if (rafId) cancelAnimationFrame(rafId);
    showScreen(endingScreen);
    buildCake();
    var cake = $("cake");
    cake.classList.add("assemble");

    // 층을 순서대로 펼치는 연출
    var tiers = document.querySelectorAll(".cake-tier");
    tiers.forEach(function (t, i) {
      setTimeout(function () {
        t.classList.add("set");
        playNote(i, { vol: 0.12, dur: 0.25 });
      }, REDUCED ? 0 : 250 + i * 120);
    });

    // 케이크 다 모이면 바로 후 불기 단계로
    setTimeout(function () {
      $("blow-panel").hidden = false;
      startBlowPhase();
    }, REDUCED ? 200 : 250 + tiers.length * 120 + 500);
  }

  function buildCake() {
    var tiersEl = $("cake-tiers");
    tiersEl.innerHTML = "";
    // 쌓은 칸 색을 6층 정도로 샘플링해서 케이크 층으로
    var TIERS = Math.min(6, Math.max(3, Math.round(TARGET / 4)));
    var maxW = Math.min(W || window.innerWidth * 0.8, 260);
    for (var i = 0; i < TIERS; i++) {
      var srcIdx = Math.floor((i / TIERS) * stack.length);
      var color = (stack[srcIdx] && stack[srcIdx].color) ||
        CAKE_COLORS[i % CAKE_COLORS.length];
      var div = document.createElement("div");
      div.className = "cake-tier";
      // 위로 갈수록 좁아짐
      var w = maxW * (0.55 + 0.45 * (i + 1) / TIERS);
      div.style.width = w + "px";
      div.style.background = color;
      tiersEl.appendChild(div);
    }
  }

  /* =====================================================================
     촛불 끄기 — 선풍기를 드래그해서 촛불 쪽으로 가져가기
     (폴백: 촛불을 길게 눌러도 꺼짐)
     ===================================================================== */
  var blownOut = false;
  var BLOW_RANGE = 95;     // 촛불 중심에서 이 거리 안에 들면 바람이 닿음(px)
  var BLOW_HOLD = 600;     // 이만큼 머무르면 촛불이 꺼짐(ms)

  function startBlowPhase() {
    blownOut = false;
    setupFan();
    setupCandleHold();
  }

  function setupFan() {
    var fan = $("fan");
    var wind = $("fan-wind");
    var sub = $("blow-sub");
    var armed = false, blowTimer = null;
    var dragging = false, offX = 0, offY = 0;

    fan.hidden = false;
    // 시작 위치: 엔딩 화면 좌측 상단
    placeFan(18, 18);

    function placeFan(left, top) {
      fan.style.left = left + "px";
      fan.style.top = top + "px";
    }
    function fanCenter() {
      var r = fan.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function candleCenter() {
      var r = $("flame").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom };
    }

    function updateProximity() {
      if (blownOut) return;
      var fc = fanCenter(), cc = candleCenter();
      var dx = cc.x - fc.x, dy = cc.y - fc.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      // 바람(연기 줄)을 촛불 방향으로 회전
      var ang = Math.atan2(dy, dx) * 180 / Math.PI;
      wind.style.transform = "translate(-50%,-50%) rotate(" + ang + "deg)";

      var inRange = dist < BLOW_RANGE;
      if (inRange && !armed) {
        armed = true;
        fan.classList.add("fan-fast");
        wind.classList.add("on");
        blowTimer = setTimeout(function () { if (!blownOut) blowOut(); }, BLOW_HOLD);
      } else if (!inRange && armed) {
        armed = false;
        fan.classList.remove("fan-fast");
        wind.classList.remove("on");
        if (blowTimer) { clearTimeout(blowTimer); blowTimer = null; }
      }
    }

    function onDown(e) {
      if (blownOut) return;
      dragging = true;
      try { fan.setPointerCapture(e.pointerId); } catch (err) {}
      var r = fan.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging || blownOut) return;
      var host = endingScreen.getBoundingClientRect();
      var left = e.clientX - host.left - offX;
      var top = e.clientY - host.top - offY;
      // 화면 안으로 가두기
      left = Math.max(0, Math.min(left, host.width - fan.offsetWidth));
      top = Math.max(0, Math.min(top, host.height - fan.offsetHeight));
      placeFan(left, top);
      updateProximity();
    }
    function onUp(e) {
      dragging = false;
      try { fan.releasePointerCapture(e.pointerId); } catch (err) {}
      // 손을 떼도 촛불 범위 안에 놓였으면 계속 바람이 닿음
      updateProximity();
    }

    fan.addEventListener("pointerdown", onDown);
    fan.addEventListener("pointermove", onMove);
    fan.addEventListener("pointerup", onUp);
    fan.addEventListener("pointercancel", onUp);
    // 키보드 접근성: 방향키로 선풍기 이동
    fan.addEventListener("keydown", function (e) {
      if (blownOut) return;
      var step = 24, moved = true;
      var left = parseFloat(fan.style.left) || 0;
      var top = parseFloat(fan.style.top) || 0;
      if (e.key === "ArrowLeft") left -= step;
      else if (e.key === "ArrowRight") left += step;
      else if (e.key === "ArrowUp") top -= step;
      else if (e.key === "ArrowDown") top += step;
      else moved = false;
      if (moved) { e.preventDefault(); placeFan(left, top); updateProximity(); }
    });
  }

  /* ---------- 폴백: 촛불 길게 누르기 ---------- */
  function setupCandleHold() {
    var candle = $("candle");
    var HOLD_MS = 1000;
    var holdRAF = null, holdStart = 0;

    function begin(e) {
      if (blownOut) return;
      e.preventDefault();
      holdStart = performance.now();
      step();
    }
    function step() {
      if (blownOut) return;
      if (performance.now() - holdStart >= HOLD_MS) { blowOut(); return; }
      holdRAF = requestAnimationFrame(step);
    }
    function end() { if (holdRAF) cancelAnimationFrame(holdRAF); }

    candle.addEventListener("pointerdown", begin);
    candle.addEventListener("pointerup", end);
    candle.addEventListener("pointerleave", end);
    candle.addEventListener("pointercancel", end);
    candle.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.code === "Space") && !blownOut) {
        e.preventDefault(); blowOut();
      }
    });
  }

  /* ---------- 촛불이 꺼지는 순간 ---------- */
  function blowOut() {
    if (blownOut) return;
    blownOut = true;
    $("fan").classList.remove("fan-fast");
    $("fan-wind").classList.remove("on");

    $("flame").classList.add("out");
    $("smoke").classList.add("rise");
    vibrate([20, 40, 60]);
    // 낮은 "후—" 음
    playNote(0, { freq: 180, type: "sine", vol: 0.14, dur: 0.5 });

    var panel = $("blow-panel");
    panel.classList.add("hide");
    setTimeout(function () {
      panel.hidden = true;
      $("fan").hidden = true;
    }, 400);

    setTimeout(function () {
      launchConfetti();
      revealFinale();
    }, REDUCED ? 200 : 900);
  }

  /* =====================================================================
     피날레: 손편지 타이핑
     ===================================================================== */
  function revealFinale() {
    var finale = $("finale");
    finale.hidden = false;
    $("letter-sign").textContent = C.letterSign || "";
    typeLetter(C.letter || "생일 축하해 🤍");
    // 축하 멜로디
    if (!REDUCED) {
      [0, 2, 4, 7].forEach(function (n, i) {
        setTimeout(function () { playNote(n, { vol: 0.1, dur: 0.3 }); }, i * 160);
      });
    }
  }

  function typeLetter(text) {
    var el = $("letter");
    el.textContent = "";
    if (REDUCED) { el.textContent = text; return; }
    var caret = document.createElement("span");
    caret.className = "letter-caret";
    caret.textContent = "|";
    var i = 0;
    function step() {
      if (i < text.length) {
        el.textContent = text.slice(0, i + 1);
        el.appendChild(caret);
        i++;
        // 줄바꿈에선 잠깐 쉬어감
        var delay = text[i - 1] === "\n" ? 220 : 55;
        setTimeout(step, delay);
      } else {
        if (caret.parentNode) caret.parentNode.removeChild(caret);
      }
    }
    step();
  }

  /* ---------- 한 번 더 ---------- */
  $("replay-btn").addEventListener("click", function () {
    location.reload();
  });

  /* =====================================================================
     꽃가루 폭죽 (캔버스)
     ===================================================================== */
  function launchConfetti() {
    var cv = $("confetti-canvas");
    var cctx = cv.getContext("2d");
    cv.classList.add("on");
    var cw = cv.width = window.innerWidth;
    var ch = cv.height = window.innerHeight;
    var colors = ["#FF8A3D", "#FFD23F", "#25D6A4", "#38B6FF", "#FF5C8A", "#A06CFF", "#fff"];
    var parts = [];
    var count = REDUCED ? 50 : 160;
    for (var i = 0; i < count; i++) {
      parts.push({
        x: cw / 2 + (Math.random() - 0.5) * 120,
        y: ch * 0.4 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -14 - 4,
        size: 6 + Math.random() * 8,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }
    var frames = 0;
    function draw() {
      cctx.clearRect(0, 0, cw, ch);
      var alive = false;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.vy += 0.35; p.vx *= 0.99;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y < ch + 40) alive = true;
        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(p.rot);
        cctx.fillStyle = p.color;
        cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        cctx.restore();
      }
      frames++;
      if (alive && frames < 260 && !REDUCED) {
        requestAnimationFrame(draw);
      } else {
        cctx.clearRect(0, 0, cw, ch);
        cv.classList.remove("on");
      }
    }
    draw();
  }

  /* ---------- 첫 배경 깔아두기(타이틀에서도 보이게) ---------- */
  setBackground(0);
})();
