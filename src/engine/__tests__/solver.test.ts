import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetlist } from '../netlist';
import { extractTheveninNorton, runSimulation } from '../mna';
import { CircuitState } from '../../types/circuit';

function approx(actual: number, expected: number, tol = 1e-3, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );
}

test('Benchmark 1: Mạch DC có điện trở + nguồn dòng + nguồn áp', () => {
  // E1 = 24V (A -> GND), R1 = 6 Ohm (A -> B), R2 = 12 Ohm (B -> GND),
  // R3 = 4 Ohm (B -> GND), J1 = 3A bơm từ GND lên B.
  // Giải tích: (Vb - 24)/6 + Vb/12 + Vb/4 = 3 => Vb = 14 V
  // I_R1 = 5/3 A, I_R2 = 7/6 A, I_R3 = 3.5 A, P_gen = P_cons = 82 W
  const state: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 24 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 6 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 160, y: 0, rotation: 90, resistance: 12 },
      { id: 'r3', name: 'R3', type: 'RESISTOR', x: 240, y: 0, rotation: 90, resistance: 4 },
      { id: 'j1', name: 'J1', type: 'I_SRC', x: 320, y: 0, rotation: 0, waveform: 'DC', dcValue: 3 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 120, y: -40 }, { x: 160, y: -40 }, { x: 240, y: -40 }, { x: 320, y: -40 }] },
      { id: 'w3', points: [{ x: 0, y: 40 }, { x: 160, y: 40 }, { x: 240, y: 40 }, { x: 320, y: 40 }] },
    ],
  };

  const res = runSimulation(state, 'DC');
  assert.equal(res.success, true);

  const r1 = res.elements.find((e) => e.elementId === 'r1')!;
  const r2 = res.elements.find((e) => e.elementId === 'r2')!;
  const r3 = res.elements.find((e) => e.elementId === 'r3')!;
  const e1 = res.elements.find((e) => e.elementId === 'e1')!;
  const j1 = res.elements.find((e) => e.elementId === 'j1')!;

  approx(r2.voltageDc, 14, 1e-4, 'V_B');
  approx(r1.currentDc, 5 / 3, 1e-4, 'I_R1');
  approx(r2.currentDc, 7 / 6, 1e-4, 'I_R2');
  approx(r3.currentDc, 3.5, 1e-4, 'I_R3');
  approx(e1.pWatts, -40, 1e-3, 'P_E1');
  approx(j1.pWatts, -42, 1e-3, 'P_J1');
  approx(res.powerBalance!.pGenerated, 82, 1e-3, 'P_gen');
  approx(res.powerBalance!.pConsumed, 82, 1e-3, 'P_cons');
});

