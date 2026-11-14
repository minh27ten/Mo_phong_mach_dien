import test from 'node:test';
import assert from 'node:assert/strict';
import { Complex } from './complex';
import { extractTheveninNorton, extractTwoPort, runSimulation } from './mna';
import { CIRCUIT_PRESETS } from '../data/presets';
import { CircuitState } from '../types/circuit';

function approx(actual: number, expected: number, tol = 1e-3, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );
}

test('Complex arithmetic and polar conversion', () => {
  const a = new Complex(3, 4);
  approx(a.mag(), 5, 1e-9);
  approx(a.deg(), 53.13010235, 1e-5);
  const b = Complex.fromPolar(10, 60);
  approx(b.re, 5, 1e-9);
  approx(b.im, 5 * Math.sqrt(3), 1e-9);
  const c = a.mul(b).div(b);
  approx(c.re, 3, 1e-9);
  approx(c.im, 4, 1e-9);
});

test('DC resistive divider & DC steady state (C open, L short)', () => {
  const state: CircuitState = {
    elements: [
      { id: 'v1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 12 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 100 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 160, y: 0, rotation: 90, resistance: 200 },
      { id: 'l1', name: 'L1', type: 'INDUCTOR', x: 200, y: -40, rotation: 0, inductance: 0.1 },
      { id: 'c1', name: 'C1', type: 'CAPACITOR', x: 240, y: 0, rotation: 90, capacitance: 10e-6 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 120, y: -40 }, { x: 160, y: -40 }] },
      { id: 'w4', points: [{ x: 0, y: 40 }, { x: 160, y: 40 }, { x: 240, y: 40 }] },
    ],
  };
  const res = runSimulation(state, 'DC_SS');
  assert.equal(res.success, true);
  // R1=100, R2=200 -> V_out = 12 * 200/300 = 8V
  const r2 = res.elements.find((e) => e.elementId === 'r2')!;
  approx(r2.voltageDc, 8, 1e-4, 'V_R2');
  approx(r2.currentDc, 0.04, 1e-5, 'I_R2');
  const c1 = res.elements.find((e) => e.elementId === 'c1')!;
  approx(c1.currentDc, 0, 1e-6, 'I_C in DC');
  approx(res.powerBalance!.pGenerated, res.powerBalance!.pConsumed, 1e-5, 'Power conservation');
});

test('AC Steady-State Superposition (DC + 50Hz + 100Hz)', () => {
  // E_dc = 10V nối tiếp E_ac = 10Vrms @ 50Hz cấp cho R = 10 Ohm
  const state: CircuitState = {
    elements: [
      { id: 'v1', name: 'Edc', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 10 },
      { id: 'v2', name: 'Eac', type: 'V_SRC', x: 0, y: -80, rotation: 0, waveform: 'AC', acValue: 10, amplitudeType: 'RMS', freqHz: 50, phaseDeg: 0 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 120, y: -40, rotation: 90, resistance: 10 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -120 }, { x: 120, y: -120 }, { x: 120, y: -80 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 0 }] },
    ],
  };
  const res = runSimulation(state, 'AC');
  assert.equal(res.success, true);
  const r1 = res.elements.find((e) => e.elementId === 'r1')!;
  // U_rms = sqrt(10^2 + 10^2) = 14.1421 V, P = 10^2/10 + 10^2/10 = 20 W
  approx(r1.voltageRms, Math.sqrt(200), 1e-3, 'Superposition U_rms');
  approx(r1.pWatts, 20, 1e-3, 'Superposition P');
});

