(() => {
  if (window.parent === window || new URLSearchParams(location.search).get("embedded") !== "1") return;
  document.body.dataset.embedded = "true";
  const source = window.parent.chatAPI;
  if (!source) {
    document.getElementById("input").disabled = true;
    document.getElementById("btn-send").disabled = true;
    document.getElementById("soft-status").textContent = "聊天连接未就绪，请重新打开应用。";
    return;
  }
  const cleanups = [];
  const bridge = {};
  for (const name of Object.keys(source)) {
    if (typeof source[name] !== "function") continue;
    bridge[name] = (...args) => {
      const result = source[name](...args);
      if (name.startsWith("on") && typeof result === "function") cleanups.push(result);
      return result;
    };
  }
  window.petAPI = Object.freeze(bridge);
  window.addEventListener("beforeunload", () => cleanups.forEach(cleanup => cleanup()));
})();
