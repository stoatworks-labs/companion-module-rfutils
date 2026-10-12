# companion-module-rfutils

> **AI-assisted project.** This module was created with [Claude](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. Check it over before you rely on it for
> a show.

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[RFutils](https://github.com/stoatworks-labs/RFutils). It puts a radio-mic rack's
battery, RF and audio state on a control surface, and lets you drive Dante
crosspoints from it too.

<!-- downloads:start -->

## Download

**[v1.0.5](https://github.com/stoatworks-labs/companion-module-rfutils/releases/tag/v1.0.5)**

This release contains:

- [`companion-module-rfutils-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-rfutils/releases/latest/download/companion-module-rfutils-pkg.tgz) — npm package, 24 KB
- [`rfutils-1.0.5.tgz`](https://github.com/stoatworks-labs/companion-module-rfutils/releases/download/v1.0.5/rfutils-1.0.5.tgz) — npm package, 24 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-rfutils/releases](https://github.com/stoatworks-labs/companion-module-rfutils/releases).

<!-- downloads:end -->

## What it does

- **Actions:** make and clear a Dante crosspoint, program frequencies to real
  receivers (dry run by default), refresh the device list, and log the
  devices, the crosspoint status and the audio mode.
- **Feedbacks:** battery low, battery critical, battery runtime low, RF low,
  audio present, channel silent, channel has stopped reporting, receiver
  identified, any battery low, any receiver stale, scanning, and connected.
- **Variables:** per channel, the name, receiver, vendor, battery %, battery
  minutes, RF, audio dBFS, antenna and Live/Stale. Plus rack counts.
- **Presets:** a monitor tile per channel, an audio-present tile per channel,
  and a rack overview.

## The tile, and why blue matters

Each channel tile shows the name, battery and RF, and escalates like this:

| Colour   | Means                                  |
| -------- | -------------------------------------- |
| default  | fine                                   |
| amber    | battery low, or RF weak                |
| red      | battery critical                       |
| **blue** | **this channel has stopped reporting** |

Blue overrides both. Every threshold feedback here goes dark when a receiver
goes quiet, rather than lighting up from a remembered value, so without the blue
a dead receiver would look just like a healthy one.

Same goes for the variables: a stale channel reads `--`, not its last number. On
a button face, a battery percentage from twenty minutes ago looks no different
from a current one, and that's the reading that catches people out.

## Programming receivers is guarded

`Program frequencies to receivers` **sends commands to real hardware that may be
in use on a live show**. It's a dry run unless _Actually transmit_ is ticked.

That matches RFutils' own API, which checks `dryRun !== false`. So leaving it
out, `true`, `null` and the string `"false"` are all dry runs, and only the
literal boolean `false` transmits. The module sends a proper boolean and nothing
else.

## Before you rely on the readings

Some of RFutils' vendor adapters are better proven than others, and the
**Protocol status** table in its README has the final word. The Sennheiser SSC
adapter in particular is labelled an _unverified skeleton_, and its metering
paths are best-effort guesses from public examples.

If a channel reads nothing here, it could be the receiver, the network or the
adapter, so check that table before you decide a battery's flat. RFutils
normalises RF to 0–100 across vendors, so a threshold does mean the same thing
across a mixed rack.

## Setting it up

Point it at the RFutils server, port 8420 by default.

> **There's no authentication and it binds `0.0.0.0`.** Anyone who can reach
> the port can read your inventory and, through the programming API, send
> commands to real receivers. Bind it to `127.0.0.1` or firewall it outside a
> trusted production network.

Device state comes in on RFutils' `/ws`. The module doesn't use the audio
WebSocket (`/ws/audio`), since a Stream Deck has nowhere to plug the headphones
in.

## Tests

```bash
npm test
```

This runs the module's actual code against a pretend RFutils (over real HTTP
and a real WebSocket). It covers the escalation order, staleness hiding readings
rather than showing old ones, the `dryRun` guard, and telemetry updates not
churning the definition sets.

## Installing

It's not in the official Companion module store, so install it as a developer
module through **Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT, see [LICENSE](LICENSE).
