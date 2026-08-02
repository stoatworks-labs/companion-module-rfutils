import { safeId } from "./main.js";

// Rebuilt only when the device/channel membership moves — main.js compares that
// rather than whole state, because battery, RF and audio levels all arrive on
// the frequent `device-updated` event.
export default function UpdateVariableDefinitions(self) {
  const defs = {
    connection_status: { name: "RFutils connection" },
    device_count: { name: "Receivers discovered" },
    channel_count: { name: "Channels across all receivers" },
    scanning: { name: "Discovery (Scanning / Idle)" },
    low_battery_count: { name: "Channels at or below the battery warning" },
  };
  for (const c of self.channels()) {
    const p = `ch_${safeId(c.id)}_`;
    const n = c.name ?? c.id;
    defs[`${p}name`] = { name: `${n}: name` };
    defs[`${p}device`] = { name: `${n}: receiver` };
    defs[`${p}vendor`] = { name: `${n}: vendor` };
    // These read "--" rather than a last-known number once the device goes
    // stale: an old battery percentage is indistinguishable from a current one
    // on a button face, and that is what catches people out.
    defs[`${p}battery`] = { name: `${n}: battery % ("--" when stale)` };
    defs[`${p}battery_minutes`] = { name: `${n}: battery minutes remaining` };
    defs[`${p}rf`] = { name: `${n}: RF level 0-100 ("--" when stale)` };
    defs[`${p}audio_db`] = { name: `${n}: audio dBFS ("--" when stale)` };
    defs[`${p}antenna`] = { name: `${n}: antenna` };
    defs[`${p}status`] = { name: `${n}: Live / Stale` };
  }
  self.setVariableDefinitions(defs);
}
