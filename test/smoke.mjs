// Drives the RFutils module's real source against a fake RFutils: a real HTTP
// server for the REST endpoints and a real WebSocket pushing the event stream.
// The cases that matter are staleness suppressing readings rather than showing
// history, the escalation order on a channel tile, and the dryRun guard on
// programming real receivers.
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const { socket } = await import(`${MOD}api.js`);
const { safeId } = await import(`${MOD}main.js`);

function device(id, over = {}) {
  return {
    id,
    vendor: "shure",
    model: "ULXD4Q",
    name: id.toUpperCase(),
    address: "10.0.0.20",
    port: 2202,
    transport: "shure-command-strings",
    identified: true,
    lastSeen: Date.now(),
    channels: [
      {
        id: `${id}:1`,
        name: "Lead vocal",
        rfLevel: 80,
        audioLevelDb: -18,
        batteryPercent: 95,
        batteryMinutesRemaining: 240,
        antenna: "diversity",
      },
      {
        id: `${id}:2`,
        name: "Spare",
        rfLevel: 20,
        audioLevelDb: -80,
        batteryPercent: 8,
        batteryMinutesRemaining: 12,
        antenna: "A",
      },
    ],
    ...over,
  };
}

const world = { devices: [device("rx-a")] };
const programCalls = [];
const body = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const payload =
    req.method === "POST" ? JSON.parse((await body(req)) || "{}") : {};

  if (url.pathname === "/api/devices") return send(200, world);
  if (url.pathname === "/api/companion/status")
    return send(200, { configured: true });
  if (url.pathname === "/api/audio/mode")
    return send(200, { mode: "aes67", cueBusConfigured: true });
  if (url.pathname === "/api/program") {
    programCalls.push(payload);
    return send(200, { ok: true, transmitted: payload.dryRun === false });
  }
  if (url.pathname.startsWith("/api/companion/"))
    return send(200, { ok: true });
  send(404, { error: "not found" });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "devices-snapshot", devices: world.devices }));
  ws.on("close", () => clients.delete(ws));
});
const emit = (event) => {
  for (const ws of clients) ws.send(JSON.stringify(event));
};

let actions = {};
let feedbacks = {};
let variables = {};
let presetStructure = null;
let presetDefs = null;
const variableValues = {};
let lastWarn = "";
let lastInfo = "";
let rebuilds = 0;

