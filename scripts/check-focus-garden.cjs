// Run against the loopback-only fixture: node scripts/check-focus-garden.cjs [--screenshots]
// The clock changes only in isolated Chromium contexts. No real accounts or records are used.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");

const origin = "http://127.0.0.1:43181";
const output = path.resolve(__dirname, "../docs/focus-garden-preview");
const screenshots = process.argv.includes("--screenshots");
const dbKey = "fictional-focus-garden-records-v1";
const legacyKey = "grove-focus-session";
const owner = "fictional-focus-gardener";
const sessionKey = `${legacyKey}:${owner}`;
const allowedPaths = new Set(["/focus", "/daily", "/garden.js", "/garden.css", "/favicon.ico"]);
const species = {
  CHICORY: "Common chicory",
  FIREWEED: "Fireweed",
  CANADA_COLUMBINE: "Canada columbine",
  BLUE_FLAG_IRIS: "Northern blue flag",
  OSTRICH_FERN: "Ostrich fern",
  MAIDENHAIR_FERN: "Northern maidenhair fern",
  PAPER_BIRCH: "Paper birch",
  WHITE_SPRUCE: "White spruce",
};

function playwright() {
  const cache = path.join(os.homedir(), ".npm/_npx");
  const candidates = process.env.GROVE_TEST_PLAYWRIGHT
    ? [process.env.GROVE_TEST_PLAYWRIGHT]
    : [
        "playwright",
        ...(fs.existsSync(cache)
          ? fs.readdirSync(cache).map((dir) => path.join(cache, dir, "node_modules/playwright"))
          : []),
      ];
  for (const candidate of candidates) {
    try {
      const tool = require(candidate);
      if (fs.existsSync(tool.chromium.executablePath())) return tool;
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("Set GROVE_TEST_PLAYWRIGHT to an installed Playwright package with Chromium.");
}

async function open(browser, viewport, { reduce = true, fallback = false } = {}) {
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 500,
    serviceWorkers: "block",
    deviceScaleFactor: 1,
    reducedMotion: reduce ? "reduce" : "no-preference",
    hasTouch: viewport.width < 500,
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin && allowedPaths.has(url.pathname) && route.request().method() === "GET"
      ? route.continue() : route.abort();
  });
  if (fallback)
    await context.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.startsWith("webgl") ? null : get.call(this, type, ...args);
      };
    });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  return { context, page };
}