test('Transient Backward Euler RC charging curve with u_C(0) = 2V', () => {
  // E = 12V step, R = 1k, C = 100uF => tau = 0.1s; u_C(0) = 2V
  // u_C(t) = 12 - 10 * exp(-t / 0.1)
  const state: CircuitState = {
    elements: [
      { id: 'v1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 12 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 1000 },
      { id: 'c1', name: 'C1', type: 'CAPACITOR', x: 120, y: 0, rotation: 90, capacitance: 100e-6, initialVoltage: 2 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 120, y: 40 }] },
    ],
  };
  const res = runSimulation(state, 'TRANSIENT', { dt: 0.0005, tEnd: 0.1 });
  assert.equal(res.success, true);
  assert.ok(res.transient);
  const uC = res.transient.elementVoltages['c1'];
  approx(uC[0], 2, 1e-5, 'u_C(0+)');
  const last = uC[uC.length - 1];
  const analytical = 12 - 10 * Math.exp(-1);
  approx(last, analytical, 0.05, 'u_C(tau) Backward Euler');
});

test('All 3 built-in presets solve cleanly with power balance', () => {
  for (const preset of CIRCUIT_PRESETS) {
    const res = runSimulation(preset.state, preset.recommendedMode);
    assert.equal(res.success, true, `Preset ${preset.id} failed`);
    if (res.powerBalance) {
      approx(res.powerBalance.pGenerated, res.powerBalance.pConsumed, 1e-2, `P balance in ${preset.id}`);
    }
  }
});

test('Op-Amp inverting amplifier gain (-Rf/R1 = -3)', () => {
  const opPreset = CIRCUIT_PRESETS.find((p) => p.id === 'opamp-dependent')!;
  const res = runSimulation(opPreset.state, 'DC');
  assert.equal(res.success, true);
  const rl1 = res.elements.find((e) => e.elementId === 'rl1')!;
  const rl2 = res.elements.find((e) => e.elementId === 'rl2')!;
  // E1 = 2V, R1 = 1k, Rf = 3k => V_RL1 = -6V
  approx(rl1.voltageDc, -6, 1e-3, 'Inverting OpAmp Vout');
  // Ev1 = 2 * V(3) = -12V => V_RL2 = -12V
  approx(rl2.voltageDc, -12, 1e-3, 'VCVS output');
});

test('Three-phase unbalanced Y system neutral current & power conservation', () => {
  const tpPreset = CIRCUIT_PRESETS.find((p) => p.id === 'three-phase-unbalanced')!;
  const res = runSimulation(tpPreset.state, 'AC');
  assert.equal(res.success, true);
  const load = res.elements.find((e) => e.elementId === 't3')!;
  assert.ok(load.threePhaseDetails);
  assert.ok(load.threePhaseDetails.inMag! > 1, 'Unbalanced Y load must have nonzero neutral current');
  approx(res.powerBalance!.pGenerated, res.powerBalance!.pConsumed, 1e-2, '3-phase P balance');
  approx(res.powerBalance!.qGenerated, res.powerBalance!.qConsumed, 1e-2, '3-phase Q balance');
});

test('Equivalent Extractor: Thevenin / Norton & Two-Port [Z], [Y], [A]', () => {
  // Cầu phân áp: E = 12V, R1 = 100 Ohm, R2 = 300 Ohm -> giữa nút ra (2) và GND (0):
  // Vth = 9V, Zth = 75 Ohm, In = 0.12 A
  const divState: CircuitState = {
    elements: [
      { id: 'v1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 12 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: -40, rotation: 0, resistance: 100 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 120, y: 0, rotation: 90, resistance: 300 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 60, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 40, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 120, y: 40 }] },
    ],
  };
  const sim = runSimulation(divState, 'DC');
  const outNode = sim.nodeMap['r2:1'];
  const th = extractTheveninNorton(divState, outNode, '0', 0);
  assert.equal(th.success, true);
  approx(th.vth.re, 9, 1e-4, 'Vth');
  approx(th.zth.re, 75, 1e-4, 'Zth');
  approx(th.inorton.re, 0.12, 1e-5, 'Inorton');

  // Mạng hình T đối xứng: R1 = 10, R2 = 10, R3 (shunt) = 20
  // Z11 = 30, Z12 = 20, Z21 = 20, Z22 = 30; A = 30/20 = 1.5, B = 500/20 = 25, C = 1/20 = 0.05, D = 1.5
  const teeState: CircuitState = {
    elements: [
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 40, y: 0, rotation: 0, resistance: 10 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 120, y: 0, rotation: 0, resistance: 10 },
      { id: 'r3', name: 'R3', type: 'RESISTOR', x: 80, y: 40, rotation: 90, resistance: 20 },
      { id: 'g', name: 'GND', type: 'GND', x: 80, y: 100, rotation: 0 },
    ],
    wires: [],
  };
  const teeSim = runSimulation(teeState, 'DC');
  const p1 = teeSim.nodeMap['r1:1'];
  const p2 = teeSim.nodeMap['r2:2'];
  const tp = extractTwoPort(teeState, p1, '0', p2, '0', 0);
  assert.equal(tp.success, true);
  approx(tp.Z![0][0].re, 30, 1e-3, 'Z11');
  approx(tp.Z![0][1].re, 20, 1e-3, 'Z12');
  approx(tp.Z![1][1].re, 30, 1e-3, 'Z22');
  approx(tp.A![0][0].re, 1.5, 1e-3, 'A');
  approx(tp.A![0][1].re, 25, 1e-3, 'B');
  approx(tp.A![1][0].re, 0.05, 1e-4, 'C');
});

