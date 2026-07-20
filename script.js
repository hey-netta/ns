let topZ = 10;
const taskbar = document.getElementById("taskbar-windows");
const mobileLayoutQuery = window.matchMedia("(max-width: 820px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const isMobileLayout = () => mobileLayoutQuery.matches;
const taskButtonsByWindowKey = new Map();
const staticWindowTemplates = new Map();
let mobileWindowObserver = null;
const mobileWindowRatios = new Map();
let mobileActiveLockKey = "";
let mobileActiveLockTimer = 0;
let mobileScrollTrackingEnabled = false;

function keyToDomId(key) {
  return "app-window-" + key.replace(/[^a-z0-9_-]/gi, "-");
}

function getWindowKey(win) {
  if (win.dataset.windowKey) return win.dataset.windowKey;

  if (win.dataset.windowId) {
    win.dataset.windowKey = "dynamic:" + win.dataset.windowId;
  } else if (win.dataset.id) {
    win.dataset.windowKey = "static:" + win.dataset.id;
  } else {
    const title = win.querySelector(".window-title")?.textContent.trim() || "window";
    win.dataset.windowKey = "window:" + title.toLowerCase().replace(/\s+/g, "-");
  }

  return win.dataset.windowKey;
}

function findWindowByKey(key) {
  return document.querySelector(`.app-window[data-window-key="${CSS.escape(key)}"]`);
}

function hasTaskButton(win) {
  return taskButtonsByWindowKey.has(getWindowKey(win));
}

function isOpenWindow(win) {
  return !!win && document.body.contains(win) && hasTaskButton(win);
}

function isVisibleOpenWindow(win) {
  return isOpenWindow(win) && getComputedStyle(win).display !== "none";
}

function setActiveTaskButton(key) {
  document.querySelectorAll(".taskbar-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.windowKey === key);
  });
}

function setActiveWindowClass(key) {
  document.querySelectorAll(".app-window").forEach(win => {
    win.classList.toggle("active", win.dataset.windowKey === key && isVisibleOpenWindow(win));
  });
}

function getHighestOpenWindow() {
  const windows = Array.from(document.querySelectorAll(".app-window"))
    .filter(isVisibleOpenWindow);

  const activeWindow = windows.find(win => win.classList.contains("active"));
  if (activeWindow) return activeWindow;

  return windows
    .map(win => ({
      win,
      z: Number.parseInt(win.style.zIndex || getComputedStyle(win).zIndex, 10)
    }))
    .sort((a, b) => (Number.isFinite(b.z) ? b.z : 0) - (Number.isFinite(a.z) ? a.z : 0))[0]?.win || null;
}

function syncActiveTaskbarToActiveWindow() {
  const focusedWindow = document.activeElement?.closest?.(".app-window");
  const activeWindow = isVisibleOpenWindow(focusedWindow) ? focusedWindow : getHighestOpenWindow();

  if (activeWindow) {
    setActiveWindowClass(getWindowKey(activeWindow));
    setActiveTaskButton(getWindowKey(activeWindow));
  } else {
    setActiveWindowClass("");
    setActiveTaskButton("");
  }
}

function lockMobileActiveTaskButton(key) {
  if (!isMobileLayout()) return;

  mobileActiveLockKey = key;
  setActiveTaskButton(key);
  clearTimeout(mobileActiveLockTimer);

  mobileActiveLockTimer = setTimeout(() => {
    mobileActiveLockKey = "";
  }, reducedMotionQuery.matches ? 100 : 900);
}

const scrollWindowIntoView = win => {
  if (isMobileLayout()) {
    win.scrollIntoView({
      block: "start",
      behavior: reducedMotionQuery.matches ? "auto" : "smooth"
    });
  }
};

function focusWindow(win) {
  if (!win) return;
  win.focus({ preventScroll: true });
}

function activateWindow(win, options = {}) {
  if (!win) return;

  const key = getWindowKey(win);
  const wasHidden = win.style.display === "none";

  win.classList.remove("minimizing");
  if (wasHidden) {
    win.classList.add("restoring");
  }

  win.style.display = "flex";

  topZ++;
  win.style.zIndex = topZ;

  document.querySelectorAll(".app-window").forEach(w => w.classList.remove("active"));
  win.classList.add("active");
  setActiveTaskButton(key);

  if (options.focus !== false) {
    focusWindow(win);
  }

  if (options.scroll) {
    lockMobileActiveTaskButton(key);
    scrollWindowIntoView(win);
  }

  if (wasHidden) {
    requestAnimationFrame(() => {
      win.classList.remove("restoring");
    });
  }
}

