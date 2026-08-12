import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "PipeForge Manual & Tutorials",
  description:
    "Operating manual and tutorials for PipeForge — the web-based 3D UHP / industrial piping designer.",
};

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2
    id={id}
    className="mt-12 border-b border-neutral-800 pb-2 text-xl font-semibold text-amber-300"
  >
    {children}
  </h2>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 text-sm leading-relaxed text-neutral-300">{children}</p>
);

const LI = ({ children }: { children: React.ReactNode }) => (
  <li className="text-sm leading-relaxed text-neutral-300">{children}</li>
);

const chapters: [string, string][] = [
  ["intro", "1. What is PipeForge"],
  ["quickstart", "2. Quick start (5 minutes)"],
  ["interface", "3. Interface tour"],
  ["joining", "4. Joining methods"],
  ["building", "5. Building a system"],
  ["editing", "6. Moving, rotating, stretching"],
  ["sketch", "7. Sketch run (freehand drafting)"],
  ["outputs", "8. 2D drawings & exports"],
  ["mto", "9. MTO & ordering"],
  ["custom", "10. Custom parts & manifolds"],
  ["ai", "11. AI designer (your own key)"],
  ["shortcuts", "12. Keyboard shortcuts"],
  ["systems", "13. Piping systems & safety"],
  ["files", "14. Save, load, autosave"],
  ["faq", "15. FAQ"],
];

const shortcuts: [string, string][] = [
  ["Z", "Zoom to fit all parts"],
  ["M", "Move help (drag free parts; arrows nudge)"],
  ["R", "Rotate selected 90° about Y"],
  ["A", "Auto-connect selected part to nearest free port"],
  ["S", "Sketch run on/off"],
  ["I or 2", "Isometric view"],
  ["1 / 3 / 4 / 5", "3D / Top / Front / Side view"],
  ["Arrow keys", "Nudge selected part 0.25 in (X/Z)"],
  ["PgUp / PgDn", "Nudge selected part up / down"],
  ["Delete / Backspace", "Delete selected part"],
  ["Esc", "Cancel mode / close panels / clear selection"],
  ["Ctrl+S", "Save project as JSON"],
];

