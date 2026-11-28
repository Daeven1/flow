// Fictional data stays on the isolated preview origin. /focus uses the project's
// real workspace and clock. /grove-lab displays the development gallery.
import "../app/globals.css";
import { createRoot } from "react-dom/client";
import FocusPage from "../app/focus/page";
import GroveLab from "../app/grove-lab/GroveLab";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { format } from "date-fns";
import { GroveWorkspace } from "../components/focus/FocusSessionProvider";
import { AccountFocusStorage, OWNER_HEADER } from "../lib/focus/accountStorage";
import { currentOwner, fictionalOwner, reopenSample } from "./focus-garden-auth";
import { STORAGE_KEY } from "../lib/focus/storage";
import { parseEnd, parseStart } from "../lib/focus/validate";
import { isLegacySpecies } from "../lib/grove/species";
import { isSpecies, canTend } from "../lib/grove/layout";
import { planFor, resolvePlant } from "../lib/grove/planting";

// Emulate pre-catalog planting responses in this tab only.
const legacySetting = new URLSearchParams(location.search).get("legacyServer");
const legacyKey = "fictional-focus-garden-legacy-server";
if (legacySetting === "1" || legacySetting === "0") sessionStorage.setItem(legacyKey, legacySetting);
const legacyServer = sessionStorage.getItem(legacyKey) === "1";

const recordsKey = "fictional-focus-garden-records-v1";

function freshRecords() {
  const tasks = [
    { id: "paper", name: "Fold a paper lantern" },
    { id: "ink", name: "Sketch a fern frond" },
    { id: "paint", name: "Mix a sky-blue swatch" },
    { id: "glaze", name: "Glaze the clay bowl", context: "PERSONAL" },
  ].map((task, index) => ({ userId: fictionalOwner, context: "PROFESSIONAL", ...task, sprint: index + 1, estMinutes: 10, done: false }));

  const plants = [
    { id: "tree", species: "TREE", x: -2, y: -1, stage: 2 },
    { id: "flower", species: "WILDFLOWERS", x: 1, y: -2, stage: 1 },
    { id: "fern", species: "FERN", x: -2, y: 1, stage: 1 },
    { id: "bush", species: "BERRY_BUSH", x: 2, y: 0, stage: 1 },
  ].map(plant => ({ ...plant, status: "ALIVE", plantedAt: "2026-07-02T12:00:00Z", witheredAt: null }));

  return { tasks, plants, seeds: 20, sessions: [] };
}

function loadRecords() {
  const stored = localStorage.getItem(recordsKey);
  return stored ? JSON.parse(stored) : freshRecords();
}

function save(db) {
  localStorage.setItem(recordsKey, JSON.stringify(db));
}

function json(body, status = 200) {
  return Response.json(body, { status });
}

function startSession(db, input) {
  const startedAt = input.startedAt.toISOString();
  const existing = db.sessions.find(session => session.startedAt === startedAt);
  if (existing) return existing;

  const tree = db.plants.find(plant => plant.id === input.plant?.tendId) ?? null;
  const resolved = resolvePlant(input.plant, tree, db.seeds);
  const session = {
    ...resolved,
    // Works on private HTTP as well as loopback's secure context.
    id: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""),
    startedAt,
    plannedMinutes: input.plannedMinutes,
    taskIds: input.taskIds,
  };
  db.seeds -= resolved.plantCost;
  db.sessions.push(session);
  save(db);
  return session;
}

function endSession(db, session, end) {
  if (session.ended) return;

  const kept = end.outcome === "COMPLETED" || end.outcome === "CLEARED";
  const tree = db.plants.find(plant => plant.id === session.tendPlantId);
  if (tree && kept && canTend(tree)) tree.stage += 1;

  const plant = planFor(session, end.outcome, end.endedAt, db.plants);
  if (plant) db.plants.push({ ...plant, id: "plant-" + session.id, stage: 1 });
  session.ended = end.outcome;
  save(db);
}