function getOrCreateTaskButton(key, title, options = {}) {
  let taskBtn = taskButtonsByWindowKey.get(key);

  if (!taskBtn) {
    taskBtn = document.createElement("button");
    taskBtn.type = "button";
    taskBtn.className = "taskbar-btn";
    taskBtn.dataset.windowKey = key;
    taskBtn.textContent = title;

    taskBtn.addEventListener("click", () => {
      const win = findWindowByKey(key);

      activateWindow(win, {
        focus: true,
        scroll: isMobileLayout()
      });
    });

    taskbar.appendChild(taskBtn);
    taskButtonsByWindowKey.set(key, taskBtn);
  }

  taskBtn.textContent = title;

  if (options.windowCreated !== undefined) {
    taskBtn.dataset.windowCreated = options.windowCreated ? "true" : "false";
  }

  return taskBtn;
}

function ensureTaskButton(win) {
  const key = getWindowKey(win);
  const title = win.querySelector(".window-title")?.textContent.trim() || "Window";
  const taskBtn = getOrCreateTaskButton(key, title, {
    windowCreated: true
  });

  taskBtn.setAttribute("aria-controls", win.id || keyToDomId(key));
  return taskBtn;
}

function removeTaskButton(win) {
  const key = getWindowKey(win);
  const taskBtn = taskButtonsByWindowKey.get(key);

  if (taskBtn) {
    taskBtn.remove();
    taskButtonsByWindowKey.delete(key);
  }
}

function closeStartMenu() {
  if (startMenu) startMenu.style.display = "none";
  if (startBtn) startBtn.classList.remove("active");
}

function openStaticWindow(staticId) {
  let win = findWindowByKey("static:" + staticId) ||
    document.querySelector(`.app-window[data-id="${CSS.escape(staticId)}"]`);

  if (!win) {
    const template = staticWindowTemplates.get(staticId);
    if (!template) return null;

    win = template.cloneNode(true);
    document.body.appendChild(win);
    attachWindowLogic(win);
  }

  if (!win.dataset.windowReady) {
    attachWindowLogic(win);
  }

  ensureTaskButton(win);

  if (mobileWindowObserver) {
    mobileWindowObserver.observe(win);
  }

  activateWindow(win, {
    focus: true,
    scroll: isMobileLayout()
  });

  return win;
}

function openDynamicWindow(launcher) {
  const windowId = launcher.dataset.windowId;
  const existing = findWindowByKey("dynamic:" + windowId);

  if (existing) {
    applyFranklinWindowLayout(existing);
    activateWindow(existing, {
      focus: true,
      scroll: isMobileLayout()
    });
    return existing;
  }

  return createDynamicWindow(launcher);
}

function launchWindowFromElement(launcher) {
  if (launcher.dataset.staticId) {
    return openStaticWindow(launcher.dataset.staticId);
  }

  if (launcher.dataset.windowId) {
    return openDynamicWindow(launcher);
  }

  return null;
}

