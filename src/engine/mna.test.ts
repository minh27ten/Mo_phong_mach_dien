import test from 'node:test';
import assert from 'node:assert/strict';
import { Complex } from './complex';
import {
  extractTheveninNorton,
  extractTwoPort,
  findMaxPowerImpedance,
  getSourceHarmonicSummary,
  runSimulation,
} from './mna';
import { createDefaultElement, isValidComponentType } from './pins';
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

test('All built-in presets solve cleanly with power balance', () => {
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

test('Mixed-waveform V_SRC (DC + 50Hz + 150Hz) across RC network: DC, AC superposition, Thevenin & Transient', () => {
  const state: CircuitState = {
    elements: [
      {
        id: 'e1',
        name: 'E1',
        type: 'V_SRC',
        x: 100,
        y: 200,
        rotation: 0,
        waveform: 'MIXED',
        mixedDcValue: 12,
        amplitudeType: 'RMS',
        harmonics: [
          { id: 'h1', freqHz: 50, amplitude: 100, phaseDeg: 0 },
          { id: 'h2', freqHz: 150, amplitude: 30, phaseDeg: -30 },
        ],
      },
      {
        id: 'r1',
        name: 'R1',
        type: 'RESISTOR',
        x: 200,
        y: 120,
        rotation: 0,
        resistance: 100,
      },
      {
        id: 'c1',
        name: 'C1',
        type: 'CAPACITOR',
        x: 280,
        y: 200,
        rotation: 90,
        capacitance: 20e-6,
      },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 100, y: 280, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 100, y: 160 }, { x: 100, y: 120 }, { x: 160, y: 120 }] },
      { id: 'w2', points: [{ x: 240, y: 120 }, { x: 280, y: 120 }, { x: 280, y: 160 }] },
      { id: 'w3', points: [{ x: 100, y: 240 }, { x: 100, y: 260 }, { x: 280, y: 260 }, { x: 280, y: 240 }] },
    ],
  };

  // 1. DC mode suppresses AC harmonics cleanly
  const dcRes = runSimulation(state, 'DC');
  assert.equal(dcRes.success, true);
  assert.ok(dcRes.diagnostics.some((d) => d.level === 'info'));
  const c1Dc = dcRes.elements.find((e) => e.elementId === 'c1')!;
  approx(c1Dc.voltageDc, 12, 1e-6, 'VC DC');
  approx(c1Dc.currentDc, 0, 1e-9, 'IC DC');

  // 2. AC superposition across 0 Hz, 50 Hz, 150 Hz
  const acRes = runSimulation(state, 'AC');
  assert.equal(acRes.success, true);
  assert.equal(acRes.singleFrequencyHz, null);
  assert.deepEqual(acRes.frequenciesHz, [0, 50, 150]);

  const R = 100;
  const C = 20e-6;
  const x50 = 1 / (2 * Math.PI * 50 * C);
  const x150 = 1 / (2 * Math.PI * 150 * C);
  const uc50 = (100 * x50) / Math.hypot(R, x50);
  const uc150 = (30 * x150) / Math.hypot(R, x150);
  const expectedUcRms = Math.hypot(12, uc50, uc150);
  const i50 = 100 / Math.hypot(R, x50);
  const i150 = 30 / Math.hypot(R, x150);
  const expectedIRms = Math.hypot(i50, i150);
  const expectedP = expectedIRms * expectedIRms * R;

  const c1Ac = acRes.elements.find((e) => e.elementId === 'c1')!;
  const r1Ac = acRes.elements.find((e) => e.elementId === 'r1')!;
  approx(c1Ac.voltageRms, expectedUcRms, 1e-4, 'C1 total RMS voltage');
  approx(c1Ac.voltageDc, 12, 1e-6, 'C1 DC voltage');
  assert.equal(c1Ac.voltageHarmonics?.length, 2);
  approx(c1Ac.voltageHarmonics![0].rms, uc50, 1e-4, 'C1 50Hz RMS');
  approx(c1Ac.voltageHarmonics![1].rms, uc150, 1e-4, 'C1 150Hz RMS');
  approx(r1Ac.currentRms, expectedIRms, 1e-5, 'R1 total RMS current');
  approx(r1Ac.pWatts, expectedP, 1e-3, 'R1 total active power');
  assert.ok(r1Ac.instantaneousVoltage && r1Ac.instantaneousVoltage.includes('cos'));
  approx(acRes.powerBalance!.pGenerated, acRes.powerBalance!.pConsumed, 1e-3, 'Mixed power balance');

  // 3. Thevenin extraction at 0 Hz, 50 Hz, 150 Hz
  const nodeOut = acRes.nodeMap['c1:1'];
  const th0 = extractTheveninNorton(state, nodeOut, '0', 0);
  assert.equal(th0.success, true);
  approx(th0.vth.re, 12, 1e-5, 'Vth(0Hz)');
  approx(th0.zth.re, 100, 1e-3, 'Zth(0Hz)');

  const th50 = extractTheveninNorton(state, nodeOut, '0', 50);
  assert.equal(th50.success, true);
  approx(Math.hypot(th50.vth.re, th50.vth.im), uc50, 1e-4, '|Vth(50Hz)|');

  const th150 = extractTheveninNorton(state, nodeOut, '0', 150);
  assert.equal(th150.success, true);
  approx(Math.hypot(th150.vth.re, th150.vth.im), uc150, 1e-4, '|Vth(150Hz)|');

  // 4. Transient waveform reproduces exact mixed source excitation
  const trRes = runSimulation(state, 'TRANSIENT', { dt: 0.0002, tEnd: 0.02 });
  assert.equal(trRes.success, true);
  const tr = trRes.transient!;
  const uSrc = tr.elementVoltages['e1'];
  assert.ok(uSrc && uSrc.length === tr.times.length);
  for (let idx = 0; idx < tr.times.length; idx += 15) {
    const t = tr.times[idx];
    const analyticalU =
      12 +
      100 * Math.SQRT2 * Math.cos(2 * Math.PI * 50 * t) +
      30 * Math.SQRT2 * Math.cos(2 * Math.PI * 150 * t - Math.PI / 6);
    approx(uSrc[idx], analyticalU, 1e-4, `Transient E1(t=${t})`);
  }
});