test('Benchmark 2: Mạch AC xác lập có R, L, C và Hỗ cảm M', () => {
  // omega = 100 rad/s => f = 100 / (2*PI) Hz
  // Vòng 1: E1 = 100∠0° Vrms -> R1 = 10 -> L1 = 0.2H (X_L1 = 20) -> C1 = 1e-3 F (X_C1 = -10) -> GND
  // Vòng 2: L2 = 0.1H (X_L2 = 10) -> R2 = 10 -> GND; M = 0.1H (X_M = 10, dotPolarity = +1)
  // Giải tích: Z11 = 10 + j10, Z22 = 10 + j10, Zm = j10
  // I1 = 6 - j2 A (|I1| = sqrt(40), pha = -18.435°), I2 = -4 - j2 A (|I2| = sqrt(20), pha = -153.435°)
  // P_R1 = 400 W, P_R2 = 200 W, P_nguồn = 600 W, Q_nguồn = 200 VAr
  const freqHz = 100 / (2 * Math.PI);
  const state: CircuitState = {
    elements: [
      {
        id: 'e1',
        name: 'E1',
        type: 'V_SRC',
        x: 0,
        y: 0,
        rotation: 0,
        waveform: 'AC',
        acValue: 100,
        amplitudeType: 'RMS',
        phaseDeg: 0,
        freqHz,
      },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 10 },
      { id: 'l1', name: 'L1', type: 'INDUCTOR', x: 160, y: -40, rotation: 0, inductance: 0.2 },
      { id: 'c1', name: 'C1', type: 'CAPACITOR', x: 200, y: 0, rotation: 90, capacitance: 1e-3 },
      { id: 'l2', name: 'L2', type: 'INDUCTOR', x: 320, y: -40, rotation: 0, inductance: 0.1 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 360, y: 0, rotation: 90, resistance: 10 },
      { id: 'm1', name: 'M1', type: 'MUTUAL', x: 240, y: -100, rotation: 0, l1Id: 'l1', l2Id: 'l2', mutualM: 0.1, dotPolarity: 1 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 200, y: 40 }, { x: 280, y: 40 }, { x: 360, y: 40 }] },
      { id: 'w3', points: [{ x: 280, y: 40 }, { x: 280, y: -40 }] },
    ],
  };

  const res = runSimulation(state, 'AC');
  assert.equal(res.success, true);

  const l1 = res.elements.find((e) => e.elementId === 'l1')!;
  const l2 = res.elements.find((e) => e.elementId === 'l2')!;
  const r1 = res.elements.find((e) => e.elementId === 'r1')!;
  const r2 = res.elements.find((e) => e.elementId === 'r2')!;
  const c1 = res.elements.find((e) => e.elementId === 'c1')!;
  const e1 = res.elements.find((e) => e.elementId === 'e1')!;

  approx(l1.currentRms, Math.sqrt(40), 1e-3, '|I1|');
  approx(l1.currentPhasorDeg!, (Math.atan2(-2, 6) * 180) / Math.PI, 1e-2, 'angle(I1)');
  approx(l2.currentRms, Math.sqrt(20), 1e-3, '|I2|');
  approx(l2.currentPhasorDeg!, (Math.atan2(-2, -4) * 180) / Math.PI, 1e-2, 'angle(I2)');

  approx(r1.pWatts, 400, 1e-2, 'P_R1');
  approx(r2.pWatts, 200, 1e-2, 'P_R2');
  approx(c1.qVars, -400, 1e-2, 'Q_C1');
  approx(e1.pWatts, -600, 1e-2, 'P_E1');
  approx(e1.qVars, -200, 1e-2, 'Q_E1');
  approx(res.powerBalance!.pGenerated, 600, 1e-2, 'AC P_gen');
  approx(res.powerBalance!.pConsumed, 600, 1e-2, 'AC P_cons');
});

test('Benchmark 3a: Mạch có CCCS + trích xuất Thévenin/Norton', () => {
  // E1 = 12V (N1 -> GND), R1 = 4 Ohm (N1 -> N2), R2 = 6 Ohm (N2 -> GND),
  // CCCS Jb1 (beta = 2, điều khiển bởi I_R1) bơm vào N2.
  // Giải tích tại cổng (N2, GND): Vth = 108/11 V, Zth = 12/11 Ohm, In = 9 A
  const state: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 12 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 4 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 140, y: 0, rotation: 90, resistance: 6 },
      { id: 'jb1', name: 'Jb1', type: 'CCCS', x: 220, y: 0, rotation: 0, gain: 2, ctrlElementId: 'r1' },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 120, y: -40 }, { x: 140, y: -40 }, { x: 220, y: -40 }] },
      { id: 'w3', points: [{ x: 0, y: 40 }, { x: 140, y: 40 }, { x: 220, y: 40 }] },
    ],
  };

  const net = buildNetlist(state.elements, state.wires);
  const outNode = net.nodeMap['r2:1'];
  const th = extractTheveninNorton(state, outNode, '0', 0);
  assert.equal(th.success, true);
  approx(th.vth.re, 108 / 11, 1e-4, 'CCCS Vth');
  approx(th.zth.re, 12 / 11, 1e-4, 'CCCS Zth');
  approx(th.inorton.re, 9, 1e-4, 'CCCS Inorton');
});

