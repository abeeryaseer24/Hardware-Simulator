// Ready-made circuits. Coordinates are in grid units (1 unit = 20 px).
import { G } from './engine.js';

const two = (type, x1, y1, x2, y2, props = {}) => ({ type, p: [[x1 * G, y1 * G], [x2 * G, y2 * G]], ...props });
const one = (type, x, y, props = {}) => ({ type, p: [[x * G, y * G]], ...props });
const W = (x1, y1, x2, y2) => two('wire', x1, y1, x2, y2);

export const PRESETS = [
  {
    id: 'divider', group: 'DC basics', title: 'Voltage divider',
    about: 'Vout = Vin · R2 / (R1 + R2). With 10 V, 1 kΩ and 2 kΩ the meter should read 6.67 V. Change R2 in the inspector and watch it move.',
    dt: 1e-4, window: 0.02, probes: [[12, 9]],
    els: [
      two('V', 4, 14, 4, 4, { value: 10 }), W(4, 4, 12, 4), two('R', 12, 4, 12, 9, { value: 1000 }), two('R', 12, 9, 12, 14, { value: 2000 }),
      W(12, 14, 4, 14), one('GND', 4, 14), W(12, 9, 17, 9), W(12, 14, 17, 14), two('VM', 17, 14, 17, 9),
    ],
  },
  {
    id: 'kvl', group: 'DC basics', title: 'Two-source network (KCL / KVL)',
    about: 'Three branches meet at the middle node. The ammeters show the branch currents; check that they add to zero at the node (KCL) and that the voltages round each loop add to zero (KVL).',
    dt: 1e-4, window: 0.02, probes: [[12, 4]],
    els: [
      two('V', 4, 14, 4, 4, { value: 12 }), W(4, 4, 5, 4), two('R', 5, 4, 9, 4, { value: 1000 }), two('AM', 9, 4, 12, 4),
      two('AM', 12, 4, 12, 7), two('R', 12, 7, 12, 14, { value: 2200 }),
      two('AM', 15, 4, 12, 4), two('R', 19, 4, 15, 4, { value: 470 }), W(19, 4, 20, 4), two('V', 20, 14, 20, 4, { value: 5 }),
      W(4, 14, 12, 14), W(12, 14, 20, 14), one('GND', 12, 14),
    ],
  },
  {
    id: 'rc-charge', group: 'RC, RL and RLC', title: 'RC charging and discharging',
    about: 'Close S1 and the capacitor charges through 10 kΩ with τ = RC = 0.1 s. After one τ it reaches 63 % of 5 V. Open S1 and close S2 to discharge it.',
    dt: 2e-4, window: 0.8, probes: [[18, 4], [12, 4]],
    els: [
      two('V', 4, 14, 4, 4, { value: 5 }), W(4, 4, 8, 4), two('SW', 8, 4, 12, 4, { closed: false, label: 'S1' }), two('R', 12, 4, 18, 4, { value: 10000 }),
      two('C', 18, 4, 18, 14, { value: 10e-6 }), W(18, 14, 4, 14), one('GND', 4, 14),
      W(18, 4, 24, 4), two('R', 24, 4, 24, 9, { value: 10000 }), two('SW', 24, 9, 24, 14, { closed: false, label: 'S2' }), W(24, 14, 18, 14),
    ],
  },
  {
    id: 'rc-lowpass', group: 'RC, RL and RLC', title: 'RC low-pass filter',
    about: 'The cut-off is fc = 1 / (2πRC) ≈ 1 kHz. At 1 kHz the output (CH2) is 0.707 of the input and lags it by 45°. Try 100 Hz and 10 kHz on the source.',
    dt: 4e-6, window: 4e-3, probes: [[8, 4], [14, 4]],
    els: [
      two('AC', 4, 14, 4, 4, { amp: 5, freq: 1000, offset: 0, wave: 'sine' }), W(4, 4, 8, 4), two('R', 8, 4, 14, 4, { value: 1000 }),
      two('C', 14, 4, 14, 14, { value: 159e-9 }), W(14, 14, 4, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'rl', group: 'RC, RL and RLC', title: 'RL circuit with a square wave',
    about: 'An inductor resists changes in current. With τ = L/R = 10 µs the resistor voltage (CH2) rises and falls exponentially on each edge of the square wave.',
    dt: 2e-7, window: 2e-4, probes: [[8, 4], [14, 8]],
    els: [
      two('AC', 4, 14, 4, 4, { amp: 5, freq: 10000, offset: 5, wave: 'square' }), W(4, 4, 8, 4), two('L', 8, 4, 14, 4, { value: 10e-3 }),
      W(14, 4, 14, 8), two('R', 14, 8, 14, 14, { value: 1000 }), W(14, 14, 4, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'rlc', group: 'RC, RL and RLC', title: 'Series RLC ringing',
    about: 'An under-damped RLC rings at f₀ = 1 / (2π√LC) ≈ 1.6 kHz after each edge. Raise R towards 2√(L/C) = 200 Ω and the ringing dies out (critical damping).',
    dt: 2e-6, window: 1e-2, probes: [[4, 4], [18, 4]],
    els: [
      two('AC', 4, 14, 4, 4, { amp: 2, freq: 100, offset: 2, wave: 'square' }), W(4, 4, 6, 4), two('R', 6, 4, 10, 4, { value: 20 }),
      two('L', 10, 4, 16, 4, { value: 10e-3 }), W(16, 4, 18, 4), two('C', 18, 4, 18, 14, { value: 1e-6 }), W(18, 14, 4, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'half-wave', group: 'Diodes', title: 'Half-wave rectifier with filter',
    about: 'The diode passes only the positive half-cycles. Close the switch to add the 100 µF reservoir capacitor and the output becomes DC with a small ripple.',
    dt: 2e-5, window: 0.06, probes: [[4, 4], [14, 4]],
    els: [
      two('AC', 4, 14, 4, 4, { amp: 12, freq: 50, offset: 0, wave: 'sine' }), two('D', 4, 4, 10, 4), W(10, 4, 14, 4),
      two('R', 14, 4, 14, 14, { value: 1000 }), W(14, 4, 19, 4), two('SW', 19, 4, 19, 8, { closed: false }), two('C', 19, 8, 19, 14, { value: 100e-6 }),
      W(19, 14, 14, 14), W(14, 14, 4, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'bridge', group: 'Diodes', title: 'Full-wave bridge rectifier',
    about: 'Four diodes steer both half-cycles the same way through the load, so the ripple frequency doubles to 100 Hz. Each half-cycle passes through two diodes, so the peak is about 1.4 V below the input.',
    dt: 2e-5, window: 0.06, probes: [[20, 7]],
    els: [
      two('AC', 2, 12, 2, 2, { amp: 12, freq: 50, offset: 0, wave: 'sine' }), W(2, 2, 10, 2), W(2, 12, 10, 12),
      two('D', 10, 2, 14, 7), two('D', 10, 12, 14, 7), two('D', 6, 7, 10, 2), two('D', 6, 7, 10, 12),
      W(14, 7, 20, 7), two('R', 20, 7, 20, 16, { value: 1000 }), W(20, 16, 6, 16), W(6, 16, 6, 7), one('GND', 6, 16),
    ],
  },
  {
    id: 'zener', group: 'Diodes', title: 'Zener voltage regulator',
    about: 'The 5.1 V Zener holds the output steady while the supply changes. Try the source between 7 V and 20 V: the meter barely moves. The 220 Ω resistor drops the difference.',
    dt: 1e-4, window: 0.02, probes: [[12, 4]],
    els: [
      two('V', 4, 14, 4, 4, { value: 12 }), W(4, 4, 6, 4), two('R', 6, 4, 12, 4, { value: 220 }), two('Z', 12, 14, 12, 4, { vz: 5.1 }),
      W(12, 4, 18, 4), two('R', 18, 4, 18, 14, { value: 1000 }), W(18, 14, 4, 14), one('GND', 4, 14),
      W(18, 4, 22, 4), W(18, 14, 22, 14), two('VM', 22, 14, 22, 4),
    ],
  },
  {
    id: 'led', group: 'Diodes', title: 'LED with a series resistor',
    about: 'R = (Vs − Vf) / I. With 5 V, a red LED (about 1.8 V) and 330 Ω you get roughly 10 mA. Swap the colour: blue LEDs need about 3 V, so the current drops.',
    dt: 1e-4, window: 0.02, probes: [[18, 4]],
    els: [
      two('V', 4, 14, 4, 4, { value: 5 }), two('SW', 4, 4, 8, 4, { closed: true }), two('R', 8, 4, 13, 4, { value: 330 }),
      two('AM', 13, 4, 18, 4), two('LED', 18, 4, 18, 14, { color: 'red' }), W(18, 14, 4, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'inverting', group: 'Op-amps', title: 'Inverting amplifier',
    about: 'Gain = −Rf / Rin = −10. A 0.5 V input gives a 5 V output, flipped upside-down. Push the input above 1.35 V and the output clips at the ±13.5 V rails.',
    dt: 5e-6, window: 3e-3, probes: [[8, 7], [20, 8]],
    els: [
      two('AC', 4, 14, 4, 7, { amp: 0.5, freq: 1000, offset: 0, wave: 'sine' }), W(4, 7, 8, 7), two('R', 8, 7, 14, 7, { value: 1000 }),
      one('OA', 14, 8, { vsat: 13.5, flip: false }), W(14, 7, 14, 4), two('R', 14, 4, 20, 4, { value: 10000 }), W(20, 4, 20, 8), W(18, 8, 20, 8),
      W(20, 8, 24, 8), two('R', 24, 8, 24, 14, { value: 10000 }), W(14, 9, 14, 14), W(4, 14, 24, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'noninverting', group: 'Op-amps', title: 'Non-inverting amplifier',
    about: 'Gain = 1 + Rf / Rg = 1 + 10k / 2.2k ≈ 5.5, in phase with the input. Set Rf to 0 Ω and it becomes a voltage follower with gain 1.',
    dt: 5e-6, window: 3e-3, probes: [[8, 9], [20, 8]],
    els: [
      two('AC', 4, 14, 4, 9, { amp: 1, freq: 1000, offset: 0, wave: 'sine' }), W(4, 9, 14, 9),
      one('OA', 14, 8, { vsat: 13.5, flip: false }), W(14, 7, 14, 4), two('R', 14, 4, 20, 4, { value: 10000 }), W(20, 4, 20, 8), W(18, 8, 20, 8),
      W(14, 4, 10, 4), two('R', 10, 4, 10, 14, { value: 2200 }), W(20, 8, 24, 8), two('R', 24, 8, 24, 14, { value: 10000 }), W(4, 14, 24, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'comparator', group: 'Op-amps', title: 'Comparator (sine to square)',
    about: 'With no feedback the op-amp slams to a rail whenever the input crosses the 2.5 V reference set by the divider. Move the reference and the duty cycle changes.',
    dt: 5e-6, window: 3e-3, probes: [[8, 9], [20, 8]],
    els: [
      two('AC', 4, 14, 4, 9, { amp: 5, freq: 1000, offset: 0, wave: 'sine' }), W(4, 9, 14, 9),
      one('OA', 14, 8, { vsat: 13.5, flip: false }), W(14, 7, 14, 3), W(14, 3, 10, 3), two('R', 10, 3, 10, 0, { value: 1000 }),
      two('V', 6, 14, 6, 0, { value: 5 }), W(6, 0, 10, 0), two('R', 10, 3, 10, 7, { value: 1000 }), W(10, 7, 10, 14),
      W(18, 8, 22, 8), two('R', 22, 8, 22, 14, { value: 10000 }), W(4, 14, 22, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'integrator', group: 'Op-amps', title: 'Integrator (square to triangle)',
    about: 'The capacitor in the feedback path makes the output the running integral of the input, so a square wave becomes a triangle. The 1 MΩ resistor stops the output drifting into a rail.',
    dt: 5e-6, window: 4e-3, probes: [[8, 7], [22, 8]],
    els: [
      two('AC', 4, 14, 4, 7, { amp: 1, freq: 1000, offset: 0, wave: 'square' }), W(4, 7, 8, 7), two('R', 8, 7, 14, 7, { value: 10000 }),
      one('OA', 14, 8, { vsat: 13.5, flip: false }), W(14, 7, 14, 4), two('C', 14, 4, 20, 4, { value: 100e-9 }), W(14, 4, 14, 1), two('R', 14, 1, 20, 1, { value: 1e6 }),
      W(20, 1, 20, 4), W(20, 4, 20, 8), W(18, 8, 22, 8), two('R', 22, 8, 22, 14, { value: 10000 }), W(14, 9, 14, 14), W(4, 14, 22, 14), one('GND', 4, 14),
    ],
  },
  {
    id: 'bjt-switch', group: 'Transistors', title: 'BJT as a switch',
    about: 'A small base current (about 0.4 mA through 10 kΩ) lets roughly 15 mA flow through the LED. Open the switch: no base current, no collector current. The transistor is in saturation when on.',
    dt: 1e-4, window: 0.02, probes: [[16, 9]],
    els: [
      two('V', 2, 16, 2, 2, { value: 9 }), W(2, 2, 16, 2), two('R', 16, 2, 16, 6, { value: 470 }), two('LED', 16, 6, 16, 9, { color: 'green' }),
      two('SW', 6, 2, 6, 6, { closed: true }), two('R', 6, 6, 6, 11, { value: 10000 }), W(6, 11, 14, 11),
      one('NPN', 14, 11, { beta: 100, flip: false }), W(16, 13, 16, 16), W(2, 16, 16, 16), one('GND', 2, 16),
    ],
  },
  {
    id: 'ce-amp', group: 'Transistors', title: 'Common-emitter amplifier',
    about: 'A voltage-divider bias sets the operating point; the coupling capacitors pass only the signal. The output (CH2) is an inverted, amplified copy of the 10 mV input. Gain is roughly −Rc / re.',
    dt: 5e-6, window: 3e-3, probes: [[6, 10], [22, 5]],
    els: [
      two('V', 26, 18, 26, 0, { value: 12 }), W(26, 0, 12, 0), W(12, 0, 18, 0),
      two('R', 12, 0, 12, 9, { value: 47000 }), two('R', 12, 11, 12, 18, { value: 10000 }), W(12, 9, 12, 11),
      two('R', 18, 0, 18, 7, { value: 4700 }), one('NPN', 16, 11, { beta: 100, flip: false }), W(18, 7, 18, 9), W(12, 11, 16, 11),
      two('R', 18, 13, 18, 18, { value: 1000 }), two('C', 22, 13, 22, 18, { value: 100e-6 }), W(18, 13, 22, 13),
      two('AC', 2, 18, 2, 10, { amp: 0.01, freq: 1000, offset: 0, wave: 'sine' }), W(2, 10, 6, 10), two('C', 6, 10, 12, 10, { value: 10e-6 }),
      W(18, 7, 22, 7), two('C', 22, 7, 22, 5, { value: 10e-6 }), W(22, 5, 30, 5), two('R', 30, 5, 30, 18, { value: 10000 }),
      W(2, 18, 12, 18), W(12, 18, 18, 18), W(18, 18, 22, 18), W(22, 18, 26, 18), W(26, 18, 30, 18), one('GND', 2, 18),
    ],
  },
];
