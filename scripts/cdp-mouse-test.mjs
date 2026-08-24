// Scratch CDP driver: verifies viewport mouse behavior in headless Chrome.
// Not part of the app — manual test harness for the §3 interaction model
// (left-drag pan / part move / Shift axis-lock / Esc cancel / right-drag
// stretch handles / context-menu guard).
//
// Usage:
//   1. npm run dev -- -p 3123          (dev build — window.__pf hooks required)
//   2. chrome --headless=new --remote-debugging-port=9222 about:blank
//   3. node scripts/cdp-mouse-test.mjs [baseline|pan|orbit|move|shiftmove|
//      escmove|resize|escresize|all]
const DEBUG = "http://localhost:9222";
const APP = process.env.APP_URL ?? "http://localhost:3123/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHIFT = 8; // Input.dispatchMouseEvent modifiers bitfield

let send;
let wsRaw; // raw socket — scenarios can listen for events (JS dialogs etc.)
let failures = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function getWsUrl() {
  const list = await (await fetch(`${DEBUG}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  return page.webSocketDebuggerUrl;
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
}

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function mouse(type, x, y, button = "none", buttons = 0, clickCount = 0, modifiers = 0) {
  await send("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount, modifiers });
}

// Generic drag: press, move in steps, release. Returns after settling.
async function drag(x, y, dx, dy, { button = "left", modifiers = 0, steps = 8 } = {}) {
  const btn = button === "left" ? 1 : 2;
  await mouse("mousePressed", x, y, button, btn, 1, modifiers);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", x + (dx * i) / steps, y + (dy * i) / steps, button, btn, 0, modifiers);
    await sleep(30);
  }
  await sleep(60);
  await mouse("mouseReleased", x + dx, y + dy, button, 0, 1, modifiers);
  await sleep(300);
}

// Press-and-hold, move partway, fire Escape, move again, release (cancel path).
async function dragWithEscape(x, y, dx, dy, { button = "left", steps = 6 } = {}) {
  const btn = button === "left" ? 1 : 2;
  await mouse("mousePressed", x, y, button, btn, 1);
  for (let i = 1; i <= steps / 2; i++) {
    await mouse("mouseMoved", x + (dx * i) / steps, y + (dy * i) / steps, button, btn, 0);
    await sleep(30);
  }
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await sleep(150);
  for (let i = steps / 2 + 1; i <= steps; i++) {
    await mouse("mouseMoved", x + (dx * i) / steps, y + (dy * i) / steps, button, btn, 0);
    await sleep(30);
  }
  await sleep(60);
  await mouse("mouseReleased", x + dx, y + dy, button, 0, 1);
  await sleep(300);
}

const dump = `(() => {
  const s = window.__pf?.getState();
  if (!s) return null;
  const p = s.placed.find((x) => x.uid === s.selectedUid) ?? s.placed[0] ?? null;
  return {
    placed: s.placed.length,
    selectedUid: s.selectedUid,
    dragging: s.dragging,
    resizing: s.resizing,
    past: s.past.length,
    position: p?.position ?? null,
    quaternion: p?.quaternion ?? null,
    lengthOverride: p?.lengthOverride ?? null,
    notice: s.notice,
  };
})()`;

const cam = `(() => {
  const c = window.__pfCam;
  return c ? [c.position.x, c.position.y, c.position.z] : null;
})()`;

const menuText = `(() => {
  const el = document.querySelector("div.fixed.inset-0.z-50");
  return el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
})()`;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

let info; // canvas rect

async function fresh() {
  // First pass: wipe persisted state (the app autosaves placed parts to
  // localStorage), then reload so every scenario boots with an empty project.
  await send("Page.navigate", { url: APP });
  await sleep(2500);
  await evalJs(`localStorage.clear()`);
  await send("Page.navigate", { url: APP });
  await sleep(6000); // hydration + three.js boot
  info = await evalJs(`(() => {
    const c = document.querySelector("main canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (!info) throw new Error("no canvas found");
  const hasHooks = await evalJs(`!!window.__pf && !!window.__pfProject`);
  if (!hasHooks) throw new Error("dev hooks missing — run a dev server (NODE_ENV=development)");
}

async function placePart(defId) {
  await evalJs(`window.__pf.getState().placePart(${JSON.stringify(defId)})`);
  await sleep(700);
}

async function scenarioBaseline() {
  await fresh();
  // Place via the real catalog button when it is visible, else store fallback.
  const clicked = await evalJs(`(() => {
    const b = [...document.querySelectorAll("button")].find((e) => e.textContent.includes("SS-400-6"));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!clicked) await placePart("ss-400-6");
  await sleep(800);

  // Right-click ON the part (projected to screen coords): part menu.
  const s0 = await evalJs(dump);
  const pt = await evalJs(`window.__pfProject(${s0.position.join(",")})`);
  await drag(Math.round(pt.x), Math.round(pt.y), 0, 0, { button: "right", steps: 1 });
  const partMenu = await evalJs(menuText);
  check("right-click on part opens part menu", !!partMenu, partMenu ?? "none");
  await evalJs(`document.querySelector("div.fixed.inset-0.z-50")?.dispatchEvent(new MouseEvent("click", {bubbles:true}))`);
  await sleep(300);

  await drag(info.x + 30, info.y + info.h - 40, 0, 0, { button: "right", steps: 1 });
  const canvasMenu = await evalJs(menuText);
  check("right-click on empty canvas opens canvas menu", !!canvasMenu, canvasMenu ?? "none");
  check("part and canvas menus differ", !!partMenu && !!canvasMenu && partMenu !== canvasMenu);
}

async function scenarioPan() {
  await fresh();
  const before = await evalJs(cam);
  await drag(info.x + 60, info.y + info.h - 80, 140, -60);
  const after = await evalJs(cam);
  const s = await evalJs(dump);
  check("left-drag on empty canvas pans the camera", dist(before, after) > 0.5,
    `moved ${dist(before, after).toFixed(2)} in`);
  check("pan leaves store idle", s.dragging === false && s.placed === 0);
}

async function scenarioOrbit() {
  await fresh();
  const before = await evalJs(cam);
  await drag(info.x + 60, info.y + info.h - 80, 160, 40, { button: "right" });
  const after = await evalJs(cam);
  check("right-drag on empty canvas orbits (3d view)", dist(before, after) > 0.5,
    `moved ${dist(before, after).toFixed(2)} in`);
}

async function scenarioMove() {
  await fresh();
  await placePart("ss-400-6");
  const s0 = await evalJs(dump);
  const camBefore = await evalJs(cam);
  const pt = await evalJs(`window.__pfProject(${s0.position.join(",")})`);
  await drag(Math.round(pt.x), Math.round(pt.y), 110, 55);
  const s1 = await evalJs(dump);
  const camAfter = await evalJs(cam);
  const moved = dist(s0.position, s1.position);
  check("left-drag on a part moves it", moved > 0.2, `moved ${moved.toFixed(2)} in`);
  check("move is grid-snapped to 0.25 in",
    s1.position.every((v) => near(v * 4, Math.round(v * 4), 1e-9)),
    JSON.stringify(s1.position));
  check("move keeps the part's height", near(s1.position[1], s0.position[1], 1e-9));
  check("camera does not pan while a part is dragged", dist(camBefore, camAfter) < 0.01);
  check("whole drag is one undo step", s1.past === s0.past + 1, `past ${s0.past} -> ${s1.past}`);
  check("drag flag cleared after release", s1.dragging === false);
}

async function scenarioShiftMove() {
  await fresh();
  await placePart("ss-400-6");
  const s0 = await evalJs(dump);
  const pt = await evalJs(`window.__pfProject(${s0.position.join(",")})`);
  await drag(Math.round(pt.x), Math.round(pt.y), 130, 45, { modifiers: SHIFT });
  const s1 = await evalJs(dump);
  const dx = Math.abs(s1.position[0] - s0.position[0]);
  const dz = Math.abs(s1.position[2] - s0.position[2]);
  check("Shift-drag constrains to one axis",
    (dx > 0.2 && dz < 1e-9) || (dz > 0.2 && dx < 1e-9),
    `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}`);
}

async function scenarioEscMove() {
  await fresh();
  await placePart("ss-400-6");
  const s0 = await evalJs(dump);
  const pt = await evalJs(`window.__pfProject(${s0.position.join(",")})`);
  await dragWithEscape(Math.round(pt.x), Math.round(pt.y), 110, 55);
  const s1 = await evalJs(dump);
  check("Escape mid-move restores the position",
    near(dist(s0.position, s1.position), 0, 1e-9), JSON.stringify(s1.position));
  check("Escape leaves no undo entry", s1.past === s0.past, `past ${s0.past} -> ${s1.past}`);
  check("drag flag cleared after Escape", s1.dragging === false);
}

// Tube at [0,0.75,0], identity quaternion, world-X axis, 6 in stick.
async function scenarioResize() {
  await fresh();
  await placePart("dw-1001-1-4x0-035-1-4435-ultron");
  const s0 = await evalJs(dump);
  const camBefore = await evalJs(cam);
  const half = 3;
  const p1 = [s0.position[0] - half, s0.position[1], s0.position[2]];
  const p2 = [s0.position[0] + half, s0.position[1], s0.position[2]];
  const sp1 = await evalJs(`window.__pfProject(${p1.join(",")})`);
  const sp2 = await evalJs(`window.__pfProject(${p2.join(",")})`);
  // Drag the p2 handle further out along the tube's on-screen axis.
  const dir = { x: sp2.x - sp1.x, y: sp2.y - sp1.y };
  const len = Math.hypot(dir.x, dir.y);
  dir.x /= len; dir.y /= len;
  await drag(Math.round(sp2.x), Math.round(sp2.y), Math.round(dir.x * 120), Math.round(dir.y * 120), { button: "right" });
  const s1 = await evalJs(dump);
  const camAfter = await evalJs(cam);
  check("right-drag on an end handle stretches the tube",
    typeof s1.lengthOverride === "number" && s1.lengthOverride > 6,
    `len 6 -> ${s1.lengthOverride}`);
  if (typeof s1.lengthOverride === "number") {
    const anchor = s1.position[0] - s1.lengthOverride / 2;
    check("opposite end stays anchored", near(anchor, p1[0], 0.14),
      `anchor ${anchor.toFixed(2)} vs ${p1[0].toFixed(2)}`);
  }
  check("resize does not orbit the camera", dist(camBefore, camAfter) < 0.01);
  check("resize flag cleared after release", s1.resizing === false);
  const menu = await evalJs(menuText);
  check("no context menu after a resize drag", menu === null, menu ?? "closed");
}

async function scenarioEscResize() {
  await fresh();
  await placePart("dw-1001-1-4x0-035-1-4435-ultron");
  const s0 = await evalJs(dump);
  const p2 = [s0.position[0] + 3, s0.position[1], s0.position[2]];
  const sp2 = await evalJs(`window.__pfProject(${p2.join(",")})`);
  await dragWithEscape(Math.round(sp2.x), Math.round(sp2.y), 90, 0, { button: "right" });
  const s1 = await evalJs(dump);
  check("Escape mid-resize restores the length", s1.lengthOverride === null,
    `lengthOverride=${s1.lengthOverride}`);
  check("Escape mid-resize restores the center",
    near(dist(s0.position, s1.position), 0, 1e-9), JSON.stringify(s1.position));
  check("Escape leaves no undo entry", s1.past === s0.past, `past ${s0.past} -> ${s1.past}`);
  check("resize flag cleared after Escape", s1.resizing === false);
}

// §7: plan/elevation/isometric are camera projections of the one 3D model,
// switchable from a persistent toolbar control.
async function scenarioViews() {
  await fresh();
  await placePart("ss-400-6");
  for (const mode of ["top", "front", "side", "iso", "3d"]) {
    await evalJs(`window.__pf.getState().setViewMode("${mode}")`);
    await sleep(700);
    const c = await evalJs(`(() => { const c = window.__pfCam; return c ? { ortho: c.isOrthographicCamera === true } : null; })()`);
    const vm = await evalJs(`window.__pf.getState().viewMode`);
    check(`view "${mode}" uses ${mode === "3d" ? "perspective" : "orthographic"} projection`,
      vm === mode && !!c && c.ortho === (mode !== "3d"), `ortho=${c?.ortho}`);
  }
  const n = await evalJs(`[...document.querySelectorAll("button")].filter((b) => ["3D","Iso","Top","Front","Side"].includes(b.textContent.trim())).length`);
  check("view switcher shows all five modes", n === 5, `${n}/5`);
  const placed = await evalJs(`window.__pf.getState().placed.length`);
  check("single 3D model survives all view switches", placed === 1, `${placed} part(s)`);
}

// §4: click through the Export menu and verify the generated files. Blob
// downloads are captured in-page — headless Chrome's download manager is
// flaky with blob: URLs, and the payload is what matters here.
async function scenarioExports() {
  await fresh();
  await placePart("dw-1001-1-4x0-035-1-4435-ultron");
  await placePart("ss-400-6");
  await evalJs(`(() => {
    window.__downloads = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__downloads.push(blob);
      return orig(blob);
    };
  })()`);

  const clickItem = async (label) => {
    await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Export"))?.click()`);
    await sleep(300);
    const found = await evalJs(`(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(${JSON.stringify(label)}));
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (!found) check(`export menu item "${label}" exists`, false);
    await sleep(800);
  };

  await clickItem("DXF — AutoCAD");
  await clickItem("PDF — current view");
  await clickItem("IFC — BIM");
  await clickItem("DWG — via format");

  const files = await evalJs(`Promise.all(window.__downloads.map((b) => b.text()))`);
  const [dxf, pdf, ifc, dwg] = files;
  check("four exports produced blobs", files.length === 4, `${files.length} blobs`);

  check("DXF has sections + geometry",
    !!dxf && dxf.startsWith("0\nSECTION") && dxf.includes("3DFACE") && dxf.includes("CENTERLINES") && dxf.trimEnd().endsWith("EOF"),
    dxf ? `${dxf.length} chars` : "missing");

  check("PDF is a valid vector file",
    !!pdf && pdf.startsWith("%PDF-") && pdf.includes(" m ") && pdf.trimEnd().endsWith("%%EOF"),
    pdf ? `${pdf.length} chars` : "missing");

  check("IFC is STEP with pipe entities",
    !!ifc && ifc.startsWith("ISO-10303-21") && ifc.includes("IFCPIPESEGMENT") && ifc.includes("IFCPIPEFITTING") && ifc.includes("IFC4"),
    ifc ? `${ifc.length} chars` : "missing");

  check("DWG path produces a second DXF", !!dwg && dwg.startsWith("0\nSECTION"),
    dwg ? `${dwg.length} chars` : "missing");
  const notice = await evalJs(`window.__pf.getState().notice`);
  check("DWG click flags the conversion step", !!notice && notice.includes("DWG"), notice ?? "no notice");
}

// Build a minimal one-page PDF with the given text lines (Helvetica, absolute
// positioning) — a synthetic vendor catalog for the §5 import test.
function catalogPdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = lines
    .map((l, i) => `BT /F1 10 Tf 1 0 0 1 50 ${790 - i * 15} Tm (${esc(l)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return pdf;
}

// §5: upload a synthetic vendor catalog, review the parsed drafts, commit.
async function scenarioCatalog() {
  const fs = await import("node:fs");
  const tmp = "C:/Users/MOHAMMED MAMUN/AppData/Local/Temp/pf-catalog.pdf";
  fs.writeFileSync(
    tmp,
    catalogPdf([
      "ACME FITTINGS CATALOG - 316 SS tube fittings",
      "Union Elbows 90 deg",
      "SS-400-9  Union Elbow, 1/4 in OD",
      "SS-600-9  Union Elbow, 3/8 in OD",
      "Unions",
      "SS-400-6  Union, 1/4 in",
      "Ball Valves",
      "SS-43S4  Ball valve, 1/4 in, SCH 40",
      "Pressure Gauges",
      "PG-25-100  Gauge, 1/4 in MNPT",
    ]),
  );
  const emptyPdf = "C:/Users/MOHAMMED MAMUN/AppData/Local/Temp/pf-empty.pdf";
  fs.writeFileSync(emptyPdf, catalogPdf([])); // no text → raster fallback

  await fresh();
  await send("DOM.enable");
  const doc = await send("DOM.getDocument");
  const setFile = async (path) => {
    const q = await send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: 'input[type="file"][accept*="pdf"]',
    });
    await send("DOM.setFileInputFiles", { files: [path], nodeId: q.nodeId });
    await sleep(4000); // pdf.js worker parse
  };

  await setFile(tmp);
  const drafts = await evalJs(
    `window.__pf.getState().catalogImport.drafts.map((d) => ({ pn: d.partNumber, t: d.template, s: d.size, ok: d.approved }))`,
  );
  const byPn = (pn) => drafts.find((d) => d.pn === pn);
  check("catalog dialog opened with drafts", drafts.length >= 5, JSON.stringify(drafts));
  check("elbow row typed + sized", byPn("SS-400-9")?.t === "elbow" && byPn("SS-400-9")?.s === "1/4",
    JSON.stringify(byPn("SS-400-9")));
  check("second elbow keeps 3/8 size", byPn("SS-600-9")?.t === "elbow" && byPn("SS-600-9")?.s === "3/8");
  check("union row typed", byPn("SS-400-6")?.t === "union");
  check("ball valve row typed", byPn("SS-43S4 SCH40")?.t === "ball-valve",
    JSON.stringify(byPn("SS-43S4 SCH40")));
  check("gauge row typed", byPn("PG-25-100")?.t === "gauge", JSON.stringify(byPn("PG-25-100")));

  const customBefore = await evalJs(`window.__pf.getState().customDefs.length`);
  const clicked = await evalJs(`(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Add") && x.textContent.includes("to catalog"));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(700);
  const customAfter = await evalJs(`window.__pf.getState().customDefs.length`);
  check("commit adds approved drafts to the catalog",
    clicked && customAfter === customBefore + drafts.filter((d) => d.ok).length,
    `${customBefore} -> ${customAfter}`);
  const reg = await evalJs(`window.__pf.getState().customDefs.map((d) => d.partNumber).join(",")`);
  check("imported parts registered", reg.includes("SS-400-9"), reg.slice(0, 120));

  // Raster/scanned PDF → flagged for manual entry, no drafts.
  await setFile(emptyPdf);
  const msg = await evalJs(`window.__pf.getState().catalogImport.message`);
  check("scanned PDF flagged for manual entry", !!msg && msg.includes("no embedded text"), msg ?? "no message");
  const dialogText = await evalJs(`document.body.textContent.includes("manual entry")`);
  check("fallback message visible in dialog", dialogText === true);
}

// §6: DXF + PDF underlay import, two-point scale calibration, panel controls.
async function scenarioUnderlay() {
  const fs = await import("node:fs");
  const dxfPath = "C:/Users/MOHAMMED MAMUN/AppData/Local/Temp/pf-underlay.dxf";
  // 10x10 drawing: LINE + CIRCLE + closed LWPOLYLINE → bbox 0..10, 0..10.
  const pairs = [];
  const P = (c, v) => pairs.push(`${c}\n${v}`);
  P(0, "SECTION"); P(2, "ENTITIES");
  P(0, "LINE"); P(10, "0.0"); P(20, "0.0"); P(11, "10.0"); P(21, "0.0");
  P(0, "CIRCLE"); P(10, "5.0"); P(20, "5.0"); P(40, "2.5");
  P(0, "LWPOLYLINE"); P(70, "1"); P(10, "0.0"); P(20, "0.0"); P(10, "10.0"); P(20, "10.0");
  P(0, "ENDSEC"); P(0, "EOF");
  fs.writeFileSync(dxfPath, pairs.join("\n") + "\n");
  const pdfPath = "C:/Users/MOHAMMED MAMUN/AppData/Local/Temp/pf-underlay.pdf";
  fs.writeFileSync(pdfPath, catalogPdf(["SITE PLAN — test drawing"]));

  await fresh();
  await send("DOM.enable");
  const doc = await send("DOM.getDocument");
  const setFile = async (selector, path, wait = 2500) => {
    const q = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    if (!q.nodeId) {
      check(`file input ${selector} exists`, false);
      return;
    }
    await send("DOM.setFileInputFiles", { files: [path], nodeId: q.nodeId });
    await sleep(wait);
  };

  // DXF underlay: parsed, scaled to ~40 in wide, centered.
  await setFile('input[type="file"][accept=".dxf"]', dxfPath);
  let ref = await evalJs(`window.__pf.getState().reference`);
  check("DXF underlay parsed (3 polylines)", ref?.kind === "dxf" && ref.polylines.length === 3,
    ref ? `${ref.polylines?.length} polylines` : "no reference");
  check("DXF scaled to 40 in wide", near(ref?.scale ?? 0, 4, 1e-9), `scale=${ref?.scale}`);
  check("DXF centered at origin",
    near(ref?.offset?.[0] ?? 0, -20, 1e-9) && near(ref?.offset?.[1] ?? 0, 20, 1e-9),
    JSON.stringify(ref?.offset));

  // PDF underlay: page rasterized onto the same locked layer.
  await setFile('input[type="file"][accept*="pdf"]:nth-of-type(3)', pdfPath, 4000);
  ref = await evalJs(`window.__pf.getState().reference`);
  check("PDF underlay rasterized", ref?.kind === "pdf" && !!ref.image?.startsWith("data:image"),
    ref ? `${Math.round(ref.imgW)}x${Math.round(ref.imgH)}` : "no reference");
  check("underlay panel visible", await evalJs(`document.body.textContent.includes("Underlay —")`));

  // Two-point calibration: click world (0,0) and (4,0), answer 8 → scale ×2.
  const scaleBefore = ref.scale;
  const offsetBefore = ref.offset;
  wsRaw.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Page.javascriptDialogOpening")
      send("Page.handleJavaScriptDialog", { accept: true, promptText: "8" });
  });
  await evalJs(`window.__pf.getState().setCalibrating(true)`);
  await sleep(400);
  const pa = await evalJs(`window.__pfProject(0, 0, 0)`);
  const pb = await evalJs(`window.__pfProject(4, 0, 0)`);
  // Fractional pixel coords (dispatchMouseEvent takes floats) — rounding to
  // integers made the measured distance drift beyond the assert tolerance.
  await drag(pa.x, pa.y, 0, 0, { steps: 1 });
  await drag(pb.x, pb.y, 0, 0, { steps: 1 });
  await sleep(600);
  ref = await evalJs(`window.__pf.getState().reference`);
  check("calibration doubles the scale", near(ref.scale / scaleBefore, 2, 0.02),
    `${scaleBefore} -> ${ref.scale}`);
  check("calibration anchors at the first clicked point",
    near(ref.offset[0], offsetBefore[0] * 2, 0.25) && near(ref.offset[1], offsetBefore[1] * 2, 0.25),
    JSON.stringify(ref.offset));
  const calibrating = await evalJs(`window.__pf.getState().calibrating`);
  check("calibration mode ends after two points", calibrating === false);

  // DWG item flags the conversion path; Remove clears the layer.
  await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Import"))?.click()`);
  await sleep(300);
  await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("DWG drawing"))?.click()`);
  await sleep(400);
  const notice = await evalJs(`window.__pf.getState().notice`);
  check("DWG import flags the conversion step", !!notice && notice.includes("ODA"), notice ?? "no notice");
  await evalJs(`window.__pf.getState().setReference(null)`);
  ref = await evalJs(`window.__pf.getState().reference`);
  check("underlay removable", ref === null);
}

// Toolbar dropdowns paint above the 3D view (fixed-position menus — the
// header is a scroll container, absolute dropdowns get clipped behind it),
// and panel headers drag-dock onto the left/right/bottom drop targets.
async function scenarioPanels() {
  await fresh();
  await placePart("ss-400-6");

  const openMenu = async (label, marker) => {
    await evalJs(`[...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)})?.click()`);
    await sleep(400);
    return evalJs(`(() => {
      const m = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed") && d.textContent.includes(${JSON.stringify(marker)}));
      if (!m) return null;
      const r = m.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + 40);
      return { inside: m.contains(el) };
    })()`);
  };
  const m1 = await openMenu("Export ▾", "DXF — AutoCAD exchange");
  check("export dropdown above the 3D view", !!m1 && m1.inside === true);
  const m2 = await openMenu("Import ▾", "PDF catalog → parts");
  check("import dropdown above the 3D view", !!m2 && m2.inside === true);
  await evalJs(`document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`);
  await sleep(200);

  check("catalog header is draggable",
    await evalJs(`!![...document.querySelectorAll("div")].find((d) => d.getAttribute("draggable") === "true" && d.textContent.includes("Part Catalog"))`));
  await evalJs(`(() => {
    const header = [...document.querySelectorAll("div")].find((d) => d.getAttribute("draggable") === "true" && d.textContent.includes("Part Catalog"));
    window.__dt = new DataTransfer();
    header.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: window.__dt }));
  })()`);
  await sleep(300);
  check("drop targets appear during drag", await evalJs(`document.body.textContent.includes("Drop to dock bottom")`));
  await evalJs(`(() => {
    const target = [...document.querySelectorAll("div")].find((d) => d.textContent.trim() === "Drop to dock bottom");
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: window.__dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: window.__dt }));
    const header = [...document.querySelectorAll("div")].find((d) => d.getAttribute("draggable") === "true");
    header?.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: window.__dt }));
  })()`);
  await sleep(400);
  const zones = await evalJs(`JSON.stringify(window.__pf.getState().panelZones)`);
  check("drop docks the panel at the bottom", zones.includes('"catalog":"bottom"'), zones);
  check("drop targets hidden after dragend", await evalJs(`!document.body.textContent.includes("Drop to dock")`));
}

const SCENARIOS = {
  baseline: scenarioBaseline,
  pan: scenarioPan,
  orbit: scenarioOrbit,
  move: scenarioMove,
  shiftmove: scenarioShiftMove,
  escmove: scenarioEscMove,
  resize: scenarioResize,
  escresize: scenarioEscResize,
  views: scenarioViews,
  exports: scenarioExports,
  catalog: scenarioCatalog,
  underlay: scenarioUnderlay,
  panels: scenarioPanels,
};

async function main() {
  const arg = process.argv[2] ?? "all";
  const ws = new WebSocket(await getWsUrl());
  await new Promise((r) => ws.addEventListener("open", r));
  wsRaw = ws;
  send = makeClient(ws);
  await send("Page.enable");
  await send("Runtime.enable");

  const names = arg === "all" ? Object.keys(SCENARIOS) : [arg];
  for (const name of names) {
    const fn = SCENARIOS[name];
    if (!fn) {
      console.error(`unknown scenario "${name}" — one of: ${Object.keys(SCENARIOS).join(", ")}, all`);
      process.exit(1);
    }
    console.log(`\n--- ${name} ---`);
    await fn();
  }
  ws.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
