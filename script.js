let topZ = 10;
const taskbar = document.getElementById("taskbar-windows");

/* SHARED WINDOW LOGIC
   Works for both static windows and dynamic windows. */
function attachWindowLogic(win) {
  if (!win || win.dataset.windowReady === "true") return;
  win.dataset.windowReady = "true";

  const bar = win.querySelector(".window-header");
  const btnMin = win.querySelector(".btn-min");
  const btnClose = win.querySelector(".btn-close");
  const titleEl = win.querySelector(".window-title");

  if (!bar || !titleEl) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const title = titleEl.textContent.trim();

  const taskBtn = document.createElement("button");
  taskBtn.type = "button";
  taskBtn.className = "taskbar-btn";
  taskBtn.textContent = title;
  taskbar.appendChild(taskBtn);

  const bringToFront = () => {
    topZ++;
    win.style.zIndex = topZ;

    document.querySelectorAll(".app-window").forEach(w => w.classList.remove("active"));
    win.classList.add("active");

    document.querySelectorAll(".taskbar-btn").forEach(btn => btn.classList.remove("active"));
    taskBtn.classList.add("active");
  };

 const showWindow = () => {
  win.classList.remove("minimizing");
  win.classList.add("restoring");

  win.style.display = "flex";
  bringToFront();

  requestAnimationFrame(() => {
    win.classList.remove("restoring");
  });
};

const hideWindow = () => {
  win.classList.add("minimizing");
  taskBtn.classList.remove("active");
  win.classList.remove("active");

  setTimeout(() => {
    win.style.display = "none";
    win.classList.remove("minimizing");
  }, 140);
};

  win.addEventListener("mousedown", bringToFront);

  taskBtn.addEventListener("click", () => {
    if (win.style.display === "none") {
      showWindow();
    } else {
      hideWindow();
    }
  });

  bar.addEventListener("mousedown", e => {
    // Do not drag if the click started on a titlebar button.
    if (e.target.closest("button")) return;

    dragging = true;
    bringToFront();

    const rect = win.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    win.style.left = `${e.clientX - offsetX}px`;
    win.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    saveWindowPosition(win);
  });

  if (btnClose) {
    btnClose.addEventListener("click", e => {
      e.stopPropagation();
      win.remove();
      taskBtn.remove();

      if (win.dataset.id) {
        localStorage.removeItem("win-" + win.dataset.id);
      }
    });
  }

  if (btnMin) {
    btnMin.addEventListener("click", e => {
      e.stopPropagation();
      hideWindow();
    });
  }

  const btnMax = win.querySelector(".btn-max");
  if (btnMax) {
    btnMax.addEventListener("click", e => {
      e.stopPropagation();
      return false;
    });
  }

  bringToFront();
}

/* STATIC WINDOWS */
document.querySelectorAll(".app-window").forEach(win => {

  if (win.dataset.windowId) {
    restoreWindowPosition(win);
  }

  attachWindowLogic(win);
});

function saveWindowPosition(win) {
  const id = win.dataset.id;
  if (!id) return;

  const contentBox = win.querySelector(".content-box");

  localStorage.setItem("win-" + id, JSON.stringify({
    left: parseInt(win.style.left, 10),
    top: parseInt(win.style.top, 10),
    width: parseInt(win.offsetWidth, 10),
    height: parseInt(win.offsetHeight, 10),
    contentHeight: contentBox ? parseInt(contentBox.offsetHeight, 10) : null
  }));
}

function restoreWindowPosition(win) {
  const id = win.dataset.id;
  if (!id) return;

  const saved = localStorage.getItem("win-" + id);
  if (!saved) return;

  try {
    const pos = JSON.parse(saved);
    if (Number.isFinite(pos.left)) win.style.left = pos.left + "px";
    if (Number.isFinite(pos.top)) win.style.top = pos.top + "px";
  } catch (err) {
    localStorage.removeItem("win-" + id);
  }
}

/* START MENU */
const startBtn = document.getElementById("start-btn");
const startMenu = document.getElementById("start-menu");