test('Benchmark 3b: Mạch có VCVS + trích xuất Thévenin/Norton', () => {
  // E1 = 10V (N1 -> GND), R1 = 2 Ohm (N1 -> A), R2 = 6 Ohm (A -> N3),
  // VCVS Ev1 (mu = 2, điều khiển bởi V_A - V_0) nối từ GND (-) lên N3 (+).
  // Giải tích tại cổng (A, GND): Vth = 15 V, Zth = 3 Ohm, In = 5 A
  const baseElements: CircuitState['elements'] = [
    { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 10 },
    { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 2 },
    { id: 'r2', name: 'R2', type: 'RESISTOR', x: 160, y: -40, rotation: 0, resistance: 6 },
    { id: 'ev1', name: 'Ev1', type: 'VCVS', x: 200, y: 0, rotation: 0, gain: 2, ctrlNodePos: '0', ctrlNodeNeg: '0' },
    { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
  ];
  const wires: CircuitState['wires'] = [
    { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
    { id: 'w2', points: [{ x: 0, y: 40 }, { x: 200, y: 40 }] },
  ];
  const preNet = buildNetlist(baseElements, wires);
  const nodeA = preNet.nodeMap['r1:2'];
  baseElements[3].ctrlNodePos = nodeA;

  const state: CircuitState = { elements: baseElements, wires };
  const th = extractTheveninNorton(state, nodeA, '0', 0);
  assert.equal(th.success, true);
  approx(th.vth.re, 15, 1e-4, 'VCVS Vth');
  approx(th.zth.re, 3, 1e-4, 'VCVS Zth');
  approx(th.inorton.re, 5, 1e-4, 'VCVS Inorton');
});

test('Benchmark 4a: Mạch quá độ RC và RL có sơ kiện khác 0', () => {
  // 1) RC: E = 20V, R = 500 Ohm, C = 200uF (tau = 0.1s), u_C(0) = 5V
  //    u_C(t) = 20 - 15*exp(-t/0.1) => tại t = 0.1s: 14.48181 V
  const rcState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 20 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 500 },
      { id: 'c1', name: 'C1', type: 'CAPACITOR', x: 120, y: 0, rotation: 90, capacitance: 200e-6, initialVoltage: 5 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 120, y: 40 }] },
    ],
  };
  const rcRes = runSimulation(rcState, 'TRANSIENT', { dt: 0.0001, tEnd: 0.1 });
  assert.equal(rcRes.success, true);
  const uC = rcRes.transient!.elementVoltages['c1'];
  approx(uC[0], 5, 1e-5, 'u_C(0+)');
  approx(uC[uC.length - 1], 20 - 15 * Math.exp(-1), 0.015, 'u_C(tau)');

  // 2) RL: E = 12V, R = 4 Ohm, L = 0.2H (tau = 0.05s), i_L(0) = 1A
  //    i_L(t) = 3 - 2*exp(-t/0.05) => tại t = 0.05s: 2.26424 A
  const rlState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 12 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 4 },
      { id: 'l1', name: 'L1', type: 'INDUCTOR', x: 120, y: 0, rotation: 90, inductance: 0.2, initialCurrent: 1 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 120, y: 40 }] },
    ],
  };
  const rlRes = runSimulation(rlState, 'TRANSIENT', { dt: 0.0001, tEnd: 0.05 });
  assert.equal(rlRes.success, true);
  const iL = rlRes.transient!.elementCurrents['l1'];
  const uL = rlRes.transient!.elementVoltages['l1'];
  approx(iL[0], 1, 1e-5, 'i_L(0+)');
  approx(uL[0], 8, 1e-4, 'u_L(0+) = E - R*i_L(0)');
  approx(iL[iL.length - 1], 3 - 2 * Math.exp(-1), 0.005, 'i_L(tau)');
});