const read = (page, key) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function visit(page, query = "") {
  const response = await page.goto(origin + "/focus" + query);
  assert.equal(response.status(), 200);
  await page.getByText("Fictional local preview", { exact: false }).first().waitFor();
}
async function active(page, heading) {
  await page.getByRole("timer", { name: "Focus time remaining" }).waitFor();
  await page.locator(".focus-garden-caption").getByText(new RegExp(heading, "i")).first().waitFor();
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "Complete task" }).waitFor();
}
async function setProgress(page, session, fraction) {
  const elapsed = Math.floor(session.plannedMinutes * 60_000 * fraction);
  const fixedNow = session.startedAt + elapsed;
  await page.clock.setFixedTime(new Date(fixedNow));
  const leftSeconds = Math.ceil((session.plannedMinutes * 60_000 - elapsed) / 1000);
  const time = Math.floor(leftSeconds / 60) + ":" + String(leftSeconds % 60).padStart(2, "0");
  await page.waitForFunction(
    (expected) => document.querySelector('[role="timer"][aria-label="Focus time remaining"]')?.innerText.includes(expected),
    time,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function frame(page, label, { controlsInView = true, bottomInset = 0 } = {}) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const canvas = await page.locator("canvas").boundingBox();
  const clock = await page.locator('[role="timer"][aria-label="Focus time remaining"]').boundingBox();
  const done = await page.getByRole("button", { name: "Complete task" }).boundingBox();
  const giveUp = await page.getByRole("button", { name: "End session", exact: true }).boundingBox();
  const viewport = page.viewportSize();
  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(docWidth <= viewport.width + 1, label + " horizontal overflow");
  for (const [item, box] of Object.entries({ canvas, clock, done, giveUp })) {
    assert.ok(box && box.width > 10 && box.height > 10, item + " is visibly laid out");
    if (controlsInView)
      assert.ok(
        box.y >= -1 && box.y + box.height <= viewport.height - bottomInset + 1,
        label + " " + item + " outside initial viewport " + JSON.stringify(box),
      );
  }
  if (controlsInView) {
    for (const [name, box] of [["Complete task", done], ["End session", giveUp]]) {
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim(),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      assert.equal(hit, name, label + " " + name + " center is tappable");
    }
  }
  if (viewport.width >= 1200)
    assert.ok(canvas.width >= viewport.width * 0.55, "wide screen includes a substantially sized garden");
  if (viewport.width < 440) assert.ok(canvas.width >= viewport.width * 0.82, "phone close-up fills the content width");
  console.log(
    label +
      ": " +
      Math.round(canvas.width) +
      "×" +
      Math.round(canvas.height) +
      " canvas; timer y=" +
      Math.round(clock.y) +
      "; Complete bottom=" + Math.round(done.y + done.height) + "; End session bottom=" +
      Math.round(giveUp.y + giveUp.height),
  );
}
async function capture(page, filename) {
  if (!screenshots) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, filename), animations: "disabled" });
}
async function canvasPixels(page) {
  const png = await page.locator("canvas").screenshot();
  const { data, info } = await sharp(png)
    .removeAlpha()
    .resize({ width: 180 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set();
  for (let i = 0; i < data.length; i += 3)
    colors.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
  assert.ok(colors.size >= 14, "WebGL canvas has visible colored geometry");
  return { png, data, width: info.width, height: info.height };
}
// In reduced motion the camera and surrounding garden should be stationary.
// The location of changed pixels measures where the growing edge plant is drawn.
function changedPlant(first, last) {
  assert.equal(first.width, last.width);
  assert.equal(first.height, last.height);
  let count = 0,
    totalX = 0,
    totalY = 0,
    loY = first.height,
    hiY = -1;
  for (let i = 0; i < first.data.length; i += 3) {
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(first.data[i + c] - last.data[i + c]))) < 24) continue;
    const pixel = i / 3,
      x = pixel % first.width,
      y = Math.floor(pixel / first.width);
    totalX += x;
    totalY += y;
    count++;
    loY = Math.min(loY, y);
    hiY = Math.max(hiY, y);
  }
  assert.ok(count > first.width * first.height * 0.002, "growth changes visible pixels");
  const center = [totalX / count / first.width, totalY / count / first.height];
  assert.ok(
    center[0] > 0.23 && center[0] < 0.77 && center[1] > 0.14 && center[1] < 0.88,
    "growing plant is centered in close-up: " + center,
  );
  assert.ok((hiY - loY) / first.height > 0.15, "growing plant has legible height");
  return { center: center.map((n) => n.toFixed(2)), occupiedHeight: ((hiY - loY) / first.height).toFixed(2) };
}

