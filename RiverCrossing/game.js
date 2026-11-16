/* 跳石過河 — game page logic.
   Classic script (no modules) so the page also runs from file://. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------------ */

  // Inclusive value ranges for each difficulty. Change them here only.
  var RANGES = {
    easy:   { min: 1, max: 10 },
    normal: { min: 1, max: 15 },
    hard:   { min: 1, max: 20 }
  };
  var MODES = ['quantity', 'number'];
  var TOTAL_QUESTIONS = 8;

  var IMAGE_DIR = './Image/';
  var AUDIO_DIR = './Audio/';
  var IMAGES = [
    'GameBackground.png', 'StoneRed.png', 'StoneBlue.png', 'WatermelonBear.png',
    'NumberMonster.png', 'GemRed.png', 'GemBlue.png'
  ];

  // Every clip filename lives here, so clips added later only need the file.
  var AUDIO = {
    intro: 'Introduction.mp3',
    ask: {
      quantity: { bigger: 'JumpMoreJewel.mp3', smaller: 'JumpFewerJewel.mp3' },
      number:   { bigger: 'JumpLargerNumber.mp3', smaller: 'JumpSmallerNumber.mp3' }
    },
    retry: {
      quantity: { bigger: 'WhichMoreJewel.mp3', smaller: 'WhichFewerJewel.mp3' },
      number:   { bigger: 'WhichLargerNumber.mp3', smaller: 'WhichSmallerNumber.mp3' }
    },
    success: [
      'voice_human_success_01.mp3', 'voice_human_success_02.mp3', 'voice_human_success_03.mp3',
      'voice_human_success_04.mp3', 'voice_human_success_05.mp3'
    ]
  };

  var WORDS = {
    quantity: { bigger: '較多', smaller: '較少' },
    number:   { bigger: '較大', smaller: '較小' }
  };
  var COLOR_NAME = { red: '紅色', blue: '藍色' };

  var INTRO_HTML =
    '<span class="line">石頭上的物件是<span class="hl-red">能量寶石</span>，</span>' +
    '<span class="line">答對能跳上石頭，並儲起<span class="hl-blue">能量</span>！</span>';

  // Stage positions (960 × 536 logical px). A stone's anchor is its top-face centre.
  var POS = {
    near:     { x: 480, y: 478, s: 1.1 },
    left:     { x: 232, y: 292, s: 1 },
    right:    { x: 728, y: 292, s: 1 },
    farLeft:  { x: 372, y: 150, s: 0.3 },
    farRight: { x: 588, y: 150, s: 0.3 },
    below:    { x: 480, y: 660, s: 1.1 }
  };
  var BEAR_BASE_SCALE = 1.1; // the bear is drawn at 100% on the near stone
  var BEAR_FEET_DY = 6;
  var BEAR_HEIGHT = 175;

  // Upper outline of a 380-px stone, relative to its top-face centre: the left
  // and right edges are lines running down from the top tip (measured from the
  // PNG). The gem grid is fitted inside it.
  var STONE_TOP = { y: -62, leftX: -3, leftSlope: 2.3, rightX: 46, rightSlope: 1.75, cx: 4 };

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function T(ms) {
    return reduceMotion ? Math.round(ms * 0.4) : ms;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function noop() {}

  function animate(el, keyframes, options) {
    if (!el.animate) return Promise.resolve();
    var a = el.animate(keyframes, options);
    if (a.finished) return a.finished.then(noop, noop);
    return new Promise(function (resolve) { a.onfinish = resolve; a.oncancel = resolve; });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function make(tag, className) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function fromHtml(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    return box.firstElementChild;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function tr(x, y, s) {
    return 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Keyframes along a quadratic curve p0 -> p2 (control c), scaling s0 -> s1.
  function curveFrames(p0, c, p2, s0, s1, n, extra) {
    var frames = [];
    for (var i = 0; i <= n; i++) {
      var t = easeInOut(i / n);
      var u = 1 - t;
      var x = u * u * p0.x + 2 * u * t * c.x + t * t * p2.x;
      var y = u * u * p0.y + 2 * u * t * c.y + t * t * p2.y;
      var frame = { transform: tr(x, y, s0 + (s1 - s0) * t) + (extra ? extra(i / n) : '') };
      frames.push(frame);
    }
    return frames;
  }

  /* ------------------------------------------------------------------------
     DOM references and settings from the URL
     ------------------------------------------------------------------------ */

  var viewport = document.querySelector('.viewport');
  var stage = $('stage');
  var water = $('water');
  var world = $('world');
  var bear = $('bear');
  var bearBody = bear.querySelector('.bear-body');
  var monster = $('monster');
  var monsterImg = monster.querySelector('.monster-img');
  var fx = $('fx');
  var speech = $('speech');
  var speechText = $('speech-text');
  var speakerBtn = $('speaker-btn');
  var stepsEl = $('steps');
  var goBtn = $('go-btn');
  var confettiEl = $('confetti');
  var resultsEl = $('results');
  var detailsEl = $('details');
  var detailsBtn = $('details-btn');
  var detailsClose = $('details-close');
  var loadingEl = $('loading');
  var loadingFill = $('loading-fill');

  var params = new URLSearchParams(window.location.search);
  var mode = MODES.indexOf(params.get('mode')) >= 0 ? params.get('mode') : 'quantity';
  var difficulty = Object.prototype.hasOwnProperty.call(RANGES, params.get('difficulty'))
    ? params.get('difficulty') : 'easy';
  var range = (function (r) {
    var lo = Math.min(r.min, r.max);
    var hi = Math.max(r.min, r.max);
    return { min: lo, max: hi > lo ? hi : lo + 1 };
  })(RANGES[difficulty]);

  document.body.setAttribute('data-mode', mode);

  /* ------------------------------------------------------------------------
     Stage scaling
     ------------------------------------------------------------------------ */

  var k = 1;

  function fitStage() {
    var w = viewport.clientWidth;
    var h = viewport.clientHeight;
    if (!w || !h) return;
    k = Math.min(w / 960, h / 536);
    stage.style.setProperty('--k', String(k));
  }

  function stagePointOf(el) {
    var r = el.getBoundingClientRect();
    var s = stage.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k };
  }

  /* ------------------------------------------------------------------------
     Audio: one reusable voice channel
     ------------------------------------------------------------------------ */

  var voice = new Audio();
  voice.preload = 'auto';
  var currentVoice = null;
  var voiceDone = null;
  var lastSuccess = -1;

  function stopVoice() {
    if (voiceDone) {
      var done = voiceDone;
      voiceDone = null;
      done();
    }
    try { voice.pause(); } catch (e) { /* ignore */ }
  }

  // Resolves when the clip ends, fails, is blocked or stopped, so a missing
  // clip never stalls the game.
  function playVoice(file) {
    stopVoice();
    currentVoice = file;
    return new Promise(function (resolve) {
      var finished = false;
      var timer;

      function done() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        voice.removeEventListener('ended', done);
        voice.removeEventListener('error', done);
        voice.removeEventListener('loadedmetadata', onMeta);
        if (voiceDone === done) voiceDone = null;
        resolve();
      }

      function onMeta() {
        if (isFinite(voice.duration) && voice.duration > 0) {
          clearTimeout(timer);
          timer = setTimeout(done, Math.max(0, voice.duration - voice.currentTime) * 1000 + 800);
        }
      }

      voiceDone = done;
      voice.addEventListener('ended', done);
      voice.addEventListener('error', done);
      voice.addEventListener('loadedmetadata', onMeta);
      timer = setTimeout(done, 6000);
      voice.src = AUDIO_DIR + file;
      try {
        var p = voice.play();
        if (p && p.catch) p.catch(done);
      } catch (e) {
        done();
      }
    });
  }

  function pickSuccess() {
    var n = AUDIO.success.length;
    var i;
    do {
      i = Math.floor(Math.random() * n);
    } while (n > 1 && i === lastSuccess);
    lastSuccess = i;
    return AUDIO.success[i];
  }

  /* ------------------------------------------------------------------------
     Questions
     ------------------------------------------------------------------------ */

  // Each value is an independent fair-die roll; equal pairs are re-rolled.
  function makeQuestions() {
    var list = [];
    for (var i = 0; i < TOTAL_QUESTIONS; i++) {
      var red;
      var blue;
      do {
        red = randInt(range.min, range.max);
        blue = randInt(range.min, range.max);
      } while (red === blue);
      var compare = Math.random() < 0.5 ? 'bigger' : 'smaller';
      list.push({
        red: red,
        blue: blue,
        compare: compare,
        answer: (red > blue) === (compare === 'bigger') ? 'red' : 'blue',
        attempts: 0,
        firstChoice: null,
        firstTryCorrect: false
      });
    }
    return list;
  }

  function askHtml(q) {
    var word = '<em>' + WORDS[mode][q.compare] + '</em>';
    return (mode === 'quantity' ? '哪一種顏色的寶石' : '哪一個數字的數值') + word + '？';
  }

  function retryHtml(q) {
    var word = '<em>' + WORDS[mode][q.compare] + '</em>';
    return '再幫西瓜熊想一想，' + (mode === 'quantity' ? '哪邊的寶石' : '哪邊的數值') + word + '呢？';
  }

  function plain(html) {
    return html.replace(/<[^>]+>/g, '');
  }

  /* ------------------------------------------------------------------------
     Stones and bear
     ------------------------------------------------------------------------ */

  var S = { start: null, left: null, right: null };
  var choiceResolver = null;
  var refocusStone = null;

  function createStone(color, grey) {
    var el = make('button', 'stone stone-' + color + (grey ? ' is-grey' : ''));
    el.type = 'button';
    el.disabled = true;
    el.setAttribute('aria-label', grey ? '起點石頭' : COLOR_NAME[color] + '石頭');
    el.innerHTML =
      '<span class="stone-body">' +
        '<span class="ripple"></span><span class="ripple ripple-late"></span>' +
        '<img class="stone-img" src="' + IMAGE_DIR + (color === 'red' ? 'StoneRed.png' : 'StoneBlue.png') +
          '" alt="" draggable="false">' +
        '<span class="stone-value"></span>' +
      '</span>';
    var stone = { el: el, color: color, value: el.querySelector('.stone-value'), x: 0, y: 0, s: 1 };
    el.addEventListener('click', function () { onStoneTap(stone); });
    world.insertBefore(el, bear);
    return stone;
  }

  function placeStone(stone, p) {
    stone.x = p.x;
    stone.y = p.y;
    stone.s = p.s;
    stone.el.style.transform = tr(p.x, p.y, p.s);
    stone.el.style.zIndex = String(Math.round(p.y));
  }

  function bearPoint(p) {
    return { x: p.x, y: p.y + BEAR_FEET_DY * p.s, s: p.s / BEAR_BASE_SCALE };
  }

  function placeBear(b) {
    bear.style.transform = tr(b.x, b.y, b.s);
  }

  // Stone glides from `from` to its place, fading in.
  function stoneArrive(stone, from, to, delay, duration) {
    placeStone(stone, to);
    return animate(stone.el, [
      { transform: tr(from.x, from.y, from.s), opacity: 0 },
      { opacity: 1, offset: 0.4 },
      { transform: tr(to.x, to.y, to.s), opacity: 1 }
    ], { duration: duration || T(900), delay: delay || 0, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
  }

  function moveStone(stone, to, duration, easing, fadeOut) {
    var from = { x: stone.x, y: stone.y, s: stone.s };
    placeStone(stone, to);
    if (fadeOut) stone.el.style.opacity = '0';
    return animate(stone.el, [
      { transform: tr(from.x, from.y, from.s), opacity: 1 },
      { transform: tr(to.x, to.y, to.s), opacity: fadeOut ? 0 : 1 }
    ], { duration: duration, easing: easing });
  }

  // Parabolic jump with crouch, stretch and a squash on landing.
  function jumpBear(from, to, opts) {
    opts = opts || {};
    var crouch = T(opts.crouch || 110);
    var air = T(opts.air || 560);
    var land = T(opts.land || 220);
    var dist = Math.sqrt((to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y));
    var height = opts.height || 80 + dist * 0.22;
    var frames = [];
    var n = 16;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      frames.push({
        transform: tr(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t - height * 4 * t * (1 - t),
          from.s + (to.s - from.s) * t
        )
      });
    }
    placeBear(to);
    var total = crouch + air + land;
    var c = crouch / total;
    var a = air / total;
    var l = land / total;
    return Promise.all([
      animate(bear, frames, { duration: air, delay: crouch, easing: 'linear', fill: 'backwards' }),
      animate(bearBody, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.12,0.84)', offset: c },
        { transform: 'scale(0.9,1.12)', offset: c + a * 0.15 },
        { transform: 'scale(1,1)', offset: c + a * 0.55 },
        { transform: 'scale(0.97,1.04)', offset: c + a * 0.95 },
        { transform: 'scale(1.16,0.8)', offset: c + a + l * 0.3 },
        { transform: 'scale(0.97,1.04)', offset: c + a + l * 0.7 },
        { transform: 'scale(1,1)', offset: 1 }
      ], { duration: total })
    ]);
  }

  function bearHop(times, height) {
    var h = height || 34;
    return animate(bearBody, [
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(0) scale(1.1,0.88)', offset: 0.15 },
      { transform: 'translateY(' + -h + 'px) scale(0.94,1.08)', offset: 0.5, easing: 'ease-in' },
      { transform: 'translateY(0) scale(1.1,0.9)', offset: 0.85 },
      { transform: 'translateY(0) scale(1,1)' }
    ], { duration: T(560), iterations: times, easing: 'ease-out' });
  }

  function wobbleBear() {
    return animate(bearBody, [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-11deg)' },
      { transform: 'rotate(9deg)' },
      { transform: 'rotate(-6deg)' },
      { transform: 'rotate(3deg)' },
      { transform: 'rotate(0deg)' }
    ], { duration: T(900), easing: 'ease-in-out' });
  }

  /* ------------------------------------------------------------------------
     Values on the stones
     ------------------------------------------------------------------------ */

  // Gems sit in rows of 5, aligned to the left edge and filled top to bottom.
  // The size is fixed for the whole game so that range.max gems fit, and both
  // stones use the same size so area gives no clue.
  var gemLayout = (function () {
    var rows = Math.max(1, Math.ceil(range.max / 5));
    var size = rows <= 3 ? 32 : Math.max(16, Math.floor((118 - (rows - 1) * 3) / rows));
    var gapX = 4;
    var gapY = 3;
    var half = (5 * size + 4 * gapX) / 2;
    var height = rows * size + (rows - 1) * gapY;
    var tolerance = 6; // a pentagon's corners are transparent
    // Highest top that keeps the widest (first) row inside the stone outline.
    var minTop = STONE_TOP.y + Math.max(
      (half - STONE_TOP.cx - tolerance + STONE_TOP.leftX) / STONE_TOP.leftSlope,
      (half + STONE_TOP.cx - tolerance - STONE_TOP.rightX) / STONE_TOP.rightSlope,
      0
    );
    return {
      size: size,
      stepX: size + gapX,
      stepY: size + gapY,
      left: STONE_TOP.cx - half,
      top: Math.max(-height / 2, minTop)
    };
  })();

  function gemPoint(i) {
    var L = gemLayout;
    return {
      x: L.left + (i % 5) * L.stepX + L.size / 2,
      y: L.top + Math.floor(i / 5) * L.stepY + L.size / 2
    };
  }

  function renderValue(stone, value) {
    var box = stone.value;
    var html = '';
    if (mode === 'quantity') {
      var size = gemLayout.size;
      for (var i = 0; i < value; i++) {
        var p = gemPoint(i);
        html += '<svg class="gem" viewBox="0 0 24 24" style="left:' + (p.x - size / 2).toFixed(1) +
          'px;top:' + (p.y - size / 2).toFixed(1) + 'px;width:' + size + 'px;height:' + size +
          'px;z-index:' + Math.round(p.y + 200) + '"><use href="#gem" width="24" height="24"/></svg>';
      }
      stone.el.setAttribute('aria-label', COLOR_NAME[stone.color] + '石頭，' + value + ' 粒寶石');
    } else {
      // The number stands upright on the stone's top face (see .stone-number).
      html = '<svg class="stone-number" viewBox="-110 -120 220 150">' +
        '<text class="num-face" x="0" y="0" text-anchor="middle">' + value + '</text></svg>';
      stone.el.setAttribute('aria-label', COLOR_NAME[stone.color] + '石頭，數字 ' + value);
    }
    box.style.opacity = '';
    box.innerHTML = html;
    return Array.prototype.slice.call(box.children);
  }

  function revealValues(q) {
    var jobs = [];
    [renderValue(S.left, q.red), renderValue(S.right, q.blue)].forEach(function (items) {
      items.forEach(function (el, i) {
        if (mode === 'number') {
          // Stands up from lying flat on the stone (matches the .stone-number tilt).
          jobs.push(animate(el, [
            { transform: 'perspective(500px) rotateX(88deg)', opacity: 0 },
            { transform: 'perspective(500px) rotateX(-26deg)', opacity: 1, offset: 0.6 },
            { transform: 'perspective(500px) rotateX(-6deg)', opacity: 1, offset: 0.82 },
            { transform: 'perspective(500px) rotateX(-14deg)', opacity: 1 }
          ], { duration: T(560), delay: T(120), easing: 'ease-out', fill: 'backwards' }));
          return;
        }
        jobs.push(animate(el, [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.3)', opacity: 1, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: T(340), delay: T(120 + i * 35), easing: 'ease-out', fill: 'backwards' }));
      });
    });
    return Promise.all(jobs);
  }

  function fadeValues(stone) {
    if (!stone) return Promise.resolve();
    var box = stone.value;
    box.style.opacity = '0';
    return animate(box, [{ opacity: 1 }, { opacity: 0 }], { duration: T(300) }).then(function () {
      box.innerHTML = '';
    });
  }

  /* ------------------------------------------------------------------------
     Choosing a stone
     ------------------------------------------------------------------------ */

  function setChoosable(on) {
    [S.left, S.right].forEach(function (s) {
      s.el.disabled = !on;
      s.el.classList.toggle('is-choosable', on);
    });
  }

  function waitForChoice() {
    return new Promise(function (resolve) {
      choiceResolver = resolve;
      setChoosable(true);
      if (refocusStone) {
        refocusStone.el.focus({ preventScroll: true });
        refocusStone = null;
      }
    });
  }

  // The first tap wins; later taps are ignored until input unlocks again.
  function onStoneTap(stone) {
    if (!choiceResolver || (stone !== S.left && stone !== S.right)) return;
    var resolve = choiceResolver;
    choiceResolver = null;
    refocusStone = document.activeElement === stone.el ? stone : null;
    setChoosable(false);
    resolve(stone);
  }

  /* ------------------------------------------------------------------------
     Monster and speech
     ------------------------------------------------------------------------ */

  var speechToken = 0;

  function monsterEnter() {
    monster.style.opacity = '1';
    return animate(monster, [
      { transform: 'translate(180px,40px) rotate(24deg)', opacity: 0 },
      { transform: 'translate(-14px,-10px) rotate(-6deg)', opacity: 1, offset: 0.65 },
      { transform: 'translate(5px,0) rotate(3deg)', opacity: 1, offset: 0.85 },
      { transform: 'none', opacity: 1 }
    ], { duration: T(900), easing: 'ease-out', fill: 'backwards' });
  }

  function monsterTalk() {
    return animate(monsterImg, [
      { transform: 'rotate(0deg) scale(1,1)' },
      { transform: 'rotate(-5deg) scale(1.05,0.96)' },
      { transform: 'rotate(4deg) scale(0.97,1.04)' },
      { transform: 'rotate(-3deg) scale(1.03,0.98)' },
      { transform: 'rotate(0deg) scale(1,1)' }
    ], { duration: T(1000), easing: 'ease-in-out' });
  }

  function monsterShake() {
    return animate(monster, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-9px) rotate(-4deg)' },
      { transform: 'translateX(8px) rotate(4deg)' },
      { transform: 'translateX(-6px) rotate(-3deg)' },
      { transform: 'translateX(4px) rotate(2deg)' },
      { transform: 'translateX(0)' }
    ], { duration: T(700), easing: 'ease-in-out' });
  }

  function showSpeech(html, file) {
    speechToken++;
    speechText.innerHTML = html;
    if (speech.hidden) {
      speech.hidden = false;
      animate(speech, [
        { transform: 'scale(0.4)', opacity: 0 },
        { transform: 'scale(1.05)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 }
      ], { duration: T(340), easing: 'ease-out' });
    } else {
      animate(speechText, [
        { transform: 'translateY(8px)', opacity: 0 },
        { transform: 'none', opacity: 1 }
      ], { duration: T(260), easing: 'ease-out' });
    }
    monsterTalk();
    return file ? playVoice(file) : Promise.resolve();
  }

  function hideSpeech() {
    if (speech.hidden) return Promise.resolve();
    var token = ++speechToken;
    return animate(speech, [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.6)', opacity: 0 }
    ], { duration: T(220), easing: 'ease-in' }).then(function () {
      if (token === speechToken) speech.hidden = true;
    });
  }

  /* ------------------------------------------------------------------------
     Step indicator
     ------------------------------------------------------------------------ */

  function buildSteps() {
    stepsEl.innerHTML = '';
    for (var i = 0; i < TOTAL_QUESTIONS; i++) {
      var li = make('li', 'step');
      li.setAttribute('aria-label', '第 ' + (i + 1) + ' 題');
      stepsEl.appendChild(li);
    }
  }

  function setCurrentStep(index) {
    Array.prototype.forEach.call(stepsEl.children, function (li, i) {
      var current = i === index;
      li.classList.toggle('is-current', current);
      if (current) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  // The tick is always green, even after a retry; scoring is kept separately.
  function markStepDone(index) {
    var li = stepsEl.children[index];
    li.classList.remove('is-current');
    li.removeAttribute('aria-current');
    li.classList.add('is-done');
    li.setAttribute('aria-label', '第 ' + (index + 1) + ' 題：完成');
    li.innerHTML = '<svg aria-hidden="true"><use href="#icon-tick"/></svg>';
    return animate(li.firstElementChild, [
      { transform: 'scale(0) rotate(-90deg)' },
      { transform: 'scale(1.35) rotate(10deg)', offset: 0.65 },
      { transform: 'scale(1) rotate(0deg)' }
    ], { duration: T(450), easing: 'ease-out' });
  }

  /* ------------------------------------------------------------------------
     Effects
     ------------------------------------------------------------------------ */

  function buildWater() {
    for (var i = 0; i < 18; i++) {
      var g = make('span', 'glint');
      g.style.left = rand(10, 920).toFixed(0) + 'px';
      g.style.top = rand(20, 430).toFixed(0) + 'px';
      g.style.width = rand(18, 54).toFixed(0) + 'px';
      g.style.setProperty('--d', rand(2.4, 4.8).toFixed(2) + 's');
      g.style.setProperty('--delay', rand(0, 4).toFixed(2) + 's');
      g.style.setProperty('--o', rand(0.4, 0.8).toFixed(2));
      water.appendChild(g);
    }
    for (var j = 0; j < 7; j++) {
      var star = fromHtml('<svg class="water-star" aria-hidden="true"><use href="#icon-spark"/></svg>');
      star.style.left = rand(20, 920).toFixed(0) + 'px';
      star.style.top = rand(30, 420).toFixed(0) + 'px';
      star.style.setProperty('--d', rand(2, 3.6).toFixed(2) + 's');
      star.style.setProperty('--delay', rand(0, 3).toFixed(2) + 's');
      water.appendChild(star);
    }
  }

  function sparkle(x, y, count, dist) {
    for (var i = 0; i < count; i++) {
      var sp = fromHtml('<svg class="spark"><use href="#icon-spark"/></svg>');
      fx.appendChild(sp);
      var ang = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
      var r = dist * rand(0.7, 1.2);
      var ex = x + Math.cos(ang) * r;
      var ey = y + Math.sin(ang) * r;
      animate(sp, [
        { transform: tr(x, y, 0.3) + ' rotate(0deg)', opacity: 1 },
        { transform: tr(ex, ey, 1) + ' rotate(90deg)', opacity: 1, offset: 0.6 },
        { transform: tr(ex, ey + 8, 0.2) + ' rotate(180deg)', opacity: 0 }
      ], { duration: T(750), easing: 'ease-out', fill: 'forwards' }).then(remover(sp));
    }
  }

  function remover(el) {
    return function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }

  // Small splash ring and drops at the stone's waterline.
  function splash(stone) {
    var cx = stone.x;
    var cy = stone.y + 112 * stone.s;
    var ring = make('div', 'splash-ring');
    fx.appendChild(ring);
    animate(ring, [
      { transform: tr(cx, cy, 0.5), opacity: 0.95 },
      { transform: tr(cx, cy, 1.3), opacity: 0 }
    ], { duration: T(850), easing: 'ease-out', fill: 'forwards' }).then(remover(ring));
    for (var i = 0; i < 10; i++) {
      var d = make('div', 'drop');
      fx.appendChild(d);
      var x0 = cx + rand(-130, 130);
      var dx = (x0 - cx) * 0.35;
      var h = rand(40, 95);
      var s = rand(0.6, 1.2);
      animate(d, [
        { transform: tr(x0, cy, s), opacity: 1, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: tr(x0 + dx * 0.6, cy - h, s), opacity: 1, offset: 0.45, easing: 'cubic-bezier(.6,0,.8,.4)' },
        { transform: tr(x0 + dx, cy + 14, s * 0.6), opacity: 0 }
      ], { duration: T(rand(650, 900)), delay: T(i * 18), fill: 'both' }).then(remover(d));
    }
  }

  // The gem pops out above the bear, then flies to the step slot.
  function gemShowOff(index, q, stone) {
    var gem = make('img', 'fly-gem');
    gem.alt = '';
    gem.draggable = false;
    gem.src = IMAGE_DIR + (q.answer === 'red' ? 'GemRed.png' : 'GemBlue.png');
    fx.appendChild(gem);

    var b = bearPoint(stone);
    var start = { x: stone.x, y: stone.y };
    var top = { x: b.x + 6 * b.s, y: b.y - BEAR_HEIGHT * b.s - 44 };
    gem.style.transform = tr(top.x, top.y, 1);

    var hop = bearHop(2);
    return animate(gem, [
      { transform: tr(start.x, start.y, 0.2) + ' rotate(-120deg)', opacity: 0 },
      { transform: tr(top.x, top.y - 24, 1.25) + ' rotate(12deg)', opacity: 1, offset: 0.7 },
      { transform: tr(top.x, top.y, 1) + ' rotate(0deg)', opacity: 1 }
    ], { duration: T(650), easing: 'ease-out', fill: 'backwards' }).then(function () {
      sparkle(top.x, top.y, 10, 70);
      return wait(T(750));
    }).then(function () {
      var target = stagePointOf(stepsEl.children[index]);
      var control = { x: (top.x + target.x) / 2, y: Math.min(top.y, target.y) - 70 };
      gem.style.transform = tr(target.x, target.y, 0.42);
      return animate(gem, curveFrames(top, control, target, 1, 0.42, 14), { duration: T(700), easing: 'linear' })
        .then(function () { return target; });
    }).then(function (target) {
      remover(gem)();
      sparkle(target.x, target.y, 6, 34);
      return Promise.all([markStepDone(index), hop]);
    });
  }

  function confetti() {
    if (reduceMotion) return;
    var colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#339af0', '#f783ac', '#ff922b', '#ffffff', '#845ef7'];
    for (var i = 0; i < 100; i++) {
      var c = make('i');
      var w = rand(8, 14);
      c.style.width = w.toFixed(0) + 'px';
      c.style.height = (w * rand(1.2, 1.8)).toFixed(0) + 'px';
      c.style.background = colors[i % colors.length];
      if (i % 5 === 0) c.style.borderRadius = '50%';
      confettiEl.appendChild(c);
      var rot = rand(-900, 900);
      var flip = rand(360, 1080);
      var dur = rand(2600, 4200);
      var frames;
      if (i < 40) {
        // Burst up from around the bear, then fall.
        var x0 = 480 + rand(-40, 40);
        var x1 = x0 + rand(-380, 380);
        var peak = rand(40, 220);
        frames = [
          { transform: 'translate(' + x0 + 'px,400px) rotate(0deg) rotateX(0deg)', easing: 'cubic-bezier(.15,.75,.35,1)' },
          { transform: 'translate(' + ((x0 + x1) / 2) + 'px,' + peak + 'px) rotate(' + rot / 3 + 'deg) rotateX(' + flip / 3 + 'deg)', offset: 0.3, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: 'translate(' + x1 + 'px,580px) rotate(' + rot + 'deg) rotateX(' + flip + 'deg)' }
        ];
      } else {
        // Rain from the top.
        var xs = rand(0, 960);
        var drift = rand(-140, 140);
        frames = [
          { transform: 'translate(' + xs + 'px,-30px) rotate(0deg) rotateX(0deg)' },
          { transform: 'translate(' + (xs + drift * 0.6) + 'px,260px) rotate(' + rot / 2 + 'deg) rotateX(' + flip / 2 + 'deg)' },
          { transform: 'translate(' + (xs + drift) + 'px,580px) rotate(' + rot + 'deg) rotateX(' + flip + 'deg)' }
        ];
      }
      c.style.transform = frames[frames.length - 1].transform;
      animate(c, frames, {
        duration: dur,
        delay: i < 40 ? rand(0, 250) : rand(300, 1800),
        fill: 'backwards'
      }).then(remover(c));
    }
  }

  /* ------------------------------------------------------------------------
     Game flow
     ------------------------------------------------------------------------ */

  var questions = makeQuestions();
  var started = false;

  function preload() {
    var done = 0;
    var tasks = IMAGES.map(function (name) {
      return new Promise(function (resolve) {
        var img = new Image();
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          done++;
          loadingFill.style.width = Math.round(done / IMAGES.length * 100) + '%';
          resolve();
        }
        img.onload = function () {
          if (img.decode) img.decode().then(finish, finish);
          else finish();
        };
        img.onerror = finish;
        img.src = IMAGE_DIR + name;
      });
    });
    return Promise.race([Promise.all(tasks), wait(10000)]);
  }

  function hideLoading() {
    loadingEl.classList.add('is-leaving');
    return wait(reduceMotion ? 0 : 400).then(function () {
      loadingEl.hidden = true;
    });
  }

  function intro() {
    S.start = createStone('blue', true);
    S.left = createStone('red');
    S.right = createStone('blue');

    stoneArrive(S.start, POS.below, POS.near, 0, T(800));
    stoneArrive(S.left, POS.farLeft, POS.left, T(250));
    stoneArrive(S.right, POS.farRight, POS.right, T(380));

    return wait(T(750)).then(function () {
      bear.style.opacity = '1';
      return jumpBear({ x: -90, y: 560, s: 1 }, bearPoint(POS.near), { air: 720, height: 190 });
    }).then(function () {
      return monsterEnter();
    }).then(function () {
      // Keep the line readable for a while even when the clip is missing.
      return Promise.all([showSpeech(INTRO_HTML, AUDIO.intro), wait(1800)]);
    }).then(function () {
      goBtn.hidden = false;
      animate(goBtn, [
        { transform: 'scale(0)', opacity: 0 },
        { transform: 'scale(1.15)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 }
      ], { duration: T(450), easing: 'ease-out' });
    });
  }

  // Resolves with the stone the bear finally stands on (the correct one).
  function playQuestion(index) {
    var q = questions[index];
    setCurrentStep(index);
    // On the first question this runs inside the 「開始」 tap, which unlocks audio on iPad.
    showSpeech(askHtml(q), AUDIO.ask[mode][q.compare]);

    function attempt() {
      var stone;
      var home = bearPoint(S.start);
      return waitForChoice().then(function (chosen) {
        stone = chosen;
        q.attempts++;
        if (q.attempts === 1) {
          q.firstChoice = stone.color;
          q.firstTryCorrect = stone.color === q.answer;
        }
        stone.el.classList.add('is-chosen');
        return wait(300);
      }).then(function () {
        return jumpBear(home, bearPoint(stone));
      }).then(function () {
        if (stone.color === q.answer) {
          hideSpeech();
          var voiceP = playVoice(pickSuccess());
          fadeValues(S.left);
          fadeValues(S.right);
          return Promise.all([
            gemShowOff(index, q, stone),
            Promise.race([voiceP, wait(3600)])
          ]).then(function () { return stone; });
        }
        showSpeech(retryHtml(q), AUDIO.retry[mode][q.compare]);
        monsterShake();
        splash(stone);
        return wobbleBear().then(function () {
          return wait(T(150));
        }).then(function () {
          return jumpBear(bearPoint(stone), home);
        }).then(function () {
          stone.el.classList.remove('is-chosen');
          return attempt();
        });
      });
    }

    return revealValues(q).then(attempt);
  }

  // The "camera" moves towards the chosen stone: the background stays still,
  // the chosen stone (with the bear) slides to the start position, the others
  // slide away and fade, and the next pair arrives from the distance.
  function cameraMove(chosen, spawnNext) {
    var other = chosen === S.left ? S.right : S.left;
    var dx = POS.near.x - chosen.x;
    var dy = POS.near.y - chosen.y;
    var ratio = POS.near.s / chosen.s;
    var duration = T(1000);
    var easing = 'cubic-bezier(.45,.05,.3,1)';
    var fromBear = bearPoint(chosen);
    var jobs = [];

    chosen.el.classList.remove('is-chosen');
    chosen.el.setAttribute('aria-label', COLOR_NAME[chosen.color] + '石頭');

    [other, S.start].forEach(function (s) {
      jobs.push(moveStone(s, { x: s.x + dx, y: s.y + dy, s: s.s * ratio }, duration, easing, true)
        .then(remover(s.el)));
    });
    jobs.push(moveStone(chosen, POS.near, duration, easing, false));

    var toBear = bearPoint(POS.near);
    placeBear(toBear);
    jobs.push(animate(bear, [
      { transform: tr(fromBear.x, fromBear.y, fromBear.s) },
      { transform: tr(toBear.x, toBear.y, toBear.s) }
    ], { duration: duration, easing: easing }));

    var next = null;
    if (spawnNext) {
      next = { left: createStone('red'), right: createStone('blue') };
      jobs.push(stoneArrive(next.left, POS.farLeft, POS.left, Math.round(duration * 0.45)));
      jobs.push(stoneArrive(next.right, POS.farRight, POS.right, Math.round(duration * 0.45) + T(90)));
    }

    return Promise.all(jobs).then(function () {
      S.start = chosen;
      S.left = next ? next.left : null;
      S.right = next ? next.right : null;
    });
  }

  function victory() {
    setCurrentStep(-1);
    hideSpeech();
    playVoice(pickSuccess());
    confetti();
    var hop = bearHop(3, 48);

    var b = bearPoint(POS.near);
    var origin = { x: b.x, y: b.y - 90 };
    var cx = 480;
    var cy = 395;
    var radius = 215;
    var jobs = questions.map(function (q, i) {
      var ang = Math.PI + i * Math.PI / (TOTAL_QUESTIONS - 1);
      var p = { x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) };
      var g = make('img', 'arc-gem');
      g.alt = '';
      g.draggable = false;
      g.src = IMAGE_DIR + (q.answer === 'red' ? 'GemRed.png' : 'GemBlue.png');
      g.style.transform = tr(p.x, p.y, 1);
      fx.appendChild(g);
      var control = { x: (origin.x + p.x) / 2, y: Math.min(origin.y, p.y) - 80 };
      var frames = curveFrames(origin, control, p, 0.2, 1, 12);
      frames[0].opacity = 0;
      frames[2].opacity = 1;
      return animate(g, frames, { duration: T(750), delay: T(i * 120), easing: 'linear', fill: 'backwards' })
        .then(function () {
          g.style.setProperty('--delay', (i * 0.15).toFixed(2) + 's');
          g.classList.add('is-floating');
        });
    });
    // Let the celebration play for a while before the results cover it.
    return Promise.all(jobs.concat([hop])).then(function () {
      return wait(T(2800));
    });
  }

  function gemIcon(color) {
    return '<svg class="gem-' + color + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<use href="#gem" width="24" height="24"/></svg>';
  }

  function chip(color) {
    return color ? '<span class="chip chip-' + color + '">' + COLOR_NAME[color] + '</span>' : '';
  }

  function valueCell(color, value) {
    return '<span class="val val-' + color + '">' + (mode === 'quantity' ? gemIcon(color) : '') + value + '</span>';
  }

  function showResults() {
    var score = questions.filter(function (q) { return q.firstTryCorrect; }).length;
    $('score').textContent = String(score);
    $('score-total').textContent = String(TOTAL_QUESTIONS);
    $('results-gems').innerHTML = questions.map(function (q) {
      return '<img src="' + IMAGE_DIR + (q.answer === 'red' ? 'GemRed.png' : 'GemBlue.png') + '" alt="">';
    }).join('');
    $('replay-btn').href = window.location.href.split('#')[0];

    $('details-body').innerHTML = questions.map(function (q, i) {
      var ok = q.firstTryCorrect;
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="col-q">' + plain(askHtml(q)) + '</td>' +
        '<td>' + valueCell('red', q.red) + '</td>' +
        '<td>' + valueCell('blue', q.blue) + '</td>' +
        '<td>' + chip(q.answer) + '</td>' +
        '<td>' + chip(q.firstChoice) + '</td>' +
        '<td>' + q.attempts + '</td>' +
        '<td><svg class="result-icon" role="img" aria-label="' + (ok ? '答對' : '答錯') + '">' +
          '<use href="#icon-' + (ok ? 'tick' : 'cross') + '"/></svg></td>' +
        '</tr>';
    }).join('');

    resultsEl.hidden = false;
    animate(resultsEl, [{ opacity: 0 }, { opacity: 1 }], { duration: T(300) });
    animate(resultsEl.querySelector('.results-card'), [
      { transform: 'translateY(40px) scale(0.85)', opacity: 0 },
      { transform: 'translateY(-6px) scale(1.03)', opacity: 1, offset: 0.7 },
      { transform: 'none', opacity: 1 }
    ], { duration: T(500), easing: 'ease-out' });
  }

  function openDetails() {
    detailsEl.hidden = false;
    animate(detailsEl.querySelector('.details-card'), [
      { transform: 'translateY(30px)', opacity: 0 },
      { transform: 'none', opacity: 1 }
    ], { duration: T(300), easing: 'ease-out' });
    detailsClose.focus({ preventScroll: true });
  }

  function closeDetails() {
    if (detailsEl.hidden) return;
    detailsEl.hidden = true;
    detailsBtn.focus({ preventScroll: true });
  }

  function runGame() {
    var i = 0;
    function next() {
      if (i >= TOTAL_QUESTIONS) {
        return victory().then(showResults);
      }
      var index = i++;
      return playQuestion(index).then(function (chosen) {
        return cameraMove(chosen, index < TOTAL_QUESTIONS - 1);
      }).then(next);
    }
    return next();
  }

  /* ------------------------------------------------------------------------
     Events and start-up
     ------------------------------------------------------------------------ */

  goBtn.addEventListener('click', function () {
    if (started) return;
    started = true;
    goBtn.hidden = true;
    runGame();
  });

  speakerBtn.addEventListener('click', function () {
    if (!currentVoice) return;
    playVoice(currentVoice);
    monsterTalk();
  });

  detailsBtn.addEventListener('click', openDetails);
  detailsClose.addEventListener('click', closeDetails);
  detailsEl.addEventListener('click', function (e) {
    if (e.target === detailsEl) closeDetails();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeDetails();
  });

  // Enables :active styles on iOS Safari.
  document.addEventListener('touchstart', noop, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { voice.pause(); } catch (e) { /* ignore */ }
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) window.location.reload();
  });

  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);

  fitStage();
  buildSteps();
  buildWater();
  preload().then(hideLoading).then(intro);
})();
