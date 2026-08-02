# RFutils

Puts a radio-mic rack on a control surface, through
[RFutils](https://github.com/stoatworks-labs/RFutils).

## Connection

The RFutils server, port **8420** by default. **No authentication, binds
`0.0.0.0`** — keep it on a trusted production network.

Thresholds for battery and RF live in the connection config, so every channel
tile agrees without editing each button.

## Reading a channel tile

| Colour   | Means                                  |
| -------- | -------------------------------------- |
| default  | fine                                   |
| amber    | battery low, or RF weak                |
| red      | battery critical                       |
| **blue** | **this channel has stopped reporting** |

**Blue wins over everything.** Every threshold here goes dark when a receiver
goes quiet rather than showing its last value, so without the blue a dead
receiver looks healthy. Variables read `--` for the same reason: a battery
percentage from twenty minutes ago looks exactly like a current one.

## Audio present vs silent

Both take a dBFS threshold. `-60` catches "the mic is open"; raise it towards
`-20` to catch "someone is actually talking". Both go dark on a stale channel —
silence and no-information are different things.

## Programming receivers

**Program frequencies to receivers sends commands to real hardware** that may be
in use on a show. It is a **dry run** unless _Actually transmit_ is ticked, and
the log line says which happened.

## How much to trust a reading

RFutils' README has a **Protocol status** table, and the Sennheiser adapter is
labelled an _unverified skeleton_. A channel showing nothing may be the
receiver, the network, or the adapter. RF is normalised 0–100 across vendors, so
that threshold at least means the same thing on every box.