test('Mutual inductance M in Transient + CCVS/CCCS/VCCS + ONE_PORT + TWO_PORT', () => {
  // 1. Coupled inductors in Transient (RLC & Mutual preset)
  const rlcPreset = CIRCUIT_PRESETS.find((p) => p.id === 'rlc-mutual')!;
  const tr = runSimulation(rlcPreset.state, 'TRANSIENT', { dt: 0.0005, tEnd: 0.02 });
  assert.equal(tr.success, true);
  assert.ok(tr.transient!.elementCurrents['l2'].some((v) => Math.abs(v) > 1e-3), 'Secondary current induced via Mutual M');

  // 2. CCCS + VCCS + CCVS: E=10V -> R1=5 Ohm (I_R1 = 2A).
  // CCCS (beta=3) driving R_load1=10 Ohm => V = 60V
  // CCVS (r=4) driving R_load2=8 Ohm => I = 8V / 8 = 1A
  const depState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 0, rotation: 0, waveform: 'DC', dcValue: 10 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 80, y: 0, rotation: 90, resistance: 5 },
      { id: 'jb', name: 'Jb1', type: 'CCCS', x: 200, y: 0, rotation: 0, gain: 3, ctrlElementId: 'r1' },
      { id: 'rl1', name: 'RL1', type: 'RESISTOR', x: 280, y: 0, rotation: 90, resistance: 10 },
      { id: 'er', name: 'Er1', type: 'CCVS', x: 400, y: 0, rotation: 0, gain: 4, ctrlElementId: 'r1' },
      { id: 'rl2', name: 'RL2', type: 'RESISTOR', x: 480, y: 0, rotation: 90, resistance: 8 },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 80, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: -40 }, { x: 80, y: -40 }] },
      { id: 'w2', points: [{ x: 0, y: 40 }, { x: 80, y: 40 }, { x: 200, y: 40 }, { x: 280, y: 40 }, { x: 400, y: 40 }, { x: 480, y: 40 }] },
      { id: 'w3', points: [{ x: 200, y: -40 }, { x: 280, y: -40 }] },
      { id: 'w4', points: [{ x: 400, y: -40 }, { x: 480, y: -40 }] },
    ],
  };
  const depRes = runSimulation(depState, 'DC');
  assert.equal(depRes.success, true);
  approx(depRes.elements.find((e) => e.elementId === 'rl1')!.voltageDc, 60, 1e-3, 'CCCS output voltage');
  approx(depRes.elements.find((e) => e.elementId === 'rl2')!.currentDc, 1, 1e-4, 'CCVS output current');

  // 3. ONE_PORT (Thevenin 10V, Zth=5) -> R=5 => V_R = 5V
  // 4. TWO_PORT ([A] = [2, 0; 0, 0.5] ideal 2:1 transformer) fed by 10V -> R2=10 => V2 = 5V
  const netState: CircuitState = {
    elements: [
      {
        id: 'p1',
        name: 'P1',
        type: 'ONE_PORT',
        x: 40,
        y: 0,
        rotation: 0,
        onePortMode: 'THEVENIN',
        onePortMag: 10,
        onePortPhaseDeg: 0,
        onePortFreqHz: 0,
        onePortZ: { re: 5, im: 0 },
      },
      { id: 'rl1', name: 'R1', type: 'RESISTOR', x: 0, y: 40, rotation: 90, resistance: 5 },
      {
        id: 'p2',
        name: 'P2',
        type: 'TWO_PORT',
        x: 300,
        y: 40,
        rotation: 0,
        twoPortType: 'A',
        m11: { re: 2, im: 0 },
        m12: { re: 0, im: 0 },
        m21: { re: 0, im: 0 },
        m22: { re: 0.5, im: 0 },
      },
      { id: 'e2', name: 'E2', type: 'V_SRC', x: 200, y: 40, rotation: 0, waveform: 'DC', dcValue: 10 },
      { id: 'rl2', name: 'R2', type: 'RESISTOR', x: 400, y: 40, rotation: 90, resistance: 10 },
      { id: 'g', name: 'GND', type: 'GND', x: 80, y: 100, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 80, y: 0 }, { x: 80, y: 80 }] },
      { id: 'w2', points: [{ x: 0, y: 80 }, { x: 80, y: 80 }, { x: 200, y: 80 }, { x: 240, y: 80 }] },
      { id: 'w3', points: [{ x: 200, y: 0 }, { x: 240, y: 0 }] },
      { id: 'w4', points: [{ x: 360, y: 0 }, { x: 400, y: 0 }] },
      { id: 'w5', points: [{ x: 360, y: 80 }, { x: 400, y: 80 }, { x: 240, y: 80 }] },
    ],
  };
  const netRes = runSimulation(netState, 'DC');
  assert.equal(netRes.success, true);
  approx(netRes.elements.find((e) => e.elementId === 'rl1')!.voltageDc, 5, 1e-3, 'ONE_PORT Thevenin divider');
  approx(netRes.elements.find((e) => e.elementId === 'rl2')!.voltageDc, 5, 1e-3, 'TWO_PORT [A] ideal transformer');
});