const STALE_AFTER_MS = 30000;
const self = {
  config: {
    host: "127.0.0.1",
    port: String(PORT),
    batterylow: 20,
    batterycritical: 10,
    rflow: 30,
  },
  label: "RF",
  devices: [],
  scanning: false,
  lastShape: "",
  log: (level, msg) => {
    if (level === "warn") lastWarn = msg;
    if (level === "info") lastInfo = msg;
  },
  updateStatus: () => {},
  checkFeedbacks: () => {},
  checkAllFeedbacks: () => {},
  setActionDefinitions: (d) => (actions = d),
  setFeedbackDefinitions: (d) => (feedbacks = d),
  setVariableDefinitions: (d) => {
    if (Array.isArray(d)) throw new Error("must be an object");
    variables = d;
  },
  setPresetDefinitions: (s, p) => {
    presetStructure = s;
    presetDefs = p;
  },
  setVariableValues: (v) => Object.assign(variableValues, v),
  parseVariablesInString: async (s) => s,
  device(id) {
    return this.devices.find((d) => d.id === String(id ?? "")) ?? null;
  },
  channels() {
    return this.devices.flatMap((d) =>
      (d.channels ?? []).map((c) => ({ ...c, device: d })),
    );
  },
  channel(id) {
    return this.channels().find((c) => c.id === String(id ?? "")) ?? null;
  },
  isStale(d) {
    if (!d?.lastSeen) return false;
    return Date.now() - Number(d.lastSeen) > STALE_AFTER_MS;
  },
  rebuild() {
    rebuilds++;
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariables(this);
    UpdatePresets(this);
    this.refreshVariableValues();
  },
  reshape() {
    const shape = JSON.stringify(
      this.devices.map((d) => [
        d.id,
        d.name,
        (d.channels ?? []).map((c) => c.id),
      ]),
    );
    if (shape !== this.lastShape) {
      this.lastShape = shape;
      this.rebuild();
    } else {
      this.refreshVariableValues();
    }
  },
  applySnapshot(devices) {
    this.devices = devices ?? [];
    this.reshape();
  },
  applyDevice(d) {
    if (!d?.id) return;
    const at = this.devices.findIndex((x) => x.id === d.id);
    if (at >= 0) {
      const changed =
        JSON.stringify((this.devices[at].channels ?? []).map((c) => c.id)) !==
        JSON.stringify((d.channels ?? []).map((c) => c.id));
      this.devices[at] = d;
      if (changed) return this.reshape();
    } else {
      this.devices.push(d);
      return this.reshape();
    }
    this.refreshVariableValues();
  },
  removeDevice(id) {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    if (this.devices.length !== before) this.reshape();
  },
  refreshVariableValues() {
    const channels = this.channels();
    const values = {
      connection_status:
        socket.ws?.readyState === 1 ? "Connected" : "Disconnected",
      device_count: this.devices.length,
      channel_count: channels.length,
      scanning: this.scanning ? "Scanning" : "Idle",
      low_battery_count: channels.filter(
        (c) =>
          !this.isStale(c.device) &&
          c.batteryPercent !== null &&
          c.batteryPercent <= Number(this.config.batterylow),
      ).length,
    };
    for (const c of channels) {
      const p = `ch_${safeId(c.id)}_`;
      const stale = this.isStale(c.device);
      values[`${p}name`] = c.name ?? c.id;
      values[`${p}device`] = c.device?.name ?? "";
      values[`${p}vendor`] = c.device?.vendor ?? "";
      values[`${p}battery`] =
        stale || c.batteryPercent === null ? "--" : c.batteryPercent;
      values[`${p}battery_minutes`] =
        stale || c.batteryMinutesRemaining === null
          ? "--"
          : c.batteryMinutesRemaining;
      values[`${p}rf`] = stale || c.rfLevel === null ? "--" : c.rfLevel;
      values[`${p}audio_db`] =
        stale || c.audioLevelDb === null ? "--" : c.audioLevelDb.toFixed(1);
      values[`${p}antenna`] = stale ? "--" : (c.antenna ?? "");
      values[`${p}status`] = stale ? "Stale" : "Live";
    }
    this.setVariableValues(values);
  },
};

