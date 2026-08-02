// Variable references in preset text use `self.label`, the CONNECTION's label,
// not the module id — Companion resolves $(label:variable) against whatever the
// operator named this connection.
//
// A channel preset is generated per discovered channel, because a rack's
// channels are what an operator thinks in. Each one is a monitoring tile: the
// name, the battery, the RF, and colour that escalates amber -> red as the
// battery falls, with blue for "this channel has stopped reporting".
//
// That last state is the one worth defending. Every threshold feedback here
// goes DARK when a device is stale rather than lighting off a remembered value,
// so without the stale colour a dead receiver looks exactly like a healthy one.
import { safeId } from "./main.js";

const WHITE = 0xffffff;
const BLACK = 0x000000;
const GREY = 0x333333;
const RED = 0xcc0000;
const AMBER = 0xcc7a00;
const BLUE = 0x0066cc;
const GREEN = 0x009900;
const DARKGREEN = 0x003300;
const BRIGHTGREEN = 0x00ff00;

function preset({
  name,
  text,
  size = "14",
  color = WHITE,
  bgcolor = GREY,
  actions = [],
  feedbacks = [],
}) {
  return {
    type: "simple",
    name,
    style: { text, size, color, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  };
}

export default function UpdatePresets(self) {
  const presets = {};
  const structure = [];

  const channelRefs = [];
  const audioRefs = [];
  for (const c of self.channels()) {
    const key = safeId(c.id);
    const label = c.name ?? c.id;

    presets[`ch_${key}`] = preset({
      name: `${label}: monitor tile`,
      text: `${label}\n$(${self.label}:ch_${key}_battery)%\nRF $(${self.label}:ch_${key}_rf)`,
      bgcolor: BLACK,
      feedbacks: [
        // Ordered so the more serious state wins: low is amber, critical
        // overrides it in red, and stale overrides both in blue — because a
        // channel that has stopped reporting is neither healthy nor low, and
        // showing it as either is the failure this tile exists to prevent.
        {
          feedbackId: "batteryLow",
          options: { channel: c.id },
          style: { bgcolor: AMBER, color: BLACK },
        },
        {
          feedbackId: "rfLow",
          options: { channel: c.id },
          style: { bgcolor: AMBER, color: BLACK },
        },
        {
          feedbackId: "batteryCritical",
          options: { channel: c.id },
          style: { bgcolor: RED, color: WHITE },
        },
        {
          feedbackId: "channelStale",
          options: { channel: c.id },
          style: { bgcolor: BLUE, color: WHITE },
        },
      ],
    });
    channelRefs.push(`ch_${key}`);

    presets[`audio_${key}`] = preset({
      name: `${label}: audio present`,
      text: `${label}\n$(${self.label}:ch_${key}_audio_db)`,
      bgcolor: BLACK,
      feedbacks: [
        {
          feedbackId: "audioPresent",
          options: { channel: c.id, db: -60 },
          style: { bgcolor: GREEN, color: WHITE },
        },
        {
          feedbackId: "channelStale",
          options: { channel: c.id },
          style: { bgcolor: BLUE, color: WHITE },
        },
      ],
    });
    audioRefs.push(`audio_${key}`);
  }

  if (channelRefs.length > 0) {
    structure.push({
      id: "channels",
      name: "Channel tiles",
      description:
        "Amber for a low battery or weak RF, red for critical, BLUE when the channel has stopped reporting. The blue matters: every threshold here goes dark rather than showing a remembered value, so without it a dead receiver looks healthy.",
      definitions: [
        {
          id: "channels-main",
          type: "simple",
          name: "Channels",
          presets: channelRefs,
        },
      ],
      keywords: ["battery", "rf", "channel", "mic"],
    });
    structure.push({
      id: "audio",
      name: "Audio present",
      description:
        "dBFS. -60 catches 'the mic is open'; raise it to catch 'someone is actually talking'.",
      definitions: [
        { id: "audio-main", type: "simple", name: "Audio", presets: audioRefs },
      ],
      keywords: ["audio", "level", "open"],
    });
  }

  // --- Rack-wide -----------------------------------------------------------
  presets.rack_battery = preset({
    name: "Any battery low (no action)",
    text: `BATTERY\n$(${self.label}:low_battery_count) low`,
    bgcolor: DARKGREEN,
    color: BRIGHTGREEN,
    feedbacks: [
      {
        feedbackId: "anyBatteryLow",
        options: {},
        style: { bgcolor: AMBER, color: BLACK },
      },
    ],
  });
  presets.rack_stale = preset({
    name: "Any receiver has stopped reporting (no action)",
    text: `RX\n$(${self.label}:device_count) found`,
    bgcolor: DARKGREEN,
    color: BRIGHTGREEN,
    feedbacks: [
      {
        feedbackId: "anyStale",
        options: {},
        style: { bgcolor: BLUE, color: WHITE },
      },
    ],
  });
  presets.connected = preset({
    name: "RFutils is connected",
    text: `RFUTILS\n$(${self.label}:connection_status)`,
    bgcolor: RED,
    actions: [{ actionId: "refresh", options: {} }],
    feedbacks: [
      {
        feedbackId: "connected",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.scanning = preset({
    name: "Discovery status (no action)",
    text: `DISCOVERY\n$(${self.label}:scanning)`,
    bgcolor: BLACK,
    feedbacks: [
      {
        feedbackId: "scanning",
        options: {},
        style: { bgcolor: AMBER, color: BLACK },
      },
    ],
  });
  presets.log_devices = preset({
    name: "Log the discovered devices",
    text: "LOG\nDEVICES",
    actions: [{ actionId: "logDevices", options: {} }],
  });

  structure.push({
    id: "rack",
    name: "Rack overview",
    description:
      "One light per question for the whole rack. Put these where a show caller can see them.",
    definitions: [
      {
        id: "rack-main",
        type: "simple",
        name: "Rack",
        presets: [
          "rack_battery",
          "rack_stale",
          "connected",
          "scanning",
          "log_devices",
        ],
      },
    ],
    keywords: ["rack", "overview", "battery"],
  });

  self.setPresetDefinitions(structure, presets);
}
