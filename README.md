# Benchnote

A free virtual lab for electrical and electronic engineering students. Every experiment is shown fully wired on a breadboard, with an empty board beside it so you can build it yourself and have it checked.

**Live site:** https://abeeryaseer24.github.io/Hardware-Simulator/

## Sections

| Section | What it does |
|---|---|
| **Digital Lab** | 29 experiments on a digital trainer (switches, LEDs, 7-segment display, clock, pulsers, logic probe) with 30 real 74xx chips. Includes the **K-Map solver** (K-map, truth table, Boolean expression, minterm and maxterm input; minimal SOP/POS with the working). |
| **Analog Lab** | 25 experiments on an analog trainer with a DC supply (±12 V, two variable outputs), function generator, multimeter, two ammeters, two-channel oscilloscope, switches, constant-current source and potentiometer. |
| **Tools** | Resistor and capacitor codes, LED resistor, Ohm's law and dividers, RC/RLC, op-amp gain, 555 timer, number bases and codes. |
| **Learn** | Breadboard basics with a pinout library (inputs and outputs listed for every chip), a printable revision sheet, and a free-form schematic sandbox. |

## How each experiment works

1. **Overview** – aim, theory, procedure, circuit diagram or truth table, components and expected results.
2. **Reference build** – the circuit wired on the breadboard and running. Step through the build one part or wire at a time.
3. **Practice** – an empty breadboard below the reference. Build it yourself, then press **Check**:
   - digital circuits are tested against every row of the truth table (or the clocked sequence);
   - analog circuits are compared with the reference part by part (voltage across and current through each component).

Progress is saved in the browser, and finished experiments are ticked in the list.

### Analog experiments

Ohm's law · series and parallel resistors · voltage divider · KVL and KCL · superposition · Thevenin · Norton · maximum power transfer · RC charging and discharging · RC low-pass and high-pass filters · series RLC · diode characteristic · half-wave rectifier · clipper · Zener regulator · LED · BJT switch · common-emitter amplifier · 741 inverting, non-inverting, follower, summing, comparator and integrator

### Digital experiments

Basic gates · NAND and NOR universality · half and full adder · half subtractor · 7483 adder · 7485 comparator · 74153 MUX · Boolean function with 74151 · 74138 decoder · 74155 demux · 74148 encoder · 7447 BCD to 7-segment · SR latch · 7474 D flip-flop · 7476 JK flip-flop · 7493 counter · 7490 + 7447 decade counter · 74161 mod-10 counter · 74194 shift register

## How the simulation works

- **Digital:** the breadboard is reduced to electrical nodes; chips are evaluated until the circuit settles, with detection of output conflicts, floating inputs, unpowered or reversed chips, and oscillation.
- **Analog:** modified nodal analysis with backward-Euler models for capacitors and inductors and Newton–Raphson iteration for diodes, BJTs and op-amps. Every circuit starts from its DC operating point.
- **K-map:** Quine–McCluskey plus an exact minimum cover.

Plain HTML, CSS and JavaScript modules. No build step, no dependencies.

## Run locally

```bash
python -m http.server 8000
```

Open http://localhost:8000.

## Credits

Designed and developed by **Talha Yaseer Abeer**.

© 2026 Talha Yaseer Abeer. All rights reserved. Free to use for personal study; redistribution or reuse of the code or content requires the author's permission.
