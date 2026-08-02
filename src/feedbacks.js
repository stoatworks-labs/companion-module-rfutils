import { channelChoices } from "./actions.js";
import { socket } from "./api.js";

// This is the module's reason to exist. A radio-mic rack's whole job is to not
// surprise you, and the surprises are all threshold crossings: a battery about
// to die, an RF level dropping as someone walks behind the LED wall, a channel
// that has stopped reporting entirely.
//
// Every one of these treats a STALE device as "no reading" rather than as its
// last value. A battery percentage from twenty minutes ago looks exactly like a
// current one on a button face, and that is the reading that gets someone
// caught out mid-show. `channelStale` is the feedback that says so out loud.

export default function UpdateFeedbacks(self) {
  const channels = channelChoices(self);
  const channelOption = {
    id: "channel",
    type: "dropdown",
    label: "Channel",
    choices: channels,
    default: channels[0]?.id ?? "",
    allowCustom: true,
  };

  /** A channel's reading, or null when the device is stale or not reporting. */
  const reading = (f, key) => {
    const c = self.channel(String(f.options.channel ?? ""));
    if (!c || self.isStale(c.device)) return null;
    const v = c[key];
    return v === null || v === undefined ? null : Number(v);
  };

  self.setFeedbackDefinitions({
    batteryLow: {
      type: "boolean",
      name: "Channel battery at or below the warning threshold",
      description:
        "Threshold comes from the connection config. Dark when the device is stale — a reading that old is history, not status.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [channelOption],
      callback: (f) => {
        const v = reading(f, "batteryPercent");
        return v !== null && v <= Number(self.config?.batterylow ?? 20);
      },
    },
    batteryCritical: {
      type: "boolean",
      name: "Channel battery at or below the critical threshold",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [channelOption],
      callback: (f) => {
        const v = reading(f, "batteryPercent");
        return v !== null && v <= Number(self.config?.batterycritical ?? 10);
      },
    },
    batteryMinutesLow: {
      type: "boolean",
      name: "Channel battery runtime below a threshold",
      description:
        "Minutes remaining, where the receiver reports it. More useful than a percentage on a long act — but not every receiver sends it.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [
        channelOption,
        {
          id: "minutes",
          type: "number",
          label: "Below (minutes)",
          min: 1,
          max: 600,
          default: 30,
        },
      ],
      callback: (f) => {
        const v = reading(f, "batteryMinutesRemaining");
        return v !== null && v < Number(f.options.minutes ?? 30);
      },
    },
    rfLow: {
      type: "boolean",
      name: "Channel RF below the warning threshold",
      description:
        "RF is vendor-normalised 0-100 by RFutils, so the threshold means the same thing across a mixed Shure/Sennheiser rack.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [channelOption],
      callback: (f) => {
        const v = reading(f, "rfLevel");
        return v !== null && v <= Number(self.config?.rflow ?? 30);
      },
    },
    audioPresent: {
      type: "boolean",
      name: "Channel has audio above a threshold",
      description:
        "dBFS, so the threshold is negative. -60 catches 'the mic is open'; -20 catches 'someone is actually talking'.",
      defaultStyle: { bgcolor: 0x009900, color: 0xffffff },
      options: [
        channelOption,
        {
          id: "db",
          type: "number",
          label: "Above (dBFS)",
          min: -100,
          max: 0,
          default: -60,
        },
      ],
      callback: (f) => {
        const v = reading(f, "audioLevelDb");
        return v !== null && v > Number(f.options.db ?? -60);
      },
    },
    channelSilent: {
      type: "boolean",
      name: "Channel is reporting but silent",
      description:
        "Metering is arriving and there is nothing on it — a muted transmitter, or a mic that has been put down. Distinct from the channel having gone stale.",
      defaultStyle: { bgcolor: 0x333333, color: 0xffffff },
      options: [
        channelOption,
        {
          id: "db",
          type: "number",
          label: "At or below (dBFS)",
          min: -100,
          max: 0,
          default: -60,
        },
      ],
      callback: (f) => {
        const v = reading(f, "audioLevelDb");
        return v !== null && v <= Number(f.options.db ?? -60);
      },
    },
    channelStale: {
      type: "boolean",
      name: "Channel has stopped reporting",
      description:
        "Its device has gone quiet. Every other feedback here goes dark rather than showing a stale value, so this is the one that distinguishes 'all clear' from 'no idea'.",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [channelOption],
      callback: (f) => {
        const c = self.channel(String(f.options.channel ?? ""));
        return !!c && self.isStale(c.device);
      },
    },
    deviceIdentified: {
      type: "boolean",
      name: "Receiver has completed its handshake",
      description:
        "RFutils only counts a host as a receiver once a vendor handshake succeeds — an open port alone is not accepted. Dark means it was found but has not identified.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [
        {
          id: "device",
          type: "dropdown",
          label: "Receiver",
          choices: self.devices.map((d) => ({
            id: d.id,
            label: d.name ?? d.id,
          })),
          default: self.devices[0]?.id ?? "",
          allowCustom: true,
        },
      ],
      callback: (f) =>
        !!self.device(String(f.options.device ?? ""))?.identified,
    },
    anyBatteryLow: {
      type: "boolean",
      name: "Any channel's battery is low",
      description: "The rack-wide check — one light for the whole show.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [],
      callback: () =>
        self
          .channels()
          .some(
            (c) =>
              !self.isStale(c.device) &&
              c.batteryPercent !== null &&
              c.batteryPercent <= Number(self.config?.batterylow ?? 20),
          ),
    },
    anyStale: {
      type: "boolean",
      name: "Any receiver has stopped reporting",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [],
      callback: () => self.devices.some((d) => self.isStale(d)),
    },
    scanning: {
      type: "boolean",
      name: "RFutils is scanning for devices",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [],
      callback: () => !!self.scanning,
    },
    connected: {
      type: "boolean",
      name: "RFutils is connected",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => socket.ws?.readyState === 1,
    },
  });
}