test('Benchmark 4b: Mạch 3 pha không đối xứng đấu Y không dây trung tính (điện áp lệch điểm trung tính)', () => {
  // Nguồn Y 220V pha, Za = 10, Zb = 20, Zc = 20 (không dây trung tính N)
  // Giải tích (Millman): V_N' = +55 V, |Ia| = 16.5 A, |Ib| = |Ic| = 55*sqrt(21)/20 A, P_total = 9075 W
  const state: CircuitState = {
    elements: [
      {
        id: 'g3',
        name: 'G3',
        type: 'THREE_PHASE_SRC',
        x: 100,
        y: 200,
        rotation: 0,
        tpConnection: 'Y',
        tpVoltageMode: 'PHASE',
        tpVoltageRms: 220,
        tpFreqHz: 50,
        tpPhaseADeg: 0,
        tpSequence: 'ABC',
      },
      {
        id: 't3',
        name: 'T3',
        type: 'THREE_PHASE_LOAD',
        x: 300,
        y: 200,
        rotation: 0,
        loadConnection: 'Y',
        loadNeutralConnected: false,
        loadSymmetric: false,
        loadZa: { re: 10, im: 0 },
        loadZb: { re: 20, im: 0 },
        loadZc: { re: 20, im: 0 },
      },
      { id: 'gnd', name: 'GND', type: 'GND', x: 160, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'wa', points: [{ x: 160, y: 140 }, { x: 240, y: 140 }] },
      { id: 'wb', points: [{ x: 160, y: 180 }, { x: 240, y: 180 }] },
      { id: 'wc', points: [{ x: 160, y: 220 }, { x: 240, y: 220 }] },
      { id: 'wn', points: [{ x: 160, y: 260 }, { x: 160, y: 280 }] },
    ],
  };

  const res = runSimulation(state, 'AC');
  assert.equal(res.success, true);
  const load = res.elements.find((e) => e.elementId === 't3')!;
  const tp = load.threePhaseDetails!;
  const expectedIb = (55 * Math.sqrt(21)) / 20;

  approx(tp.uNeutralShift!, 55, 1e-2, 'Neutral shift voltage |U_NN|');
  approx(tp.iaMag, 16.5, 1e-2, '|Ia|');
  approx(tp.ibMag, expectedIb, 1e-2, '|Ib|');
  approx(tp.icMag, expectedIb, 1e-2, '|Ic|');
  approx(tp.pTotal, 9075, 1e-1, '3-phase P_total');
  approx(res.powerBalance!.pGenerated, 9075, 1e-1, '3-phase P_gen');
  approx(res.powerBalance!.pConsumed, 9075, 1e-1, '3-phase P_cons');
});

test('Benchmark 5: Mạch 3 pha RL + R-C không đối xứng (đấu Y không trung tính) ở chế độ Quá độ khớp xác lập AC', () => {
  const state: CircuitState = {
    elements: [
      {
        id: 'g3',
        name: 'G3',
        type: 'THREE_PHASE_SRC',
        x: 100,
        y: 200,
        rotation: 0,
        tpConnection: 'Y',
        tpVoltageMode: 'PHASE',
        tpVoltageRms: 220,
        tpFreqHz: 50,
        tpPhaseADeg: 0,
        tpSequence: 'ABC',
      },
      {
        id: 'line3',
        name: 'L3',
        type: 'THREE_PHASE_LINE',
        x: 240,
        y: 200,
        rotation: 0,
        hasNeutral: false,
        lineZ: { re: 2, im: 4 },
        lineZn: { re: 2, im: 1 },
      },
      {
        id: 't3',
        name: 'T3',
        type: 'THREE_PHASE_LOAD',
        x: 420,
        y: 200,
        rotation: 0,
        loadConnection: 'Y',
        loadNeutralConnected: false,
        loadSymmetric: false,
        loadZa: { re: 20, im: 15 },
        loadZb: { re: 30, im: -10 },
        loadZc: { re: 25, im: 5 },
      },
      { id: 'gnd', name: 'GND', type: 'GND', x: 160, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'wa1', points: [{ x: 160, y: 140 }, { x: 180, y: 140 }] },
      { id: 'wb1', points: [{ x: 160, y: 180 }, { x: 180, y: 180 }] },
      { id: 'wc1', points: [{ x: 160, y: 220 }, { x: 180, y: 220 }] },
      { id: 'wa2', points: [{ x: 300, y: 140 }, { x: 360, y: 140 }] },
      { id: 'wb2', points: [{ x: 300, y: 180 }, { x: 360, y: 180 }] },
      { id: 'wc2', points: [{ x: 300, y: 220 }, { x: 360, y: 220 }] },
      { id: 'wn', points: [{ x: 160, y: 260 }, { x: 160, y: 280 }] },
    ],
  };

  const acRes = runSimulation(state, 'AC');
  assert.equal(acRes.success, true);
  const trRes = runSimulation(state, 'TRANSIENT', { dt: 0.0001, tEnd: 0.2 });
  assert.equal(trRes.success, true);
  assert.equal(
    trRes.diagnostics.some((d) => d.level === 'info' && d.text.includes('50 Hz')),
    true,
    'Should emit reactive 3-phase conversion info diagnostic at 50 Hz',
  );

  // Kiểm tra RMS chu kỳ cuối [0.18s..0.20s] của quá độ khớp với AC
  const times = trRes.transient!.times;
  const steadyStartIdx = times.findIndex((t) => t >= 0.18);
  assert.ok(steadyStartIdx > 0);
  const sliceRms = (arr: number[]) => {
    const seg = arr.slice(steadyStartIdx);
    return Math.sqrt(seg.reduce((s, v) => s + v * v, 0) / seg.length);
  };

  const acLoad = acRes.elements.find((e) => e.elementId === 't3')!;
  const acLine = acRes.elements.find((e) => e.elementId === 'line3')!;
  const trLoadIaRms = sliceRms(trRes.transient!.elementCurrents['t3']);
  const trLoadUaRms = sliceRms(trRes.transient!.elementVoltages['t3']);
  const trLineIaRms = sliceRms(trRes.transient!.elementCurrents['line3']);

  assert.ok(
    Math.abs(trLoadIaRms - acLoad.currentRms) < 0.25,
    `Transient steady Ia RMS (${trLoadIaRms.toFixed(4)}) should match AC (${acLoad.currentRms.toFixed(4)})`,
  );
  assert.ok(
    Math.abs(trLoadUaRms - acLoad.voltageRms) < 2.0,
    `Transient steady Ua RMS (${trLoadUaRms.toFixed(4)}) should match AC (${acLoad.voltageRms.toFixed(4)})`,
  );
  assert.ok(
    Math.abs(trLineIaRms - acLine.currentRms) < 0.25,
    `Transient line Ia RMS (${trLineIaRms.toFixed(4)}) should match AC (${acLine.currentRms.toFixed(4)})`,
  );
});