async function realStart(browser) {
  const { context, page } = await open(browser, { width: 1440, height: 900 }, { reduce: false });
  try {
    await visit(page);
    const original = await page.evaluate(async () => (await (await fetch("/api/grove")).json()).plants);
    await page.getByRole("checkbox", { name: /Sketch a fern frond/ }).check();
    await page.getByRole("link", { name: "Daily", exact: true }).click();
    await page.locator('a[href="/focus?task=paper"]').click();
    const setup = page.getByRole("region", { name: "Session setup" });
    await setup.waitFor();
    assert.equal(await read(page, sessionKey), null, "a Forage deep link prepares the queue without starting");
    await setup.getByRole("button", { name: "30 min" }).click();
    await setup.getByRole("button", { name: "Gentle" }).click();
    await setup.getByRole("button", { name: /What to grow/i }).click();
    const select = setup.getByRole("combobox", { name: /what to grow/i });
    for (const sp of Object.keys(species)) assert.equal(await select.locator("option[value=" + sp + "]").count(), 1);
    await select.selectOption("FIREWEED");
    await setup.getByText(/Native range includes Yukon/).waitFor();
    await page.reload();
    await setup.waitFor();
    assert.equal(await select.inputValue(), "FIREWEED");
    assert.equal(await setup.getByRole("button", { name: "30 min" }).getAttribute("aria-pressed"), "true");
    await select.selectOption("CHICORY");
    await setup.getByText(/Introduced in Canada/).waitFor();
    await setup.getByRole("button", { name: "Start 30-minute session" }).click();
    await active(page, species.CHICORY);
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key))?.id, sessionKey);
    const started = await read(page, sessionKey);
    assert.equal(started.plant.species, "CHICORY");
    assert.deepEqual(started.taskIds, ["paper", "ink"]);
    assert.equal(started.plannedMinutes, 30);
    assert.equal(started.rule, "GENTLE");
    assert.equal(await read(page, legacyKey), null);
    await page.getByRole("link", { name: "Daily", exact: true }).click();
    await page.getByRole("link", { name: /Return to Focus/ }).click();
    await active(page, species.CHICORY);
    await page.getByRole("link", { name: "Daily", exact: true }).click();
    await page.locator('a[href="/focus?task=paint"]').click();
    await active(page, species.CHICORY);
    const stillActive = await read(page, sessionKey);
    assert.deepEqual(stillActive.taskIds, started.taskIds, "a different Forage task cannot replace a running pile");
    assert.equal(stillActive.startedAt, started.startedAt);
    await page.getByText(/Your session is still running/).waitFor();
    await page.getByRole("link", { name: "Daily", exact: true }).click();
    await page.getByRole("link", { name: /Return to Focus/ }).click();
    await active(page, species.CHICORY);
    await setProgress(page, started, 0.91);
    await page.reload();
    await active(page, species.CHICORY);
    await setProgress(page, started, 0.91);
    const resumed = await read(page, sessionKey);
    assert.deepEqual(resumed.plant, started.plant);
    assert.equal(resumed.id, started.id);
    assert.equal(resumed.startedAt, started.startedAt);
    await frame(page, "1440×900 desktop");
    await canvasPixels(page);
    await capture(page, "desktop.png");
    await page.getByRole("button", { name: "End session", exact: true }).click();
    await page.getByRole("button", { name: "Keep focusing" }).click();
    await page.getByRole("button", { name: "Complete task" }).click();
    await page.getByRole("heading", { name: "Sketch a fern frond" }).waitFor();
    await page.getByRole("button", { name: "Complete task" }).click();
    await page.getByRole("heading", { name: "List cleared" }).waitFor();
    await page.waitForFunction(
      (key) => JSON.parse(localStorage.getItem(key))?.sessions.some((s) => s.ended === "CLEARED"),
      dbKey,
    );
    const records = await read(page, dbKey);
    assert.equal(records.sessions.length, 1);
    assert.equal(records.seeds, 22);
    assert.deepEqual(records.tasks.filter(t => t.done).map(t => t.id).sort(), ["ink", "paper"]);
    assert.deepEqual(
      records.plants.filter((p) => original.some((o) => o.id === p.id)),
      original,
    );
    assert.equal(records.plants.filter((p) => p.species === "CHICORY" && p.status === "ALIVE").length, 1);
    await page.getByRole("button", { name: "Take a 5-minute break" }).click();
    await page.getByRole("timer", { name: "Break time remaining" }).waitFor();
    await page.getByRole("button", { name: "End break and plan next session" }).click();
    await page.getByRole("checkbox", { name: /Mix a sky-blue swatch/ }).waitFor();
    console.log(
      "PASS task deep link, queue order and setup across reload, return to Focus, persisted clock/plant, completion, seed accounting and break",
    );
  } finally {
    await context.close();
  }
}