function setProjectTab(tabRoot, selectedTab, options = {}) {
  if (!tabRoot || !selectedTab) return;

  const selectedKey = selectedTab.dataset.projectTab;
  const tabs = Array.from(tabRoot.querySelectorAll("[data-project-tab]"));
  const panels = Array.from(tabRoot.querySelectorAll("[data-project-panel]"));

  tabs.forEach(tab => {
    const isSelected = tab === selectedTab;

    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  panels.forEach(panel => {
    panel.hidden = panel.dataset.projectPanel !== selectedKey;
  });

  if (options.focus) {
    selectedTab.focus();
  }
}

function initializeProjectTabs(win) {
  const tabRoot = win.querySelector(".projects-tabs");
  if (!tabRoot || tabRoot.dataset.tabsReady === "true") return;

  tabRoot.dataset.tabsReady = "true";

  const windowId = (win.id || keyToDomId(getWindowKey(win))).replace(/[^a-z0-9_-]/gi, "-");
  const tabs = Array.from(tabRoot.querySelectorAll("[data-project-tab]"));

  tabs.forEach((tab, index) => {
    const key = tab.dataset.projectTab;
    const panel = tabRoot.querySelector(`[data-project-panel="${CSS.escape(key)}"]`);

    if (!panel) return;

    tab.id = `${windowId}-project-tab-${index}`;
    panel.id = `${windowId}-project-panel-${index}`;
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-labelledby", tab.id);
  });

  setProjectTab(
    tabRoot,
    tabs.find(tab => tab.getAttribute("aria-selected") === "true") || tabs[0]
  );

  tabRoot.addEventListener("click", e => {
    const tab = e.target.closest("[data-project-tab]");
    if (!tabRoot.contains(tab)) return;

    setProjectTab(tabRoot, tab, {
      focus: true
    });
  });

  tabRoot.addEventListener("keydown", e => {
    const currentTab = e.target.closest("[data-project-tab]");
    if (!currentTab || !tabRoot.contains(currentTab)) return;

    const currentTabs = Array.from(tabRoot.querySelectorAll("[data-project-tab]"));
    const currentIndex = currentTabs.indexOf(currentTab);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % currentTabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + currentTabs.length) % currentTabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = currentTabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    setProjectTab(tabRoot, currentTabs[nextIndex], {
      focus: true
    });
  });
}

function updateMobileWindowObserver() {
  if (mobileWindowObserver) {
    mobileWindowObserver.disconnect();
    mobileWindowObserver = null;
  }

  mobileWindowRatios.clear();

  if (!isMobileLayout() || !("IntersectionObserver" in window)) {
    syncActiveTaskbarToActiveWindow();
    return;
  }

  mobileWindowObserver = new IntersectionObserver(() => {
    if (mobileActiveLockKey) {
      setActiveTaskButton(mobileActiveLockKey);
      return;
    }

    if (!mobileScrollTrackingEnabled) {
      syncActiveTaskbarToActiveWindow();
      return;
    }

    mobileWindowRatios.clear();

    document.querySelectorAll(".app-window").forEach(win => {
      if (!isVisibleOpenWindow(win)) return;

      const rect = win.getBoundingClientRect();
      const visible = Math.min(rect.bottom, document.body.clientHeight) - Math.max(rect.top, 0);
      const ratio = Math.max(0, visible) / Math.max(1, rect.height);
      mobileWindowRatios.set(getWindowKey(win), ratio);
    });

    const best = Array.from(mobileWindowRatios.entries())
      .filter(([, ratio]) => ratio > 0)
      .sort((a, b) => b[1] - a[1])[0];

    if (best) {
      setActiveWindowClass(best[0]);
      setActiveTaskButton(best[0]);
    }
  }, {
    root: document.body,
    threshold: [0.2, 0.45, 0.7]
  });

  document.querySelectorAll(".app-window").forEach(win => {
    if (isOpenWindow(win)) {
      mobileWindowObserver.observe(win);
    }
  });

  syncActiveTaskbarToActiveWindow();
}

/* SHARED WINDOW LOGIC
   Works for both static windows and dynamic windows. */
function attachWindowLogic(win) {
  if (!win || win.dataset.windowReady === "true") return;
  win.dataset.windowReady = "true";
  const windowKey = getWindowKey(win);
  win.id = win.id || keyToDomId(windowKey);
  win.tabIndex = -1;

  const bar = win.querySelector(".window-header");
  const btnMin = win.querySelector(".btn-min");
  const btnClose = win.querySelector(".btn-close");
  const titleEl = win.querySelector(".window-title");

  if (!bar || !titleEl) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  ensureTaskButton(win);

  const bringToFront = () => {
    activateWindow(win, { focus: false });
  };

  const hideWindow = () => {
    const taskBtn = taskButtonsByWindowKey.get(windowKey);

    win.classList.add("minimizing");
    if (taskBtn) taskBtn.classList.remove("active");
    win.classList.remove("active");

    setTimeout(() => {
      win.style.display = "none";
      win.classList.remove("minimizing");
      syncActiveTaskbarToActiveWindow();
    }, 140);
  };

  win.addEventListener("mousedown", bringToFront);
  win.addEventListener("focusin", bringToFront);

  bar.addEventListener("mousedown", e => {
    if (isMobileLayout()) return;

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
    if (isMobileLayout()) {
      dragging = false;
      return;
    }

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

      if (win.dataset.id) {
        win.style.display = "none";
        win.classList.remove("active", "minimizing", "restoring");
      } else {
        win.remove();
      }

      removeTaskButton(win);

      if (mobileWindowObserver) {
        mobileWindowObserver.unobserve(win);
        mobileWindowRatios.delete(windowKey);
      }

      if (win.dataset.id) {
        localStorage.removeItem("win-" + win.dataset.id);
      }

      syncActiveTaskbarToActiveWindow();
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

  if (mobileWindowObserver) {
    mobileWindowObserver.observe(win);
  }
}

/* STATIC WINDOWS */
document.querySelectorAll(".app-window[data-id]").forEach(win => {
  staticWindowTemplates.set(win.dataset.id, win.cloneNode(true));
});

document.querySelectorAll(".app-window").forEach(win => {

  if (win.dataset.windowId) {
    restoreWindowPosition(win);
  }

  attachWindowLogic(win);
});

initializeActiveWindow();

function initializeActiveWindow() {
  const helloWindow = document.querySelector('.app-window[data-id="hello"]');
  const fallbackWindow = document.querySelector(".app-window");

  activateWindow(helloWindow || fallbackWindow, {
    focus: true
  });
}

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

function buildContactFormPayload(form) {
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();

  return {
    formData,
    name: String(formData.get("name") || "").trim(),
    email,
    replyTo: email,
    message: String(formData.get("message") || ""),
    honeypot: String(formData.get("website") || "")
  };
}

function makeBlankPaintImageUrl(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function getMobilePaintCanvasSize(iframe) {
  const iframeWidth = Math.floor(iframe.getBoundingClientRect().width || iframe.clientWidth);
  const toolbarAndChromeWidth = 92;
  const canvasWidth = Math.max(180, Math.min(360, iframeWidth - toolbarAndChromeWidth));
  const canvasHeight = Math.max(220, Math.min(300, Math.round(canvasWidth * 1.08)));

  return {
    width: canvasWidth,
    height: canvasHeight,
    iframeWidth
  };
}

function initializePaintFrame(win) {
  const iframe = win.querySelector(".paint-frame");
  if (!iframe || iframe.dataset.paintInitialized === "true") return;

  iframe.dataset.paintInitialized = "true";

  if (!isMobileLayout()) return;

  requestAnimationFrame(() => {
    const { width, height } = getMobilePaintCanvasSize(iframe);
    iframe.src = "https://jspaint.app/#load:" + makeBlankPaintImageUrl(width, height);
    iframe.dataset.mobileCanvasWidth = String(width);
    iframe.dataset.mobileCanvasHeight = String(height);
  });
}

function applyFranklinWindowLayout(win) {
  if (!win || win.dataset.windowId !== "franklin" || isMobileLayout()) return;

  const margin = 20;
  const topMargin = 20;
  const upwardOffset = 34;
  const rightMargin = 20;
  const bottomMargin = 18;
  const verticalBreathingRoom = 80;
  const taskbarHeight = document.getElementById("taskbar")?.offsetHeight || 30;
  const usableHeight = window.innerHeight - taskbarHeight;
  const availableWidth = window.innerWidth - margin - rightMargin;
  const availableHeight = usableHeight - topMargin - bottomMargin;
  const width = Math.max(360, Math.min(availableWidth, 1440));
  const height = Math.min(Math.max(360, availableHeight - verticalBreathingRoom), availableHeight, 980);
  const centeredLeft = (window.innerWidth - width) / 2;
  const centeredTop = (usableHeight - height) / 2 - upwardOffset;
  const left = Math.max(margin, Math.min(centeredLeft, window.innerWidth - width - rightMargin));
  const top = Math.max(topMargin, Math.min(centeredTop, usableHeight - height - bottomMargin));

  win.style.left = `${left}px`;
  win.style.top = `${top}px`;
  win.style.width = `${width}px`;
  win.style.height = `${height}px`;
}

function showContactSuccess(form) {
  const contentBox = form.closest(".content-box");
  if (!contentBox) return;

  contentBox.innerHTML = `
    <div class="contact-success" role="status" aria-live="polite" tabindex="-1">
      <img class="contact-success-icon" src="images/pixelarticons-master/svg/mail-right.svg" alt="">
      <div class="contact-success-copy">
        <p class="contact-success-title"><b>Message sent.</b></p>
        <p>I appreciate you stopping by.</p>
        <p>I’ll be in touch soon.</p>
      </div>
    </div>
  `;

  contentBox.querySelector(".contact-success")?.focus({ preventScroll: true });
}

async function submitContactForm(form) {
  const status = form.querySelector("[data-contact-status]");
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.textContent || "Send";

  if (!form.checkValidity()) {
    form.reportValidity();
    return null;
  }

  const payload = buildContactFormPayload(form);
  const endpoint = form.getAttribute("action");

  if (!endpoint) {
    if (status) {
      status.textContent = "This form is missing its connection. Please try again later.";
    }
    return null;
  }

  if (status) {
    status.textContent = "Sending...";
    status.classList.add("contact-status-sr");
  }

  if (submitButton) {
    submitButton.textContent = "Sending...";
    submitButton.disabled = true;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json"
      },
      body: payload.formData
    });

    if (!response.ok) {
      throw new Error(`Contact form request failed with ${response.status}`);
    }

    showContactSuccess(form);
  } catch (err) {
    if (status) {
      status.classList.remove("contact-status-sr");
      status.textContent = "Message not sent. Please try again.";
    }
  } finally {
    if (submitButton && document.body.contains(submitButton)) {
      submitButton.textContent = submitLabel;
      submitButton.disabled = false;
    }
  }

  // Basin receives the field named "email"; keep payload.replyTo as the future mailer hook.
  return payload;
}

document.addEventListener("submit", e => {
  const form = e.target.closest("[data-contact-form]");
  if (!form) return;

  e.preventDefault();
  submitContactForm(form);
});


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
      closeStartMenu();
    }
  });

  startMenu.addEventListener("click", e => {
    const link = e.target.closest("a");

    if (!link) return;

    if (link.dataset.staticId || link.dataset.windowId) {
      e.preventDefault();
      launchWindowFromElement(link);
      closeStartMenu();
      return;
    }

    if (link.getAttribute("href") === "#") {
      e.preventDefault();
      return;
    }

    closeStartMenu();
  });

  startMenu.addEventListener("keydown", e => {
    const link = e.target.closest("a");

    if (e.key === "Escape") {
      e.preventDefault();
      closeStartMenu();
      startBtn.focus();
      return;
    }

    if (e.key === " " && link && (link.dataset.staticId || link.dataset.windowId)) {
      e.preventDefault();
      launchWindowFromElement(link);
      closeStartMenu();
    } else if (e.key === " " && link) {
      e.preventDefault();
      link.click();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && startMenu.style.display === "block") {
      e.preventDefault();
      closeStartMenu();
      startBtn.focus();
    }
  });
}


