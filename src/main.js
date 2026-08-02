import { InstanceBase, Regex, InstanceStatus } from "@companion-module/base";
import { UpgradeScripts } from "./upgrades.js";
import UpdateActions from "./actions.js";
import UpdateFeedbacks from "./feedbacks.js";
import UpdateVariableDefinitions from "./variables.js";
import UpdatePresets from "./presets.js";
import { socket } from "./api.js";

/** Companion variable ids allow only [a-zA-Z0-9_]. RFutils channel ids carry a
 *  vendor prefix and separators, so every one needs sanitising. */
export function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

/** How long a device may go unheard before its channels stop being trusted.
 *  RFutils reports lastSeen per device; a receiver that has gone quiet is a
 *  real event on a show, and stale battery percentages are worse than none. */
const STALE_AFTER_MS = 30000;

export default class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.devices = [];
    this.scanning = false;
    this.lastShape = "";
    this.staleTimer = null;
  }

  async init(config) {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
    // Staleness expires on a clock rather than on a message, so it needs its
    // own tick — by definition the message that would clear it is not arriving.
    this.staleTimer = setInterval(() => {
      this.refreshVariableValues();
      this.checkFeedbacks();
    }, 5000);
  }

  async destroy() {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
    socket.close();
  }

  async configUpdated(config) {
    this.config = config;
    socket.close();
    this.devices = [];
    this.lastShape = "";
    this.updateStatus(InstanceStatus.Connecting);
    socket.connect(this);
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Connection",
        value:
          "The RFutils server, port 8420 by default. <b>There is no authentication and it binds 0.0.0.0</b> — anyone who can reach the port can read your inventory and, through the programming API, send commands to real receivers. Keep it on a trusted production network.",
      },
      {
        type: "textinput",
        id: "host",
        label: "RFutils host",
        width: 8,
        default: "127.0.0.1",
        regex: Regex.HOSTNAME,
      },
      {
        type: "textinput",
        id: "port",
        label: "Port",
        width: 4,
        default: "8420",
        regex: Regex.PORT,
      },
      {
        type: "number",
        id: "batterylow",
        label: "Battery warning threshold (%)",
        width: 4,
        min: 1,
        max: 99,
        default: 20,
      },
      {
        type: "number",
        id: "batterycritical",
        label: "Battery critical threshold (%)",
        width: 4,
        min: 1,
        max: 99,
        default: 10,
      },
      {
        type: "number",
        id: "rflow",
        label: "RF warning threshold (0-100)",
        width: 4,
        min: 1,
        max: 99,
        default: 30,
      },
      {
        type: "static-text",
        id: "protocolnote",
        width: 12,
        label: "Before you rely on this",
        value:
          "RFutils' Shure and Sennheiser adapters are documented in its README's Protocol status table, and the Sennheiser one is labelled an <b>unverified skeleton</b>. A channel reading nothing here may be the receiver, the network, or the adapter — check that table before assuming a battery is flat.",
      },
    ];
  }

  applySnapshot(devices) {
    this.devices = Array.isArray(devices) ? devices : [];
    this.updateStatus(InstanceStatus.Ok);
    this.reshape();
  }

  /**
   * One device changed — the FREQUENT message, since battery, RF and audio
   * levels all arrive on it. Values and feedbacks only; re-registering the
   * definition sets at telemetry rate would churn the dropdowns continuously.
   * Membership changes still go through reshape().
   */
  applyDevice(device) {
    if (!device?.id) return;
    const at = this.devices.findIndex((d) => d.id === device.id);
    if (at >= 0) {
      const channelsChanged =
        JSON.stringify((this.devices[at].channels ?? []).map((c) => c.id)) !==
        JSON.stringify((device.channels ?? []).map((c) => c.id));
      this.devices[at] = device;
      if (channelsChanged) return this.reshape();
    } else {
      this.devices.push(device);
      return this.reshape();
    }
    this.refreshVariableValues();
    this.checkFeedbacks();
  }

  removeDevice(deviceId) {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== deviceId);
    if (this.devices.length !== before) this.reshape();
  }

  /** Re-register only when the device/channel membership actually moved. */
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
      this.checkFeedbacks();
    }
  }

  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariableDefinitions(this);
    UpdatePresets(this);
    this.refreshVariableValues();
    this.checkFeedbacks();
  }

  device(id) {
    return this.devices.find((d) => d.id === String(id ?? "")) ?? null;
  }

  /** Every channel across every device, with its owning device attached —
   *  channels are what an operator thinks in, devices are just where they live. */
  channels() {
    return this.devices.flatMap((d) =>
      (d.channels ?? []).map((c) => ({ ...c, device: d })),
    );
  }

  channel(id) {
    return this.channels().find((c) => c.id === String(id ?? "")) ?? null;
  }

  /** A device is stale when RFutils has not heard from it recently. Its
   *  channels' last reported battery and RF are then history, not status. */
  isStale(device) {
    if (!device?.lastSeen) return false;
    return Date.now() - Number(device.lastSeen) > STALE_AFTER_MS;
  }

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
          c.batteryPercent <= Number(this.config?.batterylow ?? 20),
      ).length,
    };
    for (const c of channels) {
      const p = `ch_${safeId(c.id)}_`;
      const stale = this.isStale(c.device);
      values[`${p}name`] = c.name ?? c.id;
      values[`${p}device`] = c.device?.name ?? "";
      values[`${p}vendor`] = c.device?.vendor ?? "";
      // A stale reading is shown as "--" rather than as its last value. A
      // battery percentage from twenty minutes ago looks exactly like a current
      // one on a button face, and that is the reading that gets someone caught
      // out.
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
  }
}

export { UpgradeScripts };