async function phone(browser) {
  const { context, page } = await open(browser, { width: 390, height: 844 });
  try {
    await visit(page, "?sample=growing");
    await active(page, species.CHICORY);
    const selected = await read(page, sessionKey);
    // Move only this fictional resumed session to the outermost tile.
    selected.plant.x = -3;
    selected.plant.y = -3;
    await page.evaluate(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [sessionKey, selected]);
    await page.reload();
    await active(page, species.CHICORY);
    await setProgress(page, selected, 0.02);
    const seed = await canvasPixels(page);
    await page.getByText(/Growth 1 of 17/i).waitFor();
    await setProgress(page, selected, 0.52);
    await page.getByText(/Growth 9 of 17/i).waitFor();
    const middle = await canvasPixels(page);
    assert.ok(!middle.data.equals(seed.data), "a mid-session milestone changes the plant");
    await setProgress(page, selected, 0.97);
    await page.getByText(/Growth 16 of 17/i).waitFor();
    const mature = await canvasPixels(page);
    console.log("390px outer-tile plant:", changedPlant(seed, mature));
    await page.waitForTimeout(450);
    assert.ok(
      (await canvasPixels(page)).data.equals(mature.data),
      "reduced-motion scene remains still between garden milestones",
    );
    await frame(page, "390×844 phone");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34 } });
    await frame(page, "390×844 phone with 34px bottom inset", { bottomInset: 34 });
    await capture(page, "phone.png");
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: {} });
    await page.setViewportSize({ width: 320, height: 568 });
    await frame(page, "320×568 phone");
    await page.getByRole("button", { name: "End session", exact: true }).click();
    const keep = page.getByRole("button", { name: "Keep focusing" });
    const cancelBox = await keep.boundingBox();
    assert.ok(cancelBox.y >= 0 && cancelBox.y + cancelBox.height <= 568, "compact confirmation fits");
    await keep.click();
    await page.setViewportSize({ width: 844, height: 390 });
    await frame(page, "844×390 landscape", { controlsInView: false });
    await page.getByRole("button", { name: "End session", exact: true }).click();
    await page.getByRole("button", { name: "End early" }).click();
    await page.getByText(/Session ended early/).waitFor();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key))?.plants.some((p) => p.species === "CHICORY" && p.status === "WITHERED"),
      dbKey,
    );
    console.log("PASS reduced motion, focused outer tile, compact and landscape controls, early end");
  } finally {
    await context.close();
  }
}

async function speciesAndLegacy(browser) {
  for (const [id, label] of Object.entries({
    ...species,
    WILDFLOWERS: "Wildflowers",
    FERN: "Fern",
    TREE: "Tree",
    BERRY_BUSH: "Berry bush",
  })) {
    const { context, page } = await open(browser, { width: 390, height: 844 });
    try {
      await visit(page, "?sample=growing&species=" + id);
      await active(page, label);
      const session = await read(page, sessionKey);
      assert.equal(session.plant.species, id);
      await setProgress(page, session, 0.97);
      await canvasPixels(page);
      if (id === "FERN") {
        await page.clock.setFixedTime(new Date(session.startedAt + session.plannedMinutes * 60000));
        await page.getByText(/Session complete/).waitFor();
        await page.waitForFunction(
          (key) => JSON.parse(localStorage.getItem(key))?.sessions.some((s) => s.ended === "COMPLETED"),
          dbKey,
        );
      }
    } finally {
      await context.close();
    }
  }
  console.log("PASS eight named species and four legacy plant IDs render real WebGL geometry");
}