test('Regression: TWO_PORT [Y] transient readout, series L t=0+ divider, and DELTA auto-ground', () => {
  // 1. TWO_PORT [Y] + ONE_PORT NORTON in TRANSIENT (S095)
  const tpYState: CircuitState = {
    elements: [
      {
        id: 'p1',
        name: 'P1',
        type: 'ONE_PORT',
        x: 120,
        y: 200,
        rotation: 90,
        onePortMode: 'NORTON',
        onePortMag: 2,
        onePortPhaseDeg: 0,
        onePortFreqHz: 0,
        onePortZ: { re: 0.1, im: 0 },
      },
      {
        id: 'p2',
        name: 'P2',
        type: 'TWO_PORT',
        x: 240,
        y: 200,
        rotation: 0,
        twoPortType: 'Y',
        m11: { re: 0.2, im: 0 },
        m12: { re: -0.1, im: 0 },
        m21: { re: -0.1, im: 0 },
        m22: { re: 0.2, im: 0 },
      },
      { id: 'rl', name: 'RL', type: 'RESISTOR', x: 360, y: 200, rotation: 90, resistance: 10 },
      { id: 'g', name: 'GND', type: 'GND', x: 120, y: 240, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 180, y: 160 }] },
      { id: 'w2', points: [{ x: 300, y: 160 }, { x: 360, y: 160 }] },
      { id: 'w3', points: [{ x: 120, y: 240 }, { x: 360, y: 240 }] },
    ],
  };
  const tpYRes = runSimulation(tpYState, 'TRANSIENT', { dt: 0.001, tEnd: 0.01 });
  assert.equal(tpYRes.success, true);
  const p2Res = tpYRes.elements.find((e) => e.elementId === 'p2')!;
  approx(p2Res.voltageDc, 7.5, 1e-3, 'TWO_PORT [Y] U1 should be 7.5V');
  approx(p2Res.currentDc, 1.25, 1e-3, 'TWO_PORT [Y] I1 should be 1.25A');

  // 2. Series inductors with i_L(0) = 1A at t=0+ (S086)
  const serLState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 120, y: 200, rotation: 0, waveform: 'DC', dcValue: 10 },
      { id: 'l1', name: 'L1', type: 'INDUCTOR', x: 180, y: 160, rotation: 0, inductance: 0.2, initialCurrent: 1 },
      { id: 'l2', name: 'L2', type: 'INDUCTOR', x: 280, y: 160, rotation: 0, inductance: 0.2, initialCurrent: 1 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 360, y: 200, rotation: 90, resistance: 5 },
      { id: 'g', name: 'GND', type: 'GND', x: 120, y: 260, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 140, y: 160 }] },
      { id: 'w2', points: [{ x: 220, y: 160 }, { x: 240, y: 160 }] },
      { id: 'w3', points: [{ x: 320, y: 160 }, { x: 360, y: 160 }] },
      { id: 'w4', points: [{ x: 120, y: 240 }, { x: 360, y: 240 }] },
    ],
  };
  const serLRes = runSimulation(serLState, 'TRANSIENT', { dt: 0.0005, tEnd: 0.1 });
  assert.equal(serLRes.success, true);
  const midNid = serLRes.nodeMap['l1:2'];
  approx(serLRes.transient!.nodeVoltages[midNid][0], 7.5, 1e-3, 'Midpoint voltage between equal L1,L2 at t=0+');
  approx(serLRes.transient!.elementVoltages['l1'][0], 2.5, 1e-3, 'L1 voltage at t=0+');
  approx(serLRes.elements.find((e) => e.elementId === 'r1')!.currentDc, 2 - Math.exp(-1.25), 0.02, 'RL final current');

  // 3. THREE_PHASE_SRC DELTA without GND should ground phase C (not floating N) (S077)
  const deltaState: CircuitState = {
    elements: [
      {
        id: 'g3',
        name: 'G3',
        type: 'THREE_PHASE_SRC',
        x: 120,
        y: 200,
        rotation: 0,
        tpConnection: 'DELTA',
        tpVoltageMode: 'LINE',
        tpVoltageRms: 380,
        tpFreqHz: 50,
        tpPhaseADeg: 0,
        tpSequence: 'ABC',
      },
      {
        id: 't3',
        name: 'T3',
        type: 'THREE_PHASE_LOAD',
        x: 320,
        y: 200,
        rotation: 0,
        loadConnection: 'DELTA',
        loadSymmetric: true,
        loadZa: { re: 38, im: 0 },
      },
    ],
    wires: [
      { id: 'wa', points: [{ x: 180, y: 140 }, { x: 260, y: 140 }] },
      { id: 'wb', points: [{ x: 180, y: 180 }, { x: 260, y: 180 }] },
      { id: 'wc', points: [{ x: 180, y: 220 }, { x: 260, y: 220 }] },
    ],
  };
  const deltaRes = runSimulation(deltaState, 'AC');
  assert.equal(deltaRes.success, true);
  assert.equal(deltaRes.nodeMap['g3:C'], '0', 'DELTA auto-ground should select phase C');
  approx(deltaRes.nodes.find((n) => n.nodeId === deltaRes.nodeMap['g3:A'])!.rms, 380, 0.1, 'Va magnitude wrt C = 380V');
  approx(deltaRes.nodes.find((n) => n.nodeId === deltaRes.nodeMap['g3:B'])!.rms, 380, 0.1, 'Vb magnitude wrt C = 380V');
  approx(deltaRes.elements.find((e) => e.elementId === 't3')!.threePhaseDetails!.iaMag, 10 * Math.sqrt(3), 0.05, 'Delta line current');
});