document.querySelectorAll(".desktop-icon[data-static-id], .desktop-icon[data-window-id]").forEach(icon => {
  icon.addEventListener("click", e => {
    e.preventDefault();
    launchWindowFromElement(icon);
  });
});

updateMobileWindowObserver();

document.body.addEventListener("scroll", () => {
  if (isMobileLayout()) {
    mobileScrollTrackingEnabled = true;
  }
});

if (mobileLayoutQuery.addEventListener) {
  mobileLayoutQuery.addEventListener("change", () => {
    mobileScrollTrackingEnabled = false;
    updateMobileWindowObserver();
  });
} else {
  mobileLayoutQuery.addListener(() => {
    mobileScrollTrackingEnabled = false;
    updateMobileWindowObserver();
  });
}

function createDynamicWindow(icon, options = {}) {
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
  win.dataset.windowKey = "dynamic:" + windowId;

  if (windowId === "franklin") {
    win.classList.add("franklin-window");
  }

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
  applyFranklinWindowLayout(win);
  attachWindowLogic(win);
  initializeProjectTabs(win);
  initializePaintFrame(win);

  if (options.scroll !== false) {
    activateWindow(win, {
      focus: true,
      scroll: isMobileLayout()
    });
  }

  return win;
}

window.addEventListener("resize", () => {
  const franklinWindow = findWindowByKey("dynamic:franklin");
  applyFranklinWindowLayout(franklinWindow);
});

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
    closeStartMenu();

    document.querySelectorAll(".app-window").forEach(win => {
      if (win.dataset.id) {
        win.style.display = "none";
        win.classList.remove("active", "minimizing", "restoring");
      } else {
        win.remove();
      }

      removeTaskButton(win);

      if (mobileWindowObserver) {
        mobileWindowObserver.unobserve(win);
      }

      mobileWindowRatios.delete(getWindowKey(win));
    });

    syncActiveTaskbarToActiveWindow();
  });
}

if (shutdownLink) {
  shutdownLink.addEventListener("click", () => {
    closeStartMenu();
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