async function previewRequest(input, init) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== location.origin) throw new Error("Only the local preview API is available.");

  const owner = currentOwner();
  const expectedOwner = request.headers.get(OWNER_HEADER);
  if (!owner || (expectedOwner !== null && expectedOwner !== owner)) return json({}, 401);

  // The last task sends both a task update and a session end. Parse first so
  // each write can read, update and commit the latest fixture state synchronously.
  const body = request.method === "GET" ? null : await request.json();
  request.signal.throwIfAborted();
  const db = loadRecords();
  if (request.method === "GET") {
    if (url.pathname === "/api/focus/owner") return json({ owner });
    if (url.pathname === "/api/tasks") {
      const mode = url.searchParams.get("context");
      return json(mode ? db.tasks.filter(task => task.context === mode) : db.tasks);
    }
    if (url.pathname === "/api/grove") return json({ plants: db.plants, seeds: db.seeds, ...(legacyServer ? {} : { namedPlantStarts: true }) });
    if (url.pathname === "/api/settings") return json({ userMode: "TEACHER" });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
    const task = db.tasks.find(row => row.id === url.pathname.split("/").pop());
    if (!task || typeof body.done !== "boolean") return json({}, 400);
    if (body.done !== task.done) db.seeds += body.done ? 1 : -1;
    task.done = body.done;
    save(db);
    return json(task);
  }

  if (request.method === "POST" && url.pathname === "/api/focus/recover") {
    if (expectedOwner !== fictionalOwner) return json({}, 401);
    if (!Array.isArray(body) || body.some(claim => !claim ||
      !(claim.id === null || typeof claim.id === "string") || !Number.isFinite(claim.startedAt) ||
      !Array.isArray(claim.taskIds) || !claim.taskIds.length || !claim.taskIds.every(id => typeof id === "string"))) {
      return json({}, 400);
    }
    const owned = body.filter(claim =>
      db.sessions.some(row => Date.parse(row.startedAt) === claim.startedAt &&
        (claim.id === null ? JSON.stringify(row.taskIds) === JSON.stringify(claim.taskIds) : row.id === claim.id)) ||
      (claim.id === null && claim.taskIds.some(id => db.tasks.some(task => task.id === id))),
    ).map(claim => claim.startedAt);
    return json({ owned });
  }
  if (request.method === "POST" && url.pathname === "/api/focus/sessions") {
    // An older route ignores an unrecognised species during request parsing.
    const ignorePlant = legacyServer && body?.plant && !isLegacySpecies(body.plant.species);
    const parsed = parseStart(ignorePlant ? { ...body, plant: null } : body);
    if (!parsed || parsed.taskIds.some(id => !db.tasks.find(task => task.id === id))) {
      return json({}, 400);
    }
    const session = startSession(db, parsed);
    return json({ id: session.id, plantAccepted: session.accepted,
      ...(!legacyServer && session.plantSpecies === "CHICORY" && session.accepted ? { acceptedSpecies: "CHICORY" } : {}) }, 201);
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/focus/sessions/")) {
    const session = db.sessions.find(row => row.id === url.pathname.split("/").pop());
    if (!session) return json({}, 404);
    const end = parseEnd(body, session.plannedMinutes);
    if (!end) return json({}, 400);
    endSession(db, session, end);
    return json({});
  }
  return json({ error: "Unknown fictional preview operation" }, 404);
}

function startRequestedSample() {
  const query = new URLSearchParams(location.search);
  const sample = query.get("sample");
  if (sample !== "growing" && sample !== "tending") return;

  const scoped = new AccountFocusStorage(fictionalOwner);
  if (!scoped.readSession() && !localStorage.getItem(STORAGE_KEY)) {
    const requested = query.get("species") ?? "CHICORY";
    const species = isSpecies(requested) ? requested : "CHICORY";
    const plant = sample === "tending"
      ? { species: "TREE", x: -2, y: -1, tendId: "tree", stage: 3 }
      : { species, x: 0, y: 0 };
    const startedAt = Date.now() - 15 * 60_000;
    const taskIds = ["paper", "ink"];
    const session = startSession(loadRecords(), { startedAt: new Date(startedAt), plannedMinutes: 20, plant, taskIds });
    const saved = {
      id: session.id, startedAt, plannedMinutes: session.plannedMinutes, rule: "GENTLE",
      taskIds, ticks: [], hiddenAt: null, ended: null, plant,
    };
    if (sample === "tending") localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else scoped.save(saved);
  }
  query.delete("sample");
  query.delete("species");
  const remaining = query.toString();
  history.replaceState(null, "", location.pathname + (remaining ? "?" + remaining : "") + location.hash);
}

function Preview() {
  const path = usePathname();
  let page;
  if (path === "/focus") page = <FocusPage />;
  else if (path === "/grove-lab") page = <GroveLab />;
  else if (path === "/login") page = <button onClick={reopenSample}>Reopen fictional account</button>;
  else if (path === "/daily") page = <section>
    <h1>Daily</h1><p>Fictional navigation test page.</p>
    <ul>
      <li><Link href="/focus?task=paper">Focus on Fold a paper lantern</Link></li>
      <li><Link href="/focus?task=paint">Focus on Mix a sky-blue swatch</Link></li>
    </ul>
  </section>;
  else page = <p>Fictional navigation test page.</p>;
  return <><GroveWorkspace>{page}</GroveWorkspace>
    <footer className="py-2 text-center text-xs text-slate-600 dark:text-zinc-400">Fictional local preview</footer></>;
}

if (!localStorage.getItem("grove-mode-date")) {
  localStorage.setItem("grove-mode-date", format(new Date(), "yyyy-MM-dd"));
  localStorage.setItem("grove-mode", "PROFESSIONAL");
}
const theme = localStorage.getItem("grove-theme");
document.documentElement.classList.toggle("dark", theme === "dark" || (!theme && matchMedia("(prefers-color-scheme: dark)").matches));
window.fetch = previewRequest;
if (location.pathname === "/focus" && currentOwner()) startRequestedSample();
createRoot(document.getElementById("root")).render(<Preview />);
