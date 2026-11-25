// Analog lab experiments: breadboard reference build + circuit diagram + notes.
import { G } from './engine.js';
import { PRESETS } from './presets.js';

// ---- schematic helpers (grid units)
const two = (type, x1, y1, x2, y2, props = {}) => ({ type, p: [[x1 * G, y1 * G], [x2 * G, y2 * G]], ...props });
const one = (type, x, y, props = {}) => ({ type, p: [[x * G, y * G]], ...props });
const W = (x1, y1, x2, y2) => two('wire', x1, y1, x2, y2);
const preset = (id) => PRESETS.find(p => p.id === id).els;

// ---- breadboard helpers
const R = (a, b, value) => ({ type: 'R', holes: [a, b], value });
const C = (a, b, value) => ({ type: 'C', holes: [a, b], value });
const CE = (plus, minus, value) => ({ type: 'CE', holes: [plus, minus], value });
const L = (a, b, value) => ({ type: 'L', holes: [a, b], value });
const D = (anode, cathode) => ({ type: 'D', holes: [anode, cathode] });
const LED = (anode, cathode, color = 'red') => ({ type: 'LED', holes: [anode, cathode], color });
const Z = (anode, cathode, vz) => ({ type: 'Z', holes: [anode, cathode], value: vz });
const NPN = (row, baseCol) => ({ type: 'NPN', holes: [row + (baseCol - 1), row + baseCol, row + (baseCol + 1)] }); // C B E
const OA = (col) => ({ type: 'OA', col: col - 1 }); // col = breadboard column of pin 1
const w = (a, b) => ({ a, b });

const RAILS_TOP = [w('var1', 'tp2'), w('g1', 'tn3')];
const OPAMP_PWR = [w('p12', 'tp2'), w('g0', 'tn3'), w('m12', 'bp2'), w('g2', 'bn3'), w('a31', 'tp31'), w('j33', 'bp33')];

const DC = 0.02;