test('Mixed-waveform I_SRC with PEAK amplitudes and same-frequency phasor summation', () => {
  const j1El = {
    id: 'j1',
    name: 'J1',
    type: 'I_SRC' as const,
    x: 100,
    y: 200,
    rotation: 0 as const,
    waveform: 'MIXED' as const,
    mixedDcValue: 2,
    amplitudeType: 'PEAK' as const,
    harmonics: [
      { id: 'h0', freqHz: 0, amplitude: 1, phaseDeg: 180 }, // -1 A DC -> net DC = 1 A
      { id: 'h1', freqHz: 50, amplitude: 6, phaseDeg: 0 },
      { id: 'h2', freqHz: 50, amplitude: 8, phaseDeg: 90 }, // 6 + j8 => peak 10 A => RMS 10/sqrt(2)
    ],
  };

  const summary = getSourceHarmonicSummary(j1El);
  approx(summary.dc, 1, 1e-9, 'Net DC after combining 0Hz harmonic');
  assert.equal(summary.harmonics.length, 1, 'Duplicate 50Hz entries merge into one phasor');
  approx(summary.harmonics[0].peak, 10, 1e-6, 'Vector sum peak at 50Hz');
  approx(summary.harmonics[0].rms, 10 / Math.SQRT2, 1e-6, 'Vector sum RMS at 50Hz');
  approx(summary.totalRms, Math.hypot(1, 10 / Math.SQRT2), 1e-6, 'Total RMS');

  const state: CircuitState = {
    elements: [
      j1El,
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 220, y: 200, rotation: 90, resistance: 10 },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 100, y: 280, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 100, y: 160 }, { x: 220, y: 160 }] },
      { id: 'w2', points: [{ x: 100, y: 240 }, { x: 100, y: 260 }, { x: 220, y: 260 }, { x: 220, y: 240 }] },
    ],
  };

  const res = runSimulation(state, 'AC');
  assert.equal(res.success, true);
  assert.deepEqual(res.frequenciesHz, [0, 50]);
  const r1 = res.elements.find((e) => e.elementId === 'r1')!;
  approx(r1.currentDc, 1, 1e-6, 'R1 DC current');
  approx(r1.currentRms, Math.hypot(1, 10 / Math.SQRT2), 1e-5, 'R1 RMS current');
  approx(r1.pWatts, (1 + 50) * 10, 1e-4, 'R1 total power P = I_rms^2 * R = 510W');
});

test('Mixed-source preset works in DC, AC, and TRANSIENT modes and preserves three-phase details in multi-frequency circuits', () => {
  const mixedPreset = CIRCUIT_PRESETS.find((p) => p.id === 'mixed-source');
  assert.ok(mixedPreset, 'mixed-source preset should exist');
  for (const mode of ['DC', 'AC', 'TRANSIENT'] as const) {
    const res = runSimulation(mixedPreset!.state, mode, mixedPreset!.transientConfig);
    assert.equal(res.success, true, `mixed-source ${mode} failed`);
    if (mode !== 'TRANSIENT' && res.powerBalance) {
      approx(res.powerBalance.pGenerated, res.powerBalance.pConsumed, 1e-2, `mixed-source ${mode} power balance`);
    }
  }

  // Three-phase 50Hz + auxiliary DC branch in same schematic retains threePhaseDetails
  const combinedTp: CircuitState = {
    elements: [
      ...CIRCUIT_PRESETS.find((p) => p.id === 'three-phase-unbalanced')!.state.elements,
      {
        id: 'e_dc',
        name: 'Edc',
        type: 'V_SRC',
        x: 120,
        y: 440,
        rotation: 0,
        waveform: 'DC',
        dcValue: 12,
      },
      { id: 'r_dc', name: 'Rdc', type: 'RESISTOR', x: 240, y: 440, rotation: 90, resistance: 12 },
    ],
    wires: [
      ...CIRCUIT_PRESETS.find((p) => p.id === 'three-phase-unbalanced')!.state.wires,
      { id: 'wd1', points: [{ x: 120, y: 400 }, { x: 240, y: 400 }] },
      {
        id: 'wd2',
        points: [
          { x: 120, y: 480 },
          { x: 240, y: 480 },
          { x: 300, y: 480 },
          { x: 300, y: 320 },
          { x: 240, y: 320 },
        ],
      },
    ],
  };
  const tpMixedRes = runSimulation(combinedTp, 'AC');
  assert.equal(tpMixedRes.success, true);
  assert.deepEqual(tpMixedRes.frequenciesHz, [0, 50]);
  const t3 = tpMixedRes.elements.find((e) => e.elementId === 't3')!;
  assert.ok(t3.threePhaseDetails, 'threePhaseDetails must be preserved in multi-frequency circuits');
});

