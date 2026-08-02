import { post, getJson, program } from "./api.js";

export function channelChoices(self) {
  return self.channels().map((c) => ({
    id: c.id,
    label: `${c.name ?? c.id} — ${c.device?.name ?? c.device?.id ?? "?"}`,
  }));
}

export function deviceChoices(self) {
  return self.devices.map((d) => ({
    id: d.id,
    label: `${d.name ?? d.id} (${d.vendor}${d.model ? ` ${d.model}` : ""})`,
  }));
}

export default function UpdateActions(self) {
  const channels = channelChoices(self);
  const devices = deviceChoices(self);

  const text = async (event, key) =>
    (
      await self.parseVariablesInString(String(event.options[key] ?? ""))
    ).trim();

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      self.log("error", e.message);
    }
  };

  self.setActionDefinitions({
    makeCrosspoint: {
      name: "Dante: make a crosspoint",
      description:
        "Routes one device-channel to another through RFutils' Companion crosspoint integration.",
      options: [
        {
          id: "sourceDevice",
          type: "dropdown",
          label: "Source device",
          choices: devices,
          default: devices[0]?.id ?? "",
          allowCustom: true,
        },
        {
          id: "sourceChannel",
          type: "textinput",
          label: "Source channel",
          default: "",
          useVariables: true,
        },
        {
          id: "destinationDevice",
          type: "dropdown",
          label: "Destination device",
          choices: devices,
          default: devices[0]?.id ?? "",
          allowCustom: true,
        },
        {
          id: "destinationChannel",
          type: "textinput",
          label: "Destination channel",
          default: "",
          useVariables: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const body = {
            sourceDevice: await text(event, "sourceDevice"),
            sourceChannel: await text(event, "sourceChannel"),
            destinationDevice: await text(event, "destinationDevice"),
            destinationChannel: await text(event, "destinationChannel"),
          };
          if (Object.values(body).some((v) => !v)) {
            self.log(
              "warn",
              "Crosspoint skipped — all four fields are required.",
            );
            return;
          }
          await post(self, "/api/companion/make-crosspoint", body);
        }),
    },

    clearCrosspoint: {
      name: "Dante: clear a crosspoint",
      options: [
        {
          id: "sourceDevice",
          type: "dropdown",
          label: "Source device",
          choices: devices,
          default: devices[0]?.id ?? "",
          allowCustom: true,
        },
        {
          id: "sourceChannel",
          type: "textinput",
          label: "Source channel",
          default: "",
          useVariables: true,
        },
        {
          id: "destinationDevice",
          type: "dropdown",
          label: "Destination device",
          choices: devices,
          default: devices[0]?.id ?? "",
          allowCustom: true,
        },
        {
          id: "destinationChannel",
          type: "textinput",
          label: "Destination channel",
          default: "",
          useVariables: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const body = {
            sourceDevice: await text(event, "sourceDevice"),
            sourceChannel: await text(event, "sourceChannel"),
            destinationDevice: await text(event, "destinationDevice"),
            destinationChannel: await text(event, "destinationChannel"),
          };
          if (Object.values(body).some((v) => !v)) {
            self.log(
              "warn",
              "Crosspoint clear skipped — all four fields are required.",
            );
            return;
          }
          await post(self, "/api/companion/clear-crosspoint", body);
        }),
    },

    program: {
      name: "Program frequencies to receivers",
      description:
        "SENDS COMMANDS TO REAL RECEIVERS that may be in use on a live show. It is a dry run unless 'Actually transmit' is ticked — RFutils' own API defaults to dryRun for the same reason, and only the literal boolean false transmits.",
      options: [
        {
          id: "targets",
          type: "textinput",
          label: "Targets JSON",
          default: "[]",
          useVariables: true,
          width: 12,
        },
        {
          id: "live",
          type: "checkbox",
          label: "Actually transmit (untick for a dry run)",
          default: false,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const raw = await text(event, "targets");
          const targets = JSON.parse(raw || "[]");
          if (!Array.isArray(targets) || targets.length === 0) {
            self.log("warn", "Program skipped — no targets given.");
            return;
          }
          const live = event.options.live === true;
          const body = await program(self, targets, live);
          self.log(
            live ? "warn" : "info",
            `${live ? "TRANSMITTED" : "Dry run"}: ${JSON.stringify(body)}`,
          );
        }),
    },

    refresh: {
      name: "Refresh the device list",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/devices");
          self.applySnapshot(body?.devices ?? []);
        }),
    },

    logDevices: {
      name: "Log the discovered devices",
      description:
        "Dumps the device list into Companion's log — the quickest way to find a channel id for a button, since ids carry a vendor prefix.",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/devices");
          self.log("info", JSON.stringify(body, null, 2));
        }),
    },

    logCompanionStatus: {
      name: "Log the crosspoint integration status",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/companion/status");
          self.log("info", JSON.stringify(body, null, 2));
        }),
    },

    logAudioMode: {
      name: "Log the audio monitoring mode",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/audio/mode");
          self.log("info", JSON.stringify(body));
        }),
    },
  });

  // channels is used by presets/feedbacks via channelChoices; referenced here
  // so the linter sees the dependency even though actions address devices.
  void channels;
}