if (startBtn && startMenu) {
  startBtn.addEventListener("click", e => {
    e.stopPropagation();

    const isOpen = startMenu.style.display === "block";

    startMenu.style.display = isOpen ? "none" : "block";
    startBtn.classList.toggle("active", !isOpen);
  });

  document.addEventListener("click", e => {
    if (
      startMenu.style.display === "block" &&
      !startMenu.contains(e.target) &&
      e.target !== startBtn
    ) {
      startMenu.style.display = "none";
      startBtn.classList.remove("active");
    }
  });

  startMenu.addEventListener("click", e => {
    const link = e.target.closest("a");

    if (!link) return;

    const href = link.getAttribute("href");

    if (href === "#") {
      e.preventDefault();
      return;
    }

    startMenu.style.display = "none";
    startBtn.classList.remove("active");
  });
}


document.querySelectorAll(".desktop-icon[data-window-id]").forEach(icon => {
  icon.addEventListener("click", e => {
    e.preventDefault();

    const windowId = icon.dataset.windowId;
    const existing = document.querySelector(`.app-window[data-window-id="${CSS.escape(windowId)}"]`);

    if (existing) {
      existing.style.display = "flex";
      topZ++;
      existing.style.zIndex = topZ;

      document.querySelectorAll(".app-window").forEach(w => w.classList.remove("active"));
      existing.classList.add("active");

      document.querySelectorAll(".taskbar-btn").forEach(btn => btn.classList.remove("active"));
      const existingTitle = existing.querySelector(".window-title").textContent.trim();
      document.querySelectorAll(".taskbar-btn").forEach(btn => {
        if (btn.textContent.trim() === existingTitle) btn.classList.add("active");
      });
      return;
    }

    createDynamicWindow(icon);
  });
});