test('Complex Impedance (Z): AC series-parallel analysis, power balance, DC & Transient', () => {
  // E1 = 100∠0° Vrms @ 50Hz -> Z1 = 10 + j20 Ω -> nút B -> song song Z2 = 30 - j40 Ω và Z3 = j25 Ω -> GND
  // Giải tích: I1 = 0.75 - j1.5 A, V_B = 62.5∠0° V, I2 = 0.75 + j1.0 A (1.25 A), I3 = -j2.5 A (2.5 A)
  // P_tổng = 75 W, Q_tổng = 150 var
  const state: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 100, y: 200, rotation: 0, waveform: 'AC', acValue: 100, amplitudeType: 'RMS', freqHz: 50, phaseDeg: 0 },
      { id: 'z1', name: 'Z1', type: 'IMPEDANCE', x: 200, y: 160, rotation: 0, impedance: { re: 10, im: 20 } },
      { id: 'z2', name: 'Z2', type: 'IMPEDANCE', x: 280, y: 200, rotation: 90, impedance: { re: 30, im: -40 } },
      { id: 'z3', name: 'Z3', type: 'IMPEDANCE', x: 360, y: 200, rotation: 90, impedance: { re: 0, im: 25 } },
      { id: 'g', name: 'GND', type: 'GND', x: 100, y: 260, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 100, y: 160 }, { x: 160, y: 160 }] },
      { id: 'w2', points: [{ x: 240, y: 160 }, { x: 280, y: 160 }, { x: 360, y: 160 }] },
      { id: 'w3', points: [{ x: 100, y: 240 }, { x: 280, y: 240 }, { x: 360, y: 240 }] },
    ],
  };

  const acRes = runSimulation(state, 'AC');
  assert.equal(acRes.success, true);

  const z1 = acRes.elements.find((e) => e.elementId === 'z1')!;
  const z2 = acRes.elements.find((e) => e.elementId === 'z2')!;
  const z3 = acRes.elements.find((e) => e.elementId === 'z3')!;
  const e1 = acRes.elements.find((e) => e.elementId === 'e1')!;

  approx(z1.currentRms, Math.hypot(0.75, -1.5), 1e-4, '|I_Z1|');
  approx(z1.currentPhasorDeg!, (Math.atan2(-1.5, 0.75) * 180) / Math.PI, 1e-2, 'angle(I_Z1)');
  approx(z2.voltageRms, 62.5, 1e-4, 'V_B');
  approx(z2.voltagePhasorDeg!, 0, 1e-2, 'angle(V_B)');
  approx(z2.currentRms, 1.25, 1e-4, '|I_Z2|');
  approx(z3.currentRms, 2.5, 1e-4, '|I_Z3|');
  approx(z3.currentPhasorDeg!, -90, 1e-2, 'angle(I_Z3)');

  approx(z1.pWatts, 28.125, 1e-3, 'P_Z1');
  approx(z1.qVars, 56.25, 1e-3, 'Q_Z1');
  approx(z2.pWatts, 46.875, 1e-3, 'P_Z2');
  approx(z2.qVars, -62.5, 1e-3, 'Q_Z2');
  approx(z3.pWatts, 0, 1e-3, 'P_Z3');
  approx(z3.qVars, 156.25, 1e-3, 'Q_Z3');
  approx(e1.pWatts, -75, 1e-3, 'P_E1');
  approx(e1.qVars, -150, 1e-3, 'Q_E1');
  approx(acRes.powerBalance!.pGenerated, 75, 1e-3, 'Z P_gen');
  approx(acRes.powerBalance!.pConsumed, 75, 1e-3, 'Z P_cons');
  approx(acRes.powerBalance!.qGenerated, 212.5, 1e-2, 'Z Q_gen (source + cap)');
  approx(acRes.powerBalance!.qConsumed, 212.5, 1e-2, 'Z Q_cons');

  // DC mode: R_Z3 = 0 => V_B ~ 0, I_Z1 ~ 10 A (DC source = 0 -> all 0), với DC info diagnostic
  const dcRes = runSimulation(state, 'DC');
  assert.equal(dcRes.success, true);
  assert.ok(dcRes.diagnostics.some((d) => d.level === 'info' && d.text.includes('Z')));

  // Transient mode converges to AC steady-state RMS
  const trRes = runSimulation(state, 'TRANSIENT', { dt: 0.0001, tEnd: 0.4 });
  assert.equal(trRes.success, true);
  assert.ok(trRes.diagnostics.some((d) => d.level === 'info' && d.text.includes('50 Hz')));
  const times = trRes.transient!.times;
  const steadyIdx = times.findIndex((t) => t >= 0.36);
  const segRms = (arr: number[]) => {
    const seg = arr.slice(steadyIdx);
    return Math.sqrt(seg.reduce((s, v) => s + v * v, 0) / seg.length);
  };
  approx(segRms(trRes.transient!.elementCurrents['z1']), z1.currentRms, 0.05, 'Transient Z1 I_rms');
  approx(segRms(trRes.transient!.elementVoltages['z2']), z2.voltageRms, 0.8, 'Transient Z2 V_rms');
  approx(segRms(trRes.transient!.elementCurrents['z2']), z2.currentRms, 0.05, 'Transient Z2 I_rms');
});