export const AEXPERIMENTS = [
  // ------------------------------------------------------------ DC circuits
  {
    id: 'ohm', group: 'DC circuits', title: "Ohm's law",
    aim: 'Show that the current through a resistor is proportional to the voltage across it, V = IR.',
    theory: '<p>For a fixed resistance the V–I graph is a straight line through the origin, and its slope is R. Change VAR 1 in steps, record the multimeter and A1 readings, and plot V against I.</p>',
    settings: { var1: 5 }, window: DC, controls: ['var1'], plot: ['dmm', 'a1'], record: ['var1', 'dmm', 'a1'],
    parts: [R('b10', 'b16', 1000)],
    wires: [...RAILS_TOP, w('tp10', 'a10'), w('a16', 'a1in'), w('a1out', 'tn22'), w('dmmV', 'd10'), w('dmmC', 'd16')],
    schematic: [two('V', 3, 12, 3, 4, { value: 5, label: 'VAR 1' }), W(3, 4, 8, 4), two('R', 8, 4, 14, 4, { value: 1000 }), two('AM', 14, 4, 18, 4, { label: 'A1' }), W(18, 4, 18, 12), W(18, 12, 3, 12), one('GND', 3, 12), W(8, 4, 8, 1), W(14, 4, 14, 1), two('VM', 14, 1, 8, 1, { label: 'DMM' })],
    expect: 'At 5 V the meter reads 5 V and A1 reads 5 mA. Doubling VAR 1 doubles the current.',
  },
  {
    id: 'series-parallel', group: 'DC circuits', title: 'Series and parallel resistors',
    aim: 'Verify R = R1 + R2 in series and 1/R = 1/R2 + 1/R3 in parallel.',
    theory: '<p>R2 = 2.2 kΩ and R3 = 3.3 kΩ in parallel give 1.32 kΩ. In series with R1 = 1 kΩ the total is 2.32 kΩ, so 10 V drives 4.31 mA. The voltage across the parallel pair is 4.31 mA × 1.32 kΩ = 5.69 V.</p>',
    settings: { var1: 10 }, window: DC, controls: ['var1'], plot: ['var1', 'a1'], record: ['var1', 'dmm', 'a1'],
    parts: [R('b10', 'b15', 1000), R('a15', 'a22', 2200), R('c15', 'c22', 3300)],
    wires: [...RAILS_TOP, w('tp10', 'a10'), w('d22', 'a1in'), w('a1out', 'tn28'), w('dmmV', 'e15'), w('dmmC', 'e22')],
    schematic: [two('V', 3, 12, 3, 3, { value: 10, label: 'VAR 1' }), W(3, 3, 6, 3), two('R', 6, 3, 11, 3, { value: 1000 }), W(11, 3, 13, 3), W(13, 3, 13, 5), W(13, 3, 17, 3), W(17, 3, 17, 5), two('R', 13, 5, 13, 9, { value: 2200 }), two('R', 17, 5, 17, 9, { value: 3300 }), W(13, 9, 17, 9), W(15, 9, 15, 10), two('AM', 15, 10, 15, 12, { label: 'A1' }), W(15, 12, 3, 12), one('GND', 3, 12)],
    expect: 'A1 reads about 4.31 mA and the multimeter about 5.69 V.',
  },
  {
    id: 'divider', group: 'DC circuits', title: 'Voltage divider',
    aim: 'Measure Vout = Vin · R2 / (R1 + R2).',
    theory: '<p>The same current flows through both resistors, so the voltage splits in proportion to resistance. With 10 V, 1 kΩ and 2 kΩ, Vout = 6.67 V.</p>',
    settings: { var1: 10 }, window: DC, controls: ['var1'], record: ['var1', 'dmm'],
    parts: [R('b10', 'b16', 1000), R('c16', 'c22', 2000)],
    wires: [...RAILS_TOP, w('tp10', 'a10'), w('a22', 'tn23'), w('dmmV', 'd16'), w('dmmC', 'd22')],
    schematic: preset('divider'),
    expect: 'The multimeter reads 6.67 V.',
  },
  {
    id: 'kvl-kcl', group: 'DC circuits', title: 'KVL and KCL',
    aim: 'Check that currents into a node sum to zero and voltages round a loop sum to zero.',
    theory: '<p>Three branches meet at node M: R1 from VAR 1 (12 V), R2 to ground, and R3 to VAR 2 (5 V). A1 measures the current arriving through R1, A2 the current leaving towards VAR 2. KCL says I(R2) = A1 − A2.</p>',
    settings: { var1: 12, var2: 5 }, window: DC, controls: ['var1', 'var2'], record: ['var1', 'var2', 'dmm', 'a1', 'a2'],
    parts: [R('b8', 'b13', 1000), R('c18', 'tn19', 2200), R('b23', 'b30', 470)],
    wires: [...RAILS_TOP, w('var2', 'bp2'), w('g2', 'bn3'), w('tp8', 'a8'), w('a13', 'a1in'), w('a1out', 'a18'), w('b18', 'a2in'), w('a2out', 'a23'), w('c30', 'bp31'), w('dmmV', 'd18'), w('dmmC', 'tn21')],
    schematic: preset('kvl'),
    expect: 'A1 ≈ 5.68 mA, A2 ≈ 2.81 mA, and the multimeter (across R2) ≈ 6.32 V, so R2 carries 2.87 mA = 5.68 − 2.81.',
  },
  {
    id: 'superposition', group: 'Network theorems', title: 'Superposition theorem',
    aim: 'Show that the current in R2 with both sources equals the sum of the currents with each source acting alone.',
    theory: '<p>Measure A1 with both sources. Then set VAR 2 to 0 V (an ideal source at 0 V is a short circuit) and measure again; then restore VAR 2, set VAR 1 to 0 V and measure. The two partial currents add up to the first reading.</p><p>Expected: 2.87 mA with both, 1.52 mA with VAR 1 only, 1.35 mA with VAR 2 only.</p>',
    settings: { var1: 12, var2: 5 }, window: DC, controls: ['var1', 'var2'], record: ['var1', 'var2', 'a1'],
    parts: [R('b8', 'b14', 1000), R('a14', 'a22', 470), R('c14', 'c19', 2200)],
    wires: [...RAILS_TOP, w('var2', 'bp2'), w('g2', 'bn3'), w('tp8', 'a8'), w('c22', 'bp23'), w('a19', 'a1in'), w('a1out', 'tn26'), w('dmmV', 'd14'), w('dmmC', 'd19')],
    schematic: [two('V', 3, 13, 3, 3, { value: 12, label: 'VAR 1' }), W(3, 3, 5, 3), two('R', 5, 3, 10, 3, { value: 1000 }), W(10, 3, 12, 3), two('R', 12, 3, 17, 3, { value: 470 }), W(17, 3, 19, 3), two('V', 19, 13, 19, 3, { value: 5, label: 'VAR 2' }), two('R', 10, 3, 10, 9, { value: 2200 }), two('AM', 10, 9, 10, 13, { label: 'A1' }), W(3, 13, 10, 13), W(10, 13, 19, 13), one('GND', 3, 13)],
    expect: 'A1 reads 2.87 mA with both sources on.',
  },
  {
    id: 'thevenin', group: 'Network theorems', title: "Thevenin's theorem",
    aim: 'Replace a network by a single source Vth in series with Rth and show the load current is unchanged.',
    theory: '<p>Seen from the load, R1 = R2 = 1 kΩ and R3 = 470 Ω with 10 V reduce to Vth = 10 × 1k / 2k = 5 V and Rth = (1k ∥ 1k) + 470 = 970 Ω.</p><p>The top half of the board is the original network with a 1 kΩ load (A1). The bottom half is the Thevenin equivalent: VAR 2 set to Vth and the potentiometer set to Rth, driving an identical load (A2). Both ammeters read the same current, 5 / (970 + 1000) = 2.54 mA.</p>',
    settings: { var1: 10, var2: 5, pot: { r: 10000, pos: 0.903 } }, window: DC, controls: ['var1', 'var2', 'pot'], record: ['var1', 'var2', 'pot', 'a1', 'a2'],
    parts: [R('b8', 'b14', 1000), R('c14', 'tn15', 1000), R('d14', 'd20', 470), R('b20', 'b26', 1000), R('h14', 'h20', 1000)],
    wires: [...RAILS_TOP, w('var2', 'bp2'), w('g2', 'bn3'), w('tp8', 'a8'), w('a26', 'a1in'), w('a1out', 'tn28'), w('bp8', 'j8'), w('i8', 'pot1'), w('potw', 'i14'), w('g20', 'a2in'), w('a2out', 'bn22'), w('dmmV', 'c20'), w('dmmC', 'c26')],
    schematic: [two('V', 2, 10, 2, 2, { value: 10, label: 'VAR 1' }), W(2, 2, 4, 2), two('R', 4, 2, 9, 2, { value: 1000 }), two('R', 9, 2, 9, 10, { value: 1000 }), two('R', 9, 2, 14, 2, { value: 470 }), two('R', 14, 2, 14, 7, { value: 1000, label: 'RL' }), two('AM', 14, 7, 14, 10, { label: 'A1' }), W(2, 10, 9, 10), W(9, 10, 14, 10), one('GND', 2, 10),
      two('V', 20, 10, 20, 2, { value: 5, label: 'Vth' }), W(20, 2, 22, 2), two('R', 22, 2, 27, 2, { value: 970, label: 'Rth' }), two('R', 27, 2, 27, 7, { value: 1000, label: 'RL' }), two('AM', 27, 7, 27, 10, { label: 'A2' }), W(20, 10, 27, 10), one('GND', 20, 10)],
    expect: 'A1 and A2 both read about 2.54 mA.',
  },
  {
    id: 'norton', group: 'Network theorems', title: "Norton's theorem",
    aim: 'Replace the same network by a current source IN in parallel with RN and show the load current is unchanged.',
    theory: '<p>IN is the short-circuit current at the load terminals: IN = Vth / Rth = 5 V / 970 Ω = 5.15 mA, and RN = Rth = 970 Ω.</p><p>The bottom half uses the constant-current source set to IN, with the potentiometer set to RN in parallel, feeding a 1 kΩ load through A2. The load current is IN × RN / (RN + RL) = 2.54 mA, the same as A1 in the original network.</p>',
    settings: { var1: 10, cc: 0.005155, pot: { r: 10000, pos: 0.903 } }, window: DC, controls: ['var1', 'cc', 'pot'], record: ['cc', 'pot', 'a1', 'a2'],
    parts: [R('b8', 'b14', 1000), R('c14', 'tn15', 1000), R('d14', 'd20', 470), R('b20', 'b26', 1000), R('h10', 'h16', 1000)],
    wires: [...RAILS_TOP, w('g2', 'bn3'), w('tp8', 'a8'), w('a26', 'a1in'), w('a1out', 'tn28'), w('ccp', 'j10'), w('ccn', 'bn13'), w('i10', 'pot1'), w('potw', 'bn14'), w('g16', 'a2in'), w('a2out', 'bn19')],
    schematic: [two('V', 2, 10, 2, 2, { value: 10, label: 'VAR 1' }), W(2, 2, 4, 2), two('R', 4, 2, 9, 2, { value: 1000 }), two('R', 9, 2, 9, 10, { value: 1000 }), two('R', 9, 2, 14, 2, { value: 470 }), two('R', 14, 2, 14, 7, { value: 1000, label: 'RL' }), two('AM', 14, 7, 14, 10, { label: 'A1' }), W(2, 10, 9, 10), W(9, 10, 14, 10), one('GND', 2, 10),
      two('I', 20, 10, 20, 2, { value: 0.005155, label: 'IN' }), W(20, 2, 24, 2), two('R', 24, 2, 24, 10, { value: 970, label: 'RN' }), W(24, 2, 28, 2), two('R', 28, 2, 28, 7, { value: 1000, label: 'RL' }), two('AM', 28, 7, 28, 10, { label: 'A2' }), W(20, 10, 24, 10), W(24, 10, 28, 10), one('GND', 20, 10)],
    expect: 'A1 and A2 both read about 2.54 mA.',
  },
  {
    id: 'max-power', group: 'Network theorems', title: 'Maximum power transfer',
    aim: 'Find the load resistance that takes the most power from a source with 1 kΩ internal resistance.',
    theory: '<p>The potentiometer is the load. P = V × I peaks when RL = Rs = 1 kΩ, where the load gets 25 mW from 10 V. Turn the pot, record the multimeter and A1, and plot P against RL.</p>',
    settings: { var1: 10, pot: { r: 10000, pos: 0.9 } }, window: DC, controls: ['var1', 'pot'], plot: ['pot', 'power'], record: ['pot', 'dmm', 'a1', 'power'],
    parts: [R('b8', 'b14', 1000)],
    wires: [...RAILS_TOP, w('tp8', 'a8'), w('a14', 'a1in'), w('a1out', 'pot1'), w('potw', 'tn20'), w('dmmV', 'c14'), w('dmmC', 'tn22')],
    schematic: [two('V', 3, 12, 3, 4, { value: 10, label: 'VAR 1' }), W(3, 4, 5, 4), two('R', 5, 4, 10, 4, { value: 1000, label: 'Rs' }), two('AM', 10, 4, 14, 4, { label: 'A1' }), two('R', 14, 4, 14, 12, { value: 1000, label: 'RL (pot)' }), W(14, 12, 3, 12), one('GND', 3, 12)],
    expect: 'With the pot at 1 kΩ the multimeter reads 5 V and A1 5 mA, so P = 25 mW, the maximum.',
  },
  // ------------------------------------------------------------ RC, RL, RLC
  {
    id: 'rc-charge', group: 'RC and RLC', title: 'RC charging and discharging',
    aim: 'Observe the exponential charge and discharge of a capacitor and measure the time constant τ = RC.',
    theory: '<p>With 10 kΩ and 10 µF, τ = 0.1 s. Close S1 and CH1 (the capacitor) rises to 63 % of 5 V after one τ. Open S1 and close S2 to discharge it through the second 10 kΩ.</p>',
    settings: { var1: 5, s1: false, s2: false }, window: 0.8, controls: ['var1', 's1', 's2'], scope: true,
    parts: [R('b12', 'b18', 10000), CE('c18', 'tn19', 10e-6), R('d18', 'd24', 10000)],
    wires: [...RAILS_TOP, w('tp8', 's1a'), w('s1b', 'a12'), w('a24', 's2a'), w('s2b', 'tn25'), w('ch1', 'e18'), w('ch2', 'c12')],
    schematic: preset('rc-charge'),
    expect: 'CH1 reaches about 3.2 V one time constant (0.1 s) after S1 closes.',
  },
  {
    id: 'rc-lowpass', group: 'RC and RLC', title: 'RC low-pass filter',
    aim: 'Measure the attenuation and phase shift of a first-order low-pass filter.',
    theory: '<p>fc = 1 / (2πRC) = 1 / (2π × 1 kΩ × 150 nF) ≈ 1.06 kHz. At fc the output (CH2) is 0.707 of the input (CH1) and lags by 45°. Sweep the generator from 100 Hz to 10 kHz and record the output amplitude.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 5, offset: 0 } }, window: 0.004, controls: ['fg'], scope: true,
    parts: [R('b8', 'b14', 1000), C('c14', 'tn15', 150e-9)],
    wires: [w('g3', 'tn3'), w('fg', 'a8'), w('ch1', 'd8'), w('ch2', 'd14')],
    schematic: preset('rc-lowpass'),
    expect: 'At 1 kHz CH2 peaks at about 3.6 V against 5 V on CH1.',
  },
  {
    id: 'rc-highpass', group: 'RC and RLC', title: 'RC high-pass filter',
    aim: 'Measure the response of a first-order high-pass filter.',
    theory: '<p>Swap R and C and the filter passes high frequencies instead. The cut-off is the same 1.06 kHz; below it the output falls by 20 dB per decade and leads the input.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 5, offset: 0 } }, window: 0.004, controls: ['fg'], scope: true,
    parts: [C('b8', 'b14', 150e-9), R('c14', 'tn15', 1000)],
    wires: [w('g3', 'tn3'), w('fg', 'a8'), w('ch1', 'd8'), w('ch2', 'd14')],
    schematic: [two('AC', 4, 14, 4, 4, { amp: 5, freq: 1000, offset: 0, wave: 'sine', label: 'FG' }), W(4, 4, 8, 4), two('C', 8, 4, 14, 4, { value: 150e-9 }), two('R', 14, 4, 14, 14, { value: 1000 }), W(14, 14, 4, 14), one('GND', 4, 14)],
    expect: 'At 1 kHz CH2 is about 0.7 of CH1 and leads it.',
  },
  {
    id: 'rlc', group: 'RC and RLC', title: 'Series RLC response',
    aim: 'Observe under-damped ringing in a series RLC circuit and relate it to f0 and damping.',
    theory: '<p>f0 = 1 / (2π√LC) ≈ 1.6 kHz with 10 mH and 1 µF. With only 22 Ω the circuit is under-damped, so the capacitor voltage (CH2) rings after each edge of the square wave. Critical damping needs R = 2√(L/C) = 200 Ω.</p>',
    settings: { fg: { wave: 'square', freq: 100, amp: 2, offset: 2 } }, window: 0.01, controls: ['fg'], scope: true,
    parts: [R('b8', 'b12', 22), L('c12', 'c18', 10e-3), C('d18', 'tn19', 1e-6)],
    wires: [w('g3', 'tn3'), w('fg', 'a8'), w('ch1', 'd8'), w('ch2', 'e18')],
    schematic: preset('rlc'),
    expect: 'CH2 overshoots to nearly 8 V and rings at about 1.6 kHz.',
  },
  // ------------------------------------------------------------ diodes
  {
    id: 'diode-vi', group: 'Diodes', title: 'Diode forward characteristic',
    aim: 'Plot the forward V–I curve of a silicon diode and find its cut-in voltage.',
    theory: '<p>Below about 0.5 V almost no current flows. Above it the current rises steeply while the diode voltage barely moves past 0.7 V. Step VAR 1 from 0 to 5 V, record the multimeter (Vd) and A1 (I), and plot.</p>',
    settings: { var1: 3 }, window: DC, controls: ['var1'], plot: ['dmm', 'a1'], record: ['var1', 'dmm', 'a1'],
    parts: [R('b8', 'b13', 220), D('b18', 'tn19')],
    wires: [...RAILS_TOP, w('tp8', 'a8'), w('a13', 'a1in'), w('a1out', 'a18'), w('dmmV', 'c18'), w('dmmC', 'tn21')],
    schematic: [two('V', 3, 12, 3, 4, { value: 3, label: 'VAR 1' }), W(3, 4, 5, 4), two('R', 5, 4, 10, 4, { value: 220 }), two('AM', 10, 4, 14, 4, { label: 'A1' }), two('D', 14, 4, 14, 12), W(14, 12, 3, 12), one('GND', 3, 12)],
    expect: 'At 3 V the diode drops about 0.68 V and about 10.5 mA flows.',
  },
  {
    id: 'half-wave', group: 'Diodes', title: 'Half-wave rectifier with filter',
    aim: 'Rectify a sine wave and see how a reservoir capacitor smooths the output.',
    theory: '<p>The diode conducts only on positive half-cycles. Close S1 to add 100 µF across the 1 kΩ load; the output (CH2) becomes DC with a ripple of roughly I / (fC).</p>',
    settings: { fg: { wave: 'sine', freq: 50, amp: 12, offset: 0 }, s1: false }, window: 0.06, controls: ['fg', 's1'], scope: true,
    parts: [D('b8', 'b13'), R('c13', 'tn14', 1000), CE('b19', 'tn20', 100e-6)],
    wires: [w('g3', 'tn3'), w('fg', 'a8'), w('d13', 's1a'), w('s1b', 'a19'), w('ch1', 'e8'), w('ch2', 'e13')],
    schematic: preset('half-wave'),
    expect: 'Without the capacitor CH2 shows half sine pulses peaking near 11.3 V.',
  },
  {
    id: 'clipper', group: 'Diodes', title: 'Diode clipper',
    aim: 'Clip the positive half of a waveform at the diode forward voltage.',
    theory: '<p>While the input is below about 0.6 V the diode is off and the output follows the input. Above that it conducts and holds the output near 0.7 V; the resistor drops the rest.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 5, offset: 0 } }, window: 0.004, controls: ['fg'], scope: true,
    parts: [R('b8', 'b14', 1000), D('c14', 'tn15')],
    wires: [w('g3', 'tn3'), w('fg', 'a8'), w('ch1', 'd8'), w('ch2', 'd14')],
    schematic: [two('AC', 4, 14, 4, 4, { amp: 5, freq: 1000, offset: 0, wave: 'sine', label: 'FG' }), W(4, 4, 8, 4), two('R', 8, 4, 14, 4, { value: 1000 }), two('D', 14, 4, 14, 14), W(14, 14, 4, 14), one('GND', 4, 14)],
    expect: 'CH2 follows the negative half but flattens at about +0.75 V.',
  },
  {
    id: 'zener', group: 'Diodes', title: 'Zener voltage regulator',
    aim: 'Hold a load voltage steady with a Zener diode while the supply changes.',
    theory: '<p>The 5.1 V Zener sits reverse-biased across the load. Vary VAR 1 from 7 V to 15 V: the multimeter barely moves while the 220 Ω resistor drops the difference. Rs = (Vin − Vz) / (Iz + IL).</p>',
    settings: { var1: 12 }, window: DC, controls: ['var1'], plot: ['var1', 'dmm'], record: ['var1', 'dmm', 'a1'],
    parts: [R('b8', 'b14', 220), Z('tn15', 'c14', 5.1), R('d14', 'd20', 1000)],
    wires: [...RAILS_TOP, w('tp8', 'a8'), w('a20', 'a1in'), w('a1out', 'tn22'), w('dmmV', 'e14'), w('dmmC', 'tn23')],
    schematic: preset('zener'),
    expect: 'The multimeter stays near 5.1 V and A1 near 5.1 mA for any VAR 1 above about 7 V.',
  },
  {
    id: 'led', group: 'Diodes', title: 'LED with a series resistor',
    aim: 'Limit LED current with a resistor and measure the forward voltage.',
    theory: '<p>R = (Vs − Vf) / I. With 5 V, a red LED (Vf ≈ 1.8 V) and 330 Ω you get about 10 mA. Remove the resistor in your head: the LED would draw far more and burn out.</p>',
    settings: { var1: 5, s1: true }, window: DC, controls: ['var1', 's1'], plot: ['dmm', 'a1'], record: ['var1', 'dmm', 'a1'],
    parts: [R('b12', 'b17', 330), LED('b22', 'tn23', 'red')],
    wires: [...RAILS_TOP, w('tp8', 's1a'), w('s1b', 'a12'), w('a17', 'a1in'), w('a1out', 'a22'), w('dmmV', 'c22'), w('dmmC', 'tn25')],
    schematic: preset('led'),
    expect: 'A1 reads about 9.7 mA and the multimeter about 1.8 V.',
  },
  // ------------------------------------------------------------ transistors
  {
    id: 'bjt-switch', group: 'Transistors', title: 'BJT as a switch',
    aim: 'Use a small base current to switch a larger collector current through an LED.',
    theory: '<p>With S1 closed, about 0.8 mA flows into the base through 10 kΩ. That saturates the BC547, so VCE drops to about 0.1 V and the LED lights. Open S1: no base current, no collector current.</p>',
    settings: { var1: 9, s1: true }, window: DC, controls: ['var1', 's1'], record: ['var1', 'dmm'],
    parts: [R('tp14', 'a14', 470), LED('b14', 'b20', 'green'), NPN('d', 21), R('a21', 'a27', 10000)],
    wires: [...RAILS_TOP, w('a22', 'tn23'), w('b27', 's1b'), w('s1a', 'tp29'), w('dmmV', 'c20'), w('dmmC', 'c22')],
    schematic: preset('bjt-switch'),
    expect: 'The multimeter (VCE) reads about 0.1 V with S1 closed and the full supply with S1 open.',
  },
  {
    id: 'ce-amp', group: 'Transistors', title: 'Common-emitter amplifier',
    aim: 'Bias a BJT with a voltage divider and measure its small-signal voltage gain.',
    theory: '<p>R1 and R2 set the base near 2.1 V, so about 1.4 mA flows in the emitter. The bypass capacitor shorts RE for the signal, giving a gain of roughly −(RC ∥ RL) / re with re = 25 mV / IE. The output (CH2) is an inverted, much larger copy of the 10 mV input (CH1).</p>',
    settings: { var1: 12, fg: { wave: 'sine', freq: 1000, amp: 0.01, offset: 0 } }, window: 0.003, controls: ['var1', 'fg'], scope: true,
    parts: [NPN('c', 31), R('tp31', 'a31', 47000), R('b31', 'tn34', 10000), R('tp28', 'a30', 4700), R('a32', 'tn35', 1000), CE('b32', 'tn37', 100e-6), CE('d31', 'd24', 10e-6), CE('d30', 'd40', 10e-6), R('a40', 'tn41', 10000)],
    wires: [...RAILS_TOP, w('fg', 'a24'), w('ch1', 'e24'), w('ch2', 'e40')],
    schematic: preset('ce-amp'),
    expect: 'CH2 swings about ±1.5 V, inverted, for a ±10 mV input.',
  },
  // ------------------------------------------------------------ op-amps
  {
    id: 'oa-inverting', group: 'Op-amps', title: 'Inverting amplifier',
    aim: 'Build an inverting amplifier with a µA741 and verify gain = −Rf / Rin.',
    theory: '<p>Negative feedback holds IN− at virtual ground, so the input current Vin / Rin all flows through Rf. With 10 kΩ and 1 kΩ the gain is −10: a 0.5 V input gives a 5 V output, inverted. The 741 needs ±12 V on pins 7 and 4.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 0.5, offset: 0 } }, window: 0.003, controls: ['fg'], scope: true,
    parts: [OA(30), R('h24', 'h31', 1000), R('i31', 'i38', 10000), R('h38', 'bn40', 10000)],
    wires: [...OPAMP_PWR, w('fg', 'j24'), w('b32', 'g38'), w('g32', 'bn34'), w('ch1', 'g24'), w('ch2', 'j38')],
    schematic: preset('inverting'),
    expect: 'CH2 is a 5 V peak sine, upside-down relative to CH1.',
  },
  {
    id: 'oa-noninverting', group: 'Op-amps', title: 'Non-inverting amplifier',
    aim: 'Verify gain = 1 + Rf / Rg for a non-inverting amplifier.',
    theory: '<p>The input goes straight to IN+, and the divider Rf–Rg feeds part of the output back to IN−. Gain = 1 + 10k / 2.2k ≈ 5.5, with the output in phase with the input.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 1, offset: 0 } }, window: 0.003, controls: ['fg'], scope: true,
    parts: [OA(30), R('h31', 'bn31', 2200), R('i31', 'i38', 10000), R('h38', 'bn40', 10000)],
    wires: [...OPAMP_PWR, w('fg', 'j32'), w('b32', 'g38'), w('ch1', 'i32'), w('ch2', 'j38')],
    schematic: preset('noninverting'),
    expect: 'CH2 peaks at about 5.5 V, in phase with CH1.',
  },
  {
    id: 'oa-follower', group: 'Op-amps', title: 'Voltage follower',
    aim: 'Show that a unity-gain buffer copies its input while drawing almost no current.',
    theory: '<p>The output is tied straight to IN−, so Vout = Vin. Its use is impedance: the input draws next to nothing, while the output can drive a load.</p>',
    settings: { fg: { wave: 'sine', freq: 1000, amp: 2, offset: 0 } }, window: 0.003, controls: ['fg'], scope: true,
    parts: [OA(30), R('c32', 'tn34', 10000)],
    wires: [...OPAMP_PWR, w('fg', 'j32'), w('b32', 'g31'), w('ch1', 'i32'), w('ch2', 'd32')],
    schematic: [two('AC', 4, 14, 4, 9, { amp: 2, freq: 1000, offset: 0, wave: 'sine', label: 'FG' }), W(4, 9, 14, 9), one('OA', 14, 8, { vsat: 10.5 }), W(14, 7, 14, 4), W(14, 4, 20, 4), W(20, 4, 20, 8), W(18, 8, 20, 8), W(20, 8, 24, 8), two('R', 24, 8, 24, 14, { value: 10000 }), W(4, 14, 24, 14), one('GND', 4, 14)],
    expect: 'CH1 and CH2 overlap exactly.',
  },
  {
    id: 'oa-summing', group: 'Op-amps', title: 'Summing amplifier',
    aim: 'Add a DC voltage and a sine wave with an inverting summer.',
    theory: '<p>Each input sends its own current into the virtual-ground node, and Rf turns the total back into a voltage: Vout = −Rf (V1 / R1 + V2 / R2). With all resistors 10 kΩ, Vout = −(VAR 1 + FG) = −(2 V + 1 V sin ωt), so CH2 swings between −1 V and −3 V.</p>',
    settings: { var1: 2, fg: { wave: 'sine', freq: 1000, amp: 1, offset: 0 } }, window: 0.003, controls: ['var1', 'fg'], scope: true,
    parts: [OA(30), R('h24', 'h31', 10000), R('g27', 'g31', 10000), R('i31', 'i38', 10000)],
    wires: [...OPAMP_PWR, w('fg', 'j24'), w('var1', 'j27'), w('b32', 'g38'), w('g32', 'bn34'), w('ch1', 'g24'), w('ch2', 'j38')],
    schematic: [two('AC', 2, 14, 2, 7, { amp: 1, freq: 1000, offset: 0, wave: 'sine', label: 'FG' }), W(2, 7, 6, 7), two('R', 6, 7, 14, 7, { value: 10000 }), two('V', 4, 14, 4, 10, { value: 2, label: 'VAR 1' }), W(4, 10, 8, 10), two('R', 8, 10, 12, 10, { value: 10000 }), W(12, 10, 12, 7), one('OA', 14, 8, { vsat: 10.5 }), W(14, 7, 14, 4), two('R', 14, 4, 20, 4, { value: 10000 }), W(20, 4, 20, 8), W(18, 8, 20, 8), W(14, 9, 14, 14), W(2, 14, 20, 14), one('GND', 2, 14)],
    expect: 'CH2 is a sine between about −1 V and −3 V.',
  },
  {
    id: 'oa-comparator', group: 'Op-amps', title: 'Comparator',
    aim: 'Turn a sine wave into a square wave by comparing it with a reference.',
    theory: '<p>With no feedback the 741 swings to a rail whenever its inputs differ. IN+ gets the sine and IN− gets VAR 1 as the reference, so the output is +10.5 V while the sine is above the reference and −10.5 V below it. Raise VAR 1 and the high part of the square wave gets shorter.</p>',
    settings: { var1: 2.5, fg: { wave: 'sine', freq: 1000, amp: 5, offset: 0 } }, window: 0.003, controls: ['var1', 'fg'], scope: true,
    parts: [OA(30), R('d32', 'tn34', 10000)],
    wires: [...OPAMP_PWR, w('fg', 'j32'), w('var1', 'j31'), w('ch1', 'i32'), w('ch2', 'c32')],
    schematic: preset('comparator'),
    expect: 'CH2 is a square wave between about +10.5 V and −10.5 V, high for less than half of each cycle.',
  },
  {
    id: 'oa-integrator', group: 'Op-amps', title: 'Integrator',
    aim: 'Integrate a square wave into a triangle wave.',
    theory: '<p>The capacitor in the feedback path makes Vout = −(1 / RC) ∫ Vin dt. A ±1 V square wave at 1 kHz with RC = 1 ms gives a triangle of about 0.5 V peak-to-peak. The 1 MΩ resistor across C stops the output drifting into a rail.</p>',
    settings: { fg: { wave: 'square', freq: 1000, amp: 1, offset: 0 } }, window: 0.004, controls: ['fg'], scope: true,
    parts: [OA(30), R('h24', 'h31', 10000), C('i31', 'i38', 100e-9), R('j31', 'j38', 1e6)],
    wires: [...OPAMP_PWR, w('fg', 'j24'), w('b32', 'g38'), w('g32', 'bn34'), w('ch1', 'g24'), w('ch2', 'h38')],
    schematic: preset('integrator'),
    expect: 'CH2 is a triangle wave about 0.5 V peak-to-peak.',
  },
  // ------------------------------------------------------------ measurements
  {
    id: 'wheatstone', group: 'Measurements', title: 'Wheatstone bridge',
    aim: 'Find an unknown resistance by balancing a Wheatstone bridge.',
    theory: '<p>The bridge is balanced when no voltage appears between its two middle points, which happens when R1 / Rx = R2 / Rv. Here R1 = R2 = 1 kΩ, so at balance the potentiometer Rv equals the unknown Rx.</p><p>Turn the potentiometer until the multimeter (acting as the null detector) reads 0 V, then read Rx straight off the pot. The unknown here is 1.5 kΩ.</p>',
    settings: { var1: 10, pot: { r: 10000, pos: 0.5 } }, window: DC, controls: ['var1', 'pot'], plot: ['pot', 'dmm'], record: ['pot', 'dmm'],
    parts: [R('b8', 'b14', 1000), R('c8', 'c20', 1000), R('d14', 'tn15', 1500)],
    wires: [...RAILS_TOP, w('tp8', 'a8'), w('d20', 'pot1'), w('potw', 'tn22'), w('dmmV', 'e14'), w('dmmC', 'e20')],
    schematic: [two('V', 2, 12, 2, 2, { value: 10, label: 'VAR 1' }), W(2, 2, 8, 2), two('R', 8, 2, 8, 7, { value: 1000, label: 'R1' }), two('R', 8, 7, 8, 12, { value: 1500, label: 'Rx' }), W(8, 2, 16, 2), two('R', 16, 2, 16, 7, { value: 1000, label: 'R2' }), two('R', 16, 7, 16, 12, { value: 1500, label: 'Rv (pot)' }), W(8, 12, 16, 12), W(2, 12, 8, 12), one('GND', 2, 12), two('VM', 16, 7, 8, 7, { label: 'DMM' })],
    expect: 'At first the meter reads about −2.3 V. It reaches 0 V when the pot (1–W) is set to 1.5 kΩ.',
  },
  // ------------------------------------------------------------ practical circuits
  {
    id: 'ne555-astable', group: 'Practical circuits', title: '555 timer LED blinker',
    aim: 'Build an astable 555 oscillator and measure its frequency and duty cycle.',
    theory: '<p>The capacitor charges through R1 + R2 and discharges through R2 alone, swinging between 1/3 and 2/3 of the supply. f = 1.44 / ((R1 + 2R2) C) and the duty cycle is (R1 + R2) / (R1 + 2R2).</p><p>With R1 = 1 kΩ, R2 = 10 kΩ and C = 10 µF: f ≈ 6.9 Hz, duty ≈ 52 %. CH1 shows the output, CH2 the capacitor voltage.</p>',
    settings: { var1: 9 }, window: 1, controls: ['var1'], scope: true,
    parts: [{ type: 'NE555', col: 29 }, R('tp25', 'b26', 1000), R('d26', 'd38', 10000), CE('a38', 'tn39', 10e-6), C('a33', 'tn34', 10e-9), R('h32', 'h37', 470), LED('i37', 'bn38', 'red')],
    wires: [...RAILS_TOP, w('g2', 'bn3'), w('tp4', 'bp4'), w('a30', 'tp31'), w('j30', 'bn31'), w('j33', 'bp34'), w('a31', 'a26'), w('d32', 'g31'), w('c32', 'c38'), w('ch1', 'g32'), w('ch2', 'e38')],
    schematic: [two('V', 2, 14, 2, 1, { value: 9, label: 'VAR 1' }), W(2, 1, 20, 1), two('R', 8, 1, 8, 5, { value: 1000, label: 'R1' }), two('R', 8, 5, 8, 9, { value: 10000, label: 'R2' }), two('C', 8, 9, 8, 14, { value: 10e-6 }), W(8, 9, 12, 9), W(8, 5, 12, 5), W(2, 14, 20, 14), one('GND', 2, 14), two('R', 16, 7, 20, 7, { value: 470 }), two('LED', 20, 7, 20, 14)],
    expect: 'The LED blinks about 7 times a second. CH2 swings between 3 V and 6 V.',
  },
  {
    id: 'lm7805', group: 'Practical circuits', title: '7805 regulated 5 V supply',
    aim: 'Show that a 7805 holds its output at 5 V while the input changes.',
    theory: '<p>The 7805 needs its input at least about 2 V above its output (the dropout voltage). Vary VAR 1 from 5 V to 15 V and record the output: below about 7 V the output follows the input minus 2 V; above it the output stays at 5 V.</p>',
    settings: { var1: 12 }, window: DC, controls: ['var1'], plot: ['var1', 'dmm'], record: ['var1', 'dmm', 'a1'],
    parts: [{ type: 'LM7805', holes: ['c20', 'c21', 'c22'] }, R('b22', 'b28', 1000)],
    wires: [...RAILS_TOP, w('a20', 'tp19'), w('a21', 'tn22'), w('a28', 'a1in'), w('a1out', 'tn29'), w('dmmV', 'd22'), w('dmmC', 'tn25')],
    schematic: [two('V', 2, 10, 2, 3, { value: 12, label: 'VAR 1' }), W(2, 3, 7, 3), two('R', 7, 3, 12, 3, { value: 0, label: '7805' }), two('R', 14, 3, 14, 7, { value: 1000 }), W(12, 3, 14, 3), two('AM', 14, 7, 14, 10, { label: 'A1' }), W(2, 10, 14, 10), one('GND', 2, 10)],
    expect: 'The multimeter reads 5.00 V and A1 5 mA for any VAR 1 above about 7 V.',
  },
  {
    id: 'mosfet-switch', group: 'Practical circuits', title: 'MOSFET switch (IRF540)',
    aim: 'Switch a load with an N-channel MOSFET driven from a 5 V logic signal.',
    theory: '<p>A MOSFET is voltage-controlled: once the gate is a few volts above the source it conducts, and almost no gate current flows. S1 connects the gate to 5 V; the 10 kΩ pull-down turns it firmly off when S1 opens. With the LED lit, VDS (multimeter) is only a few millivolts.</p>',
    settings: { var1: 12, var2: 5, s1: true }, window: DC, controls: ['var1', 'var2', 's1'], record: ['var2', 'dmm'],
    parts: [{ type: 'IRF540', holes: ['c20', 'c21', 'c22'] }, R('tp16', 'a16', 1000), LED('b16', 'b21', 'green'), R('a20', 'tn19', 10000)],
    wires: [...RAILS_TOP, w('a22', 'tn23'), w('var2', 's1a'), w('s1b', 'b20'), w('dmmV', 'd21'), w('dmmC', 'd22')],
    schematic: [two('V', 2, 12, 2, 2, { value: 12, label: 'VAR 1' }), W(2, 2, 14, 2), two('R', 14, 2, 14, 5, { value: 1000 }), two('LED', 14, 5, 14, 8), W(14, 8, 14, 9), two('R', 10, 9, 10, 12, { value: 10000 }), two('SW', 6, 9, 10, 9), W(2, 12, 14, 12), W(14, 9, 14, 12), one('GND', 2, 12)],
    expect: 'With S1 closed the LED lights and VDS is close to 0 V. Open S1 and the LED goes out.',
  },
  {
    id: 'lm358-comparator', group: 'Practical circuits', title: 'Single-supply comparator (LM358)',
    aim: 'Turn on an LED when a voltage rises past a set threshold, using an LM358 on a single 5 V supply.',
    theory: '<p>The LM358 works from one supply and its output can swing down to 0 V, which suits battery and 5 V circuits. Two 10 kΩ resistors set a 2.5 V reference on IN−. The potentiometer feeds IN+: turn it past 2.5 V (the multimeter shows IN+) and the output jumps high, lighting the LED.</p>',
    settings: { var1: 5, pot: { r: 10000, pos: 0.7 } }, window: DC, controls: ['var1', 'pot'], plot: ['pot', 'dmm'], record: ['pot', 'dmm'],
    parts: [{ type: 'LM358', col: 29 }, R('tp26', 'a26', 10000), R('b26', 'tn27', 10000), R('h30', 'h25', 330), LED('i25', 'bn23', 'yellow')],
    wires: [...RAILS_TOP, w('g2', 'bn3'), w('a30', 'tp31'), w('j33', 'bn34'), w('pot1', 'tp37'), w('pot3', 'tn38'), w('potw', 'j32'), w('c26', 'i31'), w('dmmV', 'g32'), w('dmmC', 'tn29')],
    schematic: [two('V', 2, 12, 2, 2, { value: 5, label: 'VAR 1' }), W(2, 2, 18, 2), two('R', 6, 2, 6, 7, { value: 10000 }), two('R', 6, 7, 6, 12, { value: 10000 }), W(6, 7, 10, 7), one('OA', 10, 8, { vsat: 3.5 }), two('R', 10, 2, 10, 12, { value: 10000, label: 'pot' }), two('R', 14, 8, 18, 8, { value: 330 }), two('LED', 18, 8, 18, 12), W(2, 12, 18, 12), one('GND', 2, 12)],
    expect: 'With the pot at 3 kΩ (W–3 = 7 kΩ) IN+ is 3.5 V, so the LED is on. Below 2.5 V it goes off.',
  },
];

export const AGROUPS = [...new Set(AEXPERIMENTS.map(e => e.group))];