async function strictCompact(browser) {
  const { context, page } = await open(browser, { width: 320, height: 568 });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
    });
    await visit(page);
    await page.getByRole("checkbox", { name: /Fold a paper lantern/ }).check();
    await page.getByRole("button", { name: /Choose session/ }).click();
    await page.getByRole("button", { name: "Strict", exact: true }).click();
    await page.getByRole("button", { name: /Start [0-9]+-minute session/ }).click();
    await active(page, species.CHICORY);
    await page.getByText(/can.t keep the screen awake/).waitFor();
    await frame(page, "320×568 Strict phone without wake lock");
    assert.equal((await read(page, sessionKey)).rule, "STRICT");
    console.log("PASS Strict warning, timer and controls remain reachable on a short phone");
  } finally {
    await context.close();
  }
}

async function legacyServer(browser) {
  const { context, page } = await open(browser, { width: 900, height: 800 });
  try {
    await visit(page, "?legacyServer=1&task=paper");
    const setup = page.getByRole("region", { name: "Session setup" });
    await setup.waitFor();
    await setup.getByRole("button", { name: /What to grow/ }).click();
    assert.equal(await setup.locator("#focus-plant-choice").count(), 0, "old server offers original species only");
    await setup.getByRole("button", { name: "Wildflowers Free", exact: true }).click();
    await setup.getByRole("button", { name: "Gentle" }).click();
    await setup.getByRole("button", { name: /Start [0-9]+-minute session/ }).click();
    await active(page, "Wildflowers");
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.id, sessionKey);
    assert.equal((await read(page, sessionKey)).plant.species, "WILDFLOWERS");
    await page.getByRole("button", { name: "Complete task" }).click();
    await page.getByRole("heading", { name: "List cleared" }).waitFor();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.sessions[0].ended === "CLEARED", dbKey);
    const db = await read(page, dbKey);
    assert.equal(db.sessions.length, 1);
    assert.equal(db.plants.filter(plant => plant.species === "WILDFLOWERS" && plant.status === "ALIVE").length, 2);
    console.log("PASS an older fixture server offered the original choices and grew a living legacy plant");
  } finally {
    await context.close();
  }
}

async function ownership(browser) {
  const { context, page } = await open(browser, { width: 900, height: 800 });
  try {
    await visit(page, "?sample=growing&species=FERN");
    await active(page, "Fern");
    const saved = await read(page, sessionKey);
    const initialSeeds = (await read(page, dbKey)).seeds;
    const other = { ...saved, id: "fictional-unrelated-id", taskIds: ["fictional-unrelated-task"] };
    const otherKey = legacyKey + ":fictional-other-gardener";
    await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [otherKey, other]);
    const second = await context.newPage();
    await second.goto(origin + "/daily");
    await second.getByRole("link", { name: /Return to Focus/ }).click();
    await active(second, "Fern");
    const transfer = page.getByRole("button", { name: "Use Focus in this window" });
    await transfer.waitFor();
    assert.equal(await page.getByRole("button", { name: "Complete task" }).count(), 0);
    await transfer.click();
    await active(page, "Fern");
    await second.getByRole("button", { name: "Use Focus in this window" }).waitFor();
    await page.getByRole("button", { name: "Complete task" }).click();
    await page.getByRole("heading", { name: "Sketch a fern frond" }).waitFor();
    const after = await read(page, sessionKey);
    assert.equal(after.id, saved.id);
    assert.equal(after.startedAt, saved.startedAt);
    assert.deepEqual(after.plant, saved.plant);
    assert.deepEqual(after.ticks.map(tick => tick.taskId), ["paper"]);
    assert.deepEqual(await read(page, otherKey), other, "another account's saved session is untouched");
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.tasks.find(task => task.id === "paper")?.done, dbKey);
    const db = await read(page, dbKey);
    assert.equal(db.sessions.length, 1);
    assert.equal(db.seeds, initialSeeds + 1);
    console.log("PASS real browser tab handoff, explicit takeover, one clock and one task update, other account untouched");
  } finally {
    await context.close();
  }
}

