# companion-module-rfutils

> **AI-assisted project.** This module was built with the help of
> [Claude](https://claude.ai), Anthropic's AI assistant — including
> implementation and documentation. Review it accordingly before relying on
> it in production.

A [Bitfocus Companion](https://bitfocus.io/companion) connection module for
[RFutils](https://github.com/stoatworks-labs/RFutils) — put a radio-mic rack's
battery, RF and audio state on a control surface, and drive Dante crosspoints
from it.

## What it does

- **Actions** — make and clear a Dante crosspoint, **program frequencies to real
  receivers (dry run by default)**, refresh the device list, and log the
  devices, the crosspoint status and the audio mode.
- **Feedbacks** — battery low, battery critical, battery runtime low, RF low,
  audio present, channel silent, **channel has stopped reporting**, receiver
  identified, any battery low, any receiver stale, scanning, connected.
- **Variables** — per channel: name, receiver, vendor, battery %, battery
  minutes, RF, audio dBFS, antenna, Live/Stale. Plus rack counts.
- **Presets** — a **monitor tile per channel**, an audio-present tile per
  channel, and a rack overview.

## The tile, and why blue matters

Each channel tile shows name, battery and RF, and escalates:

| Colour   | Means                                  |
| -------- | -------------------------------------- |
| default  | fine                                   |
| amber    | battery low, or RF weak                |
| red      | battery critical                       |
| **blue** | **this channel has stopped reporting** |

Blue overrides both. Every threshold feedback here goes **dark** when a
receiver goes quiet rather than lighting off a remembered value — so without
the blue, a dead receiver would look exactly like a healthy one.

The same applies to the variables: a stale channel reads `--`, not its last
number. A battery percentage from twenty minutes ago is indistinguishable from
a current one on a button face, and that is the reading that catches people out.

## Programming receivers is guarded

`Program frequencies to receivers` **sends commands to real hardware that may be
in use on a live show**. It is a dry run unless _Actually transmit_ is ticked.

That mirrors RFutils' own API, which checks `dryRun !== false` — so omitted,
`true`, `null` and the string `"false"` are all dry runs, and only the literal
boolean `false` transmits. The module sends a real boolean and nothing else.

## Before you rely on the readings

RFutils' vendor adapters vary in confidence, and its README's **Protocol status**
table is the authority. The Sennheiser SSC adapter in particular is labelled an
_unverified skeleton_, and its metering paths are best-effort guesses from
public examples.

A channel reading nothing here may be the receiver, the network, or the adapter.
Check that table before concluding a battery is flat. RF is vendor-normalised to
0–100 by RFutils, so a threshold does mean the same thing across a mixed rack.

## Setting it up

The RFutils server, port 8420 by default.

> **There is no authentication and it binds `0.0.0.0`.** Anyone who can reach
> the port can read your inventory and, through the programming API, send
> commands to real receivers. Bind it to `127.0.0.1` or firewall it outside a
> trusted production network.

Device state arrives on RFutils' `/ws`. The audio WebSocket (`/ws/audio`) is not
used — headphone cueing has nowhere to go on a Stream Deck.

## Tests

```bash
npm test
```

Drives the module's real source against a fake RFutils (real HTTP + real
WebSocket): the escalation order, staleness suppressing readings rather than
showing history, the `dryRun` guard, and telemetry updates not churning the
definition sets.

## Installing

Not in the official Companion module store. Install via
**Settings → Developer modules path**.

## Licence

MIT — see [LICENSE](LICENSE).