test('Benchmark 6: Mạch 3 pha tải Tam giác (DELTA) có điện kháng dung & cảm không đối xứng ở Quá độ', () => {
  const state: CircuitState = {
    elements: [
      {
        id: 'g3',
        name: 'G3',
        type: 'THREE_PHASE_SRC',
        x: 100,
        y: 200,
        rotation: 0,
        tpConnection: 'Y',
        tpVoltageMode: 'PHASE',
        tpVoltageRms: 220,
        tpFreqHz: 50,
        tpPhaseADeg: 0,
        tpSequence: 'ABC',
      },
      {
        id: 't3',
        name: 'T3',
        type: 'THREE_PHASE_LOAD',
        x: 300,
        y: 200,
        rotation: 0,
        loadConnection: 'DELTA',
        loadNeutralConnected: false,
        loadSymmetric: false,
        loadZa: { re: 40, im: -15 },
        loadZb: { re: 30, im: -10 },
        loadZc: { re: 50, im: 20 },
      },
      { id: 'gnd', name: 'GND', type: 'GND', x: 160, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'wa', points: [{ x: 160, y: 140 }, { x: 240, y: 140 }] },
      { id: 'wb', points: [{ x: 160, y: 180 }, { x: 240, y: 180 }] },
      { id: 'wc', points: [{ x: 160, y: 220 }, { x: 240, y: 220 }] },
      { id: 'wn', points: [{ x: 160, y: 260 }, { x: 160, y: 280 }] },
    ],
  };

  const acRes = runSimulation(state, 'AC');
  assert.equal(acRes.success, true);
  const trRes = runSimulation(state, 'TRANSIENT', { dt: 0.0001, tEnd: 0.2 });
  assert.equal(trRes.success, true);

  const times = trRes.transient!.times;
  const steadyStartIdx = times.findIndex((t) => t >= 0.18);
  const segI = trRes.transient!.elementCurrents['t3'].slice(steadyStartIdx);
  const trIaRms = Math.sqrt(segI.reduce((s, v) => s + v * v, 0) / segI.length);
  const acLoad = acRes.elements.find((e) => e.elementId === 't3')!;

  assert.equal(segI.every(Number.isFinite), true);
  assert.ok(
    Math.abs(trIaRms - acLoad.currentRms) < 0.35,
    `Delta transient steady Ia RMS (${trIaRms.toFixed(4)}) should match AC (${acLoad.currentRms.toFixed(4)})`,
  );
});