function createDynamicWindow(icon) {
  const windowId = icon.dataset.windowId;
  const title = icon.dataset.title || "Window";
  const width = parseInt(icon.dataset.width, 10) || 300;
  const height = parseInt(icon.dataset.height, 10) || 200;
  const sourceId = icon.dataset.source;
  const source = sourceId ? document.getElementById(sourceId) : null;
  const content = source ? source.innerHTML : "";

  const win = document.createElement("div");
  win.className = "app-window";
  win.dataset.windowId = windowId;

  win.style.width = width + "px";
  win.style.height = height + "px";

 
  const customLeft = parseInt(icon.dataset.left, 10);
  const customTop = parseInt(icon.dataset.top, 10);

  if (Number.isFinite(customLeft) && Number.isFinite(customTop)) {
    win.style.left = customLeft + "px";
    win.style.top = customTop + "px";
  } else {
    const iconColumnWidth = 160;
    const padding = 20;
    const taskbarHeight = 60;

    const maxLeft = Math.max(iconColumnWidth, window.innerWidth - width - padding);
    const maxTop = Math.max(padding, window.innerHeight - height - taskbarHeight);

    win.style.left =
      iconColumnWidth +
      Math.random() * Math.max(1, maxLeft - iconColumnWidth) +
      "px";

    win.style.top =
      padding +
      Math.random() * Math.max(1, maxTop - padding) +
      "px";
  }

  win.innerHTML = `
    <div class="window-header">
      <div class="window-title">${escapeHTML(title)}</div>
      <div class="window-buttons">
        <button class="btn-min" aria-label="Minimize"></button>
        <button class="btn-max" aria-label="Maximize"></button>
        <button class="btn-close" aria-label="Close"></button>
      </div>
    </div>
    <div class="window-content">
      <div class="content-box">
        ${content}
      </div>
    </div>
  `;

  document.body.appendChild(win);
  attachWindowLogic(win);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* TASKBAR CLOCK */
const clock = document.getElementById("taskbar-clock");

function updateClock() {
  if (!clock) return;

  const now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();

  if (m < 10) m = "0" + m;
  clock.textContent = `${h}:${m}`;
}

updateClock();
setInterval(updateClock, 60000);

/* LOG OFF + SHUT DOWN */
const logoffLink = document.getElementById("logoff-link");
const shutdownLink = document.getElementById("shutdown-link");

const shutdownScreen = document.createElement("div");
shutdownScreen.id = "shutdown-screen";
shutdownScreen.innerHTML = `
  <div class="shutdown-text">
    It is now safe to turn off your computer.
  </div>
`;
document.body.appendChild(shutdownScreen);

if (logoffLink) {
  logoffLink.addEventListener("click", () => {
    if (startMenu) startMenu.style.display = "none";
    if (startBtn) startBtn.classList.remove("active");

    document.querySelectorAll(".app-window").forEach(win => {
      win.style.display = "none";
      win.classList.remove("active");
    });

    document.querySelectorAll(".taskbar-btn").forEach(btn => {
      btn.classList.remove("active");
    });
  });
}

if (shutdownLink) {
  shutdownLink.addEventListener("click", () => {
    if (startMenu) startMenu.style.display = "none";
    if (startBtn) startBtn.classList.remove("active");
    shutdownScreen.style.display = "flex";
  });
}

shutdownScreen.addEventListener("click", () => {
  shutdownScreen.style.display = "none";
});


/* CD PLAYER */
/* CD PLAYER */
const cdAudio = document.getElementById("cd-audio");
const cdPlay = document.getElementById("cd-play");
const cdPrev = document.getElementById("cd-prev");
const cdNext = document.getElementById("cd-next");
const cdProgress = document.getElementById("cd-progress");
const cdCurrentTime = document.getElementById("cd-current-time");
const cdDuration = document.getElementById("cd-duration");
const cdTrackSelect = document.getElementById("cd-track-select");
const cdCoverImg = document.getElementById("cd-cover-img");

if (
  cdAudio &&
  cdPlay &&
  cdPrev &&
  cdNext &&
  cdProgress &&
  cdCurrentTime &&
  cdDuration &&
  cdTrackSelect &&
  cdCoverImg
) {
  const tracks = Array.from(cdTrackSelect.options);
  const defaultCover = cdCoverImg.getAttribute("src");
  let currentTrack = 0;

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

    return `${mins}:${secs}`;
  };

  const setPlayButton = (isPlaying) => {
    if (isPlaying) {
      cdPlay.textContent = "||";
      cdPlay.classList.add("playing");
    } else {
      cdPlay.textContent = "▶";
      cdPlay.classList.remove("playing");
    }
  };

  const loadTrack = (index, autoplay = false) => {
    currentTrack = index;

    const track = tracks[currentTrack];

    cdTrackSelect.selectedIndex = currentTrack;
    cdAudio.src = track.value;

    cdCoverImg.src = track.dataset.cover || defaultCover;

    cdCurrentTime.textContent = "0:00";
    cdDuration.textContent = "0:00";

    cdProgress.value = 0;
    cdProgress.max = 100;

    cdAudio.load();

    if (autoplay) {
      const playPromise = cdAudio.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => setPlayButton(true))
          .catch(() => setPlayButton(false));
      } else {
        setPlayButton(true);
      }
    } else {
      setPlayButton(false);
    }
  };

  cdPlay.addEventListener("click", () => {
    if (cdAudio.paused) {
      const playPromise = cdAudio.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => setPlayButton(true))
          .catch(() => setPlayButton(false));
      } else {
        setPlayButton(true);
      }
    } else {
      cdAudio.pause();
      setPlayButton(false);
    }
  });

  cdPrev.addEventListener("click", () => {
    currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
    loadTrack(currentTrack, true);
  });

  cdNext.addEventListener("click", () => {
    currentTrack = (currentTrack + 1) % tracks.length;
    loadTrack(currentTrack, true);
  });

  cdTrackSelect.addEventListener("change", () => {
    loadTrack(cdTrackSelect.selectedIndex, true);
  });

  cdAudio.addEventListener("loadedmetadata", () => {
    cdDuration.textContent = formatTime(cdAudio.duration);
    cdProgress.max = Math.floor(cdAudio.duration || 0);
  });

  cdAudio.addEventListener("timeupdate", () => {
    cdCurrentTime.textContent = formatTime(cdAudio.currentTime);
    cdProgress.value = Math.floor(cdAudio.currentTime || 0);
  });

  cdProgress.addEventListener("input", () => {
    cdAudio.currentTime = cdProgress.value;
  });

  cdAudio.addEventListener("ended", () => {
    currentTrack = (currentTrack + 1) % tracks.length;
    loadTrack(currentTrack, true);
  });

  loadTrack(0, false);
}