async function legacy(browser) {
  const { context, page } = await open(browser, { width: 390, height: 844 });
  try {
    await visit(page, "?sample=tending");
    await active(page, "tree");
    const saved = await read(page, sessionKey);
    assert.equal(await read(page, legacyKey), null, "verified legacy tending session migrated");
    assert.equal(saved.plant.species, "TREE");
    assert.equal(saved.plant.tendId, "tree");
    assert.equal(saved.plant.stage, 3);
    const before = await read(page, dbKey);
    const tree = before.plants.find(row => row.id === "tree");
    assert.equal(tree.stage, 2);
    await page.reload();
    await active(page, "tree");
    assert.equal((await read(page, sessionKey)).startedAt, saved.startedAt);
    await page.clock.setFixedTime(new Date(saved.startedAt + saved.plannedMinutes * 60_000));
    await page.getByRole("heading", { name: "Session complete" }).waitFor();
    await page.getByText(/Your tree grew a stage/).waitFor();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).sessions[0].ended === "COMPLETED", dbKey);
    const after = await read(page, dbKey);
    assert.deepEqual(after.plants, before.plants.map(row => row.id === "tree" ? { ...row, stage: 3 } : row));
    assert.equal(after.seeds, before.seeds);
    console.log("PASS verified old tending session recovered, kept its timer and advanced only its original tree");
  } finally {
    await context.close();
  }

  const fresh = await open(browser, { width: 390, height: 844 });
  try {
    const next = fresh.page;
    await visit(next, "?sample=growing&species=BERRY_BUSH");
    await active(next, "Berry bush");
    const saved = await read(next, sessionKey);
    // Seed the historical state in the new document. The outgoing controller
    // saves once more on pagehide, as it would on an ordinary page reload.
    await next.addInitScript(([legacy, scoped]) => {
      const old = sessionStorage.getItem("fictional-restore-record");
      if (old !== null) {
        localStorage.setItem(legacy, old);
        localStorage.removeItem(scoped);
        sessionStorage.removeItem("fictional-restore-record");
      }
    }, [legacyKey, sessionKey]);
    await next.evaluate(value => sessionStorage.setItem("fictional-restore-record", JSON.stringify(value)), saved);
    await next.reload();
    await active(next, "Berry bush");
    assert.deepEqual(await read(next, sessionKey), saved);
    assert.equal(await read(next, legacyKey), null, "verified old running session moved to the owner's key");
    const unknown = { ...saved, id: "unowned-fictional-session", startedAt: saved.startedAt - 1000, taskIds: ["unknown-task"] };
    await next.evaluate(value => sessionStorage.setItem("fictional-restore-record", JSON.stringify(value)), unknown);
    await next.reload();
    await next.getByRole("checkbox", { name: /Fold a paper lantern/ }).waitFor();
    assert.deepEqual(await read(next, legacyKey), unknown, "unattributed legacy session is available to its original account");
    assert.equal(await read(next, sessionKey), null);
    console.log("PASS old running session recovered with its original plant and unverified session left untouched");
  } finally {
    await fresh.context.close();
  }
}

async function fallback(browser) {
  const { context, page } = await open(browser, { width: 390, height: 844 }, { fallback: true });
  try {
    await visit(page, "?sample=growing&species=FERN");
    await page.getByRole("progressbar", { name: "Session progress" }).waitFor();
    await page.getByRole("button", { name: "Complete task" }).waitFor();
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal((await read(page, sessionKey)).plant.species, "FERN");
    console.log("PASS legacy fern resumed with working controls and progress when WebGL is unavailable");
  } finally {
    await context.close();
  }
}

(async () => {
  if (screenshots) fs.mkdirSync(output, { recursive: true });
  const browser = await playwright().chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const checks = { desktop: realStart, phone, strict: strictCompact, species: speciesAndLegacy, fallback, ownership, legacy, "legacy-server": legacyServer };
    const requested = process.argv.find((arg) => arg.startsWith("--case="))?.slice("--case=".length);
    if (requested) {
      assert.ok(Object.hasOwn(checks, requested), "Unknown --case; choose " + Object.keys(checks).join(", "));
      await checks[requested](browser);
    } else for (const check of Object.values(checks)) await check(browser);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
