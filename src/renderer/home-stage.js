(() => {
  const host = document.getElementById("character-stage");
  const canvas = document.getElementById("home-live2d");
  const empty = document.getElementById("model-empty");
  const fallback = document.getElementById("model-fallback");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let app = null;
  let model = null;
  let requestedSource = "";
  let loadedSource = "";
  let loadingSource = "";
  let runtimeReady = null;
  let loadToken = 0;
  let active = false;
  let visible = !document.hidden;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Cannot load ${src}`)); };
      document.head.append(script);
    });
  }
  function ensureRuntime() {
    if (!runtimeReady) {
      runtimeReady = (async () => {
        if (!window.Live2DCubismCore) await loadScript("./vendor/live2dcubismcore.min.js");
        if (!window.PIXI) await loadScript("./vendor/pixi.min.js");
        if (!window.PIXI.live2d) await loadScript("./vendor/cubism4.min.js");
      })().catch(error => { runtimeReady = null; throw error; });
    }
    return runtimeReady;
  }
  function resize() {
    if (!app || !host.clientWidth || !host.clientHeight) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    app.renderer.resize(width, height);
    if (model) {
      const bounds = model.getLocalBounds();
      const scale = Math.min(width * 0.88 / Math.max(1, bounds.width), height * 0.88 / Math.max(1, bounds.height));
      model.scale.set(scale);
      model.position.set(width * 0.5, height * 0.98);
    }
    app.render();
  }
  function syncActivity() {
    if (!app) return;
    if (active && visible && model && !reducedMotion.matches) app.start();
    else { app.stop(); if (active && visible && model) app.render(); }
  }
  function release() {
    ++loadToken;
    loadingSource = "";
    loadedSource = "";
    if (model) { app.stage.removeChild(model); model.destroy({ children: true }); model = null; }
    if (app) { app.destroy(false); app = null; }
    canvas.hidden = true;
    canvas.dataset.ready = "false";
    empty.hidden = false;
    fallback.hidden = true;
  }
  async function renderRequestedModel() {
    if (!active || !visible || !requestedSource || loadedSource === requestedSource || loadingSource === requestedSource) return;
    const fileUrl = requestedSource;
    const token = ++loadToken;
    loadingSource = fileUrl;
    fallback.hidden = false;
    fallback.textContent = "正在加载你的形象…";
    try {
      await ensureRuntime();
      if (token !== loadToken || requestedSource !== fileUrl) return;
      if (!app) {
        app = new PIXI.Application({ view: canvas, transparent: true, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5), autoStart: false, powerPreference: "low-power" });
        app.ticker.maxFPS = 30;
        app.ticker.add(() => model?.update(Math.min(app.ticker.deltaMS, 100)));
      }
      const next = await PIXI.live2d.Live2DModel.from(fileUrl, { autoUpdate: false, autoInteract: false });
      if (token !== loadToken || requestedSource !== fileUrl) { next.destroy({ children: true }); return; }
      if (model) { app.stage.removeChild(model); model.destroy({ children: true }); }
      model = next;
      model.anchor.set(0.5, 1);
      app.stage.addChild(model);
      model.update(0);
      loadedSource = fileUrl;
      empty.hidden = true;
      fallback.hidden = true;
      canvas.hidden = false;
      canvas.dataset.ready = "true";
      resize();
      syncActivity();
    } catch (error) {
      if (token !== loadToken || requestedSource !== fileUrl) return;
      console.warn("Character preview unavailable", error);
      fallback.hidden = false;
      fallback.textContent = "形象暂时没能加载，请重新导入或刷新重试。聊天仍然可用。";
    } finally { if (token === loadToken) loadingSource = ""; }
  }
  new ResizeObserver(resize).observe(host);
  reducedMotion.addEventListener("change", syncActivity);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; syncActivity(); renderRequestedModel(); });
  host.addEventListener("pointermove", event => {
    if (!model || !active || !visible || reducedMotion.matches) return;
    const bounds = host.getBoundingClientRect();
    model.focus(event.clientX - bounds.left, event.clientY - bounds.top);
  });
  window.addEventListener("beforeunload", release);
  window.homeStage = {
    load(fileUrl) {
      const nextSource = String(fileUrl || "");
      if (nextSource !== requestedSource) { ++loadToken; loadingSource = ""; }
      requestedSource = nextSource;
      if (!requestedSource) { release(); return; }
      if (loadedSource === requestedSource) fallback.hidden = true;
      renderRequestedModel();
    },
    setPage(page) { active = page === "room"; syncActivity(); if (active) { resize(); renderRequestedModel(); } },
    setVisible(value) { visible = Boolean(value); syncActivity(); if (visible) renderRequestedModel(); }
  };
})();
