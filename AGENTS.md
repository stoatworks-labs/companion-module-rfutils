# AGENTS.md — bringing an LLM up to speed on this Companion module

Orientation for an AI assistant (or a new human) picking this project up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **Bitfocus Companion connection module** for **RFutils**. Its purpose is monitoring: a
radio-mic rack's job is to not surprise you, and the surprises are all threshold crossings.
It also drives Dante crosspoints and (guarded) frequency programming.

JavaScript, Node 22 runtime, `@companion-module/base` 2.x.

## 2. Staleness suppresses readings — this is the central design decision

RFutils reports `lastSeen` per device. When a device goes quiet past
`STALE_AFTER_MS`, **every threshold feedback goes dark and every variable reads `--`.**

The alternative — holding the last value — is what other modules in this fleet do, and it is
wrong here. A battery percentage from twenty minutes ago is indistinguishable from a current
one on a button face. The `channelStale` feedback exists so "no information" has a colour of
its own, and the generated tile lists it LAST so it overrides low and critical.

**If you reorder those feedbacks, a dead receiver starts reading as healthy.** There is a
test asserting the order.

Staleness expires on a clock, so `main.js` runs a 5 s tick that re-runs variables and
feedbacks — by definition the message that would clear it is not arriving.

## 3. The event stream is not a snapshot stream

`/ws` sends `devices-snapshot`, `device-updated`, `device-removed`, `discovery-status`.

**`device-updated` is the frequent one** — battery, RF and audio levels all arrive on it. It
must not re-register the definition sets, or the dropdowns churn continuously. `applyDevice`
compares the device's CHANNEL IDS and only reshapes when membership actually moved. There is
a test for this.

`/ws/audio` is deliberately unused: it relays PCM for headphone cueing, and a Stream Deck has
nowhere to put audio.

## 4. `dryRun` is load-bearing

RFutils checks `req.body?.dryRun !== false`. So **omitted, `true`, `null` and the string
`"false"` are all dry runs — only the literal boolean `false` transmits.** `api.js::program`
sends a real boolean and nothing else, and the action requires a ticked checkbox.

Do not "simplify" this into a truthiness check. The far end is hardware that may be live on a
show.

## 5. Channels, not devices, are the unit

An operator thinks in channels; devices are just where they live. `self.channels()` flattens
every device's channels with the owning device attached, and feedbacks/presets address
channel ids. Actions address devices, because crosspoints and programming are device-level.

## 6. Confidence in the underlying readings varies — say so

RFutils' README carries a **Protocol status** table and it is the authority. The Sennheiser
SSC adapter is explicitly an _unverified skeleton_, and its metering paths are guesses from
public examples; the Shure adapter is documented but untested against real receivers.

The config panel and both docs say a blank reading may be the receiver, the network, or the
adapter. **Keep that caveat.** A monitoring module that implies more certainty than the data
supports is worse than none.

RF _is_ vendor-normalised to 0–100 by RFutils, so that threshold does mean the same thing
across a mixed rack — battery percentage and dBFS are as reported.

## 7. Traps in the Companion layer

- **`@companion-module/base` 2.x presets are `setPresetDefinitions(structure, definitions)`**
  with `type: 'simple'`. A 1.x `category` field loads and never appears.
- **`setVariableDefinitions` throws on an array.**
- **Companion variable ids allow only `[a-zA-Z0-9_]`.** RFutils channel ids carry a vendor
  prefix and separators (`rx-a:1`), so every one needs `safeId()`.
- **Preset variable references use `self.label`**, not the module id.

## 8. Conventions

- Not in the official Companion module store — installs via **Settings → Developer modules
  path**.
- `npm test` drives the real source against a fake RFutils (real HTTP + real WebSocket).
- Ships a user-facing AI-assisted disclaimer.
- "Commit" means commit **and** push.
