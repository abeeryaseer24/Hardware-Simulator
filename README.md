# Benchnote

A browser-based lab bench for EEE students: practise digital and analog lab experiments before the real session, with no installs and no sign-up.

**Live site:** https://abeeryaseer24.github.io/Hardware-Simulator/

## What's inside

| Page | What it does |
|---|---|
| **Logic bench** | A digital trainer with a full-size breadboard, 8 switches, 8 LEDs, a 7-segment display, clock generator, pulsers and logic probe. 30 real 74xx chips with datasheet pinouts. 29 guided experiments with an automatic truth-table checker. |
| **K-map solver** | 2 to 6 variables with don't cares. Minimal SOP and POS with the groups drawn on the map, prime implicant chart, Quine–McCluskey working, NAND/NOR forms and a gate diagram. |
| **Analog bench** | Draw a schematic and it simulates live: R, L, C, diodes, LEDs, Zeners, NPN/PNP transistors and op-amps, with meters and a two-channel oscilloscope. 16 ready circuits. |
| **Breadboard 101** | How a breadboard is wired, placing DIP chips, power pins, TTL levels, wire colours, debugging steps and a pinout library. |
| **Toolkit** | Resistor colour codes, number bases and codes, expression to truth table, 555 timer, LED resistor, dividers, RC/RLC and op-amp gain. |
| **Revision sheet** | Boolean laws, flip-flop tables, counters, rectifier, BJT and op-amp formulas. Prints on two pages. |

### Logic bench details

- Hover any hole or wire to highlight the whole electrical node it belongs to.
- **Logic view** colours every wire by its level: red HIGH, blue LOW, grey floating, orange when two outputs fight.
- The trainer notices unpowered chips, floating inputs, output conflicts, shorts between +5 V and GND, and chips powered backwards (which burn out, as they would on a real bench).
- **Guide me** shows ghost outlines for every chip and wire and ticks steps off as you wire them.
- **Check my circuit** runs every input combination (or a clocked sequence for flip-flops and counters) and shows which rows fail.
- Logic analyzer trace, undo/redo, save/open, and shareable links.

### Experiments included

Basic gates (AND, OR, NOT, NAND, NOR, XOR) · NAND and NOR universality · half/full adder · half subtractor · 4-bit adder (7483) · 4-bit comparator (7485) · 4:1 MUX (74153) · Boolean function with an 8:1 MUX (74151) · 3-to-8 decoder (74138) · 1-to-4 demux (74155) · priority encoder (74148) · BCD to 7-segment (7447) · SR latch · D flip-flop (7474) · JK flip-flop (7476) · mod-16 counter (7493) · decade counter on a display (7490 + 7447) · mod-10 counter (74161) · universal shift register (74194)

## How the simulators work

- **Digital:** the board is reduced to electrical nodes with union-find (breadboard strips, rails and wires). Chip outputs drive nodes; the solver iterates until nothing changes, detecting conflicts and oscillation. Flip-flops and counters keep their own state and react to clock edges.
- **Analog:** modified nodal analysis with backward-Euler companion models for capacitors and inductors and Newton–Raphson iteration (with junction-voltage limiting) for diodes, BJTs (Ebers–Moll) and op-amps. Each circuit starts from its DC operating point.
- **K-map:** Quine–McCluskey to find prime implicants, then an exact branch-and-bound cover to find every minimum solution.

Everything is plain HTML, CSS and JavaScript modules. No build step and no dependencies.

## Run it locally

Any static file server works, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root.
- **Vercel or Netlify:** import the repository; no build command, output directory is the root.

## Project layout

```
index.html, logic-bench.html, kmap.html, analog-bench.html,
breadboard.html, toolkit.html, revision.html
css/            shared styles and one stylesheet per page
js/shared/      page chrome, helpers, Boolean parser and minimiser
js/digital/     chip library, trainer model and solver, board renderer, experiments
js/analog/      MNA circuit engine and preset circuits
```
