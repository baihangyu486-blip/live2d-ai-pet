(() => {
  const api = window.homeAPI;
  const $ = id => document.getElementById(id);
  const pageNames = { home: "陪伴", memory: "回忆", room: "角色" };
  const memoryTypes = { name: "你的名字", like: "喜欢的事", dislike: "不喜欢的事", activity: "日常习惯", event: "一件小事", feeling: "心里的话", legacy: "留存的记忆" };
  let snapshot = null;
  let currentPage = "home";
  let memoryFilter = "all";
  let refreshPending = null;
  let mutationPending = false;
  let toastTimer = null;
  let visible = !document.hidden;
  let modelCatalog = null;
  let renderedCharacterName = "";

  function text(id, value) { $(id).textContent = String(value ?? ""); }
  function day(value) {
    if (!value) return "日期未记录";
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(date.getTime()) ? "日期未记录" : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  }
  function element(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = String(value);
    return el;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    text("toast", message);
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4000);
  }
  function setPage(page) {
    if (!pageNames[page]) return;
    currentPage = page;
    document.querySelectorAll(".page").forEach(el => { el.hidden = el.id !== `page-${page}`; });
    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
      const selected = button.dataset.page === page;
      button.classList.toggle("selected", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    text("breadcrumb", pageNames[page]);
    window.homeStage?.setPage(page);
    if (page === "room") refreshModels();
  }
  function setBookTab(tab) {
    const memories = tab === "memories";
    $("memory-panel").hidden = !memories;
    $("diary-panel").hidden = memories;
    $("tab-memories").setAttribute("aria-selected", String(memories));
    $("tab-diaries").setAttribute("aria-selected", String(!memories));
  }
  function renderMemories() {
    const all = [...(snapshot?.memories || [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastSeenAt - a.lastSeenAt);
    const memories = all.filter(item => memoryFilter !== "pinned" || item.pinned);
    text("memory-count", `${all.length} 条记忆`);
    const list = $("memory-list");
    list.replaceChildren();
    if (!memories.length) {
      list.append(element("p", "empty-state", memoryFilter === "pinned" ? "还没有置顶的记忆。可以把重要的小事留在最前面。" : "这里还没有记录。从一句“我喜欢……”开始，慢慢认识彼此吧。"));
    }
    memories.forEach(memory => {
      const card = element("article", "memory-card");
      const heading = element("div", "card-heading");
      heading.append(element("span", "", memoryTypes[memory.type] || "留存的记忆"));
      if (memory.id) {
        const pin = element("button", "pin-button", memory.pinned ? "♡ 已置顶" : "置顶");
        pin.setAttribute("aria-pressed", String(memory.pinned));
        pin.setAttribute("aria-label", `${memory.pinned ? "取消置顶" : "置顶"}：${memory.text}`);
        pin.disabled = mutationPending;
        pin.addEventListener("click", () => mutate(async () => {
          if (!await api.setMemoryPinned(memory.id, !memory.pinned)) throw new Error("Memory unavailable");
          toast(memory.pinned ? "这条记忆仍然保留，只是不再置顶。" : "这件小事，放到最前面了。" );
        }));
        heading.append(pin);
      }
      card.append(heading, element("p", "", memory.text), element("time", "", memory.lastSeenAt ? day(memory.lastSeenAt) : "一直记在这里"));
      list.append(card);
    });
  }
  function renderTimeline() {
    const entries = [
      ...snapshot.diaries.map(item => ({ at: item.at, date: item.dateKey, title: "日记", content: item.text })),
      ...snapshot.events.map(item => ({ at: item.at, date: item.dateKey, title: "日常片段", content: item.summary })),
      ...snapshot.summaries.map(item => ({ at: item.at, date: item.dateKey, title: "一段回忆", content: item.summary })),
      ...snapshot.affection.milestones.map(item => ({ at: item.at, date: item.at, title: "我们的里程碑", content: `关系走到了「${item.title}」${item.reason ? ` · ${item.reason}` : ""}` }))
    ].sort((a, b) => b.at - a.at);
    const list = $("timeline-list");
    list.replaceChildren();
    if (!entries.length) list.append(element("p", "empty-state", "故事从今天开始。发生过的日常，会慢慢留在这里。"));
    entries.slice(0, 100).forEach(entry => {
      const row = element("div", "timeline-entry");
      const card = element("article");
      card.append(element("h2", "", entry.title), element("p", "", entry.content));
      row.append(element("time", "", day(entry.date)), card);
      list.append(row);
    });
  }
  function renderModels() {
    const state = modelCatalog || snapshot?.model || { status: "none" };
    const active = state.status === "ready" && Boolean(state.fileUrl);
    text("model-current", active ? `正在使用 · ${state.name || "已导入的形象"}` : state.status === "missing" ? "模型文件不可用，请重新导入；聊天仍然可用。" : "当前未使用 Live2D");
    $("disable-model").setAttribute("aria-pressed", String(!active));
    $("disable-model").disabled = mutationPending || state.status === "none";
    $("import-model").disabled = mutationPending;
    const select = $("model-select");
    select.replaceChildren();
    const items = state.imported || [];
    const placeholder = element("option", "", items.length ? "选择已导入的模型" : "暂无已导入模型");
    placeholder.value = "";
    select.append(placeholder);
    items.forEach(item => {
      const option = element("option", "", item.name);
      option.value = item.path;
      option.selected = item.active;
      select.append(option);
    });
    select.disabled = !items.length || mutationPending;
    window.homeStage?.load(active ? state.fileUrl : "");
  }
  async function refreshModels() {
    try { modelCatalog = await api.getModels(); renderModels(); }
    catch (error) { console.warn("Model list unavailable", error); toast("暂时没能读取模型列表，请刷新重试。"); }
  }
  function render() {
    const { mood, affection, checkin } = snapshot;
    const name = snapshot.character.name || "我的伙伴";
    if (renderedCharacterName !== name) {
      renderedCharacterName = name;
      const chatWindow = $("chat-frame").contentWindow;
      if (chatWindow) chatWindow.dispatchEvent(new chatWindow.Event("companion-profile-changed"));
    }
    text("character-name", name);
    text("persona-name", name);
    text("character-initial", name.slice(0, 1));
    text("persona-initial", name.slice(0, 1));
    document.title = "AI 伴侣 · AI Companion";
    $("demo-notice").hidden = snapshot.demo !== true;
    text("mood-label", mood.label);
    text("mood-summary", mood.value >= 3 ? "有你在，今天也变得甜甜的。" : mood.value <= -3 ? "今天想安静一点，有你在就很好。" : "平平常常的一天，也想和你一起过。");
    text("relationship-title", affection.levelTitle);
    text("relationship-description", affection.levelDesc);
    text("affection-value", `${affection.score} / 100`);
    $("affection-progress").value = affection.score;
    text("relationship-next", affection.nextMin == null ? "每一天，都可以继续靠近。" : `离下一阶段还差 ${Math.max(0, Math.round((affection.nextMin - affection.score) * 10) / 10)} 点`);
    text("energy-numeric", `${Number(mood.energy.toFixed(1))} / 10`);
    text("checkin", checkin.doneToday ? "✓ 今天已见面" : "♡ 记下今天的相伴");
    $("checkin").disabled = checkin.doneToday || mutationPending;
    text("checkin-note", checkin.total ? `留下了 ${checkin.total} 天的见面记录` : "每次见面，都有意义。");
    text("pause-proactive", snapshot.proactivePaused ? "恢复主动陪伴" : "安静陪伴一会儿");
    $("pause-proactive").disabled = mutationPending;
    text("presence-label", snapshot.proactivePaused ? "安静陪伴中" : "今天，也在这里");
    const diary = [...snapshot.diaries].sort((a, b) => b.at - a.at)[0];
    text("diary-preview", diary?.text || "还没有写下日记。故事可以从今天开始。");
    renderMemories();
    renderTimeline();
    if (currentPage === "room") renderModels();
  }
  async function refresh() {
    if (refreshPending) return refreshPending;
    $("refresh").disabled = true;
    refreshPending = (async () => {
      try {
        if (!api) throw new Error("Home preload unavailable");
        snapshot = await api.getSnapshot();
        render();
        $("load-error").hidden = true;
      } catch (error) {
        console.warn("Companion state unavailable", error);
        $("load-error").hidden = false;
      } finally { $("refresh").disabled = false; refreshPending = null; }
    })();
    return refreshPending;
  }
  async function mutate(operation) {
    if (mutationPending) return;
    mutationPending = true;
    if (snapshot) render();
    try { if (refreshPending) await refreshPending; await operation(); }
    catch (error) { console.warn("Companion action failed", error); toast("刚刚没能完成，请稍后再试一次。"); }
    finally {
      if (refreshPending) await refreshPending;
      mutationPending = false;
      await refresh();
      if (snapshot) render();
    }
  }
  async function mutateModel(operation) {
    await mutate(async () => {
      const result = await operation();
      if (result?.canceled) return;
      await refreshModels();
      toast(result?.status === "none" ? "已关闭 Live2D，聊天和记录不受影响。" : "形象已更新，人设和回忆都还在。");
    });
  }

  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => setPage(button.dataset.page)));
  document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); setPage("home"); });
  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const actions = { settings: () => api?.openSettings(), minimize: () => api?.minimize(), close: () => api?.close() };
    actions[button.dataset.action]?.();
  }));
  document.querySelectorAll("[data-memory-filter]").forEach(button => button.addEventListener("click", () => {
    memoryFilter = button.dataset.memoryFilter;
    document.querySelectorAll("[data-memory-filter]").forEach(item => { item.classList.toggle("active", item === button); item.setAttribute("aria-pressed", String(item === button)); });
    renderMemories();
  }));
  document.querySelectorAll("[data-book-tab]").forEach(button => button.addEventListener("click", () => setBookTab(button.dataset.bookTab)));
  $("open-diary").addEventListener("click", () => { setPage("memory"); setBookTab("diaries"); });
  $("refresh").addEventListener("click", () => { refresh(); if (currentPage === "room") refreshModels(); });
  $("checkin").addEventListener("click", () => mutate(async () => { const result = await api.checkin(); toast(result ? "今天的见面，也好好记下了。" : "今天已经见过面啦。" ); }));
  $("pause-proactive").addEventListener("click", () => mutate(async () => { await api.setProactivePaused(!snapshot.proactivePaused); }));
  $("import-model").addEventListener("click", () => mutateModel(() => api.importModel()));
  $("disable-model").addEventListener("click", () => mutateModel(() => api.disableModel()));
  $("model-select").addEventListener("change", () => {
    const selectedPath = $("model-select").value;
    if (selectedPath) mutateModel(() => api.selectModel(selectedPath));
  });
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) refresh(); });
  const cleanups = [
    api?.onNavigate?.(setPage),
    api?.onModelChanged?.(() => { modelCatalog = null; refresh(); if (currentPage === "room") refreshModels(); }),
    api?.onVisibilityChange?.(value => { visible = value; window.homeStage?.setVisible(value); if (value) refresh(); })
  ];
  const refreshTimer = setInterval(() => { if (visible) refresh(); }, 30000);
  window.addEventListener("beforeunload", () => { clearInterval(refreshTimer); clearTimeout(toastTimer); cleanups.forEach(cleanup => cleanup?.()); });
  // The local chat document reuses every existing conversation capability.
  $("chat-frame").src = "./chat.html?embedded=1";
  window.homeStage?.setPage("home");
  refresh();
})();
