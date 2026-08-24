// Debug: log event stream + menu open/close around a right-click.
const DEBUG = "http://localhost:9222";
const APP = "http://localhost:3123/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch(`${DEBUG}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    return r.result?.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: APP });
  await sleep(6000);

  await evalJs(`(() => {
    window.__log = [];
    for (const t of ["pointerdown","pointerup","mousedown","mouseup","contextmenu","click"]) {
      window.addEventListener(t, (e) => window.__log.push(
        t + " btn=" + e.button + " @" + e.clientX + "," + e.clientY +
        " tgt=" + e.target.tagName + " def=" + e.defaultPrevented), true);
    }
    window.__menuLog = [];
    new MutationObserver(() => {
      const el = document.querySelector("div.fixed.inset-0.z-50");
      window.__menuLog.push(el ? "OPEN:" + el.textContent.slice(0, 60) : "CLOSED");
    }).observe(document.body, { childList: true, subtree: true });
    return "instrumented";
  })()`);

  const info = await evalJs(`(() => { const c = document.querySelector("main canvas"); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const cx = Math.round(info.x + info.w / 2), cy = Math.round(info.y + info.h / 2);

  // place a part
  await evalJs(`[...document.querySelectorAll("button")].find((e) => e.textContent.includes("SS-400-6"))?.click()`);
  await sleep(500);

  const mouse = (type, x, y, button, buttons, clickCount) =>
    send("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount });

  // right-click on the part
  await mouse("mousePressed", cx, cy, "right", 2, 1);
  await sleep(80);
  await mouse("mouseReleased", cx, cy, "right", 0, 1);
  await sleep(600);

  console.log("--- events ---");
  console.log((await evalJs(`window.__log.join("\\n")`)) ?? "(none)");
  console.log("--- menu ---");
  console.log((await evalJs(`window.__menuLog.join("\\n")`)) ?? "(none)");
  ws.close();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