socket.connect(self);
await new Promise((r) => setTimeout(r, 400));

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}\n       ${e.message}`);
  }
};
const wait = () => new Promise((r) => setTimeout(r, 150));
const fire = (id, options = {}) => actions[id].callback({ options });
const fb = (id, options = {}) => feedbacks[id].callback({ options }, {});

console.log("\n== connection ==");
await check("the snapshot arrived and channels were flattened", () => {
  assert.equal(self.devices.length, 1);
  assert.equal(self.channels().length, 2);
});
await check("7 actions, 12 feedbacks", () => {
  assert.equal(Object.keys(actions).length, 7);
  assert.equal(Object.keys(feedbacks).length, 12);
});
await check("a variable per channel, with the vendor prefix sanitised", () => {
  assert.ok(variables.ch_rx_a_1_battery, Object.keys(variables).join(","));
  assert.ok(!variables["ch_rx-a:1_battery"]);
});

console.log("\n== thresholds ==");
await check("batteryLow and batteryCritical escalate", () => {
  assert.equal(fb("batteryLow", { channel: "rx-a:1" }), false, "95% is fine");
  assert.equal(fb("batteryLow", { channel: "rx-a:2" }), true, "8% <= 20");
  assert.equal(fb("batteryCritical", { channel: "rx-a:2" }), true, "8% <= 10");
  assert.equal(fb("batteryCritical", { channel: "rx-a:1" }), false);
});
await check("rfLow uses the vendor-normalised 0-100 scale", () => {
  assert.equal(fb("rfLow", { channel: "rx-a:1" }), false, "80");
  assert.equal(fb("rfLow", { channel: "rx-a:2" }), true, "20 <= 30");
});
await check("batteryMinutesLow reads runtime, not percentage", () => {
  assert.equal(
    fb("batteryMinutesLow", { channel: "rx-a:2", minutes: 30 }),
    true,
  );
  assert.equal(
    fb("batteryMinutesLow", { channel: "rx-a:1", minutes: 30 }),
    false,
  );
});
await check(
  "audioPresent and channelSilent are complements at the threshold",
  () => {
    assert.equal(fb("audioPresent", { channel: "rx-a:1", db: -60 }), true);
    assert.equal(fb("channelSilent", { channel: "rx-a:1", db: -60 }), false);
    assert.equal(fb("audioPresent", { channel: "rx-a:2", db: -60 }), false);
    assert.equal(fb("channelSilent", { channel: "rx-a:2", db: -60 }), true);
  },
);

console.log("\n== staleness suppresses readings ==");
await check(
  "a stale device makes every threshold go DARK, not stay lit",
  () => {
    const d = self.device("rx-a");
    const saved = d.lastSeen;
    d.lastSeen = Date.now() - 60000;
    assert.equal(fb("channelStale", { channel: "rx-a:2" }), true);
    assert.equal(
      fb("batteryCritical", { channel: "rx-a:2" }),
      false,
      "8% is history, not status",
    );
    assert.equal(fb("rfLow", { channel: "rx-a:2" }), false);
    assert.equal(fb("audioPresent", { channel: "rx-a:1", db: -60 }), false);
    assert.equal(fb("channelSilent", { channel: "rx-a:1", db: -60 }), false);
    assert.equal(fb("anyStale"), true);
    assert.equal(
      fb("anyBatteryLow"),
      false,
      "a stale low battery is not counted",
    );
    d.lastSeen = saved;
  },
);
await check(
  "a stale channel's variables read '--', not a remembered number",
  () => {
    const d = self.device("rx-a");
    d.lastSeen = Date.now() - 60000;
    self.refreshVariableValues();
    assert.equal(variableValues.ch_rx_a_2_battery, "--");
    assert.equal(variableValues.ch_rx_a_2_rf, "--");
    assert.equal(variableValues.ch_rx_a_2_status, "Stale");
    d.lastSeen = Date.now();
    self.refreshVariableValues();
    assert.equal(variableValues.ch_rx_a_2_battery, 8);
    assert.equal(variableValues.ch_rx_a_2_status, "Live");
  },
);

console.log("\n== presets ==");
await check("a tile per channel, plus audio and rack sections", () => {
  const ids = presetStructure.map((s) => s.id);
  for (const want of ["channels", "audio", "rack"])
    assert.ok(ids.includes(want), `${want} in ${ids.join(",")}`);
  assert.ok(presetDefs.ch_rx_a_1);
});
await check("the tile escalates low -> critical -> stale in that order", () => {
  const order = presetDefs.ch_rx_a_1.feedbacks.map((f) => f.feedbackId);
  assert.equal(
    order.indexOf("batteryLow") < order.indexOf("batteryCritical"),
    true,
  );
  assert.equal(
    order.indexOf("batteryCritical") < order.indexOf("channelStale"),
    true,
    "stale must win — a dead receiver must not read as healthy or as low",
  );
});
await check("every preset is 2.x 'simple' and cross-references resolve", () => {
  for (const [id, p] of Object.entries(presetDefs)) {
    assert.equal(p.type, "simple", `${id} type`);
    for (const st of p.steps)
      for (const a of st.down)
        assert.ok(actions[a.actionId], `${id} -> action ${a.actionId}`);
    for (const f of p.feedbacks)
      assert.ok(feedbacks[f.feedbackId], `${id} -> feedback ${f.feedbackId}`);
  }
});
await check("nothing orphaned, and every variable reference exists", () => {
  const referenced = new Set(
    presetStructure.flatMap((s) => s.definitions.flatMap((g) => g.presets)),
  );
  for (const s of presetStructure)
    for (const g of s.definitions)
      for (const ref of g.presets)
        assert.ok(presetDefs[ref], `${s.id} -> ${ref}`);
  for (const id of Object.keys(presetDefs))
    assert.ok(referenced.has(id), `${id} defined but in no section`);
  const texts = Object.values(presetDefs)
    .map((p) => p.style.text)
    .join("\n");
  assert.ok(texts.includes("$(RF:"));
  for (const m of texts.matchAll(/\$\(RF:([a-zA-Z0-9_]+)\)/g))
    assert.ok(variables[m[1]], `${m[1]} is defined`);
});

console.log("\n== the dryRun guard ==");
await check("programming is a DRY RUN unless the box is ticked", async () => {
  programCalls.length = 0;
  await fire("program", {
    targets: '[{"id":"x","frequency":606.125}]',
    live: false,
  });
  await wait();
  assert.equal(programCalls[0].dryRun, true);
  assert.match(lastInfo, /Dry run/);
});
await check("ticking the box sends the literal boolean false", async () => {
  programCalls.length = 0;
  await fire("program", {
    targets: '[{"id":"x","frequency":606.125}]',
    live: true,
  });
  await wait();
  assert.strictEqual(
    programCalls[0].dryRun,
    false,
    "only the boolean false transmits — RFutils checks dryRun !== false",
  );
  assert.match(lastWarn, /TRANSMITTED/);
});
await check("no targets means no request at all", async () => {
  programCalls.length = 0;
  lastWarn = "";
  await fire("program", { targets: "[]", live: true });
  await wait();
  assert.equal(programCalls.length, 0);
  assert.match(lastWarn, /no targets/);
});

console.log("\n== crosspoints ==");
await check("a crosspoint with a missing field sends nothing", async () => {
  lastWarn = "";
  await fire("makeCrosspoint", {
    sourceDevice: "rx-a",
    sourceChannel: "",
    destinationDevice: "rx-a",
    destinationChannel: "5",
  });
  await wait();
  assert.match(lastWarn, /all four fields/);
});

console.log("\n== event stream ==");
await check("device-updated does NOT re-register definitions", async () => {
  const before = rebuilds;
  const updated = JSON.parse(JSON.stringify(self.device("rx-a")));
  updated.channels[0].batteryPercent = 44;
  emit({ type: "device-updated", device: updated });
  await wait();
  assert.equal(rebuilds, before, "telemetry must not churn the dropdowns");
  assert.equal(variableValues.ch_rx_a_1_battery, 44);
});
await check("a new device DOES re-register", async () => {
  const before = rebuilds;
  emit({ type: "device-updated", device: device("rx-b") });
  await wait();
  assert.ok(rebuilds > before);
  assert.ok(presetDefs.ch_rx_b_1, "and gets a tile");
});
await check("device-removed drops its tiles", async () => {
  emit({ type: "device-removed", deviceId: "rx-b" });
  await wait();
  assert.ok(!presetDefs.ch_rx_b_1);
});
await check("discovery-status drives the scanning feedback", async () => {
  emit({ type: "discovery-status", scanning: true });
  await wait();
  assert.equal(fb("scanning"), true);
  emit({ type: "discovery-status", scanning: false });
  await wait();
  assert.equal(fb("scanning"), false);
});

console.log("\n== teardown ==");
await check("close() settles", async () => {
  socket.close();
  await wait();
  assert.equal(socket.ws, null);
});

wss.close();
server.close();
console.log("\n== the checkFeedbacks trap ==");
// InstanceBase.checkFeedbacks(type, ...rest) requires AT LEAST ONE type: with no
// arguments it forwards [undefined] to the host, which checks a feedback type
// called "undefined" — i.e. nothing at all. Every feedback then sits frozen at
// whatever it last evaluated to, with no error anywhere. checkAllFeedbacks() is
// the correct call for "re-evaluate everything".
await check("no bare checkFeedbacks() survives in src/", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../src/", import.meta.url).pathname;
  const offenders = [];
  for (const f of readdirSync(dir)) {
    if (!/\.(js|ts)$/.test(f)) continue;
    const body = readFileSync(dir + f, "utf8");
    if (/[^A-Za-z]checkFeedbacks\(\s*\)/.test(body)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "use checkAllFeedbacks() instead");
});

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
