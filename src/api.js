import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// RFutils has TWO WebSocket endpoints on one HTTP server, routed by path:
// /ws for device state, /ws/audio for PCM. This module uses /ws only — audio
// cueing is a headphone feature and a Stream Deck has nowhere to put it.
//
// /ws is event-based rather than snapshot-based:
//   devices-snapshot   the full list
//   device-updated     one device, including its channel telemetry
//   device-removed     one device gone
//   discovery-status   a scan started or finished
//
// device-updated is the frequent one (battery, RF and audio levels arrive on
// it), so it must NOT re-register the definition sets — only a membership
// change should.

const RECONNECT_MS = 3000;

function base(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

export async function getJson(self, path) {
  const res = await fetch(`${base(self)}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

export async function post(self, path, body = {}) {
  const res = await fetch(`${base(self)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parsed.error || `POST ${path} failed: HTTP ${res.status}`);
  }
  return parsed;
}

/**
 * Push frequency assignments to real receivers.
 *
 * **dryRun defaults to true, and that default is load-bearing.** RFutils checks
 * `req.body?.dryRun !== false`, so the ONLY way to transmit is to send the
 * boolean `false` — omitted, `true`, `null` and the string `"false"` are all
 * dry runs. This wrapper sends a real boolean and nothing else, and the action
 * that calls it requires the operator to tick a box, because the far end is
 * hardware that may be on a live show.
 */
export async function program(self, targets, live) {
  return post(self, "/api/program", { targets, dryRun: live !== true });
}

export const socket = {
  ws: null,
  reconnectTimer: null,
  closing: false,

  connect(self) {
    this.closing = false;
    let ws;
    try {
      ws = new WebSocket(`ws://${self.config.host}:${self.config.port}/ws`);
    } catch (e) {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
      this.scheduleReconnect(self);
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("info", `Connected to RFutils at ${self.config.host}`);
      self.updateStatus(InstanceStatus.Ok);
      // The server does not necessarily push on connect, so ask.
      try {
        ws.send(JSON.stringify({ type: "request-snapshot" }));
      } catch {
        // A socket that closed between open and here; the reconnect handles it.
      }
      // Belt and braces: the REST snapshot covers a build where the
      // request-snapshot message is not answered.
      getJson(self, "/api/devices")
        .then((body) => self.applySnapshot(body?.devices ?? []))
        .catch(() => {});
    });

    ws.on("message", (data) => {
      let event;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      switch (event.type) {
        case "devices-snapshot":
          self.applySnapshot(event.devices ?? []);
          break;
        case "device-updated":
          self.applyDevice(event.device);
          break;
        case "device-removed":
          self.removeDevice(event.deviceId);
          break;
        case "discovery-status":
          self.scanning = !!event.scanning;
          if (event.message) self.log("info", `Discovery: ${event.message}`);
          self.checkFeedbacks("scanning");
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      if (this.closing) return;
      self.updateStatus(InstanceStatus.Disconnected, "RFutils disconnected");
      this.scheduleReconnect(self);
    });

    ws.on("error", (err) => {
      self.updateStatus(InstanceStatus.ConnectionFailure, err.message);
    });
  },

  scheduleReconnect(self) {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(self);
    }, RECONNECT_MS);
  },

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.removeAllListeners();
        // close() on a socket still in CONNECTING calls abortHandshake(), which
        // defers the failure: `process.nextTick(emitErrorAndClose, ...)`. That
        // 'error' therefore lands after this function has returned and after the
        // catch below has gone out of scope, on a socket whose listeners we just
        // removed — and Node throws on an unlistened 'error', killing the module
        // process. A no-op listener that outlives close() is what absorbs it.
        ws.on("error", () => {});
        ws.close();
      } catch {
        // Closing a socket that never opened can also throw synchronously;
        // nothing to recover.
      }
    }
  },
};