test('Complex Impedance (Z): CCCS/CCVS sensing (AC & Transient), zero-impedance short, and catalog', () => {
  assert.equal(isValidComponentType('IMPEDANCE'), true);
  const defZ = createDefaultElement('IMPEDANCE', 43, 57, []);
  assert.equal(defZ.name, 'Z1');
  assert.equal(defZ.x, 40);
  assert.equal(defZ.y, 60);
  assert.deepEqual(defZ.impedance, { re: 40, im: 30 });

  // E1 = 50∠0° Vrms @ 50Hz -> Z1 = 3 + j4 Ω -> Z_short = 0 + j0 Ω -> GND => I_Z1 = 6 - j8 A (|I| = 10 A)
  // CCCS (beta = 2, cảm biến I_Z1) cấp cho Z2 = 5 + j0 Ω => V_Z2 = 20∠-53.13° * 5 = 100 Vrms
  // CCVS (r = 10 Ω, cảm biến I_Z1) cấp cho Z3 = 8 - j6 Ω => |I_Z3| = (10 * 10) / 10 = 10 A
  const state: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 40, rotation: 0, waveform: 'AC', acValue: 50, amplitudeType: 'RMS', freqHz: 50, phaseDeg: 0 },
      { id: 'z1', name: 'Z1', type: 'IMPEDANCE', x: 80, y: 0, rotation: 0, impedance: { re: 3, im: 4 } },
      { id: 'z0', name: 'Z0', type: 'IMPEDANCE', x: 160, y: 40, rotation: 90, impedance: { re: 0, im: 0 } },
      { id: 'jb', name: 'Jb1', type: 'CCCS', x: 240, y: 40, rotation: 0, gain: 2, ctrlElementId: 'z1' },
      { id: 'z2', name: 'Z2', type: 'IMPEDANCE', x: 320, y: 40, rotation: 90, impedance: { re: 5, im: 0 } },
      { id: 'er', name: 'Er1', type: 'CCVS', x: 400, y: 40, rotation: 0, gain: 10, ctrlElementId: 'z1' },
      { id: 'z3', name: 'Z3', type: 'IMPEDANCE', x: 480, y: 40, rotation: 90, impedance: { re: 8, im: -6 } },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 100, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
      { id: 'w2', points: [{ x: 120, y: 0 }, { x: 160, y: 0 }] },
      { id: 'w3', points: [{ x: 0, y: 80 }, { x: 160, y: 80 }, { x: 240, y: 80 }, { x: 320, y: 80 }, { x: 400, y: 80 }, { x: 480, y: 80 }] },
      { id: 'w4', points: [{ x: 240, y: 0 }, { x: 320, y: 0 }] },
      { id: 'w5', points: [{ x: 400, y: 0 }, { x: 480, y: 0 }] },
    ],
  };

  const acRes = runSimulation(state, 'AC');
  assert.equal(acRes.success, true);
  approx(acRes.elements.find((e) => e.elementId === 'z1')!.currentRms, 10, 1e-4, 'Sensed Z1 I_rms');
  approx(acRes.elements.find((e) => e.elementId === 'z0')!.voltageRms, 0, 1e-5, 'Zero-impedance Z0 V_rms');
  approx(acRes.elements.find((e) => e.elementId === 'z2')!.voltageRms, 100, 1e-3, 'CCCS-driven Z2 V_rms');
  approx(acRes.elements.find((e) => e.elementId === 'z3')!.currentRms, 10, 1e-3, 'CCVS-driven Z3 I_rms');

  const trRes = runSimulation(state, 'TRANSIENT', { dt: 0.0001, tEnd: 0.14 });
  assert.equal(trRes.success, true);
  const steadyIdx = trRes.transient!.times.findIndex((t) => t >= 0.12);
  const segRms = (arr: number[]) => {
    const seg = arr.slice(steadyIdx);
    return Math.sqrt(seg.reduce((s, v) => s + v * v, 0) / seg.length);
  };
  approx(segRms(trRes.transient!.elementVoltages['z2']), 100, 1.5, 'Transient CCCS sensing Z1');
  approx(segRms(trRes.transient!.elementCurrents['z3']), 10, 0.25, 'Transient CCVS sensing Z1');
});

test('Complex Impedance (Z): Thévenin / Norton & Two-Port [Z, Y, A] extraction', () => {
  // Mạng hình T: Z1 = 10 + j10, Z2 = 20 - j10, nhánh rẽ Z3 = j20 (50 Hz)
  // Z11 = 10 + j30, Z12 = Z21 = j20, Z22 = 20 + j10
  // Khi cấp nguồn E1 = 100∠0° Vrms tại cửa 1:
  // V_th(cửa 2) = 100 * (j20) / (10 + j30) = (2000j)*(10 - j30)/1000 = 60 + j20 V
  // Z_th(cửa 2) = (20 - j10) + (10 + j10)*(j20)/(10 + j30) = 24 - j2 Ω
  const teeZ: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 0, y: 40, rotation: 0, waveform: 'AC', acValue: 100, amplitudeType: 'RMS', freqHz: 50, phaseDeg: 0 },
      { id: 'z1', name: 'Z1', type: 'IMPEDANCE', x: 80, y: 0, rotation: 0, impedance: { re: 10, im: 10 } },
      { id: 'z3', name: 'Z3', type: 'IMPEDANCE', x: 140, y: 40, rotation: 90, impedance: { re: 0, im: 20 } },
      { id: 'z2', name: 'Z2', type: 'IMPEDANCE', x: 200, y: 0, rotation: 0, impedance: { re: 20, im: -10 } },
      { id: 'g', name: 'GND', type: 'GND', x: 0, y: 100, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
      { id: 'w2', points: [{ x: 120, y: 0 }, { x: 140, y: 0 }, { x: 160, y: 0 }] },
      { id: 'w3', points: [{ x: 0, y: 80 }, { x: 140, y: 80 }] },
    ],
  };

  const sim = runSimulation(teeZ, 'AC');
  const outNode = sim.nodeMap['z2:2'];
  const th = extractTheveninNorton(teeZ, outNode, '0', 50);
  assert.equal(th.success, true);
  approx(th.vth.re, 60, 1e-3, 'Complex Tee Vth.re');
  approx(th.vth.im, 20, 1e-3, 'Complex Tee Vth.im');
  approx(th.zth.re, 24, 1e-3, 'Complex Tee Zth.re');
  approx(th.zth.im, -2, 1e-3, 'Complex Tee Zth.im');

  const passiveTee: CircuitState = {
    elements: teeZ.elements.filter((e) => e.id !== 'e1'),
    wires: teeZ.wires.filter((w) => w.id !== 'w1'),
  };
  const pSim = runSimulation(passiveTee, 'AC');
  const p1 = pSim.nodeMap['z1:1'];
  const p2 = pSim.nodeMap['z2:2'];
  const tp = extractTwoPort(passiveTee, p1, '0', p2, '0', 50);
  assert.equal(tp.success, true);
  approx(tp.Z![0][0].re, 10, 1e-3, 'Z11.re');
  approx(tp.Z![0][0].im, 30, 1e-3, 'Z11.im');
  approx(tp.Z![0][1].re, 0, 1e-3, 'Z12.re');
  approx(tp.Z![0][1].im, 20, 1e-3, 'Z12.im');
  approx(tp.Z![1][1].re, 20, 1e-3, 'Z22.re');
  approx(tp.Z![1][1].im, 10, 1e-3, 'Z22.im');
});

