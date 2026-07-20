let topZ = 10;
const taskbar = document.getElementById("taskbar-windows");
const mobileLayoutQuery = window.matchMedia("(max-width: 820px)");
const constrainedDesktopQuery = window.matchMedia("(min-width: 821px) and (max-width: 1149px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const isMobileLayout = () => mobileLayoutQuery.matches;
const isConstrainedDesktopLayout = () => constrainedDesktopQuery.matches;
const taskButtonsByWindowKey = new Map();
const staticWindowTemplates = new Map();
const openWindowOrder = [];
const mobileDefaultOpenWindowOrder = [
  "static:hello",
  "static:readme",
  "dynamic:approach",
  "dynamic:work",
  "dynamic:projects",
  "static:image",
  "static:cdplayer"
];
const defaultStaticWindowIds = new Set(["hello", "readme", "image", "cdplayer"]);
const wideStaticWindowLayouts = new Map();
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

function compactOpenWindowOrder() {
  for (let index = openWindowOrder.length - 1; index >= 0; index--) {
    const key = openWindowOrder[index];
    const win = findWindowByKey(key);

    if (!isOpenWindow(win)) {
      openWindowOrder.splice(index, 1);
    }
  }
}

function sortTaskbarByOpenWindowOrder() {
  compactOpenWindowOrder();

  openWindowOrder.forEach(key => {
    const taskBtn = taskButtonsByWindowKey.get(key);
    if (taskBtn) {
      taskbar.appendChild(taskBtn);
    }
  });
}

function applyMobileOpenWindowOrder() {
  if (!isMobileLayout()) return;

  compactOpenWindowOrder();

  openWindowOrder.forEach(key => {
    const win = findWindowByKey(key);

    if (isOpenWindow(win)) {
      document.body.appendChild(win);
    }
  });
}

function syncOpenWindowOrder() {
  compactOpenWindowOrder();
  sortTaskbarByOpenWindowOrder();
  applyMobileOpenWindowOrder();
}

function registerOpenWindow(win) {
  if (!win) return;

  const key = getWindowKey(win);

  if (!openWindowOrder.includes(key)) {
    openWindowOrder.push(key);
  }

  syncOpenWindowOrder();
}

function unregisterOpenWindow(win) {
  const key = typeof win === "string" ? win : getWindowKey(win);
  const index = openWindowOrder.indexOf(key);

  if (index !== -1) {
    openWindowOrder.splice(index, 1);
  }

  syncOpenWindowOrder();
}

function setOpenWindowOrder(keys) {
  openWindowOrder.splice(0, openWindowOrder.length);

  keys.forEach(key => {
    const win = findWindowByKey(key);

    if (isOpenWindow(win) && !openWindowOrder.includes(key)) {
      openWindowOrder.push(key);
    }
  });

  document.querySelectorAll(".app-window").forEach(win => {
    const key = getWindowKey(win);

    if (isOpenWindow(win) && !openWindowOrder.includes(key)) {
      openWindowOrder.push(key);
    }
  });

  syncOpenWindowOrder();
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

function getTaskbarHeight() {
  return document.getElementById("taskbar")?.offsetHeight || 30;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parsePixelValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWindowRenderedPosition(win) {
  const rect = win.getBoundingClientRect();
  const left = parsePixelValue(win.style.left) ?? rect.left;
  const top = parsePixelValue(win.style.top) ?? rect.top;

  return { left, top };
}

function setWindowIntendedPosition(win, left, top) {
  if (!win || !Number.isFinite(left) || !Number.isFinite(top)) return;

  win.dataset.intendedLeft = String(Math.round(left));
  win.dataset.intendedTop = String(Math.round(top));
}

function getWindowIntendedPosition(win) {
  if (!win) return null;

  const left = parsePixelValue(win.dataset.intendedLeft);
  const top = parsePixelValue(win.dataset.intendedTop);

  if (Number.isFinite(left) && Number.isFinite(top)) {
    return { left, top };
  }

  const rendered = getWindowRenderedPosition(win);
  setWindowIntendedPosition(win, rendered.left, rendered.top);
  return rendered;
}

function applyWindowRenderedPosition(win, left, top) {
  win.style.left = `${Math.round(left)}px`;
  win.style.top = `${Math.round(top)}px`;
}

function initializeWindowIntendedPosition(win) {
  const rendered = getWindowRenderedPosition(win);
  setWindowIntendedPosition(win, rendered.left, rendered.top);
}

function rememberWideStaticWindowLayout(win) {
  if (!win?.dataset.id || !defaultStaticWindowIds.has(win.dataset.id)) return;

  const position = getWindowRenderedPosition(win);

  wideStaticWindowLayouts.set(win.dataset.id, {
    left: position.left,
    top: position.top,
    width: parsePixelValue(win.style.width) ?? win.offsetWidth,
    height: parsePixelValue(win.style.height) ?? win.offsetHeight
  });
}

function fitStackedCompactHeights(availableHeight) {
  const heights = {
    hello: 154,
    readme: 260,
    image: 220,
    cdplayer: 160
  };
  let overflow = Object.values(heights).reduce((sum, height) => sum + height, 0) - availableHeight;

  [
    ["readme", 220],
    ["image", 190],
    ["hello", 144],
    ["cdplayer", 150]
  ].forEach(([id, minHeight]) => {
    if (overflow <= 0) return;

    const reduction = Math.min(overflow, heights[id] - minHeight);
    heights[id] -= reduction;
    overflow -= reduction;
  });

  return heights;
}

function getCompactStaticWindowLayouts() {
  const margin = 12;
  const gap = 12;
  const compactLeft = window.innerWidth >= 1100 ? 180 : 132;
  const taskbarHeight = getTaskbarHeight();
  const usableBottom = window.innerHeight - taskbarHeight - margin;
  const twoColumnLayout = window.innerWidth >= 1000;

  if (twoColumnLayout) {
    const left = compactLeft;
    const right = clampNumber(
      Math.max(left + 524, Math.round(window.innerWidth * 0.62)),
      left + 500 + 20,
      window.innerWidth - 360 - margin
    );

    return {
      hello: { left, top: 40, width: 340, height: 154 },
      readme: { left: left + 20, top: 220, width: 500, height: 300 },
      image: { left: right, top: 92, width: 360, height: 240 },
      cdplayer: { left: right, top: 390, width: 360, height: 160 }
    };
  }

  const readmeWidth = Math.min(500, window.innerWidth - compactLeft - margin);
  const helloWidth = Math.min(340, window.innerWidth - compactLeft - margin);
  const mediaWidth = Math.min(360, window.innerWidth - compactLeft - margin);
  const availableWidth = window.innerWidth - compactLeft - margin;
  const subtleOffset = clampNumber(Math.round(availableWidth * 0.13), 34, 74);
  const leftRail = clampNumber(
    Math.round(compactLeft + Math.max(0, (availableWidth - readmeWidth) * 0.22)),
    compactLeft,
    window.innerWidth - readmeWidth - margin
  );
  const rightRail = clampNumber(
    leftRail + subtleOffset,
    compactLeft,
    window.innerWidth - readmeWidth - margin
  );
  const mediaLeft = clampNumber(
    leftRail - Math.round(subtleOffset * 0.35),
    compactLeft,
    window.innerWidth - mediaWidth - margin
  );
  const cdLeft = clampNumber(
    mediaLeft + Math.round(subtleOffset * 0.8),
    compactLeft,
    window.innerWidth - mediaWidth - margin
  );
  const stackTop = 18;
  const availableStackHeight = usableBottom - stackTop - gap * 3;
  const heights = fitStackedCompactHeights(availableStackHeight);
  let top = stackTop;
  const layouts = {
    hello: {
      left: leftRail,
      top,
      width: helloWidth,
      height: heights.hello
    }
  };

  top += heights.hello + gap;
  layouts.readme = {
    left: rightRail,
    top,
    width: readmeWidth,
    height: heights.readme
  };

  top += heights.readme + gap;
  layouts.image = {
    left: mediaLeft,
    top,
    width: mediaWidth,
    height: heights.image
  };

  top += heights.image + gap;
  layouts.cdplayer = {
    left: cdLeft,
    top,
    width: mediaWidth,
    height: heights.cdplayer
  };

  return layouts;
}

function getInitialStaticWindowLayout(staticId) {
  if (!defaultStaticWindowIds.has(staticId)) return null;

  if (window.innerWidth >= 1380) {
    return wideStaticWindowLayouts.get(staticId) || null;
  }

  return getCompactStaticWindowLayouts()[staticId] || wideStaticWindowLayouts.get(staticId) || null;
}

function applyInitialStaticWindowLayout(win) {
  const staticId = win?.dataset.id;
  const layout = staticId ? getInitialStaticWindowLayout(staticId) : null;

  if (!layout) return;

  win.style.left = `${Math.round(layout.left)}px`;
  win.style.top = `${Math.round(layout.top)}px`;
  win.style.width = `${Math.round(layout.width)}px`;
  win.style.height = `${Math.round(layout.height)}px`;
  setWindowIntendedPosition(win, layout.left, layout.top);
  delete win.dataset.responsiveClamped;
}

function applyResponsiveDefaultStaticWindowLayouts() {
  if (isMobileLayout()) return;

  document.querySelectorAll(".app-window[data-id]").forEach(win => {
    if (!defaultStaticWindowIds.has(win.dataset.id)) return;
    if (win.dataset.userPositioned === "true") return;
    if (getComputedStyle(win).display === "none") return;

    applyInitialStaticWindowLayout(win);
  });
}

function syncWindowToResponsiveViewport(win) {
  if (!win || isMobileLayout()) return;

  const styles = getComputedStyle(document.documentElement);
  const compactLeft = Number.parseFloat(styles.getPropertyValue("--compact-window-left")) || 132;
  const margin = Number.parseFloat(styles.getPropertyValue("--compact-window-margin")) || 12;
  const taskbarHeight = getTaskbarHeight();
  const intended = getWindowIntendedPosition(win);

  if (!intended) return;

  if (!isConstrainedDesktopLayout()) {
    applyWindowRenderedPosition(win, intended.left, intended.top);
    delete win.dataset.responsiveClamped;
    return;
  }

  const rect = win.getBoundingClientRect();
  const width = Math.min(rect.width || win.offsetWidth, window.innerWidth - margin * 2);
  const height = Math.min(rect.height || win.offsetHeight, window.innerHeight - taskbarHeight - margin * 2);
  const minLeft = Math.min(compactLeft, Math.max(margin, window.innerWidth - width - margin));
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - taskbarHeight - height - margin);
  const nextLeft = Math.min(Math.max(intended.left, minLeft), Math.max(minLeft, maxLeft));
  const nextTop = Math.min(Math.max(intended.top, margin), maxTop);

  applyWindowRenderedPosition(win, nextLeft, nextTop);
  win.dataset.responsiveClamped =
    Math.round(nextLeft) !== Math.round(intended.left) ||
    Math.round(nextTop) !== Math.round(intended.top)
      ? "true"
      : "false";
}

function clampWindowToCompactViewport(win) {
  syncWindowToResponsiveViewport(win);
}

function clampAllWindowsToCompactViewport() {
  document.querySelectorAll(".app-window").forEach(win => {
    if (getComputedStyle(win).display !== "none") {
      syncWindowToResponsiveViewport(win);
    }
  });
}

function activateWindow(win, options = {}) {
  if (!win) return;

  clampWindowToCompactViewport(win);

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
  registerOpenWindow(win);
  return taskBtn;
}

function removeTaskButton(win) {
  const key = getWindowKey(win);
  const taskBtn = taskButtonsByWindowKey.get(key);

  if (taskBtn) {
    taskBtn.remove();
    taskButtonsByWindowKey.delete(key);
  }

  unregisterOpenWindow(key);
}

function closeStartMenu() {
  if (startMenu) startMenu.style.display = "none";
  if (startBtn) startBtn.classList.remove("active");
}

function openStaticWindow(staticId, options = {}) {
  let win = findWindowByKey("static:" + staticId) ||
    document.querySelector(`.app-window[data-id="${CSS.escape(staticId)}"]`);

  if (!win) {
    const template = staticWindowTemplates.get(staticId);
    if (!template) return null;

    win = template.cloneNode(true);
    document.body.appendChild(win);
    applyInitialStaticWindowLayout(win);
    initializeWindowIntendedPosition(win);
    attachWindowLogic(win);
  }

  if (!win.dataset.windowReady) {
    attachWindowLogic(win);
  }

  ensureTaskButton(win);
  win.style.display = "flex";

  if (mobileWindowObserver) {
    mobileWindowObserver.observe(win);
  }

  if (options.activate !== false) {
    activateWindow(win, {
      focus: true,
      scroll: options.scroll ?? isMobileLayout()
    });
  }

  return win;
}

function openDynamicWindow(launcher, options = {}) {
  const windowId = launcher.dataset.windowId;
  const existing = findWindowByKey("dynamic:" + windowId);

  if (existing) {
    applyFranklinWindowLayout(existing);
    if (options.activate !== false) {
      activateWindow(existing, {
        focus: true,
        scroll: options.scroll ?? isMobileLayout()
      });
    }
    return existing;
  }

  return createDynamicWindow(launcher, options);
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

function getDynamicWindowLauncher(windowId) {
  return document.querySelector(
    `.desktop-icon[data-window-id="${CSS.escape(windowId)}"], ` +
    `.sm-link[data-window-id="${CSS.escape(windowId)}"]`
  );
}

function openWindowByKey(key, options = {}) {
  if (key.startsWith("static:")) {
    return openStaticWindow(key.slice("static:".length), options);
  }

  if (key.startsWith("dynamic:")) {
    const launcher = getDynamicWindowLauncher(key.slice("dynamic:".length));
    return launcher ? openDynamicWindow(launcher, options) : null;
  }

  return null;
}

function initializeMobileDefaultWindows() {
  if (!isMobileLayout()) return;

  mobileDefaultOpenWindowOrder.forEach(key => {
    openWindowByKey(key, {
      activate: false,
      scroll: false
    });
  });

  setOpenWindowOrder(mobileDefaultOpenWindowOrder);

  const helloWindow = findWindowByKey("static:hello");
  if (helloWindow) {
    activateWindow(helloWindow, {
      focus: true,
      scroll: false
    });
  }
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

  scheduleProjectPanelHeightUpdate(tabRoot);

  if (options.focus) {
    selectedTab.focus({
      preventScroll: true
    });
  }
}

function getProjectTabFromEvent(tabRoot, event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const tab = target?.closest?.("[data-project-tab]");

  return tab && tabRoot.contains(tab) ? tab : null;
}

function stopMobileProjectTabWindowEvent(tabRoot, event) {
  if (!isMobileLayout() || !getProjectTabFromEvent(tabRoot, event)) return;

  event.stopPropagation();
}

function activateProjectTabByKey(tabRoot, key, options = {}) {
  if (!tabRoot || !key) return;

  const tab = tabRoot.querySelector(`[data-project-tab="${CSS.escape(key)}"]`);
  setProjectTab(tabRoot, tab, options);
}

function measureProjectPanelHeight(panel, width) {
  const wasHidden = panel.hidden;
  const previousStyle = panel.getAttribute("style");

  panel.hidden = false;
  panel.style.position = "absolute";
  panel.style.visibility = "hidden";
  panel.style.pointerEvents = "none";
  panel.style.display = "block";
  panel.style.width = width ? `${width}px` : "";

  const height = Math.ceil(panel.scrollHeight);

  if (previousStyle === null) {
    panel.removeAttribute("style");
  } else {
    panel.setAttribute("style", previousStyle);
  }

  panel.hidden = wasHidden;

  return height;
}

function updateProjectPanelHeight(tabRoot) {
  const shell = tabRoot?.querySelector(".projects-tab-panel-shell");
  if (!shell) return;

  const panels = Array.from(tabRoot.querySelectorAll("[data-project-panel]"));
  const visiblePanel = panels.find(panel => !panel.hidden) || panels[0];
  const panelWidth = Math.ceil(
    visiblePanel?.getBoundingClientRect().width ||
    Math.max(0, shell.clientWidth)
  );
  const maxHeight = panels.reduce((height, panel) => {
    return Math.max(height, measureProjectPanelHeight(panel, panelWidth));
  }, 0);
  const shellStyles = getComputedStyle(shell);
  const shellChrome =
    Number.parseFloat(shellStyles.paddingTop) +
    Number.parseFloat(shellStyles.paddingBottom) +
    Number.parseFloat(shellStyles.borderTopWidth) +
    Number.parseFloat(shellStyles.borderBottomWidth);

  shell.style.setProperty("--projects-panel-min-height", `${Math.ceil(maxHeight + shellChrome)}px`);
}

function scheduleProjectPanelHeightUpdate(tabRoot) {
  if (!tabRoot || tabRoot.dataset.panelMeasureQueued === "true") return;

  tabRoot.dataset.panelMeasureQueued = "true";

  requestAnimationFrame(() => {
    delete tabRoot.dataset.panelMeasureQueued;
    updateProjectPanelHeight(tabRoot);
  });
}

function updateAllProjectPanelHeights() {
  document.querySelectorAll(".projects-tabs").forEach(tabRoot => {
    scheduleProjectPanelHeightUpdate(tabRoot);
  });
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

  tabRoot.addEventListener("pointerdown", e => {
    stopMobileProjectTabWindowEvent(tabRoot, e);
  });

  tabRoot.addEventListener("mousedown", e => {
    stopMobileProjectTabWindowEvent(tabRoot, e);
  });

  tabRoot.addEventListener("focusin", e => {
    stopMobileProjectTabWindowEvent(tabRoot, e);
  });

  tabRoot.addEventListener("click", e => {
    const overviewLink = e.target.closest("[data-project-target-tab]");
    if (overviewLink && tabRoot.contains(overviewLink)) {
      e.preventDefault();
      e.stopPropagation();

      activateProjectTabByKey(tabRoot, overviewLink.dataset.projectTargetTab, {
        focus: true
      });
      return;
    }

    const tab = getProjectTabFromEvent(tabRoot, e);
    if (!tab) return;

    e.stopPropagation();

    setProjectTab(tabRoot, tab, {
      focus: true
    });
  });

  tabRoot.addEventListener("keydown", e => {
    const currentTab = getProjectTabFromEvent(tabRoot, e);
    if (!currentTab) return;

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
    e.stopPropagation();
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

    const nextLeft = e.clientX - offsetX;
    const nextTop = e.clientY - offsetY;

    if (win.dataset.id && defaultStaticWindowIds.has(win.dataset.id)) {
      win.dataset.userPositioned = "true";
    }

    setWindowIntendedPosition(win, nextLeft, nextTop);
    applyWindowRenderedPosition(win, nextLeft, nextTop);
    syncWindowToResponsiveViewport(win);
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    syncWindowToResponsiveViewport(win);
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
  rememberWideStaticWindowLayout(win);
  staticWindowTemplates.set(win.dataset.id, win.cloneNode(true));
});

document.querySelectorAll(".app-window").forEach(win => {

  if (win.dataset.windowId) {
    restoreWindowPosition(win);
  }

  if (win.dataset.id) {
    applyInitialStaticWindowLayout(win);
  }

  initializeWindowIntendedPosition(win);
  attachWindowLogic(win);
});

initializeActiveWindow();
initializeMobileDefaultWindows();
clampAllWindowsToCompactViewport();

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
  const intended = getWindowIntendedPosition(win);

  localStorage.setItem("win-" + id, JSON.stringify({
    left: Math.round(intended?.left ?? parseInt(win.style.left, 10)),
    top: Math.round(intended?.top ?? parseInt(win.style.top, 10)),
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
    if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      setWindowIntendedPosition(win, pos.left, pos.top);
    }
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
  setWindowIntendedPosition(win, left, top);
}

const PORTFOLIO_ACCESS_ENDPOINT = "/.netlify/functions/portfolio-access";
const PORTFOLIO_ACCESS_MESSAGES = {
  empty: "Enter the portfolio password.",
  incorrect: "Incorrect password. Please try again.",
  unavailable: "Couldn’t verify the password. Please try again."
};
let pendingPortfolioTab = null;

function getPortfolioAccessMessage(error) {
  return error?.code === "incorrect" || error?.status === 401
    ? PORTFOLIO_ACCESS_MESSAGES.incorrect
    : PORTFOLIO_ACCESS_MESSAGES.unavailable;
}

function isIncorrectPortfolioError(error) {
  return error?.code === "incorrect" || error?.status === 401;
}

function setPortfolioAccessStatus(form, message) {
  const status = form?.querySelector("[data-portfolio-status]");
  const input = form?.querySelector("[data-portfolio-password]");

  if (status && status.textContent !== message) {
    status.textContent = message;
  }

  input?.setAttribute("aria-invalid", message ? "true" : "false");
}

function setPortfolioAccessSubmitting(button, isSubmitting) {
  if (!button) return;

  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? "Opening…" : "Open";
}

function focusWorkWindow() {
  const workWindow = findWindowByKey("dynamic:work");

  if (workWindow && isVisibleOpenWindow(workWindow)) {
    activateWindow(workWindow, {
      focus: true,
      scroll: false
    });
  }
}

function closePortfolioAccessWindow(win, options = {}) {
  if (!win || !document.body.contains(win)) return;

  removeTaskButton(win);

  if (mobileWindowObserver) {
    mobileWindowObserver.unobserve(win);
    mobileWindowRatios.delete(getWindowKey(win));
  }

  win.remove();

  if (options.focusWork) {
    focusWorkWindow();
  } else {
    syncActiveTaskbarToActiveWindow();
  }
}

function openPortfolioAccessWindow() {
  const launcher = document.createElement("button");

  launcher.dataset.windowId = "portfolio-access";
  launcher.dataset.title = "Portfolio access";
  launcher.dataset.width = "300";
  launcher.dataset.height = "224";
  launcher.dataset.source = "window-portfolio-access";

  const win = openDynamicWindow(launcher);
  requestAnimationFrame(() => {
    win?.querySelector("[data-portfolio-password]")?.focus({
      preventScroll: true
    });
  });

  return win;
}

async function validatePortfolioPassword(password) {
  const response = await fetch(PORTFOLIO_ACCESS_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      password
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Portfolio access failed.");
    error.status = response.status;
    throw error;
  }

  if (data.ok === false) {
    const error = new Error(data.error || "Portfolio access failed.");
    error.code = data.code;
    throw error;
  }

  if (data.ok !== true || typeof data.url !== "string" || !data.url) {
    throw new Error("Portfolio destination missing.");
  }

  return data.url;
}

async function submitPortfolioAccessForm(form) {
  if (form.dataset.submitting === "true") return;

  const win = form.closest(".app-window");
  const input = form.querySelector("[data-portfolio-password]");
  const status = form.querySelector("[data-portfolio-status]");
  const submitButton = form.querySelector("[data-portfolio-open]");

  if (!input?.value.trim()) {
    setPortfolioAccessStatus(form, PORTFOLIO_ACCESS_MESSAGES.empty);
    input?.focus({
      preventScroll: true
    });
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const password = input.value;
  const accessTab = window.open("about:blank", "_blank");
  pendingPortfolioTab = accessTab || null;

  form.dataset.submitting = "true";
  setPortfolioAccessSubmitting(submitButton, true);
  if (status) {
    setPortfolioAccessStatus(form, "");
  }

  try {
    const url = await validatePortfolioPassword(password);

    if (accessTab && !accessTab.closed) {
      accessTab.location.replace(url);
      accessTab.opener = null;
    } else {
      const fallbackTab = window.open(url, "_blank");
      if (!fallbackTab) {
        throw new Error("Popup blocked.");
      }
    }

    pendingPortfolioTab = null;
    closePortfolioAccessWindow(win, {
      focusWork: true
    });
  } catch (error) {
    if (accessTab && !accessTab.closed) {
      accessTab.close();
    }

    pendingPortfolioTab = null;

    setPortfolioAccessStatus(form, getPortfolioAccessMessage(error));

    if (input && isIncorrectPortfolioError(error)) {
      input.value = "";
    }

    input?.focus({
      preventScroll: true
    });
  } finally {
    delete form.dataset.submitting;

    if (submitButton && document.body.contains(submitButton)) {
      setPortfolioAccessSubmitting(submitButton, false);
    }
  }
}

function initializePortfolioAccessWindow(win) {
  if (!win || win.dataset.windowId !== "portfolio-access" || win.dataset.portfolioReady === "true") return;

  win.dataset.portfolioReady = "true";

  const form = win.querySelector("[data-portfolio-access-form]");
  const input = win.querySelector("[data-portfolio-password]");
  const cancelButton = win.querySelector("[data-portfolio-cancel]");
  const closeButton = win.querySelector(".btn-close");

  form?.addEventListener("submit", e => {
    e.preventDefault();
    submitPortfolioAccessForm(form);
  });

  input?.addEventListener("input", () => {
    setPortfolioAccessStatus(form, "");
  });

  input?.addEventListener("invalid", e => {
    e.preventDefault();
    setPortfolioAccessStatus(form, PORTFOLIO_ACCESS_MESSAGES.empty);
    input.focus({
      preventScroll: true
    });
  });

  cancelButton?.addEventListener("click", e => {
    e.preventDefault();

    if (pendingPortfolioTab && !pendingPortfolioTab.closed) {
      pendingPortfolioTab.close();
      pendingPortfolioTab = null;
    }

    closePortfolioAccessWindow(win, {
      focusWork: true
    });
  });

  win.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;

    e.preventDefault();
    closePortfolioAccessWindow(win, {
      focusWork: true
    });
  });

  closeButton?.addEventListener("click", () => {
    if (pendingPortfolioTab && !pendingPortfolioTab.closed) {
      pendingPortfolioTab.close();
      pendingPortfolioTab = null;
    }

    requestAnimationFrame(focusWorkWindow);
  });
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

document.addEventListener("click", e => {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;
  const launcher = target?.closest?.("[data-portfolio-launch]");
  if (!launcher) return;

  e.preventDefault();
  openPortfolioAccessWindow();
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
    syncOpenWindowOrder();
    scheduleResponsiveLayout();
    updateMobileWindowObserver();
  });
} else {
  mobileLayoutQuery.addListener(() => {
    mobileScrollTrackingEnabled = false;
    syncOpenWindowOrder();
    scheduleResponsiveLayout();
    updateMobileWindowObserver();
  });
}

if (constrainedDesktopQuery.addEventListener) {
  constrainedDesktopQuery.addEventListener("change", scheduleResponsiveLayout);
} else {
  constrainedDesktopQuery.addListener(scheduleResponsiveLayout);
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

  if (windowId === "approach") {
    win.classList.add("approach-window");
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
    const taskbarHeight = getTaskbarHeight() + 30;

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
  initializeWindowIntendedPosition(win);
  syncWindowToResponsiveViewport(win);
  attachWindowLogic(win);
  initializeProjectTabs(win);
  initializePortfolioAccessWindow(win);
  initializePaintFrame(win);
  requestAnimationFrame(() => syncWindowToResponsiveViewport(win));

  if (options.activate !== false) {
    activateWindow(win, {
      focus: true,
      scroll: options.scroll ?? isMobileLayout()
    });
  }

  return win;
}

let responsiveLayoutFrame = null;

function runResponsiveLayout() {
  responsiveLayoutFrame = null;
  const franklinWindow = findWindowByKey("dynamic:franklin");
  applyResponsiveDefaultStaticWindowLayouts();
  applyFranklinWindowLayout(franklinWindow);
  clampAllWindowsToCompactViewport();
  updateAllProjectPanelHeights();
}

function scheduleResponsiveLayout() {
  if (responsiveLayoutFrame !== null) return;
  responsiveLayoutFrame = requestAnimationFrame(runResponsiveLayout);
}

window.addEventListener("resize", scheduleResponsiveLayout);

window.addEventListener("orientationchange", scheduleResponsiveLayout);

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