const joints: [string, string, string][] = [
  ["Tube compression", "Swagelok / Uni-Lok / Vigor tube fittings", "Same size, stub-to-stub"],
  ["NPT thread", "Threaded pipe, regulators, gauges", "Male ↔ female, same size"],
  ["Face-seal (VCR)", "UHP valves, regulators, POU sticks", "Male gland ↔ female body, same size"],
  ["Tube butt weld", "Dockweiler ultron / TCC orbital welding", "Weld ↔ weld, same size"],
  ["Heat fusion", "PP-H / HDPE plastic systems", "Fuse ↔ fuse, same size"],
  ["Flanged", "Flange adapters, equipment", "Flange ↔ flange, same size"],
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        {/* Table of contents */}
        <aside className="sticky top-10 hidden h-fit w-56 shrink-0 md:block">
          <div className="text-sm font-semibold tracking-wide text-neutral-100">
            Pipe<span className="text-amber-400">Forge</span> Manual
          </div>
          <nav className="mt-4 space-y-1.5">
            {chapters.map(([id, title]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block text-xs text-neutral-400 hover:text-amber-300"
              >
                {title}
              </a>
            ))}
          </nav>
          <Link
            href="/"
            className="mt-6 inline-block rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500"
          >
            ← Back to the app
          </Link>
        </aside>

        <main className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-bold text-neutral-100">
            PipeForge <span className="text-amber-400">Manual & Tutorials</span>
          </h1>
          <P>
            Web-based 3D designer for ultra-high-purity gas and industrial liquid piping:
            pick real catalog parts, snap them together, and get drawings + a complete
            material take-off a technician can build and order from.
          </P>

          <H2 id="intro">1. What is PipeForge</H2>
          <P>
            PipeForge lets you design piping systems in 3D directly in the browser — like a
            small, focused CAD tool. Every part in the catalog has a real part number,
            description, material, and standard joining method. The app enforces real-world
            connection rules, computes orbital weld joints and bend data, and generates the
            paperwork: isometric drawing sheet, 2D schematic, and a Material Take-Off (MTO)
            with order quantities.
          </P>
          <P>
            Covered systems: 316L UHP tube (Dockweiler ultron / TCC grades), Swagelok /
            Uni-Lok / Vigor tube fittings, NPT pipe, GCE Druva regulators, VCR face-seal
            hardware, PP-H and HDPE plastic fusion systems, and pipe supports.
          </P>

          <H2 id="quickstart">2. Quick start (5 minutes)</H2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <LI>
              In the left <b>catalog</b>, click <code>SS-400-6</code> (union) — it drops into
              the scene. Hover any part first to see its rendered preview.
            </LI>
            <LI>
              Click the <span className="text-green-400">green port marker</span> on the union
              — it turns yellow (active). The catalog now lists only compatible parts.
            </LI>
            <LI>
              Click <code>SS-400-9</code> (elbow) — it snaps on. The next free port activates
              automatically, so keep clicking parts to chain the run.
            </LI>
            <LI>
              Open the bottom <b>Material Take-Off</b> — your parts are already listed. Press{" "}
              <b>Z</b> to zoom to fit, then try the <b>Iso</b> view button.
            </LI>
            <LI>
              Click <b>Iso sheet</b> in the toolbar — a full A3 drawing with dimensions, weld
              and bend schedules, MTO, and safety notes. Download it as SVG.
            </LI>
          </ol>

          <H2 id="interface">3. Interface tour</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>Left — Part Catalog:</b> search, filter by family / size / brand, live part
              preview, and the custom-part form at the bottom.
            </LI>
            <LI>
              <b>Center — 3D viewport:</b> drag to orbit, right-drag to pan, scroll to zoom.
              Green spheres are free ports, yellow is the active port, gray are connected,
              orange rings mark weld joints, and a cyan cube marks a tube that can be split.
            </LI>
            <LI>
              <b>Right — Properties:</b> part spec, move/rotate controls, tube length, bend
              data, port list with connect/disconnect.
            </LI>
            <LI>
              <b>Bottom — MTO:</b> live material take-off with CSV export.
            </LI>
            <LI>
              <b>Top toolbar:</b> view presets (3D/Iso/Top/Front/Side), PNG snapshot,
              Schematic, Iso sheet, Sketch run, AI designer, Save/Load/Clear.
            </LI>
          </ul>

          <H2 id="joining">4. Joining methods (what connects to what)</H2>
          <P>
            PipeForge only allows joints that exist as real products. If you pick an
            incompatible part for the active port, the joint is refused and the app suggests
            the adapter you would use in reality (e.g. a reducing union).
          </P>
          <table className="mt-4 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-700 text-neutral-400">
                <th className="py-1.5 pr-3 font-medium">Method</th>
                <th className="py-1.5 pr-3 font-medium">Used for</th>
                <th className="py-1.5 font-medium">Rule</th>
              </tr>
            </thead>
            <tbody>
              {joints.map(([m, u, r]) => (
                <tr key={m} className="border-b border-neutral-800/60">
                  <td className="py-1.5 pr-3 text-amber-200/90">{m}</td>
                  <td className="py-1.5 pr-3 text-neutral-300">{u}</td>
                  <td className="py-1.5 text-neutral-400">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <H2 id="building">5. Building a system</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>Chain building:</b> activate a port (green sphere) → click a compatible part.
              The active port auto-advances, so a whole stick builds in clicks.
            </LI>
            <LI>
              <b>Auto-connect (A):</b> select a free part and it snaps onto the nearest free
              compatible port in the assembly.
            </LI>
            <LI>
              <b>Mid-run insertion:</b> click the <span className="text-cyan-300">cyan cube</span>{" "}
              at a tube’s center, then pick a weld tee/union — the tube splits into two correct
              segments with the fitting joined in the middle.
            </LI>
            <LI>
              <b>Overlap protection:</b> parts that are not connected cannot occupy the same
              space — overlapping drops and drags are refused automatically.
            </LI>
          </ul>

          <H2 id="editing">6. Moving, rotating, stretching</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>Move:</b> drag any free (unconnected) part with the mouse — grid-snapped to
              0.25 in. Arrow keys nudge, PgUp/PgDn lift.
            </LI>
            <LI>
              <b>Rotate:</b> quick 90° buttons, or any angle 0–360° around X/Y/Z from the
              Properties panel (AutoCAD/Revit style).
            </LI>
            <LI>
              <b>Stretch:</b> Dockweiler tubes and PP-H/HDPE pipes have a <b>Length</b> field.
              Beyond the 6 in standard stick, orbital weld joints appear automatically (orange
              rings + weld schedule).
            </LI>
            <LI>
              Connected parts are locked in place — disconnect their ports first to reposition.
            </LI>
          </ul>

          <H2 id="sketch">7. Sketch run (freehand drafting)</H2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <LI>
              Toolbar → <b>Sketch run</b> (or press <b>S</b>).
            </LI>
            <LI>Click points on the floor — amber markers show the route.</LI>
            <LI>
              <b>Finish run</b>: PipeForge builds it from Dockweiler 1/4 in ULTRON tube with
              real elbows at 90° corners, all weld-connected — MTO and weld joints included.
            </LI>
          </ol>

          <H2 id="outputs">8. 2D drawings & exports</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>Ortho views:</b> Top / Front / Side toolbar buttons — flat orthographic
              projection, rotation locked.
            </LI>
            <LI>
              <b>Schematic:</b> auto-laid-out P&amp;ID-style diagram (SVG download).
            </LI>
            <LI>
              <b>Iso sheet:</b> A3 isometric drawing — pipe centerlines with face-to-face
              dimensions (in + mm), part labels, weld schedule (OD / wall / ID / orbital
              GTAW), bend schedule (R / arc / setback / gain), MTO with order notes,
              installation &amp; safety notes, title block.
            </LI>
            <LI>
              <b>PNG:</b> one-click viewport snapshot, in any view.
            </LI>
          </ul>

          <H2 id="mto">9. MTO & ordering</H2>
          <P>
            The MTO groups everything by part number with quantities. Tube and pipe rows
            additionally compute <b>how many standard sticks to order</b> from the total run
            length (e.g. “3 sticks × 6 in — total run 18 in”). <b>Export CSV</b> gives a
            spreadsheet-ready ordering list. Supports (strut, clamps, hangers) are listed too —
            add them so the order is complete.
          </P>

          <H2 id="custom">10. Custom parts & manifolds</H2>
          <P>
            Bottom of the catalog → <b>+ Add custom part / manifold</b>. Pick a template
            (union, elbow, tee, ball/needle valve, regulator, gauge, or VMB-style manifold
            block with 2–8 outlets), set size, end type, brand, and part number. Custom parts
            are saved in the browser and behave exactly like built-in ones — including MTO and
            drawings.
          </P>

          <H2 id="ai">11. AI designer (your own key)</H2>
          <P>
            Toolbar → <b>AI</b>: describe the system in words and the AI places the complete
            project (parts chain-connected along the flow path, then zoom-to-fit).
          </P>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>Endpoint:</b> any OpenAI-compatible API — OpenAI
              (https://api.openai.com/v1), OpenRouter, Groq, or local{" "}
              <b>Ollama</b> (http://localhost:11434/v1 — no key needed, fully offline).
            </LI>
            <LI>
              <b>Key storage:</b> your key is stored only in this browser’s localStorage and
              sent only to the endpoint you configure. Nothing passes through our server.
            </LI>
            <LI>
              <b>Good prompts name the flow path:</b> “1/4 in UHP N2 stick: 12 in tube, weld
              elbow, diaphragm valve, EMD point-of-use regulator, gauge, VCR cap”.
            </LI>
            <LI>Unknown or un-joinable parts are skipped and reported — nothing breaks.</LI>
          </ul>

          <H2 id="shortcuts">12. Keyboard shortcuts</H2>
          <table className="mt-4 w-full text-left text-xs">
            <tbody>
              {shortcuts.map(([k, d]) => (
                <tr key={k} className="border-b border-neutral-800/60">
                  <td className="w-40 py-1.5 pr-3">
                    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-amber-300">
                      {k}
                    </code>
                  </td>
                  <td className="py-1.5 text-neutral-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <H2 id="systems">13. Piping systems & safety</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>UHP stainless (ultron / TCC):</b> cleanroom handling, ends capped until
              welding, orbital GTAW with 99.999% Ar purge, He leak test before service.
            </LI>
            <LI>
              <b>PP-H / HDPE:</b> heat fusion per DVS 2207 (element ≈ 210 °C), respect
              heat/soak/cooling times, never load fresh joints.
            </LI>
            <LI>
              <b>Supports:</b> anchor per load calculation, maintain slope/drain, never hang
              other services from gas lines.
            </LI>
            <LI>
              The iso sheet prints the safety notes that match the systems in your model.
            </LI>
          </ul>

          <H2 id="files">14. Save, load, autosave</H2>
          <P>
            The project autosaves to the browser on every change. <b>Save</b> (Ctrl+S)
            downloads a JSON project file; <b>Load</b> restores it. Custom parts are stored
            separately in the browser and reload automatically.
          </P>

          <H2 id="faq">15. FAQ</H2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <LI>
              <b>A part won’t join?</b> Read the amber banner — it names the adapter you need
              (e.g. a reducing union). Sizes and joining methods must match, like real
              hardware.
            </LI>
            <LI>
              <b>Can’t move a part?</b> It has connections — disconnect its ports in the
              Properties panel first.
            </LI>
            <LI>
              <b>Tube length won’t change?</b> Same reason — only unconnected tubes stretch.
            </LI>
            <LI>
              <b>Are dimensions certified vendor data?</b> No — they are approximate
              engineering values for design and visualization; verify against vendor catalogs
              before fabrication.
            </LI>
            <LI>
              <b>Where is my data?</b> Everything stays in your browser (localStorage) and in
              the JSON files you export. No account, no server storage.
            </LI>
          </ul>

          <div className="mt-14 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
            PipeForge — 3D UHP / industrial piping designer · pipeforge.shariar.dev
          </div>
        </main>
      </div>
    </div>
  );
}