test('findMaxPowerImpedance: mạch mẫu 1 cửa (excludeElementId & open-port, đủ 4 chế độ ràng buộc)', () => {
  const preset = CIRCUIT_PRESETS.find((p) => p.id === 'max-power-1port');
  if (!preset) throw new Error('Thiếu mạch mẫu max-power-1port');

  // 1) Chế độ phối hợp liên hợp Z_L = Z_th* với nhánh tải Z1 được tách tự động
  const conj = findMaxPowerImpedance(preset.state, '', '', 50, {
    constraintMode: 'CONJUGATE',
    excludeElementId: 'z1',
  });
  if (!conj.success) throw new Error(`CONJUGATE thất bại: ${conj.error}`);
  approx(conj.vth.re, 50, 1e-3, 'Vth.re');
  approx(conj.vth.im, -25, 1e-3, 'Vth.im');
  approx(conj.zth.re, 25, 1e-3, 'Zth.re');
  approx(conj.zth.im, 12.5, 1e-3, 'Zth.im');
  approx(conj.zOpt.re, 25, 1e-3, 'Zopt.re (CONJUGATE)');
  approx(conj.zOpt.im, -12.5, 1e-3, 'Zopt.im (CONJUGATE)');
  approx(conj.pMax, 31.25, 1e-3, 'P_max (CONJUGATE)');
  approx(conj.pSimulated, 31.25, 1e-3, 'P_sim MNA (CONJUGATE)');
  approx(conj.qAtOpt, -15.625, 1e-3, 'Q tại P_max');
  approx(conj.theveninEfficiencyPct, 50, 1e-3, 'Hiệu suất Thévenin');
  if (conj.sweepPoints.length < 41) {
    throw new Error(`Số điểm đường cong quét quá ít: ${conj.sweepPoints.length}`);
  }

  // 2) Chế độ hở 2 cực mạng 1 cửa (không có Z1 trong mạch)
  const openPortState = {
    ...preset.state,
    elements: preset.state.elements.filter((e) => e.id !== 'z1'),
  };
  const openRes = findMaxPowerImpedance(openPortState, conj.nodeA, conj.nodeB, 50, {
    constraintMode: 'CONJUGATE',
  });
  if (!openRes.success) throw new Error(`Open-port thất bại: ${openRes.error}`);
  approx(openRes.pMax, 31.25, 1e-3, 'P_max open-port');
  approx(openRes.pSimulated, 31.25, 1e-3, 'P_sim open-port');

  // 3) Thuần trở R_L = |Z_th|
  const pureR = findMaxPowerImpedance(preset.state, '', '', 50, {
    constraintMode: 'PURE_RESISTIVE',
    excludeElementId: 'z1',
  });
  if (!pureR.success) throw new Error(`PURE_RESISTIVE thất bại: ${pureR.error}`);
  const magZth = Math.hypot(25, 12.5);
  const expectedPureRPmax = 3125 / (2 * (magZth + 25));
  approx(pureR.zOpt.re, magZth, 1e-3, 'R_opt (PURE_RESISTIVE)');
  approx(pureR.zOpt.im, 0, 1e-6, 'X_opt (PURE_RESISTIVE)');
  approx(pureR.pMax, expectedPureRPmax, 1e-3, 'P_max (PURE_RESISTIVE)');
  approx(pureR.pSimulated, expectedPureRPmax, 1e-3, 'P_sim (PURE_RESISTIVE)');

  // 4) Cố định X = 7.5 Ω => R_opt = sqrt(R_th^2 + (X_th + X)^2)
  const fixedX = findMaxPowerImpedance(preset.state, '', '', 50, {
    constraintMode: 'FIXED_X',
    fixedX: 7.5,
    excludeElementId: 'z1',
  });
  if (!fixedX.success) throw new Error(`FIXED_X thất bại: ${fixedX.error}`);
  const expectedFixedXR = Math.hypot(25, 12.5 + 7.5);
  approx(fixedX.zOpt.re, expectedFixedXR, 1e-3, 'R_opt (FIXED_X)');
  approx(fixedX.zOpt.im, 7.5, 1e-6, 'X (FIXED_X)');
  approx(fixedX.pSimulated, fixedX.pMax, 1e-3, 'P_sim == P_max (FIXED_X)');

  // 5) Cố định góc pha φ = 30° => |Z_opt| = |Z_th|
  const fixedAngle = findMaxPowerImpedance(preset.state, '', '', 50, {
    constraintMode: 'FIXED_ANGLE',
    fixedAngleDeg: 30,
    excludeElementId: 'z1',
  });
  if (!fixedAngle.success) throw new Error(`FIXED_ANGLE thất bại: ${fixedAngle.error}`);
  approx(fixedAngle.zOpt.re, magZth * Math.cos(Math.PI / 6), 1e-3, 'R_opt (FIXED_ANGLE)');
  approx(fixedAngle.zOpt.im, magZth * Math.sin(Math.PI / 6), 1e-3, 'X_opt (FIXED_ANGLE)');
  approx(fixedAngle.pSimulated, fixedAngle.pMax, 1e-3, 'P_sim == P_max (FIXED_ANGLE)');
});

test('findMaxPowerImpedance: mạch một chiều (DC 0 Hz)', () => {
  const dcState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 120, y: 200, rotation: 0, waveform: 'DC', dcValue: 24, acValue: 24, freqHz: 0 },
      { id: 'r1', name: 'R1', type: 'RESISTOR', x: 220, y: 120, rotation: 0, resistance: 6 },
      { id: 'r2', name: 'R2', type: 'RESISTOR', x: 320, y: 200, rotation: 90, resistance: 12 },
      { id: 'rl', name: 'RL', type: 'RESISTOR', x: 440, y: 200, rotation: 90, resistance: 100 },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 120, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 120, y: 120 }, { x: 180, y: 120 }] },
      { id: 'w2', points: [{ x: 260, y: 120 }, { x: 320, y: 120 }, { x: 440, y: 120 }, { x: 440, y: 160 }] },
      { id: 'w3', points: [{ x: 320, y: 120 }, { x: 320, y: 160 }] },
      { id: 'w4', points: [{ x: 120, y: 240 }, { x: 120, y: 280 }] },
      { id: 'w5', points: [{ x: 120, y: 280 }, { x: 320, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 240 }] },
      { id: 'w6', points: [{ x: 320, y: 240 }, { x: 320, y: 280 }] },
    ],
  };

  const res = findMaxPowerImpedance(dcState, '', '', 0, {
    constraintMode: 'CONJUGATE',
    excludeElementId: 'rl',
  });
  if (!res.success) throw new Error(`DC max power thất bại: ${res.error}`);
  approx(res.vth.re, 16, 1e-3, 'DC Vth');
  approx(res.zth.re, 4, 1e-3, 'DC Rth');
  approx(res.zOpt.re, 4, 1e-3, 'DC R_opt');
  approx(res.zOpt.im, 0, 1e-6, 'DC X_opt');
  approx(res.pMax, 16, 1e-3, 'DC P_max');
  approx(res.pSimulated, 16, 1e-3, 'DC P_sim');

  const dcFixedX = findMaxPowerImpedance(dcState, '', '', 0, {
    constraintMode: 'FIXED_X',
    fixedX: 10,
    excludeElementId: 'rl',
  });
  if (dcFixedX.success) {
    throw new Error('Mong đợi FIXED_X ở DC 0 Hz trả về success=false');
  }
});

