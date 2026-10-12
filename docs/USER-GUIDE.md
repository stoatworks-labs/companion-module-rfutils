# Companion — RFutils user guide

This module puts a radio-mic rack on a control surface, through
[RFutils](https://github.com/stoatworks-labs/RFutils): battery, RF and audio state per channel
across mixed vendors, and frequency programming.

The [README](../README.md) covers installing the module. This guide is about building a page that
tells you the truth about a rack.

> **Before you rely on this:** how far you can trust a *reading* depends on the vendor adapter
> behind it, not on this module. RFutils' README has a **Protocol status** table, and the
> Sennheiser adapter is labelled an *unverified skeleton*. A channel showing nothing could be the
> receiver, the network or the adapter.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

The RFutils server, port **8420** by default.

> **No authentication, and it binds `0.0.0.0`.** Keep it on a trusted production network.

**Set the battery and RF thresholds in the connection config**, not on each button. That way every
channel tile agrees without you editing forty buttons, and a change before doors applies
everywhere.

---

## Reading a channel tile

| Colour | Means |
| --- | --- |
| default | fine |
| amber | battery low, or RF weak |
| red | battery critical |
| **blue** | **this channel has stopped reporting** |

**Blue beats everything else, and it's the one that matters.**

Every threshold here goes dark when a receiver goes quiet, rather than showing its last value,
because otherwise **a dead receiver looks healthy**. The variables read `--` for the same reason:
a battery percentage from twenty minutes ago looks no different from a current one, and you'll
only find out which it was at the worst possible moment.

---

## Audio present and audio silent

Both take a dBFS threshold, and they answer different questions:

- **`-60`** catches "the mic is open".
- **Towards `-20`** catches "someone's actually talking".

Pick per page. A cue light wants the second; a fault light wants the first.

Both go dark on a stale channel, because **silence and no information aren't the same thing**, and
a page that mixes them up will send someone on stage to fix a receiver that's fine.

---

## RF is normalised across vendors

RF is reported 0–100 whatever the receiver is, so **one threshold means the same thing on every
box in the rack**. That's the reason for putting a mixed rack behind one server in the first place.

Battery isn't always so obliging. Read the vendor's own units where the adapter gives you them.

---

## Programming receivers

> **Program frequencies to receivers sends commands to real hardware** that may be in use on a
> show.

It's a **dry run unless *Actually transmit* is ticked**, and the log line says which happened.
Leave it as a dry run while you build the page, and read the log before you tick the box.

---

## Building a surface that fails safe

1. **Blue on every channel tile.** Without it the rack lies about its dead channels.
2. **Thresholds in the connection config**, so the whole page agrees.
3. **Audio-present at the threshold that matches the question** the page is asking.
4. **Programming buttons on their own page**, dry run by default.

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

- [README](../README.md): installing, and the full list of actions, feedbacks and variables
- [`companion/HELP.md`](../companion/HELP.md): the same material, in Companion's help panel
- [RFutils](https://github.com/stoatworks-labs/RFutils): the server, and its **Protocol status**
  table
