(() => {
  const ROUND_PAIRS = [
    [0, 10],
    [1, 9],
    [2, 8],
    [3, 7],
    [4, 6],
    [5, 5]
  ];
  const GAME_LENGTH = 60;
  const ROUND_FALL_MS = 1100;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const BALLOON_COLORS = [
    ["#dc82f2", "#81379f"],
    ["#ffc05b", "#e76738"],
    ["#61d5dc", "#25829a"],
    ["#ff8099", "#c83458"],
    ["#a0e978", "#3b8c51"],
    ["#ffe279", "#d88b27"],
    ["#91adf2", "#3f58a0"],
    ["#d0a2ff", "#7546ae"],
    ["#7bd8b7", "#2f826e"],
    ["#ff9b6b", "#c54e35"],
    ["#f6a1c2", "#b63f70"]
  ];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const arena = document.querySelector("#arena");
  const balloonField = document.querySelector("#balloons");
  const timer = document.querySelector("#timer");
  const timerValue = document.querySelector("#timer-value");
  const feedback = document.querySelector("#feedback");
  const character = document.querySelector("#character");
  const mood = document.querySelector("#mood");
  const firstChoice = document.querySelector("#first-choice");
  const secondChoice = document.querySelector("#second-choice");
  const boardHint = document.querySelector("#board-hint");
  const projectile = document.querySelector("#projectile");
  const introOverlay = document.querySelector("#intro-overlay");
  const resultOverlay = document.querySelector("#result-overlay");
  const resultDetails = document.querySelector("#result-details");
  const detailsButton = document.querySelector("#details-button");
  const music = document.querySelector("#background-music");
  const musicButton = document.querySelector("#music-button");
  const musicIcon = document.querySelector("#music-icon");
  const musicStatus = document.querySelector("#music-status");
  music.volume = 0.4;

  let state = "intro";
  let gameStarted = false;
  let timerPaused = true;
  let timeExpired = false;
  let secondsRemaining = GAME_LENGTH;
  let roundNumber = 0;
  let balloonsRemaining = 0;
  let correctPairs = 0;
  let attempts = 0;
  let wrongAnswers = 0;
  let roundsCompleted = 0;
  let selectedIds = [];
  let history = [];
  let audioContext;
  let musicEnabled = true;
  let musicAttempt = 0;
  let arrowNoiseBuffer;

  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
    }
    return shuffled;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function updateTimer() {
    timerValue.textContent = formatTime(secondsRemaining);
    timer.setAttribute("aria-label", `剩餘時間 ${secondsRemaining} 秒`);
    timer.classList.toggle("is-urgent", secondsRemaining <= 10);
  }

  function updateBoard() {
    const selected = selectedIds.map((id) => balloonField.querySelector(`[data-balloon-id="${id}"]`));
    updateAnswerSlot(firstChoice, selected[0]);
    updateAnswerSlot(secondChoice, selected[1]);
    boardHint.textContent = selectedIds.length === 0
      ? "請選擇兩個合起來等於 10 的氣球"
      : selectedIds.length === 1
        ? "再選一個氣球"
        : "正在檢查配對…";
  }

  function updateAnswerSlot(slot, balloon) {
    slot.replaceChildren();
    if (!balloon) {
      slot.textContent = "?";
      slot.classList.remove("has-value");
      slot.setAttribute("aria-label", "尚未選擇氣球");
      return;
    }

    const artwork = balloon.querySelector(".balloon-art").cloneNode(true);
    artwork.classList.remove("balloon-art");
    artwork.classList.add("answer-balloon-art");
    artwork.setAttribute("viewBox", "0 0 100 105");
    artwork.querySelector(".balloon-string").remove();
    artwork.querySelector(".balloon-selection-outline").remove();

    const label = document.createElement("span");
    label.className = "answer-balloon-label";
    label.textContent = balloon.dataset.value;

    slot.classList.add("has-value");
    slot.setAttribute("aria-label", `已選擇 ${balloon.dataset.value} 號氣球`);
    slot.append(artwork, label);
  }

  function setBalloonInputsEnabled(enabled) {
    balloonField.querySelectorAll(".balloon").forEach((balloon) => {
      balloon.disabled = !enabled;
    });
  }

  function makeBalloon(value, index) {
    const balloon = document.createElement("button");
    balloon.type = "button";
    balloon.className = `balloon color-${value} is-falling`;
    balloon.dataset.balloonId = `${roundNumber}-${index}`;
    balloon.dataset.value = String(value);
    balloon.style.setProperty("--fall-delay", `${Math.min(index * 38, 420)}ms`);
    balloon.setAttribute("aria-label", `${value} 號氣球`);
    balloon.setAttribute("aria-pressed", "false");
    balloon.disabled = true;

    const artwork = document.createElementNS(SVG_NS, "svg");
    const gradientId = `balloon-gradient-${roundNumber}-${index}`;
    artwork.classList.add("balloon-art");
    artwork.setAttribute("viewBox", "0 0 100 130");
    artwork.setAttribute("aria-hidden", "true");

    const defs = document.createElementNS(SVG_NS, "defs");
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("x2", "1");
    gradient.setAttribute("y2", "1");
    BALLOON_COLORS[value].forEach((color, colorIndex) => {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", colorIndex === 0 ? "0%" : "100%");
      stop.setAttribute("stop-color", color);
      gradient.append(stop);
    });
    defs.append(gradient);

    const body = document.createElementNS(SVG_NS, "path");
    const bodyPath = "M50 5 C25 5 9 22 9 46 C9 67 24 83 44 92 L50 103 L56 92 C76 83 91 67 91 46 C91 22 75 5 50 5Z";
    const outline = document.createElementNS(SVG_NS, "path");
    outline.classList.add("balloon-selection-outline");
    outline.setAttribute("d", bodyPath);
    outline.setAttribute("stroke-linejoin", "round");

    body.classList.add("balloon-body");
    body.setAttribute("d", bodyPath);
    body.setAttribute("fill", `url(#${gradientId})`);
    body.setAttribute("stroke", "rgba(255,255,255,.82)");
    body.setAttribute("stroke-width", "3");

    const shine = document.createElementNS(SVG_NS, "path");
    shine.setAttribute("d", "M25 25 C30 14 40 11 47 12 C39 18 35 31 34 43 C33 49 27 49 25 43 C22 37 22 31 25 25Z");
    shine.setAttribute("fill", "rgba(255,255,255,.68)");

    const string = document.createElementNS(SVG_NS, "path");
    string.classList.add("balloon-string");
    string.setAttribute("d", "M50 103 C39 111 61 116 49 128");
    string.setAttribute("fill", "none");
    string.setAttribute("stroke", "#77544d");
    string.setAttribute("stroke-width", "2");
    string.setAttribute("stroke-linecap", "round");

    artwork.append(defs, outline, body, shine, string);
    balloon.append(artwork);

    const label = document.createElement("span");
    label.className = "balloon-label";
    label.textContent = String(value);
    balloon.append(label);
    return balloon;
  }

  function arrangeBalloons(balloons) {
    if (balloons.length === 0) return;

    const fieldRect = balloonField.getBoundingClientRect();
    const width = (balloons[0].offsetWidth / fieldRect.width) * 100;
    const height = (balloons[0].offsetHeight / fieldRect.height) * 100;
    const characterRect = character.getBoundingClientRect();
    const balloonWidth = balloons[0].offsetWidth;
    const balloonHeight = balloons[0].offsetHeight;
    const marginX = width * 0.58;
    const marginY = height * 0.6;
    const overlapsCharacter = ({ x, y }) => {
      const centerX = fieldRect.left + (x / 100) * fieldRect.width;
      const centerY = fieldRect.top + (y / 100) * fieldRect.height;
      return centerX - balloonWidth / 2 < characterRect.right
        && centerX + balloonWidth / 2 > characterRect.left
        && centerY - balloonHeight / 2 < characterRect.bottom
        && centerY + balloonHeight / 2 > characterRect.top;
    };
    let bestPositions = [];
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const positions = [];
      let score = Infinity;
      for (let index = 0; index < balloons.length; index += 1) {
        let bestCandidate;
        let bestClearance = -Infinity;
        for (let sample = 0; sample < 150; sample += 1) {
          const candidate = {
            x: marginX + Math.random() * (100 - 2 * marginX),
            y: marginY + Math.random() * (100 - 2 * marginY)
          };
          if (overlapsCharacter(candidate)) continue;
          const clearance = positions.reduce((minimum, other) => Math.min(
            minimum,
            Math.max(Math.abs(candidate.x - other.x) / (width * 1.16),
              Math.abs(candidate.y - other.y) / (height * 1.2))
          ), Infinity);
          if (clearance > bestClearance) {
            bestCandidate = candidate;
            bestClearance = clearance;
          }
          if (clearance >= 1) break;
        }
        positions.push(bestCandidate);
        score = Math.min(score, bestClearance);
      }
      if (score > bestScore) {
        bestPositions = positions;
        bestScore = score;
      }
      if (score >= 1) break;
    }

    balloons.forEach((balloon, index) => {
      balloon.style.left = `${bestPositions[index].x}%`;
      balloon.style.top = `${bestPositions[index].y}%`;
    });
  }

  function setArrowAtBow() {
    const image = character.querySelector(".character-image");
    const characterRect = image.getBoundingClientRect();
    const arenaRect = arena.getBoundingClientRect();
    const aspectRatio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
    const imageHeight = Math.min(characterRect.height, characterRect.width / aspectRatio);
    const imageWidth = imageHeight * aspectRatio;
    const width = projectile.offsetWidth || 68;
    const height = projectile.offsetHeight || 68;
    const x = characterRect.left + (characterRect.width - imageWidth) / 2 + imageWidth * 0.62 - arenaRect.left;
    const y = characterRect.bottom - imageHeight + imageHeight * 0.59 - arenaRect.top;

    projectile.hidden = false;
    projectile.style.left = `${x - width / 2}px`;
    projectile.style.top = `${y - height / 2}px`;
    projectile.style.transform = "rotate(0deg)";
  }

  function getAudioContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!audioContext) audioContext = new AudioContextConstructor();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch((error) => console.warn("Unable to enable balloon sound.", error));
    }
    return audioContext;
  }

  function playBalloonPop() {
    const context = getAudioContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(760, now);
    oscillator.frequency.exponentialRampToValueAtTime(170, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  }

  function playArrowShot() {
    const context = getAudioContext();
    if (!context) return;

    const now = context.currentTime;
    if (!arrowNoiseBuffer) {
      arrowNoiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.24), context.sampleRate);
      const samples = arrowNoiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = Math.random() * 2 - 1;
      }
    }

    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = arrowNoiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1900, now);
    filter.frequency.exponentialRampToValueAtTime(450, now + 0.22);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.055, now + 0.025);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(context.destination);
    noise.start(now);
    noise.stop(now + 0.23);

    const oscillator = context.createOscillator();
    const toneGain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.18);
    toneGain.gain.setValueAtTime(0.035, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(toneGain);
    toneGain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
  }

  function stopBackgroundMusic() {
    musicAttempt += 1;
    music.pause();
  }

  function reportMusicError(error) {
    console.warn("Unable to play background music.", error);
    stopBackgroundMusic();
    musicEnabled = false;
    updateMusicButton();
    musicStatus.textContent = "背景音樂未能播放，請再試一次。";
  }

  function startBackgroundMusic() {
    if (!musicEnabled) return;
    musicStatus.textContent = "";
    const attempt = ++musicAttempt;
    music.play().catch((error) => {
      if (attempt !== musicAttempt || !musicEnabled || !gameStarted) return;
      reportMusicError(error);
    });
  }

  function updateMusicButton() {
    const label = `背景音樂：${musicEnabled ? "開" : "關"}`;
    musicIcon.textContent = musicEnabled ? "🔊" : "🔇";
    musicButton.setAttribute("aria-label", label);
    musicButton.title = label;
    musicButton.setAttribute("aria-pressed", String(musicEnabled));
  }

  function burstBalloon(balloon) {
    balloon.classList.add("is-popping");
    const burst = document.createElement("span");
    burst.className = "balloon-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.textContent = "✦";
    balloon.append(burst);
    playBalloonPop();
  }

  function loadRound() {
    if (timeExpired || secondsRemaining <= 0) {
      finishGame();
      return;
    }

    state = "falling";
    timerPaused = true;
    roundNumber += 1;
    balloonsRemaining = 12;
    selectedIds = [];
    balloonField.replaceChildren();
    setArrowAtBow();
    updateBoard();

    const values = shuffle(ROUND_PAIRS.flatMap((pair) => pair));
    values.forEach((value, index) => {
      balloonField.append(makeBalloon(value, index));
    });
    arrangeBalloons([...balloonField.querySelectorAll(".balloon")]);

    window.setTimeout(() => {
      if (!gameStarted || state !== "falling") return;
      state = "playing";
      timerPaused = false;
      setBalloonInputsEnabled(true);
    }, ROUND_FALL_MS);
  }

  function getPointInArena(element) {
    const arenaRect = arena.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    return {
      x: elementRect.left + elementRect.width / 2 - arenaRect.left,
      y: elementRect.top + elementRect.height / 2 - arenaRect.top
    };
  }

  async function flyArrowTo(target) {
    const arenaRect = arena.getBoundingClientRect();
    const width = projectile.offsetWidth || 68;
    const height = projectile.offsetHeight || 68;
    let currentX = Number.parseFloat(projectile.style.left) + width / 2;
    let currentY = Number.parseFloat(projectile.style.top) + height / 2;
    const targets = target.map(getPointInArena);

    for (const [index, point] of targets.entries()) {
      const deltaX = point.x - currentX;
      const deltaY = point.y - currentY;
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const animation = projectile.animate(
        [
          { transform: `translate(0, 0) rotate(${angle}deg)` },
          { transform: `translate(${deltaX}px, ${deltaY}px) rotate(${angle}deg)` }
        ],
        { duration: reducedMotion ? 1 : 650, easing: "cubic-bezier(0.18, 0.72, 0.25, 1)", fill: "forwards" }
      );
      await animation.finished;
      currentX = point.x;
      currentY = point.y;
      projectile.style.left = `${currentX - width / 2}px`;
      projectile.style.top = `${currentY - height / 2}px`;
      projectile.style.transform = `rotate(${angle}deg)`;
      animation.cancel();

      burstBalloon(target[index]);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    }

    setArrowAtBow();
  }

  function addHistory(first, second, isCorrect) {
    history.push({
      round: roundNumber,
      first,
      second,
      isCorrect
    });
  }

  function settleAfterAnswer() {
    selectedIds = [];
    updateBoard();
    character.classList.remove("is-wrong");
    mood.textContent = "😊";
    feedback.hidden = true;
    feedback.textContent = "";

    if (timeExpired || secondsRemaining <= 0) {
      finishGame();
      return;
    }

    state = "playing";
    setBalloonInputsEnabled(true);
  }

  async function resolveSelection() {
    const selected = selectedIds
      .map((id) => balloonField.querySelector(`[data-balloon-id="${id}"]`))
      .filter(Boolean);
    if (selected.length !== 2) return;

    state = "resolving";
    setBalloonInputsEnabled(false);
    const first = Number(selected[0].dataset.value);
    const second = Number(selected[1].dataset.value);
    attempts += 1;

    if (first + second === 10) {
      correctPairs += 1;
      addHistory(first, second, true);
      playArrowShot();
      await flyArrowTo(selected);
      selected.forEach((balloon) => balloon.remove());
      balloonsRemaining -= 2;
      updateBoard();

      if (balloonsRemaining === 0) {
        roundsCompleted += 1;
        if (timeExpired || secondsRemaining <= 0) {
          finishGame();
          return;
        }
        selectedIds = [];
        updateBoard();
        loadRound();
        return;
      }

      settleAfterAnswer();
      return;
    }

    wrongAnswers += 1;
    addHistory(first, second, false);
    character.classList.add("is-wrong");
    mood.textContent = "😟";
    feedback.textContent = `哎呀！${first} + ${second} 不是 10 喔！`;
    feedback.hidden = false;
    selected.forEach((balloon) => balloon.classList.add("is-selected"));
    await new Promise((resolve) => window.setTimeout(resolve, 1600));
    selected.forEach((balloon) => {
      balloon.classList.remove("is-selected");
      balloon.setAttribute("aria-pressed", "false");
    });
    settleAfterAnswer();
  }

  function finishGame() {
    if (state === "results") return;
    state = "results";
    gameStarted = false;
    timerPaused = true;
    timeExpired = true;
    stopBackgroundMusic();
    selectedIds = [];
    setArrowAtBow();
    setBalloonInputsEnabled(false);
    updateBoard();
    feedback.hidden = true;
    document.querySelector("#result-correct").textContent = `${correctPairs} / ${attempts}`;
    document.querySelector("#result-wrong").textContent = String(wrongAnswers);
    document.querySelector("#result-rounds").textContent = String(roundsCompleted);

    resultDetails.replaceChildren();
    if (history.length === 0) {
      const item = document.createElement("li");
      item.textContent = "今次沒有配對紀錄，再試一次吧！";
      resultDetails.append(item);
    } else {
      history.forEach((entry) => {
        const item = document.createElement("li");
        item.className = entry.isCorrect ? "is-correct" : "is-wrong";
        item.textContent = `第 ${entry.round} 輪：${entry.first} + ${entry.second} — ${entry.isCorrect ? "答對" : "答錯"}`;
        resultDetails.append(item);
      });
    }

    detailsButton.setAttribute("aria-expanded", "false");
    detailsButton.textContent = "查看配對紀錄";
    resultDetails.hidden = true;
    resultOverlay.hidden = false;
  }

  function handleBalloonClick(event) {
    const balloon = event.target.closest(".balloon");
    if (!balloon || state !== "playing" || !gameStarted) return;

    const id = balloon.dataset.balloonId;
    const selectedIndex = selectedIds.indexOf(id);
    if (selectedIndex !== -1) {
      selectedIds.splice(selectedIndex, 1);
      balloon.classList.remove("is-selected");
      balloon.setAttribute("aria-pressed", "false");
      updateBoard();
      return;
    }

    if (selectedIds.length >= 2) return;
    selectedIds.push(id);
    balloon.classList.add("is-selected");
    balloon.setAttribute("aria-pressed", "true");
    updateBoard();
    if (selectedIds.length === 2) resolveSelection();
  }

  function startGame() {
    if (state !== "intro") return;
    getAudioContext();
    gameStarted = true;
    startBackgroundMusic();
    timeExpired = false;
    secondsRemaining = GAME_LENGTH;
    roundNumber = 0;
    balloonsRemaining = 0;
    correctPairs = 0;
    attempts = 0;
    wrongAnswers = 0;
    roundsCompleted = 0;
    history = [];
    updateTimer();
    introOverlay.hidden = true;
    resultOverlay.hidden = true;
    loadRound();
  }

  function replayGame() {
    stopBackgroundMusic();
    resultOverlay.hidden = true;
    introOverlay.hidden = false;
    balloonField.replaceChildren();
    state = "intro";
    gameStarted = false;
    timerPaused = true;
    timeExpired = false;
    secondsRemaining = GAME_LENGTH;
    selectedIds = [];
    setArrowAtBow();
    character.classList.remove("is-wrong");
    mood.textContent = "😊";
    feedback.hidden = true;
    feedback.textContent = "";
    updateTimer();
    updateBoard();
  }

  document.querySelector("#start-button").addEventListener("click", startGame);
  music.addEventListener("error", () => {
    if (musicEnabled && gameStarted) reportMusicError(music.error);
  });
  musicButton.addEventListener("click", () => {
    musicEnabled = !musicEnabled;
    updateMusicButton();
    musicStatus.textContent = "";
    if (musicEnabled && gameStarted) startBackgroundMusic();
    else stopBackgroundMusic();
  });
  document.querySelector("#replay-button").addEventListener("click", replayGame);
  document.querySelector("#details-button").addEventListener("click", () => {
    resultDetails.hidden = !resultDetails.hidden;
    const expanded = !resultDetails.hidden;
    detailsButton.setAttribute("aria-expanded", String(expanded));
    detailsButton.textContent = expanded ? "收起配對紀錄" : "查看配對紀錄";
  });
  balloonField.addEventListener("click", handleBalloonClick);
  window.addEventListener("resize", () => {
    if (state !== "resolving") {
      arrangeBalloons([...balloonField.querySelectorAll(".balloon")]);
      setArrowAtBow();
    }
  });

  window.setInterval(() => {
    if (!gameStarted || timerPaused || state === "intro" || state === "falling" || state === "results") return;
    secondsRemaining = Math.max(0, secondsRemaining - 1);
    updateTimer();
    if (secondsRemaining === 0) {
      timeExpired = true;
      timerPaused = true;
      if (state !== "resolving") finishGame();
    }
  }, 1000);

  updateTimer();
  updateBoard();
  setArrowAtBow();
  character.querySelector(".character-image").addEventListener("load", setArrowAtBow);
})();