test('findMaxPowerImpedance: mạng nguồn không tổn hao (R_th = 0) & kiểm tra cực chập', () => {
  const losslessState: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 120, y: 200, rotation: 0, waveform: 'AC', acValue: 100, amplitudeType: 'RMS', phaseDeg: 0, freqHz: 50 },
      { id: 'zs', name: 'Zs', type: 'IMPEDANCE', x: 220, y: 120, rotation: 0, impedance: { re: 0, im: 20 } },
      { id: 'zl', name: 'ZL', type: 'IMPEDANCE', x: 440, y: 200, rotation: 90, impedance: { re: 50, im: 0 } },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 120, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 120, y: 120 }, { x: 180, y: 120 }] },
      { id: 'w2', points: [{ x: 260, y: 120 }, { x: 440, y: 120 }, { x: 440, y: 160 }] },
      { id: 'w4', points: [{ x: 120, y: 240 }, { x: 120, y: 280 }] },
      { id: 'w5', points: [{ x: 120, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 240 }] },
    ],
  };

  const conjFail = findMaxPowerImpedance(losslessState, '', '', 50, {
    constraintMode: 'CONJUGATE',
    excludeElementId: 'zl',
  });
  if (conjFail.success) {
    throw new Error('Mong đợi CONJUGATE với R_th = 0 trả về success=false vì P -> vô cùng');
  }

  const pureR = findMaxPowerImpedance(losslessState, '', '', 50, {
    constraintMode: 'PURE_RESISTIVE',
    excludeElementId: 'zl',
  });
  if (!pureR.success) throw new Error(`PURE_RESISTIVE với R_th=0 thất bại: ${pureR.error}`);
  approx(pureR.zOpt.re, 20, 1e-3, 'Lossless PURE_RESISTIVE R_opt');
  approx(pureR.pMax, 250, 1e-3, 'Lossless PURE_RESISTIVE P_max');
  approx(pureR.pSimulated, 250, 1e-3, 'Lossless PURE_RESISTIVE P_sim');

  const shorted = findMaxPowerImpedance(losslessState, '0', '0', 50, {
    constraintMode: 'CONJUGATE',
  });
  if (shorted.success) {
    throw new Error('Mong đợi cặp nút chập (0, 0) trả về success=false');
  }
});

test('Hỗ cảm tổng trở (MUTUAL Z_OHM): mạch mẫu Hình 1 & quy đổi chấm cực (pin 1 / pin 2)', () => {
  const preset = CIRCUIT_PRESETS.find((p) => p.id === 'coupled-impedances');
  if (!preset) throw new Error('Thiếu mạch mẫu coupled-impedances');

  const ac = runSimulation(preset.state, 'AC');
  if (!ac.success) throw new Error('Giải AC mạch Hình 1 thất bại');
  approx(ac.powerBalance!.pGenerated, 36.8463, 1e-3, 'Hình 1 P_gen');
  approx(ac.powerBalance!.pConsumed, 36.8463, 1e-3, 'Hình 1 P_cons');

  const nodeA = ac.nodes.find((n) => n.nodeId === '2')!;
  approx(nodeA.phasorMag!, 3.015804, 1e-4, 'Hình 1 |Va|');
  approx(nodeA.phasorDeg!, -150.415, 1e-2, 'Hình 1 arg(Va)');

  const zl1 = ac.elements.find((e) => e.elementId === 'zl1')!;
  const zl2 = ac.elements.find((e) => e.elementId === 'zl2')!;
  const j3 = ac.elements.find((e) => e.elementId === 'j3')!;
  approx(zl1.voltagePhasorMag!, 7.2297, 1e-4, 'Hình 1 |U1|');
  approx(zl1.pWatts + zl2.pWatts, 0, 1e-6, 'Tổng P nhánh ghép hỗ cảm thuần kháng = 0');
  approx(j3.currentPhasorMag!, 2.16891, 1e-4, 'Hình 1 |J3|');
  approx(j3.pWatts, -19.907967, 1e-4, 'Hình 1 P(J3) (âm = phát 19.908 W)');
  approx(j3.qVars, 11.079778, 1e-4, 'Hình 1 Q(J3)');

  // Đảo đồng thời cả 2 chấm cực (1->2, 2->1): hiệu dấu hỗ cảm vẫn s = -1 nên kết quả giữ nguyên
  const swappedDotsState: CircuitState = {
    ...preset.state,
    elements: preset.state.elements.map((e) =>
      e.id === 'zm' ? { ...e, l1DotPin: 2, l2DotPin: 1, dotPolarity: -1 } : e,
    ),
  };
  const acSwapped = runSimulation(swappedDotsState, 'AC');
  if (!acSwapped.success) throw new Error('Swapped dots AC thất bại');
  approx(acSwapped.elements.find((e) => e.elementId === 'j3')!.pWatts, -19.907967, 1e-4, 'Đảo kép chấm cực giữ nguyên kết quả');

  // Đặt cùng cực (2-2 => s = +1): hệ vẫn bảo toàn công suất
  const samePolState: CircuitState = {
    ...preset.state,
    elements: preset.state.elements.map((e) =>
      e.id === 'zm' ? { ...e, l1DotPin: 2, l2DotPin: 2, dotPolarity: 1 } : e,
    ),
  };
  const acSame = runSimulation(samePolState, 'AC');
  if (!acSame.success) throw new Error('Same polarity AC thất bại');
  approx(acSame.powerBalance!.pGenerated, acSame.powerBalance!.pConsumed, 1e-5, 'Bảo toàn công suất khi đổi cực');
});

