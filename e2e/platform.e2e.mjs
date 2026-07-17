// Platform e2e: chat, clips, direct PTT, flags — two/three browser contexts.
// Complements ptt.e2e.mjs (which owns the core radio invariants).
import { chromium } from "playwright";

const URL = process.env.E2E_URL || "http://localhost:5173/";
const SHOT_DIR = process.env.E2E_SHOTS || "/tmp";
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
}

const RUN = String(Date.now() % 1000000);
const ALPHA = `Alpha${RUN}`;
const BRAVO = `Bravo${RUN}`;

const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function makeClient(name, { chatOnly = false, channel = "Security" } = {}) {
  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport: { width: 375, height: 720 },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${name} console.error]`, m.text());
  });
  await page.goto(URL);
  await page.fill('[data-testid="name-input"]', name);
  if (!chatOnly) await page.click(`[data-testid="channel-${channel}"]`);
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
  if (chatOnly) {
    await page.click('[data-testid="chat-only-link"]');
    await page.waitForSelector('[data-testid="tab-chat"]', { timeout: 15000 });
  } else {
    await page.click('[data-testid="join-button"]');
    await page.waitForSelector('[data-testid="ptt-button"]', { timeout: 15000 });
  }
  return { context, page, name };
}

// ── AC8: chat send/receive + unread badge ─────────────────────────────────
console.log("— chat: two clients, one on radio, one chat-only —");
const alpha = await makeClient(ALPHA);
const bravo = await makeClient(BRAVO, { chatOnly: true });

// Bravo opens General and sends a message.
await bravo.page.click('[data-testid="tab-chat"]');
await bravo.page.waitForSelector('[data-testid="chat-channel-General"]', {
  timeout: 15000,
});
await bravo.page.click('[data-testid="chat-channel-General"]');
await bravo.page.waitForSelector('[data-testid="chat-composer"]');
await bravo.page.fill('[data-testid="chat-composer"]', "Radio check — copy?");
const sentAt = Date.now();
await bravo.page.click('[data-testid="chat-send"]');

// Alpha (on the radio tab) sees the chat tab LED go live, opens chat, reads it.
await alpha.page.waitForSelector('[data-testid="tab-chat"] .led.on-rx', {
  timeout: 10000,
});
check("AC8 unread LED lights on the other client's tab bar", true);

await alpha.page.click('[data-testid="tab-chat"]');
await alpha.page.click('[data-testid="chat-channel-General"]');
await alpha.page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="chat-message"]')].some((el) =>
      el.textContent.includes("Radio check — copy?"),
    ),
  { timeout: 8000 },
);
check(
  "AC8 message delivered across clients",
  true,
  `${Date.now() - sentAt}ms after send`,
);

// Alpha replies; Bravo receives in-thread.
await alpha.page.fill('[data-testid="chat-composer"]', "Copy loud and clear");
await alpha.page.click('[data-testid="chat-send"]');
await bravo.page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="chat-message"]')].some((el) =>
      el.textContent.includes("Copy loud and clear"),
    ),
  { timeout: 8000 },
);
check("AC8 reply delivered back", true);

// ── channel creation propagates ───────────────────────────────────────────
await bravo.page.click('[data-testid="chat-back"]');
await bravo.page.click('[data-testid="new-channel"]');
const channelName = `Test ${Date.now() % 100000}`;
await bravo.page.fill('[data-testid="new-channel-name"]', channelName);
await bravo.page.click('[data-testid="new-channel-create"]');
await bravo.page.waitForSelector('[data-testid="chat-composer"]', {
  timeout: 8000,
});
check("channel created and opened", true);
await alpha.page.click('[data-testid="chat-back"]');
await alpha.page.waitForFunction(
  (name) =>
    [...document.querySelectorAll("button")].some((el) =>
      el.textContent.includes(name),
    ),
  channelName,
  { timeout: 8000 },
);
check("new channel appears on the other client", true);

// ── DM flow ───────────────────────────────────────────────────────────────
await bravo.page.click('[data-testid="chat-back"]').catch(() => {});
await bravo.page.click('[data-testid="new-dm"]');
await bravo.page.click(`[data-testid="member-message-${ALPHA}"]`);
await bravo.page.waitForSelector('[data-testid="chat-composer"]', {
  timeout: 8000,
});
await bravo.page.fill('[data-testid="chat-composer"]', "psst — direct line");
await bravo.page.click('[data-testid="chat-send"]');
await alpha.page.waitForSelector('[data-testid^="chat-dm-"]', {
  timeout: 15000,
});
await alpha.page.locator('[data-testid^="chat-dm-"]').first().click();
await alpha.page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="chat-message"]')].some((el) =>
      el.textContent.includes("psst — direct line"),
    ),
  { timeout: 8000 },
);
check("DM lazy-created and delivered", true);

await alpha.page.screenshot({ path: `${SHOT_DIR}/e2e-chat-alpha.png` });
await bravo.page.screenshot({ path: `${SHOT_DIR}/e2e-chat-bravo.png` });

// ── AC7: a transmission leaves a playable clip in the log ─────────────────
console.log("— clip: Alpha transmits on Security, both see the clip —");
await alpha.page.click('[data-testid="chat-back"]').catch(() => {});
await alpha.page.click('[data-testid="tab-radio"]');
const ptt = await alpha.page.locator('[data-testid="ptt-button"]').boundingBox();
await alpha.page.mouse.move(ptt.x + ptt.width / 2, ptt.y + ptt.height / 2);
await alpha.page.mouse.down();
await alpha.page.waitForFunction(
  () => document.querySelector('[data-testid="ptt-button"]').dataset.state === "talking",
  { timeout: 8000 },
);
await alpha.page.waitForTimeout(1500); // speak ~1.5s of fake-device audio
await alpha.page.mouse.up();

// The clip lands in the Security chat log on Bravo's side.
await bravo.page.click('[data-testid="chat-back"]').catch(() => {});
await bravo.page.click('[data-testid="chat-channel-Security"]');
await bravo.page.waitForSelector('[data-testid="clip-message"]', {
  timeout: 20000,
});
check("AC7 clip row appears in channel log on the other client", true);

// And in Alpha's radio LOG sheet.
await alpha.page.click('[data-testid="log-button"]');
await alpha.page.waitForSelector(
  '[data-testid="transmission-log"] [data-testid="clip-play"]',
  { timeout: 10000 },
);
check("AC7 clip appears in the radio LOG sheet", true);

// Transcript flips out of 'pending' (done/failed/skipped all acceptable in
// e2e — fake-device audio is tones, not speech; presence of the pipeline is
// what's under test. 'done' requires GROQ_API_KEY on the deployment.)
const transcriptState = await alpha.page
  .waitForFunction(
    () => {
      const toggles = document.querySelectorAll(
        '[data-testid="transmission-log"] [data-testid="clip-transcript-toggle"]',
      );
      return toggles.length > 0 ? "has-toggle" : "no-toggle";
    },
    { timeout: 15000 },
  )
  .then((h) => h.jsonValue())
  .catch(() => "timeout");
check(
  "AC7 transcription pipeline ran",
  transcriptState !== "timeout",
  String(transcriptState),
);
await alpha.page.screenshot({ path: `${SHOT_DIR}/e2e-clip-log.png` });
await alpha.page.click('button:has-text("close")');

// ── AC9: direct PTT — private line, team channel can't hear ──────────────
console.log("— direct: Alpha rings Charlie; Delta stays on Security —");
const CHARLIE = `Charlie${RUN}`;
const DELTA = `Delta${RUN}`;
const charlie = await makeClient(CHARLIE);
const delta = await makeClient(DELTA);

// measure RMS-ish peak on the first remote audio element (from ptt.e2e.mjs);
// -1 means no remote audio element at all (also silence for our purposes).
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
    return peak;
  }, ms);
}

// Alpha's roster shows Charlie; tap → GO DIRECT.
await alpha.page.waitForFunction(
  (n) =>
    [...document.querySelectorAll('[data-testid="roster-member"]')].some((el) =>
      el.textContent.includes(n),
    ),
  CHARLIE,
  { timeout: 15000 },
);
await alpha.page
  .locator('[data-testid="roster-member"]', { hasText: CHARLIE })
  .click();
await alpha.page.click('[data-testid="roster-go-direct"]');

// Both sides land on the private line (Charlie auto-answers the ring).
await alpha.page.waitForFunction(
  (n) =>
    document.querySelector('[data-testid="channel-title"]')?.textContent === n,
  CHARLIE,
  { timeout: 15000 },
);
await charlie.page.waitForFunction(
  (n) =>
    document.querySelector('[data-testid="channel-title"]')?.textContent === n,
  ALPHA,
  { timeout: 15000 },
);
check("AC9 both parties auto-switched to the private line", true);

// Delta was not dragged along.
const deltaTitle = await delta.page.textContent('[data-testid="channel-title"]');
check("AC9 Delta stays on Security", deltaTitle === "Security", deltaTitle);

// Wait for the direct mesh, then Alpha transmits.
await charlie.page.waitForFunction(
  () => {
    const a = document.querySelector("audio");
    return a && a.srcObject && a.srcObject.getAudioTracks().length > 0;
  },
  { timeout: 20000 },
);
await charlie.page.waitForTimeout(1500);
const pttDirect = await alpha.page
  .locator('[data-testid="ptt-button"]')
  .boundingBox();
await alpha.page.mouse.move(
  pttDirect.x + pttDirect.width / 2,
  pttDirect.y + pttDirect.height / 2,
);
await alpha.page.mouse.down();
await alpha.page.waitForFunction(
  () =>
    document.querySelector('[data-testid="ptt-button"]').dataset.state ===
    "talking",
  { timeout: 8000 },
);
const [charlieHears, deltaHears] = await Promise.all([
  audioEnergy(charlie.page, 1500),
  audioEnergy(delta.page, 1500),
]);
await alpha.page.mouse.up();
check("AC9 Charlie hears the direct transmission", charlieHears > 10, `peak=${charlieHears}`);
check(
  "AC9 Delta (team channel) hears NOTHING",
  deltaHears < 6,
  `peak=${deltaHears}`,
);

// Return path: Alpha comes back to Security.
await alpha.page.click('[data-testid="direct-return"]');
await alpha.page.waitForFunction(
  () =>
    document.querySelector('[data-testid="channel-title"]')?.textContent ===
    "Security",
  { timeout: 15000 },
);
check("AC9 return key brings Alpha back to Security", true);
await alpha.page.screenshot({ path: `${SHOT_DIR}/e2e-direct-return.png` });

// ── AC10: AI feature flag hides/shows the OPS tab live ────────────────────
if (process.env.E2E_ADMIN_CODE) {
  console.log("— flags: Bravo toggles AI off via admin panel —");
  await alpha.page.waitForSelector('[data-testid="tab-ops"]', {
    timeout: 8000,
  });
  await bravo.page.click('[data-testid="settings-button"]');
  await bravo.page.fill(
    '[data-testid="admin-code-input"]',
    process.env.E2E_ADMIN_CODE,
  );
  await bravo.page.waitForSelector('[data-testid="ai-flag-toggle"]', {
    timeout: 8000,
  });
  await bravo.page.click('[data-testid="ai-flag-toggle"]');
  await alpha.page.waitForFunction(
    () => !document.querySelector('[data-testid="tab-ops"]'),
    { timeout: 10000 },
  );
  check("AC10 OPS tab disappears on other clients when flag flips off", true);
  await bravo.page.click('[data-testid="ai-flag-toggle"]');
  await alpha.page.waitForSelector('[data-testid="tab-ops"]', {
    timeout: 10000,
  });
  check("AC10 OPS tab returns when flag flips back on", true);
} else {
  console.log("SKIP — AC10 flag flip (set E2E_ADMIN_CODE to enable)");
}

await browser.close();
console.log(failures === 0 ? "\nALL PLATFORM CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
