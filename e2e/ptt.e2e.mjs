import { chromium } from "playwright";

const URL = process.env.E2E_URL || "http://localhost:5173/";
const SHOT_DIR = process.env.E2E_SHOTS ||
  "/tmp";
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function makeClient(name) {
  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport: { width: 375, height: 720 },
  });
  // Mark this identity ephemeral so the hourly sweep reclaims it + its
  // content (D22) — every fresh context otherwise leaves a permanent user row.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("team-radio:e2e", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${name} console.error]`, m.text());
  });
  await page.goto(URL);
  await page.fill('[data-testid="name-input"]', name);
  await page.click('[data-testid="channel-Security"]');
  // Access-code gate (field appears only when the deployment sets ACCESS_CODE)
  const codeField = await page
    .waitForSelector('[data-testid="code-input"]', { timeout: 3000 })
    .catch(() => null);
  if (codeField) {
    if (!process.env.E2E_CODE) {
      console.log("FAIL — deployment requires an access code: set E2E_CODE=<code>");
      process.exit(1);
    }
    await codeField.fill(process.env.E2E_CODE);
  }
  await page.click('[data-testid="join-button"]');
  await page.waitForSelector('[data-testid="ptt-button"]', { timeout: 15000 });
  return { context, page, name };
}

async function pressPTT(page) {
  const box = await page.locator('[data-testid="ptt-button"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}
async function releasePTT(page) {
  await page.mouse.up();
}

// Measures RMS-ish energy on the first remote audio element for `ms`.
async function audioEnergy(page, ms) {
  return await page.evaluate(async (durMs) => {
    const el = document.querySelector("audio");
    if (!el || !el.srcObject) return -1;
    const ctx = new AudioContext();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(el.srcObject);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < durMs) {
      analyser.getByteTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      await new Promise((r) => setTimeout(r, 50));
    }
    ctx.close();
    return peak; // 0..128
  }, ms);
}

console.log("— joining two clients on channel Security —");
// Run-scoped call signs: fixed names would collide with the 7-day
// call-sign hold (D22) on the second run. Banner checks match on "Alpha".
const RUN = String(Date.now() % 1000000);
const alpha = await makeClient(`Alpha-${RUN}`);
const bravo = await makeClient(`Bravo-${RUN}`);

// AC3: rosters converge to 2 members on both clients
for (const c of [alpha, bravo]) {
  await c.page.waitForFunction(
    () => document.querySelectorAll('[data-testid="roster-member"]').length === 2,
    { timeout: 15000 },
  );
}
check("AC3 roster shows both members on both clients", true);

// Wait for mesh: each side has a remote audio element with a live track
for (const c of [alpha, bravo]) {
  await c.page.waitForFunction(
    () => {
      const a = document.querySelector("audio");
      return a && a.srcObject && a.srcObject.getAudioTracks().length > 0;
    },
    { timeout: 20000 },
  );
}
check("mesh established (remote audio track present both sides)", true);

// Give ICE a moment to fully connect, then check silence before any press (I2)
await bravo.page.waitForTimeout(2000);
const silent = await audioEnergy(bravo.page, 800);
check("I2 silence before PTT", silent >= 0 && silent < 6, `peak=${silent}`);

// AC1: Alpha talks, Bravo hears
console.log("— Alpha presses PTT —");
await pressPTT(alpha.page);
await alpha.page.waitForFunction(
  () => document.querySelector('[data-testid="ptt-button"]').dataset.state === "talking",
  { timeout: 8000 },
);
check("Alpha granted floor (ON AIR)", true);

await bravo.page.waitForSelector('[data-testid="receiving-banner"]', { timeout: 8000 });
const banner = await bravo.page.textContent('[data-testid="receiving-banner"]');
check("Bravo sees receiving banner", banner.includes("ALPHA") || banner.includes("Alpha"), banner.trim());

const loud = await audioEnergy(bravo.page, 1500);
check("AC1 Bravo receives live audio while Alpha talks", loud > 10, `peak=${loud}`);

// AC2: floor contention — Bravo pressing while Alpha talks gets busy
await pressPTT(bravo.page);
await bravo.page.waitForFunction(
  () => document.querySelector('[data-testid="ptt-button"]').dataset.state === "busy",
  { timeout: 5000 },
);
check("AC2 Bravo gets CHANNEL BUSY while Alpha holds floor", true);
await releasePTT(bravo.page);

await alpha.page.screenshot({ path: `${SHOT_DIR}/e2e-alpha-talking.png` });
await bravo.page.screenshot({ path: `${SHOT_DIR}/e2e-bravo-receiving.png` });

// Release: Alpha stops, Bravo's banner clears, silence returns
console.log("— Alpha releases —");
await releasePTT(alpha.page);
await bravo.page.waitForFunction(
  () => !document.querySelector('[data-testid="receiving-banner"]'),
  { timeout: 8000 },
);
check("floor released, banner cleared", true);

const silentAfter = await audioEnergy(bravo.page, 800);
check("I2 silence after release", silentAfter >= 0 && silentAfter < 6, `peak=${silentAfter}`);

// Now Bravo can take the floor
await pressPTT(bravo.page);
await bravo.page.waitForFunction(
  () => document.querySelector('[data-testid="ptt-button"]').dataset.state === "talking",
  { timeout: 8000 },
);
check("Bravo can acquire floor after release", true);
const loudOnAlpha = await audioEnergy(alpha.page, 1500);
check("reverse direction audio (Alpha hears Bravo)", loudOnAlpha > 10, `peak=${loudOnAlpha}`);
await releasePTT(bravo.page);

// AC3b: leave updates roster
console.log("— Alpha goes off duty —");
await alpha.page.click('[data-testid="leave-button"]');
await bravo.page.waitForFunction(
  () => document.querySelectorAll('[data-testid="roster-member"]').length === 1,
  { timeout: 15000 },
);
check("AC3 leave removes member from roster", true);

await bravo.page.screenshot({ path: `${SHOT_DIR}/e2e-bravo-alone.png` });
await alpha.page.screenshot({ path: `${SHOT_DIR}/e2e-alpha-join.png` });

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