test('Hỗ cảm tổng trở (MUTUAL Z_OHM & Z–L): giải tích 2 vòng, phức R_M+jX_M, DC, Transient & CCCS', () => {
  const twoLoop: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 120, y: 200, rotation: 0, waveform: 'AC', acValue: 100, amplitudeType: 'RMS', phaseDeg: 0, freqHz: 50 },
      { id: 'z1', name: 'Z1', type: 'IMPEDANCE', x: 220, y: 120, rotation: 0, impedance: { re: 10, im: 20 } },
      { id: 'z2', name: 'Z2', type: 'IMPEDANCE', x: 340, y: 120, rotation: 0, impedance: { re: 15, im: 30 } },
      { id: 'rl', name: 'RL', type: 'RESISTOR', x: 440, y: 200, rotation: 90, resistance: 25 },
      { id: 'zm', name: 'ZM', type: 'MUTUAL', x: 280, y: 60, rotation: 0, l1Id: 'z1', l2Id: 'z2', l1DotPin: 1, l2DotPin: 1, dotPolarity: 1, mutualValueMode: 'Z_OHM', mutualZ: { re: 0, im: 10 } },
      { id: 'f1', name: 'F1', type: 'CCCS', x: 540, y: 200, rotation: 0, gain: 0.5, ctrlElementId: 'z1' },
      { id: 'rf', name: 'Rf', type: 'RESISTOR', x: 640, y: 200, rotation: 90, resistance: 20 },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 120, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 120, y: 120 }, { x: 180, y: 120 }] },
      { id: 'w2', points: [{ x: 260, y: 120 }, { x: 260, y: 280 }, { x: 120, y: 280 }, { x: 120, y: 240 }] },
      { id: 'w3', points: [{ x: 300, y: 120 }, { x: 300, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 240 }] },
      { id: 'w4', points: [{ x: 380, y: 120 }, { x: 440, y: 120 }, { x: 440, y: 160 }] },
      { id: 'w5', points: [{ x: 540, y: 160 }, { x: 540, y: 120 }, { x: 640, y: 120 }, { x: 640, y: 160 }] },
      { id: 'w6', points: [{ x: 540, y: 240 }, { x: 540, y: 280 }, { x: 640, y: 280 }, { x: 640, y: 240 }, { x: 640, y: 280 }] },
      { id: 'w7', points: [{ x: 260, y: 280 }, { x: 300, y: 280 }] },
      { id: 'w8', points: [{ x: 440, y: 280 }, { x: 540, y: 280 }] },
    ],
  };

  // Kiểm chứng giải tích 2 vòng: Z11 = 10+j20, Z22 = 40+j30, Zm = j10
  // det = (10+j20)(40+j30) - (j10)^2 = (400+j300+j800-600) - (-100) = -100 + j1100
  const det = new Complex(-100, 1100);
  const I1exp = new Complex(4000, 3000).div(det); // 100 * Z22 / det
  const I2exp = new Complex(0, -1000).div(det); // -100 * Zm / det

  const ac = runSimulation(twoLoop, 'AC');
  if (!ac.success) throw new Error('2-loop coupled impedance AC thất bại');
  const z1Res = ac.elements.find((e) => e.elementId === 'z1')!;
  const z2Res = ac.elements.find((e) => e.elementId === 'z2')!;
  const rfRes = ac.elements.find((e) => e.elementId === 'rf')!;
  approx(z1Res.currentPhasorMag!, I1exp.mag(), 1e-4, '|I1| coupled Z');
  approx(z1Res.currentPhasorDeg!, I1exp.deg(), 1e-2, 'arg(I1) coupled Z');
  approx(z2Res.currentPhasorMag!, I2exp.mag(), 1e-4, '|I2| coupled Z');
  approx(rfRes.currentPhasorMag!, 0.5 * I1exp.mag(), 1e-4, 'CCCS cảm biến đúng dòng Z1 có hỗ cảm');
  approx(ac.powerBalance!.pGenerated, ac.powerBalance!.pConsumed, 1e-4, 'Bảo toàn công suất 2 vòng + CCCS');

  // Kiểm chứng Quá độ (Transient) hội tụ về xác lập AC
  const tr = runSimulation(twoLoop, 'TRANSIENT', { dt: 0.0001, tEnd: 0.16 });
  if (!tr.success || !tr.transient) throw new Error('Transient coupled Z thất bại');
  const i1Series = tr.transient.elementCurrents['z1'];
  const lastPeriod = i1Series.slice(Math.max(0, i1Series.length - 200));
  const peakTransientI1 = Math.max(...lastPeriod.map((v) => Math.abs(v)));
  const expectedPeakI1 = I1exp.mag() * Math.SQRT2;
  approx(peakTransientI1, expectedPeakI1, expectedPeakI1 * 0.025, 'Transient I1 hội tụ xác lập AC');

  // Kiểm chứng Z_M có phần thực (R_M + jX_M) trong AC & DC (0 Hz)
  const complexZmState: CircuitState = {
    ...twoLoop,
    elements: twoLoop.elements.map((e) => {
      if (e.id === 'e1') return { ...e, waveform: 'DC', dcValue: 100 };
      if (e.id === 'zm') return { ...e, mutualZ: { re: 5, im: 10 } };
      return e;
    }),
  };
  const dcRes = runSimulation(complexZmState, 'DC');
  if (!dcRes.success) throw new Error('DC với R_M + jX_M thất bại');
  // DC: Z1=10, Z2+RL=40, Zm=5 => det = 400 - 25 = 375, I1 = 4000/375 = 10.6667, I2 = -500/375 = -1.3333
  approx(dcRes.elements.find((e) => e.elementId === 'z1')!.currentDc, 4000 / 375, 1e-4, 'DC I1 với R_M=5');
  approx(dcRes.elements.find((e) => e.elementId === 'z2')!.currentDc, -500 / 375, 1e-4, 'DC I2 với R_M=5');

  // Kiểm chứng ghép hỗn hợp Cuộn dây (L) và Tổng trở (Z) theo hệ số M (H)
  const mixedLZ: CircuitState = {
    ...twoLoop,
    elements: twoLoop.elements.map((e) => {
      if (e.id === 'z1') {
        return { id: 'z1', name: 'L1', type: 'INDUCTOR', x: 220, y: 120, rotation: 0, inductance: 20 / (2 * Math.PI * 50) };
      }
      if (e.id === 'zm') {
        return { ...e, mutualValueMode: 'M_HENRY', mutualM: 10 / (2 * Math.PI * 50) };
      }
      return e;
    }),
  };
  // Ở 50 Hz: Z_L1 = j20 (R1=0), Z2+RL = 40+j30, Zm = j10 => det = (j20)(40+j30) + 100 = -500 + j800
  const detLZ = new Complex(-500, 800);
  const I1_lz = new Complex(4000, 3000).div(detLZ);
  const acLZ = runSimulation(mixedLZ, 'AC');
  if (!acLZ.success) throw new Error('Mixed L-Z mutual AC thất bại');
  approx(acLZ.elements.find((e) => e.elementId === 'z1')!.currentPhasorMag!, I1_lz.mag(), 1e-4, 'Ghép L-Z |I1|');
  approx(acLZ.elements.find((e) => e.elementId === 'rf')!.currentPhasorMag!, 0.5 * I1_lz.mag(), 1e-4, 'Ghép L-Z CCCS');

  // Kiểm chứng Quá độ ổn định cho tổng trở dung tính (X < 0) ghép hỗ cảm Z_M
  const capCoupled: CircuitState = {
    ...twoLoop,
    elements: twoLoop.elements.map((e) => {
      if (e.id === 'z1') return { ...e, impedance: { re: 20, im: -15 } };
      if (e.id === 'z2') return { ...e, impedance: { re: 25, im: -10 } };
      if (e.id === 'zm') return { ...e, mutualZ: { re: 0, im: 5 } };
      return e;
    }),
  };
  const acCap = runSimulation(capCoupled, 'AC');
  const trCap = runSimulation(capCoupled, 'TRANSIENT', { dt: 0.0001, tEnd: 0.14 });
  if (!acCap.success || !trCap.success || !trCap.transient) throw new Error('Capacitive coupled Z transient thất bại');
  const peakAcCap = acCap.elements.find((e) => e.elementId === 'z1')!.currentPhasorMag! * Math.SQRT2;
  const peakTrCap = Math.max(...trCap.transient.elementCurrents['z1'].slice(-200).map((v) => Math.abs(v)));
  approx(peakTrCap, peakAcCap, peakAcCap * 0.025, 'Transient ổn định & hội tụ với tổng trở dung tính X < 0 ghép Z_M');
});

