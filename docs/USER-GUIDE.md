# Companion — RFutils user guide

This module puts **a radio-mic rack on a control surface**, through
[RFutils](https://github.com/stoatworks-labs/RFutils): per-channel battery, RF and audio state
across mixed vendors, and frequency programming.

The [README](../README.md) covers installing the module. This is how to build a page that tells
you the truth about a rack.

> **Before you rely on this:** how much to trust a *reading* depends on the vendor adapter behind
> it, not on this module. RFutils' README carries a **Protocol status** table, and the Sennheiser
> adapter is labelled an *unverified skeleton*. A channel showing nothing may be the receiver, the
> network, or the adapter.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

The RFutils server, port **8420** by default.

> **No authentication, and it binds `0.0.0.0`.** Keep it on a trusted production network.

**Set the battery and RF thresholds in the connection config**, not on each button. Every channel
tile then agrees without you editing forty buttons, and a change before doors applies everywhere.

---

## Reading a channel tile

| Colour | Means |
| --- | --- |
| default | fine |
| amber | battery low, or RF weak |
| red | battery critical |
| **blue** | **this channel has stopped reporting** |

**Blue wins over everything, and it is the important one.**

Every threshold here goes dark when a receiver goes quiet rather than showing its last value —
because without that, **a dead receiver looks healthy**. The variables read `--` for the same
reason: a battery percentage from twenty minutes ago looks exactly like a current one, and the
one time that matters is the one time it will cost you.

---

## Audio present and audio silent

Both take a dBFS threshold, and they are different questions:

- **`-60`** catches "the mic is open".
- **Towards `-20`** catches "someone is actually talking".

Pick per page. A cue light wants the second; a fault light wants the first.

Both go dark on a stale channel, because **silence and no-information are different things** and
a page that conflates them will send someone on stage to fix a receiver that is fine.

---

## RF is normalised across vendors

RF is reported 0–100 whatever the receiver is, so **one threshold means the same thing on every
box in the rack**. That is the point of putting a mixed rack behind one server.

Battery is not always so cooperative — read the vendor's own units where the adapter exposes them.

---

## Programming receivers

> **Program frequencies to receivers sends commands to real hardware** that may be in use on a
> show.

It is a **dry run unless *Actually transmit* is ticked**, and the log line says which happened.
Leave it as a dry run while you build the page, and read the log before you tick the box.

---

## Building a surface that fails safe

1. **Blue on every channel tile.** Without it the rack lies about its dead channels.
2. **Thresholds in the connection config**, so the whole page agrees.
3. **Audio-present at the threshold that matches the question** the page is asking.
4. **Programming buttons on their own page**, dry-run by default.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **A channel is blue** | It has stopped reporting. Receiver, network, or adapter — in that order of likelihood. |
| **Variables read `--`** | Same thing. A stale value is deliberately not shown. |
| **A channel never reports anything** | Check RFutils' Protocol status table for that vendor — the Sennheiser adapter is an unverified skeleton. |
| **Audio-present never lights** | The threshold is set for speech (`-20`) rather than for an open mic (`-60`). |
| **Programming did nothing** | It was a dry run. *Actually transmit* was not ticked; the log says so. |

---

## See also

- [README](../README.md) — installing, and the full action/feedback/variable list
- [`companion/HELP.md`](../companion/HELP.md) — the same material, in Companion's help panel
- [RFutils](https://github.com/stoatworks-labs/RFutils) — the server, and its **Protocol status**
  table