test('Hỗ cảm tổng trở (MUTUAL Z_OHM): cảnh báo k > 1 & tương thích Thévenin / P_max', () => {
  const state: CircuitState = {
    elements: [
      { id: 'e1', name: 'E1', type: 'V_SRC', x: 120, y: 200, rotation: 0, waveform: 'AC', acValue: 50, amplitudeType: 'RMS', phaseDeg: 0, freqHz: 50 },
      { id: 'z1', name: 'Z1', type: 'IMPEDANCE', x: 220, y: 120, rotation: 0, impedance: { re: 4, im: 10 } },
      { id: 'z2', name: 'Z2', type: 'IMPEDANCE', x: 340, y: 120, rotation: 0, impedance: { re: 6, im: 10 } },
      { id: 'rl', name: 'RL', type: 'RESISTOR', x: 440, y: 200, rotation: 90, resistance: 20 },
      { id: 'zm', name: 'ZM', type: 'MUTUAL', x: 280, y: 60, rotation: 0, l1Id: 'z1', l2Id: 'z2', l1DotPin: 1, l2DotPin: 1, dotPolarity: 1, mutualValueMode: 'Z_OHM', mutualZ: { re: 0, im: 15 } },
      { id: 'gnd1', name: 'GND', type: 'GND', x: 120, y: 300, rotation: 0 },
    ],
    wires: [
      { id: 'w1', points: [{ x: 120, y: 160 }, { x: 120, y: 120 }, { x: 180, y: 120 }] },
      { id: 'w2', points: [{ x: 260, y: 120 }, { x: 260, y: 280 }, { x: 120, y: 280 }, { x: 120, y: 240 }] },
      { id: 'w3', points: [{ x: 300, y: 120 }, { x: 300, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 240 }] },
      { id: 'w4', points: [{ x: 380, y: 120 }, { x: 440, y: 120 }, { x: 440, y: 160 }] },
      { id: 'w5', points: [{ x: 260, y: 280 }, { x: 300, y: 280 }] },
    ],
  };

  // |X_M| = 15 > sqrt(10*10) = 10 -> có cảnh báo nhưng vẫn giải bình thường
  const sim = runSimulation(state, 'AC');
  if (!sim.success) throw new Error('Giải AC khi k > 1 thất bại');
  if (!sim.diagnostics.some((d) => d.level === 'warning' && d.text.includes('k > 1'))) {
    throw new Error('Mong đợi cảnh báo hệ số ghép k > 1 cho tổng trở Z');
  }

  // Thévenin & P_max tại RL (tách RL, giữ cặp ghép Z1-Z2)
  const mp = findMaxPowerImpedance(state, '', '', 50, {
    constraintMode: 'CONJUGATE',
    excludeElementId: 'rl',
  });
  if (!mp.success) throw new Error(`findMaxPowerImpedance thất bại: ${mp.error}`);
  approx(mp.pSimulated, mp.pMax, 1e-4, 'P_sim MNA khớp P_max trên mạch có hỗ cảm Z_M');
});


