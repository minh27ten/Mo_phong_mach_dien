import {
  CircuitElement,
  CircuitState,
  ComplexInput,
  DiagnosticMessage,
  ElementBranchResult,
  HarmonicComponent,
  NodeVoltageResult,
  SimulationMode,
  SimulationResult,
  TheveninNortonResult,
  TransientSeries,
  TwoPortExtractResult,
} from '../types/circuit';
import { Complex, solveLinearComplex, solveLinearReal } from './complex';
import { buildNetlist, NetlistGraph } from './netlist';

const G_MIN = 1e-12;
const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);

function toComplex(c?: ComplexInput, fallbackRe = 0, fallbackIm = 0): Complex {
  if (!c) return new Complex(fallbackRe, fallbackIm);
  return new Complex(Number.isFinite(c.re) ? c.re : fallbackRe, Number.isFinite(c.im) ? c.im : fallbackIm);
}

function sinusoidToPhasor(
  raw: number,
  ampType: 'RMS' | 'PEAK',
  freqHz: number,
  phaseDeg: number,
): { freqHz: number; phasorRms: Complex } {
  const safeRaw = Number.isFinite(raw) ? raw : 0;
  const freq = Number.isFinite(freqHz) ? Math.max(0, freqHz) : 0;
  const phase = Number.isFinite(phaseDeg) ? phaseDeg : 0;
  if (freq <= 1e-9) {
    // Với f = 0 Hz, u(t) = Um * cos(phi) là nguồn DC thực thuần
    const peak = ampType === 'RMS' ? safeRaw * SQRT2 : safeRaw;
    const rad = (phase * Math.PI) / 180;
    return { freqHz: 0, phasorRms: new Complex(peak * Math.cos(rad), 0) };
  }
  const rms = ampType === 'PEAK' ? safeRaw / SQRT2 : safeRaw;
  return { freqHz: freq, phasorRms: Complex.fromPolar(rms, phase) };
}

export function getSourceComponents(
  el: CircuitElement,
): Array<{ freqHz: number; phasorRms: Complex }> {
  const wf = el.waveform ?? 'DC';
  if (wf === 'DC') {
    return [{ freqHz: 0, phasorRms: new Complex(el.dcValue ?? 0, 0) }];
  }
  if (wf === 'STEP') {
    // Trong chế độ xác lập (DC/AC), nguồn step đóng mạch về giá trị sau cùng
    return [{ freqHz: 0, phasorRms: new Complex(el.stepFinal ?? 0, 0) }];
  }
  const ampType = el.amplitudeType ?? 'RMS';
  if (wf === 'MIXED') {
    const dcOffset = Number.isFinite(el.mixedDcValue)
      ? (el.mixedDcValue as number)
      : (el.dcValue ?? 0);
    const buckets: Array<{ freqHz: number; phasorRms: Complex }> = [
      { freqHz: 0, phasorRms: new Complex(dcOffset, 0) },
    ];
    for (const h of el.harmonics ?? []) {
      const comp = sinusoidToPhasor(h.amplitude, ampType, h.freqHz, h.phaseDeg);
      const existing = buckets.find((b) => Math.abs(b.freqHz - comp.freqHz) < 1e-6);
      if (existing) {
        existing.phasorRms = existing.phasorRms.add(comp.phasorRms);
      } else {
        buckets.push(comp);
      }
    }
    return buckets.sort((a, b) => a.freqHz - b.freqHz);
  }
  // AC Sine
  return [sinusoidToPhasor(el.acValue ?? 0, ampType, el.freqHz ?? 50, el.phaseDeg ?? 0)];
}

export function getSourcePhasorAtFreq(el: CircuitElement, targetFreqHz: number): Complex {
  let sum = Complex.zero();
  for (const c of getSourceComponents(el)) {
    if (Math.abs(c.freqHz - targetFreqHz) < 1e-6) {
      sum = sum.add(c.phasorRms);
    }
  }
  return sum;
}

export function getSourceHarmonicSummary(el: CircuitElement): {
  dc: number;
  acRms: number;
  totalRms: number;
  harmonics: Array<{ freqHz: number; rms: number; peak: number; phaseDeg: number }>;
  instantaneous: string;
} {
  let dc = 0;
  let acSq = 0;
  const harmonics: Array<{ freqHz: number; rms: number; peak: number; phaseDeg: number }> = [];
  for (const c of getSourceComponents(el)) {
    if (c.freqHz === 0) {
      dc += c.phasorRms.re;
    } else {
      const rms = c.phasorRms.mag();
      if (rms > 1e-12) {
        acSq += rms * rms;
        harmonics.push({
          freqHz: c.freqHz,
          rms,
          peak: rms * SQRT2,
          phaseDeg: c.phasorRms.deg(),
        });
      }
    }
  }
  const acRms = Math.sqrt(acSq);
  const totalRms = Math.hypot(dc, acRms);
  return {
    dc,
    acRms,
    totalRms,
    harmonics,
    instantaneous: formatInstantaneous(dc, harmonics),
  };
}

function getSourceTransientValue(el: CircuitElement, t: number): number {
  const wf = el.waveform ?? 'DC';
  if (wf === 'DC') return el.dcValue ?? 0;
  if (wf === 'STEP') {
    const tStep = el.stepTime ?? 0;
    return t >= tStep - 1e-12 ? (el.stepFinal ?? 0) : (el.stepInit ?? 0);
  }
  const ampType = el.amplitudeType ?? 'RMS';
  if (wf === 'MIXED') {
    let val = Number.isFinite(el.mixedDcValue)
      ? (el.mixedDcValue as number)
      : (el.dcValue ?? 0);
    for (const h of el.harmonics ?? []) {
      const raw = Number.isFinite(h.amplitude) ? h.amplitude : 0;
      const peak = ampType === 'RMS' ? raw * SQRT2 : raw;
      const freq = Number.isFinite(h.freqHz) ? Math.max(0, h.freqHz) : 0;
      const rad = ((Number.isFinite(h.phaseDeg) ? h.phaseDeg : 0) * Math.PI) / 180;
      val += peak * Math.cos(2 * Math.PI * freq * t + rad);
    }
    return val;
  }
  // AC Sine: u(t) = Um * cos(2*pi*f*t + phi)
  const raw = el.acValue ?? 0;
  const peak = ampType === 'RMS' ? raw * SQRT2 : raw;
  const freq = el.freqHz ?? 50;
  const rad = ((el.phaseDeg ?? 0) * Math.PI) / 180;
  return peak * Math.cos(2 * Math.PI * freq * t + rad);
}

interface MnaLinearSystem {
  A: Complex[][];
  b: Complex[];
  totalSize: number;
  nodeIdToIdx: Map<string, number>;
  senseBranchVar: Map<string, number>; // elementId -> biến dòng cảm biến I (từ chân 1 -> chân 2)
  elementAuxMap: Map<string, Record<string, number>>; // elementId -> tên phụ -> chỉ số biến MNA
  internalNodes: Map<string, Record<string, number>>; // elementId -> tên nút nội -> node index
}

function addEntry(A: Complex[][], r: number, c: number, val: Complex) {
  if (r < 0 || c < 0) return;
  A[r][c] = A[r][c].add(val);
}

function addRhs(b: Complex[], r: number, val: Complex) {
  if (r < 0) return;
  b[r] = b[r].add(val);
}

function stampConductance(A: Complex[][], p: number, n: number, Y: Complex) {
  if (p >= 0) addEntry(A, p, p, Y);
  if (n >= 0) addEntry(A, n, n, Y);
  if (p >= 0 && n >= 0) {
    addEntry(A, p, n, Y.neg());
    addEntry(A, n, p, Y.neg());
  }
}

const SHORT_ADMITTANCE = 1e9;

function effectiveAdmittance(Z: Complex): Complex {
  return Z.mag() < 1e-12 ? new Complex(SHORT_ADMITTANCE, 0) : Z.inv();
}

function branchCurrentFromImpedance(v: Complex, Z: Complex): Complex {
  return Z.mag() < 1e-12 ? v.scale(SHORT_ADMITTANCE) : v.div(Z);
}

function stampImpedance(A: Complex[][], p: number, n: number, Z: Complex) {
  stampConductance(A, p, n, effectiveAdmittance(Z));
}

function stampVoltageSource(
  A: Complex[][],
  b: Complex[],
  p: number,
  n: number,
  auxIdx: number,
  V: Complex,
) {
  if (p >= 0) {
    addEntry(A, p, auxIdx, Complex.one());
    addEntry(A, auxIdx, p, Complex.one());
  }
  if (n >= 0) {
    addEntry(A, n, auxIdx, Complex.one().neg());
    addEntry(A, auxIdx, n, Complex.one().neg());
  }
  addRhs(b, auxIdx, V);
}

function stampCurrentSource(b: Complex[], p: number, n: number, I_out_p: Complex) {
  // Dòng I_out_p đi từ cực n vào cực p bên trong nguồn (tức đi vào nút p, rời nút n)
  if (p >= 0) addRhs(b, p, I_out_p);
  if (n >= 0) addRhs(b, n, I_out_p.neg());
}

/**
 * Xây dựng và giải một hệ MNA tuyến tính phức cho tần số f (f = 0 cho DC).
 */
function solveSingleFrequencyMna(
  elements: CircuitElement[],
  netlist: NetlistGraph,
  targetFreqHz: number,
  mode: 'DC' | 'DC_SS' | 'AC',
  options?: {
    disableIndependentSources?: boolean;
    extraStamp?: (ctx: {
      A: Complex[][];
      b: Complex[];
      getNodeIdx: (nodeId: string) => number;
      allocAux: () => number;
    }) => void;
    extraAuxCount?: number;
  },
): {
  success: boolean;
  error?: string;
  x?: Complex[];
  sys?: MnaLinearSystem;
  nodeVoltages: Map<string, Complex>;
} {
  const realNodeIds = netlist.allNodeIds.filter((id) => id !== '0');
  const nodeIdToIdx = new Map<string, number>();
  nodeIdToIdx.set('0', -1);
  realNodeIds.forEach((id, i) => nodeIdToIdx.set(id, i));

  let nextNodeIdx = realNodeIds.length;
  const allocNode = () => nextNodeIdx++;

  // Xác định các phần tử cần biến dòng cảm biến (được CCVS / CCCS tham chiếu)
  const sensedIds = new Set<string>();
  for (const el of elements) {
    if ((el.type === 'CCVS' || el.type === 'CCCS') && el.ctrlElementId) {
      sensedIds.add(el.ctrlElementId);
    }
  }

  const elementAuxMap = new Map<string, Record<string, number>>();
  const internalNodes = new Map<string, Record<string, number>>();
  const senseBranchVar = new Map<string, number>();

  // Đếm trước số nút nội & số biến phụ (aux)
  type AuxSpec = { elId: string; key: string };
  const auxSpecs: AuxSpec[] = [];
  const registerAux = (elId: string, key: string): number => {
    const idx = auxSpecs.length;
    auxSpecs.push({ elId, key });
    const rec = elementAuxMap.get(elId) ?? {};
    rec[key] = idx;
    elementAuxMap.set(elId, rec);
    return idx;
  };

  for (const el of elements) {
    if (el.type === 'V_SRC' || el.type === 'VCVS' || el.type === 'CCVS') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
    } else if (el.type === 'INDUCTOR') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
    } else if (el.type === 'OPAMP') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) {
        senseBranchVar.set(el.id, idx);
      }
    } else if (el.type === 'ONE_PORT') {
      if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
        const mid = allocNode();
        internalNodes.set(el.id, { mid });
        const idx = registerAux(el.id, 'i');
        if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
      } else if (sensedIds.has(el.id)) {
        const mid = allocNode();
        internalNodes.set(el.id, { sense: mid });
        const idx = registerAux(el.id, 'sense');
        senseBranchVar.set(el.id, idx);
      }
    } else if (el.type === 'TWO_PORT') {
      const t = el.twoPortType ?? 'Z';
      if (t === 'Z' || t === 'A') {
        registerAux(el.id, 'i1');
        registerAux(el.id, 'i2');
      }
    } else if (el.type === 'THREE_PHASE_SRC') {
      if ((el.tpConnection ?? 'Y') === 'Y') {
        registerAux(el.id, 'ia');
        registerAux(el.id, 'ib');
        registerAux(el.id, 'ic');
      } else {
        // Delta: 3 nhánh nguồn áp nối tiếp điện trở nội r0 = 1e-5 Ohm qua 3 nút nội
        internalNodes.set(el.id, {
          ab: allocNode(),
          bc: allocNode(),
          ca: allocNode(),
        });
        registerAux(el.id, 'iab');
        registerAux(el.id, 'ibc');
        registerAux(el.id, 'ica');
      }
    } else if (el.type === 'THREE_PHASE_LOAD') {
      if ((el.loadConnection ?? 'Y') === 'Y' && el.loadNeutralConnected === false) {
        internalNodes.set(el.id, { nstar: allocNode() });
      }
    } else if (
      sensedIds.has(el.id) &&
      (el.type === 'RESISTOR' ||
        el.type === 'CAPACITOR' ||
        el.type === 'IMPEDANCE' ||
        el.type === 'I_SRC' ||
        el.type === 'VCCS' ||
        el.type === 'CCCS')
    ) {
      const mid = allocNode();
      internalNodes.set(el.id, { sense: mid });
      const idx = registerAux(el.id, 'sense');
      senseBranchVar.set(el.id, idx);
    }
  }

  const baseNodes = nextNodeIdx;
  const extraAux = options?.extraAuxCount ?? 0;
  const totalSize = baseNodes + auxSpecs.length + extraAux;

  // Cập nhật chỉ số thực (offset = baseNodes)
  for (const [elId, rec] of elementAuxMap.entries()) {
    for (const k of Object.keys(rec)) {
      rec[k] += baseNodes;
    }
    if (senseBranchVar.has(elId)) {
      senseBranchVar.set(elId, senseBranchVar.get(elId)! + baseNodes);
    }
  }

  const A: Complex[][] = Array.from({ length: totalSize }, () =>
    Array.from({ length: totalSize }, () => Complex.zero()),
  );
  const b: Complex[] = Array.from({ length: totalSize }, () => Complex.zero());

  // Regularization G_min trên toàn bộ các nút điện áp
  for (let i = 0; i < baseNodes; i++) {
    addEntry(A, i, i, new Complex(G_MIN, 0));
  }

  const getPinNode = (elId: string, pinId: string): number => {
    const nid = netlist.nodeMap[`${elId}:${pinId}`] ?? '0';
    return nodeIdToIdx.get(nid) ?? -1;
  };

  const getEffectivePin1 = (el: CircuitElement, defaultPin: string): number => {
    const senseNode = internalNodes.get(el.id)?.sense;
    if (senseNode !== undefined) {
      const extP1 = getPinNode(el.id, defaultPin);
      const sAux = elementAuxMap.get(el.id)!.sense;
      // Nguồn áp 0V từ extP1 -> senseNode (dòng sAux đi từ extP1 vào phần tử)
      stampVoltageSource(A, b, extP1, senseNode, sAux, Complex.zero());
      return senseNode;
    }
    return getPinNode(el.id, defaultPin);
  };

  const omega = 2 * Math.PI * targetFreqHz;
  const isDc = targetFreqHz === 0 || mode === 'DC' || mode === 'DC_SS';

  for (const el of elements) {
    switch (el.type) {
      case 'GND':
        break;
      case 'V_SRC': {
        const p = getPinNode(el.id, 'p');
        const n = getPinNode(el.id, 'n');
        const aux = elementAuxMap.get(el.id)!.i;
        let V = Complex.zero();
        if (!options?.disableIndependentSources) {
          V = getSourcePhasorAtFreq(el, targetFreqHz);
        }
        stampVoltageSource(A, b, p, n, aux, V);
        break;
      }
      case 'I_SRC': {
        const p = getEffectivePin1(el, 'p');
        const n = getPinNode(el.id, 'n');
        let I = Complex.zero();
        if (!options?.disableIndependentSources) {
          I = getSourcePhasorAtFreq(el, targetFreqHz);
        }
        stampCurrentSource(b, p, n, I);
        break;
      }
      case 'RESISTOR': {
        const p = getEffectivePin1(el, '1');
        const n = getPinNode(el.id, '2');
        const R = Math.max(1e-9, el.resistance ?? 100);
        stampConductance(A, p, n, new Complex(1 / R, 0));
        break;
      }
      case 'IMPEDANCE': {
        const p = getEffectivePin1(el, '1');
        const n = getPinNode(el.id, '2');
        const zRaw = toComplex(el.impedance, 40, 30);
        const Z = isDc ? new Complex(zRaw.re, 0) : zRaw;
        stampImpedance(A, p, n, Z);
        break;
      }
      case 'CAPACITOR': {
        const p = getEffectivePin1(el, '1');
        const n = getPinNode(el.id, '2');
        if (!isDc) {
          const C = Math.max(0, el.capacitance ?? 1e-6);
          const Y = new Complex(0, omega * C);
          stampConductance(A, p, n, Y);
        }
        break;
      }
      case 'INDUCTOR': {
        const p = getPinNode(el.id, '1');
        const n = getPinNode(el.id, '2');
        const aux = elementAuxMap.get(el.id)!.i;
        if (p >= 0) {
          addEntry(A, p, aux, Complex.one());
          addEntry(A, aux, p, Complex.one());
        }
        if (n >= 0) {
          addEntry(A, n, aux, Complex.one().neg());
          addEntry(A, aux, n, Complex.one().neg());
        }
        if (!isDc) {
          const L = Math.max(0, el.inductance ?? 0.1);
          // V1 - V2 - j*w*L*I1 - sum(j*w*s*M*I2) = 0
          addEntry(A, aux, aux, new Complex(0, -omega * L));
        }
        break;
      }
      case 'MUTUAL': {
        if (!isDc && el.l1Id && el.l2Id && el.l1Id !== el.l2Id) {
          const aux1 = elementAuxMap.get(el.l1Id)?.i;
          const aux2 = elementAuxMap.get(el.l2Id)?.i;
          if (aux1 !== undefined && aux2 !== undefined) {
            const s = el.dotPolarity ?? 1;
            const M = (el.mutualM ?? 0) * s;
            const negJwM = new Complex(0, -omega * M);
            addEntry(A, aux1, aux2, negJwM);
            addEntry(A, aux2, aux1, negJwM);
          }
        }
        break;
      }
      case 'VCVS': {
        const p = getPinNode(el.id, 'p');
        const n = getPinNode(el.id, 'n');
        const aux = elementAuxMap.get(el.id)!.i;
        const cp = nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1;
        const cn = nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1;
        const mu = el.gain ?? 1;
        if (p >= 0) {
          addEntry(A, p, aux, Complex.one());
          addEntry(A, aux, p, Complex.one());
        }
        if (n >= 0) {
          addEntry(A, n, aux, Complex.one().neg());
          addEntry(A, aux, n, Complex.one().neg());
        }
        if (cp >= 0) addEntry(A, aux, cp, new Complex(-mu, 0));
        if (cn >= 0) addEntry(A, aux, cn, new Complex(mu, 0));
        break;
      }
      case 'CCVS': {
        const p = getPinNode(el.id, 'p');
        const n = getPinNode(el.id, 'n');
        const aux = elementAuxMap.get(el.id)!.i;
        const r = el.gain ?? 1;
        const ctrlIdx = el.ctrlElementId ? senseBranchVar.get(el.ctrlElementId) : undefined;
        if (p >= 0) {
          addEntry(A, p, aux, Complex.one());
          addEntry(A, aux, p, Complex.one());
        }
        if (n >= 0) {
          addEntry(A, n, aux, Complex.one().neg());
          addEntry(A, aux, n, Complex.one().neg());
        }
        if (ctrlIdx !== undefined) {
          addEntry(A, aux, ctrlIdx, new Complex(-r, 0));
        }
        break;
      }
      case 'VCCS': {
        const p = getEffectivePin1(el, 'p');
        const n = getPinNode(el.id, 'n');
        const cp = nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1;
        const cn = nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1;
        const g = new Complex(el.gain ?? 0, 0);
        // Dòng g*(Vcp - Vcn) đi vào p (rời n)
        if (p >= 0) {
          if (cp >= 0) addEntry(A, p, cp, g.neg());
          if (cn >= 0) addEntry(A, p, cn, g);
        }
        if (n >= 0) {
          if (cp >= 0) addEntry(A, n, cp, g);
          if (cn >= 0) addEntry(A, n, cn, g.neg());
        }
        break;
      }
      case 'CCCS': {
        const p = getEffectivePin1(el, 'p');
        const n = getPinNode(el.id, 'n');
        const beta = new Complex(el.gain ?? 0, 0);
        const ctrlIdx = el.ctrlElementId ? senseBranchVar.get(el.ctrlElementId) : undefined;
        if (ctrlIdx !== undefined) {
          // Dòng beta * I_ctrl đi vào p, rời n
          if (p >= 0) addEntry(A, p, ctrlIdx, beta.neg());
          if (n >= 0) addEntry(A, n, ctrlIdx, beta);
        }
        break;
      }
      case 'OPAMP': {
        const vp = getPinNode(el.id, 'vp');
        const vn = getPinNode(el.id, 'vn');
        const vout = getPinNode(el.id, 'out');
        const aux = elementAuxMap.get(el.id)!.i;
        if (vout >= 0) addEntry(A, vout, aux, Complex.one());
        if (vp >= 0) addEntry(A, aux, vp, Complex.one());
        if (vn >= 0) addEntry(A, aux, vn, Complex.one().neg());
        break;
      }
      case 'ONE_PORT': {
        const opFreq = el.onePortFreqHz ?? 50;
        const activeThisFreq =
          !options?.disableIndependentSources && Math.abs(opFreq - targetFreqHz) < 1e-6;
        const srcPhasor = activeThisFreq
          ? isDc
            ? new Complex(el.onePortMag ?? 0, 0)
            : Complex.fromPolar(el.onePortMag ?? 0, el.onePortPhaseDeg ?? 0)
          : Complex.zero();

        if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
          const p = getPinNode(el.id, '1');
          const n = getPinNode(el.id, '2');
          const mid = internalNodes.get(el.id)!.mid;
          const aux = elementAuxMap.get(el.id)!.i;
          const zRaw = toComplex(el.onePortZ, 50, 0);
          const Z = isDc ? new Complex(Math.max(0, zRaw.re), 0) : zRaw;
          // Nguồn Vth từ n lên mid, tổng trở Zth từ mid sang p (để dòng i từ p -> n)
          stampVoltageSource(A, b, mid, n, aux, srcPhasor);
          stampImpedance(A, p, mid, Z);
        } else {
          const p = getEffectivePin1(el, '1');
          const n = getPinNode(el.id, '2');
          const yRaw = toComplex(el.onePortZ, 0.02, 0);
          const Y = isDc ? new Complex(Math.max(0, yRaw.re), 0) : yRaw;
          stampConductance(A, p, n, Y);
          stampCurrentSource(b, p, n, srcPhasor);
        }
        break;
      }
      case 'TWO_PORT': {
        const p1 = getPinNode(el.id, '1');
        const p1p = getPinNode(el.id, '1p');
        const p2 = getPinNode(el.id, '2');
        const p2p = getPinNode(el.id, '2p');
        const m11 = toComplex(el.m11, 20, 0);
        const m12 = toComplex(el.m12, 10, 0);
        const m21 = toComplex(el.m21, 10, 0);
        const m22 = toComplex(el.m22, 20, 0);
        const eff = (c: Complex) => (isDc ? new Complex(c.re, 0) : c);
        const k11 = eff(m11);
        const k12 = eff(m12);
        const k21 = eff(m21);
        const k22 = eff(m22);
        const tpType = el.twoPortType ?? 'Z';

        if (tpType === 'Y') {
          // I1 = Y11(V1 - V1') + Y12(V2 - V2') rời p1 vào 2-cửa (vào p1')
          const stampPortRow = (nPos: number, nNeg: number, vPos: number, vNeg: number, Y: Complex) => {
            if (nPos >= 0) {
              if (vPos >= 0) addEntry(A, nPos, vPos, Y);
              if (vNeg >= 0) addEntry(A, nPos, vNeg, Y.neg());
            }
            if (nNeg >= 0) {
              if (vPos >= 0) addEntry(A, nNeg, vPos, Y.neg());
              if (vNeg >= 0) addEntry(A, nNeg, vNeg, Y);
            }
          };
          stampPortRow(p1, p1p, p1, p1p, k11);
          stampPortRow(p1, p1p, p2, p2p, k12);
          stampPortRow(p2, p2p, p1, p1p, k21);
          stampPortRow(p2, p2p, p2, p2p, k22);
        } else if (tpType === 'Z') {
          const i1 = elementAuxMap.get(el.id)!.i1;
          const i2 = elementAuxMap.get(el.id)!.i2;
          if (p1 >= 0) {
            addEntry(A, p1, i1, Complex.one());
            addEntry(A, i1, p1, Complex.one());
          }
          if (p1p >= 0) {
            addEntry(A, p1p, i1, Complex.one().neg());
            addEntry(A, i1, p1p, Complex.one().neg());
          }
          if (p2 >= 0) {
            addEntry(A, p2, i2, Complex.one());
            addEntry(A, i2, p2, Complex.one());
          }
          if (p2p >= 0) {
            addEntry(A, p2p, i2, Complex.one().neg());
            addEntry(A, i2, p2p, Complex.one().neg());
          }
          addEntry(A, i1, i1, k11.neg());
          addEntry(A, i1, i2, k12.neg());
          addEntry(A, i2, i1, k21.neg());
          addEntry(A, i2, i2, k22.neg());
        } else {
          // Ma trận truyền đạt [A]:
          // V1 - V1' - A*(V2 - V2') + B*I2 = 0  (với I2 đi vào cực 2)
          // I1 - C*(V2 - V2') + D*I2 = 0
          const i1 = elementAuxMap.get(el.id)!.i1;
          const i2 = elementAuxMap.get(el.id)!.i2;
          if (p1 >= 0) addEntry(A, p1, i1, Complex.one());
          if (p1p >= 0) addEntry(A, p1p, i1, Complex.one().neg());
          if (p2 >= 0) addEntry(A, p2, i2, Complex.one());
          if (p2p >= 0) addEntry(A, p2p, i2, Complex.one().neg());

          if (p1 >= 0) addEntry(A, i1, p1, Complex.one());
          if (p1p >= 0) addEntry(A, i1, p1p, Complex.one().neg());
          if (p2 >= 0) addEntry(A, i1, p2, k11.neg()); // -A
          if (p2p >= 0) addEntry(A, i1, p2p, k11);
          addEntry(A, i1, i2, k12); // +B

          addEntry(A, i2, i1, Complex.one()); // I1
          if (p2 >= 0) addEntry(A, i2, p2, k21.neg()); // -C
          if (p2p >= 0) addEntry(A, i2, p2p, k21);
          addEntry(A, i2, i2, k22); // +D
        }
        break;
      }
      case 'THREE_PHASE_SRC': {
        const A_n = getPinNode(el.id, 'A');
        const B_n = getPinNode(el.id, 'B');
        const C_n = getPinNode(el.id, 'C');
        const N_n = getPinNode(el.id, 'N');
        const srcFreq = el.tpFreqHz ?? 50;
        const active =
          !options?.disableIndependentSources &&
          !isDc &&
          Math.abs(srcFreq - targetFreqHz) < 1e-6;
        const U = el.tpVoltageRms ?? 220;
        const phiA = el.tpPhaseADeg ?? 0;
        const seqSign = (el.tpSequence ?? 'ABC') === 'ABC' ? 1 : -1;

        if ((el.tpConnection ?? 'Y') === 'Y') {
          const Uph = (el.tpVoltageMode ?? 'PHASE') === 'PHASE' ? U : U / SQRT3;
          const Va = active ? Complex.fromPolar(Uph, phiA) : Complex.zero();
          const Vb = active ? Complex.fromPolar(Uph, phiA - 120 * seqSign) : Complex.zero();
          const Vc = active ? Complex.fromPolar(Uph, phiA + 120 * seqSign) : Complex.zero();
          const aux = elementAuxMap.get(el.id)!;
          stampVoltageSource(A, b, A_n, N_n, aux.ia, Va);
          stampVoltageSource(A, b, B_n, N_n, aux.ib, Vb);
          stampVoltageSource(A, b, C_n, N_n, aux.ic, Vc);
        } else {
          const Uline = (el.tpVoltageMode ?? 'LINE') === 'LINE' ? U : U * SQRT3;
          const Vab = active ? Complex.fromPolar(Uline, phiA + 30 * seqSign) : Complex.zero();
          const Vbc = active ? Complex.fromPolar(Uline, phiA - 90 * seqSign) : Complex.zero();
          const Vca = active ? Complex.fromPolar(Uline, phiA + 150 * seqSign) : Complex.zero();
          const nodes = internalNodes.get(el.id)!;
          const aux = elementAuxMap.get(el.id)!;
          const r0 = new Complex(1e-5, 0); // Điện trở nội nhỏ tránh vòng nguồn áp lý tưởng
          stampVoltageSource(A, b, nodes.ab, B_n, aux.iab, Vab);
          stampImpedance(A, A_n, nodes.ab, r0);
          stampVoltageSource(A, b, nodes.bc, C_n, aux.ibc, Vbc);
          stampImpedance(A, B_n, nodes.bc, r0);
          stampVoltageSource(A, b, nodes.ca, A_n, aux.ica, Vca);
          stampImpedance(A, C_n, nodes.ca, r0);
        }
        break;
      }
      case 'THREE_PHASE_LINE': {
        const zRaw = toComplex(el.lineZ, 1.5, 3.0);
        const znRaw = toComplex(el.lineZn, 2.0, 1.0);
        const Zd = isDc ? new Complex(zRaw.re, 0) : zRaw;
        const Zn = isDc ? new Complex(znRaw.re, 0) : znRaw;
        stampImpedance(A, getPinNode(el.id, 'A1'), getPinNode(el.id, 'A2'), Zd);
        stampImpedance(A, getPinNode(el.id, 'B1'), getPinNode(el.id, 'B2'), Zd);
        stampImpedance(A, getPinNode(el.id, 'C1'), getPinNode(el.id, 'C2'), Zd);
        if (el.hasNeutral !== false) {
          stampImpedance(A, getPinNode(el.id, 'N1'), getPinNode(el.id, 'N2'), Zn);
        }
        break;
      }
      case 'THREE_PHASE_LOAD': {
        const A_n = getPinNode(el.id, 'A');
        const B_n = getPinNode(el.id, 'B');
        const C_n = getPinNode(el.id, 'C');
        const N_n = getPinNode(el.id, 'N');
        const zaRaw = toComplex(el.loadZa, 40, 30);
        const zbRaw = el.loadSymmetric !== false ? zaRaw : toComplex(el.loadZb, 40, 30);
        const zcRaw = el.loadSymmetric !== false ? zaRaw : toComplex(el.loadZc, 40, 30);
        const effZ = (z: Complex) => (isDc ? new Complex(z.re, 0) : z);
        const Za = effZ(zaRaw);
        const Zb = effZ(zbRaw);
        const Zc = effZ(zcRaw);

        if ((el.loadConnection ?? 'Y') === 'Y') {
          const nStar =
            el.loadNeutralConnected === false
              ? internalNodes.get(el.id)!.nstar
              : N_n;
          stampImpedance(A, A_n, nStar, Za);
          stampImpedance(A, B_n, nStar, Zb);
          stampImpedance(A, C_n, nStar, Zc);
        } else {
          stampImpedance(A, A_n, B_n, Za);
          stampImpedance(A, B_n, C_n, Zb);
          stampImpedance(A, C_n, A_n, Zc);
        }
        break;
      }
    }
  }

  // Cho phép Trình trích xuất tương đương chèn nguồn thử (1A hoặc 1V)
  if (options?.extraStamp) {
    let nextExtraAux = baseNodes + auxSpecs.length;
    options.extraStamp({
      A,
      b,
      getNodeIdx: (nid: string) => nodeIdToIdx.get(nid) ?? -1,
      allocAux: () => nextExtraAux++,
    });
  }

  const x = solveLinearComplex(A, b);
  if (!x) {
    return {
      success: false,
      error:
        'Lỗi giải hệ phương trình MNA (ma trận suy biến): kiểm tra vòng ngắn mạch nguồn áp, nguồn phụ thuộc lặp vô hạn, hoặc nút bị cô lập.',
      nodeVoltages: new Map(),
    };
  }

  const nodeVoltages = new Map<string, Complex>();
  nodeVoltages.set('0', Complex.zero());
  for (const [nid, idx] of nodeIdToIdx.entries()) {
    if (idx >= 0) {
      nodeVoltages.set(nid, x[idx]);
    }
  }

  return {
    success: true,
    x,
    sys: {
      A,
      b,
      totalSize,
      nodeIdToIdx,
      senseBranchVar,
      elementAuxMap,
      internalNodes,
    },
    nodeVoltages,
  };
}

/**
 * Tính dòng điện phức và công suất phức (tiêu thụ) của từng phần tử tại 1 tần số.
 */
function extractElementBranchAtFreq(
  el: CircuitElement,
  netlist: NetlistGraph,
  x: Complex[],
  sys: MnaLinearSystem,
  freqHz: number,
  mode: 'DC' | 'DC_SS' | 'AC',
): {
  U: Complex;
  I: Complex; // Quy ước thụ động: đi từ chân 1 (+) vào phần tử sang chân 2 (-)
  S: Complex; // S = U * conj(I) = P + jQ (P > 0: tiêu thụ, P < 0: phát)
  threePhase?: ElementBranchResult['threePhaseDetails'];
} {
  const isDc = freqHz === 0 || mode === 'DC' || mode === 'DC_SS';
  const omega = 2 * Math.PI * freqHz;
  const getV = (idx: number) => (idx >= 0 ? x[idx] : Complex.zero());
  const getPinV = (pinId: string) => {
    const nid = netlist.nodeMap[`${el.id}:${pinId}`] ?? '0';
    return getV(sys.nodeIdToIdx.get(nid) ?? -1);
  };

  switch (el.type) {
    case 'GND':
    case 'MUTUAL':
      return { U: Complex.zero(), I: Complex.zero(), S: Complex.zero() };
    case 'V_SRC':
    case 'VCVS':
    case 'CCVS': {
      const U = getPinV('p').sub(getPinV('n'));
      const I = x[sys.elementAuxMap.get(el.id)!.i];
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'I_SRC': {
      const U = getPinV('p').sub(getPinV('n'));
      const Is = getSourcePhasorAtFreq(el, freqHz);
      // Dòng Is đi ra khỏi cực p -> theo quy ước thụ động I = -Is
      const I = Is.neg();
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'RESISTOR': {
      const U = getPinV('1').sub(getPinV('2'));
      const R = Math.max(1e-9, el.resistance ?? 100);
      const I = U.scale(1 / R);
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'IMPEDANCE': {
      const U = getPinV('1').sub(getPinV('2'));
      const zRaw = toComplex(el.impedance, 40, 30);
      const Z = isDc ? new Complex(zRaw.re, 0) : zRaw;
      const I = branchCurrentFromImpedance(U, Z);
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'CAPACITOR': {
      const U = getPinV('1').sub(getPinV('2'));
      const I = isDc ? Complex.zero() : U.mul(new Complex(0, omega * (el.capacitance ?? 1e-6)));
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'INDUCTOR': {
      const U = getPinV('1').sub(getPinV('2'));
      const I = x[sys.elementAuxMap.get(el.id)!.i];
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'VCCS': {
      const U = getPinV('p').sub(getPinV('n'));
      const vp = getV(sys.nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1);
      const vn = getV(sys.nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1);
      const Is = vp.sub(vn).scale(el.gain ?? 0);
      const I = Is.neg();
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'CCCS': {
      const U = getPinV('p').sub(getPinV('n'));
      const ctrlIdx = el.ctrlElementId ? sys.senseBranchVar.get(el.ctrlElementId) : undefined;
      const Ictrl = ctrlIdx !== undefined ? x[ctrlIdx] : Complex.zero();
      const I = Ictrl.scale(-(el.gain ?? 0));
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'OPAMP': {
      const U = getPinV('out');
      const I = x[sys.elementAuxMap.get(el.id)!.i];
      return { U, I, S: U.mul(I.conj()) };
    }
    case 'ONE_PORT': {
      const U = getPinV('1').sub(getPinV('2'));
      if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
        const I = x[sys.elementAuxMap.get(el.id)!.i];
        return { U, I, S: U.mul(I.conj()) };
      } else {
        const opFreq = el.onePortFreqHz ?? 50;
        const active = Math.abs(opFreq - freqHz) < 1e-6;
        const yRaw = toComplex(el.onePortZ, 0.02, 0);
        const Y = isDc ? new Complex(Math.max(0, yRaw.re), 0) : yRaw;
        const In = active
          ? isDc
            ? new Complex(el.onePortMag ?? 0, 0)
            : Complex.fromPolar(el.onePortMag ?? 0, el.onePortPhaseDeg ?? 0)
          : Complex.zero();
        const I = U.mul(Y).sub(In);
        return { U, I, S: U.mul(I.conj()) };
      }
    }
    case 'TWO_PORT': {
      const U1 = getPinV('1').sub(getPinV('1p'));
      const U2 = getPinV('2').sub(getPinV('2p'));
      const tpType = el.twoPortType ?? 'Z';
      let I1 = Complex.zero();
      let I2 = Complex.zero();
      if (tpType === 'Y') {
        const eff = (c?: ComplexInput, r = 0) => {
          const v = toComplex(c, r, 0);
          return isDc ? new Complex(v.re, 0) : v;
        };
        const Y11 = eff(el.m11, 0.1);
        const Y12 = eff(el.m12, 0);
        const Y21 = eff(el.m21, 0);
        const Y22 = eff(el.m22, 0.1);
        I1 = Y11.mul(U1).add(Y12.mul(U2));
        I2 = Y21.mul(U1).add(Y22.mul(U2));
      } else {
        I1 = x[sys.elementAuxMap.get(el.id)!.i1];
        I2 = x[sys.elementAuxMap.get(el.id)!.i2];
      }
      const S = U1.mul(I1.conj()).add(U2.mul(I2.conj()));
      return { U: U1, I: I1, S };
    }
    case 'THREE_PHASE_SRC': {
      const Va = getPinV('A');
      const Vb = getPinV('B');
      const Vc = getPinV('C');
      const Vn = getPinV('N');
      const aux = sys.elementAuxMap.get(el.id)!;
      let Ia: Complex;
      let Ib: Complex;
      let Ic: Complex;
      if ((el.tpConnection ?? 'Y') === 'Y') {
        // aux.ia là dòng đi từ A vào nguồn (quy ước thụ động)
        Ia = x[aux.ia];
        Ib = x[aux.ib];
        Ic = x[aux.ic];
        const Sa = Va.sub(Vn).mul(Ia.conj());
        const Sb = Vb.sub(Vn).mul(Ib.conj());
        const Sc = Vc.sub(Vn).mul(Ic.conj());
        const S = Sa.add(Sb).add(Sc);
        const In = Ia.add(Ib).add(Ic).neg();
        return {
          U: Va.sub(Vn),
          I: Ia,
          S,
          threePhase: {
            iaMag: Ia.mag(),
            iaDeg: Ia.deg(),
            ibMag: Ib.mag(),
            ibDeg: Ib.deg(),
            icMag: Ic.mag(),
            icDeg: Ic.deg(),
            inMag: In.mag(),
            inDeg: In.deg(),
            pTotal: S.re,
            qTotal: S.im,
            sTotal: S.mag(),
          },
        };
      } else {
        const Iab = x[aux.iab];
        const Ibc = x[aux.ibc];
        const Ica = x[aux.ica];
        // Dòng dây đi vào nguồn tại A = Iab - Ica
        Ia = Iab.sub(Ica);
        Ib = Ibc.sub(Iab);
        Ic = Ica.sub(Ibc);
        const S = Va.sub(Vb)
          .mul(Iab.conj())
          .add(Vb.sub(Vc).mul(Ibc.conj()))
          .add(Vc.sub(Va).mul(Ica.conj()));
        return {
          U: Va.sub(Vb),
          I: Ia,
          S,
          threePhase: {
            iaMag: Ia.mag(),
            iaDeg: Ia.deg(),
            ibMag: Ib.mag(),
            ibDeg: Ib.deg(),
            icMag: Ic.mag(),
            icDeg: Ic.deg(),
            pTotal: S.re,
            qTotal: S.im,
            sTotal: S.mag(),
          },
        };
      }
    }
    case 'THREE_PHASE_LINE': {
      const zRaw = toComplex(el.lineZ, 1.5, 3.0);
      const znRaw = toComplex(el.lineZn, 2.0, 1.0);
      const Zd = isDc ? new Complex(zRaw.re, 0) : zRaw;
      const Zn = isDc ? new Complex(znRaw.re, 0) : znRaw;
      const dVa = getPinV('A1').sub(getPinV('A2'));
      const dVb = getPinV('B1').sub(getPinV('B2'));
      const dVc = getPinV('C1').sub(getPinV('C2'));
      const dVn = getPinV('N1').sub(getPinV('N2'));
      const Ia = branchCurrentFromImpedance(dVa, Zd);
      const Ib = branchCurrentFromImpedance(dVb, Zd);
      const Ic = branchCurrentFromImpedance(dVc, Zd);
      const In =
        el.hasNeutral !== false ? branchCurrentFromImpedance(dVn, Zn) : Complex.zero();
      const S = dVa
        .mul(Ia.conj())
        .add(dVb.mul(Ib.conj()))
        .add(dVc.mul(Ic.conj()))
        .add(dVn.mul(In.conj()));
      return {
        U: dVa,
        I: Ia,
        S,
        threePhase: {
          iaMag: Ia.mag(),
          iaDeg: Ia.deg(),
          ibMag: Ib.mag(),
          ibDeg: Ib.deg(),
          icMag: Ic.mag(),
          icDeg: Ic.deg(),
          inMag: In.mag(),
          inDeg: In.deg(),
          pTotal: S.re,
          qTotal: S.im,
          sTotal: S.mag(),
        },
      };
    }
    case 'THREE_PHASE_LOAD': {
      const Va = getPinV('A');
      const Vb = getPinV('B');
      const Vc = getPinV('C');
      const Vn = getPinV('N');
      const zaRaw = toComplex(el.loadZa, 40, 30);
      const zbRaw = el.loadSymmetric !== false ? zaRaw : toComplex(el.loadZb, 40, 30);
      const zcRaw = el.loadSymmetric !== false ? zaRaw : toComplex(el.loadZc, 40, 30);
      const effZ = (z: Complex) => (isDc ? new Complex(z.re, 0) : z);
      const Za = effZ(zaRaw);
      const Zb = effZ(zbRaw);
      const Zc = effZ(zcRaw);

      if ((el.loadConnection ?? 'Y') === 'Y') {
        const Vstar =
          el.loadNeutralConnected === false
            ? getV(sys.internalNodes.get(el.id)!.nstar)
            : Vn;
        const Ua = Va.sub(Vstar);
        const Ub = Vb.sub(Vstar);
        const Uc = Vc.sub(Vstar);
        const Ia = branchCurrentFromImpedance(Ua, Za);
        const Ib = branchCurrentFromImpedance(Ub, Zb);
        const Ic = branchCurrentFromImpedance(Uc, Zc);
        const In = Ia.add(Ib).add(Ic);
        const S = Ua.mul(Ia.conj()).add(Ub.mul(Ib.conj())).add(Uc.mul(Ic.conj()));
        return {
          U: Ua,
          I: Ia,
          S,
          threePhase: {
            iaMag: Ia.mag(),
            iaDeg: Ia.deg(),
            ibMag: Ib.mag(),
            ibDeg: Ib.deg(),
            icMag: Ic.mag(),
            icDeg: Ic.deg(),
            inMag: In.mag(),
            inDeg: In.deg(),
            uNeutralShift: Vstar.sub(Vn).mag(),
            pTotal: S.re,
            qTotal: S.im,
            sTotal: S.mag(),
          },
        };
      } else {
        const Uab = Va.sub(Vb);
        const Ubc = Vb.sub(Vc);
        const Uca = Vc.sub(Va);
        const Iab = branchCurrentFromImpedance(Uab, Za);
        const Ibc = branchCurrentFromImpedance(Ubc, Zb);
        const Ica = branchCurrentFromImpedance(Uca, Zc);
        const Ia = Iab.sub(Ica);
        const Ib = Ibc.sub(Iab);
        const Ic = Ica.sub(Ibc);
        const S = Uab.mul(Iab.conj()).add(Ubc.mul(Ibc.conj())).add(Uca.mul(Ica.conj()));
        return {
          U: Uab,
          I: Ia,
          S,
          threePhase: {
            iaMag: Ia.mag(),
            iaDeg: Ia.deg(),
            ibMag: Ib.mag(),
            ibDeg: Ib.deg(),
            icMag: Ic.mag(),
            icDeg: Ic.deg(),
            pTotal: S.re,
            qTotal: S.im,
            sTotal: S.mag(),
          },
        };
      }
    }
  }
}

function formatInstantaneous(
  dc: number,
  harmonics: Array<{ freqHz: number; peak: number; phaseDeg: number }>,
): string {
  const parts: string[] = [];
  if (Math.abs(dc) > 1e-6) {
    parts.push(dc.toFixed(3).replace(/\.?0+$/, ''));
  }
  for (const h of harmonics) {
    if (h.peak < 1e-6) continue;
    const amp = h.peak.toFixed(3).replace(/\.?0+$/, '');
    const omega = (2 * Math.PI * h.freqHz).toFixed(1).replace(/\.?0+$/, '');
    const ph = Math.abs(h.phaseDeg) < 0.05 ? '' : h.phaseDeg > 0 ? ` + ${h.phaseDeg.toFixed(1)}°` : ` - ${Math.abs(h.phaseDeg).toFixed(1)}°`;
    parts.push(`${amp}·cos(${omega}t${ph})`);
  }
  return parts.length > 0 ? parts.join(' + ') : '0';
}

function getOnePortTransientValue(el: CircuitElement, t: number): number {
  const opFreq = el.onePortFreqHz ?? 50;
  return opFreq === 0
    ? (el.onePortMag ?? 0)
    : (el.onePortMag ?? 0) * SQRT2 * Math.cos(2 * Math.PI * opFreq * t + ((el.onePortPhaseDeg ?? 0) * Math.PI) / 180);
}

/**
 * Chạy mô phỏng Quá độ bằng Backward Euler từ t = 0 đến tEnd với bước dt.
 */
function runTransientSimulation(
  state: CircuitState,
  netlist: NetlistGraph,
  dt: number,
  tEnd: number,
): SimulationResult {
  const elements = state.elements;
  const diagnostics: DiagnosticMessage[] = [...netlist.diagnostics];
  const realNodeIds = netlist.allNodeIds.filter((id) => id !== '0');
  const nodeIdToIdx = new Map<string, number>();
  nodeIdToIdx.set('0', -1);
  realNodeIds.forEach((id, i) => nodeIdToIdx.set(id, i));

  let nextNodeIdx = realNodeIds.length;
  const allocNode = () => nextNodeIdx++;

  const sensedIds = new Set<string>();
  for (const el of elements) {
    if ((el.type === 'CCVS' || el.type === 'CCCS') && el.ctrlElementId) {
      sensedIds.add(el.ctrlElementId);
    }
  }

  const elementAuxMap = new Map<string, Record<string, number>>();
  const internalNodes = new Map<string, Record<string, number>>();
  const senseBranchVar = new Map<string, number>();
  const auxSpecs: Array<{ elId: string; key: string }> = [];

  const registerAux = (elId: string, key: string): number => {
    const idx = auxSpecs.length;
    auxSpecs.push({ elId, key });
    const rec = elementAuxMap.get(elId) ?? {};
    rec[key] = idx;
    elementAuxMap.set(elId, rec);
    return idx;
  };

  for (const el of elements) {
    if (el.type === 'V_SRC' || el.type === 'VCVS' || el.type === 'CCVS') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
    } else if (el.type === 'INDUCTOR') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
    } else if (el.type === 'CAPACITOR') {
      // Cần biến phụ trợ tại t=0+ khi tụ đóng vai nguồn áp sơ kiện u_C(0)
      registerAux(el.id, 'i_init');
      if (sensedIds.has(el.id)) {
        internalNodes.set(el.id, { sense: allocNode() });
        const sIdx = registerAux(el.id, 'sense');
        senseBranchVar.set(el.id, sIdx);
      }
    } else if (el.type === 'OPAMP') {
      const idx = registerAux(el.id, 'i');
      if (sensedIds.has(el.id)) {
        senseBranchVar.set(el.id, idx);
      }
    } else if (el.type === 'ONE_PORT') {
      if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
        internalNodes.set(el.id, { mid: allocNode() });
        const idx = registerAux(el.id, 'i');
        if (sensedIds.has(el.id)) senseBranchVar.set(el.id, idx);
      } else if (sensedIds.has(el.id)) {
        internalNodes.set(el.id, { sense: allocNode() });
        const idx = registerAux(el.id, 'sense');
        senseBranchVar.set(el.id, idx);
      }
    } else if (el.type === 'TWO_PORT') {
      const t = el.twoPortType ?? 'Z';
      if (t === 'Z' || t === 'A') {
        registerAux(el.id, 'i1');
        registerAux(el.id, 'i2');
      }
    } else if (el.type === 'THREE_PHASE_SRC') {
      if ((el.tpConnection ?? 'Y') === 'Y') {
        registerAux(el.id, 'ia');
        registerAux(el.id, 'ib');
        registerAux(el.id, 'ic');
      } else {
        internalNodes.set(el.id, { ab: allocNode(), bc: allocNode(), ca: allocNode() });
        registerAux(el.id, 'iab');
        registerAux(el.id, 'ibc');
        registerAux(el.id, 'ica');
      }
    } else if (el.type === 'THREE_PHASE_LOAD') {
      if ((el.loadConnection ?? 'Y') === 'Y' && el.loadNeutralConnected === false) {
        internalNodes.set(el.id, { nstar: allocNode() });
      }
    } else if (
      sensedIds.has(el.id) &&
      (el.type === 'RESISTOR' ||
        el.type === 'IMPEDANCE' ||
        el.type === 'I_SRC' ||
        el.type === 'VCCS' ||
        el.type === 'CCCS')
    ) {
      internalNodes.set(el.id, { sense: allocNode() });
      const idx = registerAux(el.id, 'sense');
      senseBranchVar.set(el.id, idx);
    }
  }

  const baseNodes = nextNodeIdx;
  const totalSize = baseNodes + auxSpecs.length;
  for (const [elId, rec] of elementAuxMap.entries()) {
    for (const k of Object.keys(rec)) {
      rec[k] += baseNodes;
    }
    if (senseBranchVar.has(elId)) {
      senseBranchVar.set(elId, senseBranchVar.get(elId)! + baseNodes);
    }
  }

  const getPinNode = (elId: string, pinId: string): number => {
    const nid = netlist.nodeMap[`${elId}:${pinId}`] ?? '0';
    return nodeIdToIdx.get(nid) ?? -1;
  };

  // Trạng thái quá khứ của tụ điện và cuộn dây
  const prevUc = new Map<string, number>();
  const prevIl = new Map<string, number>();
  for (const el of elements) {
    if (el.type === 'CAPACITOR') prevUc.set(el.id, el.initialVoltage ?? 0);
    if (el.type === 'INDUCTOR') prevIl.set(el.id, el.initialCurrent ?? 0);
  }

  const safeTEnd = Math.max(1e-6, Number.isFinite(tEnd) ? tEnd : 0.04);
  const safeDt = Math.max(1e-7, Number.isFinite(dt) ? dt : 0.0002);
  const maxSteps = 4000;
  let numSteps = Math.max(1, Math.round(safeTEnd / safeDt));
  let actualDt = safeDt;
  if (numSteps > maxSteps) {
    actualDt = safeTEnd / maxSteps;
    numSteps = maxSteps;
    diagnostics.push({
      level: 'warning',
      text: `Số bước mô phỏng vượt giới hạn ${maxSteps}, tự động điều chỉnh Δt = ${actualDt.toExponential(3)} s.`,
    });
  }

  const times: number[] = [];
  const nodeVoltages: Record<string, number[]> = {};
  for (const nid of netlist.allNodeIds) nodeVoltages[nid] = [];
  const elementCurrents: Record<string, number[]> = {};
  const elementVoltages: Record<string, number[]> = {};
  for (const el of elements) {
    if (el.type === 'GND' || el.type === 'MUTUAL') continue;
    elementCurrents[el.id] = [];
    elementVoltages[el.id] = [];
  }

  // Quy đổi phần tử 3 pha R + jX tại tần số tham chiếu fRef sang nhánh R-L / R-C Backward Euler
  const tpFreqEl = elements.find((e) => e.type === 'THREE_PHASE_SRC' && (e.tpFreqHz ?? 50) > 0);
  const acFreqEl = elements.find(
    (e) => (e.type === 'V_SRC' || e.type === 'I_SRC') && e.waveform === 'AC' && (e.freqHz ?? 50) > 0,
  );
  const mixedFreqEl = elements.find(
    (e) =>
      (e.type === 'V_SRC' || e.type === 'I_SRC') &&
      e.waveform === 'MIXED' &&
      (e.harmonics ?? []).some((h) => Number.isFinite(h.freqHz) && h.freqHz > 0 && Math.abs(h.amplitude) > 0),
  );
  const mixedFirstFreq = mixedFreqEl?.harmonics?.find(
    (h) => Number.isFinite(h.freqHz) && h.freqHz > 0 && Math.abs(h.amplitude) > 0,
  )?.freqHz;
  const opFreqEl = elements.find((e) => e.type === 'ONE_PORT' && (e.onePortFreqHz ?? 50) > 0);
  const fRef = tpFreqEl
    ? (tpFreqEl.tpFreqHz ?? 50)
    : acFreqEl
      ? (acFreqEl.freqHz ?? 50)
      : mixedFirstFreq
        ? mixedFirstFreq
        : opFreqEl
          ? (opFreqEl.onePortFreqHz ?? 50)
          : 50;
  const omegaRef = 2 * Math.PI * fRef;

  interface ReactiveCompanionBranch {
    id: string;
    p: number;
    n: number;
    kind: 'R' | 'L' | 'C';
    gEq: number;
    reactR: number;
  }

  let hasReactiveThreePhase = false;
  let hasReactiveImpedance = false;
  const makeCompanionBranch = (
    id: string,
    p: number,
    n: number,
    z: Complex,
    sourceGroup: 'TP' | 'IMP',
    minR = 1e-6,
  ): ReactiveCompanionBranch => {
    if (z.im > 1e-9) {
      if (sourceGroup === 'TP') hasReactiveThreePhase = true;
      else hasReactiveImpedance = true;
      const L = z.im / omegaRef;
      const reactR = L / actualDt;
      const gEq = 1 / Math.max(1e-9, Math.max(0, z.re) + reactR);
      return { id, p, n, kind: 'L', gEq, reactR };
    }
    if (z.im < -1e-9) {
      if (sourceGroup === 'TP') hasReactiveThreePhase = true;
      else hasReactiveImpedance = true;
      const C = 1 / (omegaRef * Math.abs(z.im));
      const reactR = actualDt / C;
      const gEq = 1 / Math.max(1e-9, Math.max(0, z.re) + reactR);
      return { id, p, n, kind: 'C', gEq, reactR };
    }
    return { id, p, n, kind: 'R', gEq: 1 / Math.max(minR, z.re), reactR: 0 };
  };

  const tpBranchesByEl = new Map<string, ReactiveCompanionBranch[]>();
  const impBranchByEl = new Map<string, ReactiveCompanionBranch>();
  const prevTpState = new Map<string, number>();
  const lastTpCurrent = new Map<string, number>();

  for (const el of elements) {
    if (el.type === 'IMPEDANCE') {
      const z = toComplex(el.impedance, 40, 30);
      const p = internalNodes.get(el.id)?.sense ?? getPinNode(el.id, '1');
      const n = getPinNode(el.id, '2');
      impBranchByEl.set(el.id, makeCompanionBranch(el.id, p, n, z, 'IMP', 1e-9));
    } else if (el.type === 'THREE_PHASE_LINE') {
      const zd = toComplex(el.lineZ, 1.5, 3.0);
      const zn = toComplex(el.lineZn, 2.0, 1.0);
      const branches: ReactiveCompanionBranch[] = [
        makeCompanionBranch(`${el.id}:A`, getPinNode(el.id, 'A1'), getPinNode(el.id, 'A2'), zd, 'TP'),
        makeCompanionBranch(`${el.id}:B`, getPinNode(el.id, 'B1'), getPinNode(el.id, 'B2'), zd, 'TP'),
        makeCompanionBranch(`${el.id}:C`, getPinNode(el.id, 'C1'), getPinNode(el.id, 'C2'), zd, 'TP'),
      ];
      if (el.hasNeutral !== false) {
        branches.push(makeCompanionBranch(`${el.id}:N`, getPinNode(el.id, 'N1'), getPinNode(el.id, 'N2'), zn, 'TP'));
      }
      tpBranchesByEl.set(el.id, branches);
    } else if (el.type === 'THREE_PHASE_LOAD') {
      const aN = getPinNode(el.id, 'A');
      const bN = getPinNode(el.id, 'B');
      const cN = getPinNode(el.id, 'C');
      const za = toComplex(el.loadZa, 40, 30);
      const zb = el.loadSymmetric !== false ? za : toComplex(el.loadZb, 40, 30);
      const zc = el.loadSymmetric !== false ? za : toComplex(el.loadZc, 40, 30);
      if ((el.loadConnection ?? 'Y') === 'Y') {
        const nStar =
          el.loadNeutralConnected === false ? internalNodes.get(el.id)!.nstar : getPinNode(el.id, 'N');
        tpBranchesByEl.set(el.id, [
          makeCompanionBranch(`${el.id}:A`, aN, nStar, za, 'TP'),
          makeCompanionBranch(`${el.id}:B`, bN, nStar, zb, 'TP'),
          makeCompanionBranch(`${el.id}:C`, cN, nStar, zc, 'TP'),
        ]);
      } else {
        tpBranchesByEl.set(el.id, [
          makeCompanionBranch(`${el.id}:AB`, aN, bN, za, 'TP'),
          makeCompanionBranch(`${el.id}:BC`, bN, cN, zb, 'TP'),
          makeCompanionBranch(`${el.id}:CA`, cN, aN, zc, 'TP'),
        ]);
      }
    }
  }

  if (hasReactiveThreePhase) {
    diagnostics.push({
      level: 'info',
      text: `Mô phỏng quá độ đã quy đổi phần tử 3 pha có điện kháng (X ≠ 0) sang phần tử R-L/R-C tương đương tại tần số tham chiếu ${fRef} Hz.`,
    });
  }
  if (hasReactiveImpedance) {
    diagnostics.push({
      level: 'info',
      text: `Mô phỏng quá độ đã quy đổi phần tử tổng trở Z có điện kháng (X ≠ 0) sang nhánh R-L/R-C tương đương tại tần số tham chiếu ${fRef} Hz.`,
    });
  }

  const getTpIHist = (br: ReactiveCompanionBranch): number => {
    const prev = prevTpState.get(br.id) ?? 0;
    if (br.kind === 'L') return br.reactR * br.gEq * prev;
    if (br.kind === 'C') return -br.gEq * prev;
    return 0;
  };

  const addR = (A: number[][], r: number, c: number, val: number) => {
    if (r >= 0 && c >= 0) A[r][c] += val;
  };
  const addB = (b: number[], r: number, val: number) => {
    if (r >= 0) b[r] += val;
  };
  const stampCondR = (A: number[][], p: number, n: number, G: number) => {
    addR(A, p, p, G);
    addR(A, n, n, G);
    addR(A, p, n, -G);
    addR(A, n, p, -G);
  };
  const stampVsrcR = (A: number[][], b: number[], p: number, n: number, aux: number, V: number) => {
    addR(A, p, aux, 1);
    addR(A, aux, p, 1);
    addR(A, n, aux, -1);
    addR(A, aux, n, -1);
    addB(b, aux, V);
  };

  // Virtual infinitesimal sub-step dt0 at t = 0+ enforces i_L(0+) = i_L(0) via L/dt0 without
  // decoupling intermediate inductor-to-inductor nodes or mutual coupling at t = 0+.
  const posInductances = elements
    .filter((e) => e.type === 'INDUCTOR')
    .map((e) => Math.max(0, e.inductance ?? 0.1))
    .filter((l) => l > 0);
  const dt0 =
    posInductances.length > 0
      ? Math.max(Math.min(...posInductances) / 1e6, Math.max(...posInductances) / 1e9, 1e-12)
      : 1e-7;

  for (let step = 0; step <= numSteps; step++) {
    const t = step * actualDt;
    const isT0 = step === 0;
    const dtStep = isT0 ? dt0 : actualDt;
    const A: number[][] = Array.from({ length: totalSize }, () =>
      new Array<number>(totalSize).fill(0),
    );
    const b: number[] = new Array<number>(totalSize).fill(0);

    for (let i = 0; i < baseNodes; i++) addR(A, i, i, G_MIN);

    const getEffPin1 = (el: CircuitElement, defaultPin: string): number => {
      const sNode = internalNodes.get(el.id)?.sense;
      if (sNode !== undefined) {
        const extP1 = getPinNode(el.id, defaultPin);
        const sAux = elementAuxMap.get(el.id)!.sense;
        stampVsrcR(A, b, extP1, sNode, sAux, 0);
        return sNode;
      }
      return getPinNode(el.id, defaultPin);
    };

    for (const el of elements) {
      switch (el.type) {
        case 'GND':
          break;
        case 'V_SRC': {
          const p = getPinNode(el.id, 'p');
          const n = getPinNode(el.id, 'n');
          const aux = elementAuxMap.get(el.id)!.i;
          stampVsrcR(A, b, p, n, aux, getSourceTransientValue(el, t));
          break;
        }
        case 'I_SRC': {
          const p = getEffPin1(el, 'p');
          const n = getPinNode(el.id, 'n');
          const Is = getSourceTransientValue(el, t);
          addB(b, p, Is);
          addB(b, n, -Is);
          break;
        }
        case 'RESISTOR': {
          const p = getEffPin1(el, '1');
          const n = getPinNode(el.id, '2');
          stampCondR(A, p, n, 1 / Math.max(1e-9, el.resistance ?? 100));
          break;
        }
        case 'IMPEDANCE': {
          getEffPin1(el, '1');
          const br = impBranchByEl.get(el.id);
          if (br) {
            const iHist = getTpIHist(br);
            stampCondR(A, br.p, br.n, br.gEq);
            if (iHist !== 0) {
              addB(b, br.p, -iHist);
              addB(b, br.n, iHist);
            }
          }
          break;
        }
        case 'CAPACITOR': {
          const p = getEffPin1(el, '1');
          const n = getPinNode(el.id, '2');
          if (isT0) {
            // Tại t = 0+, tụ giữ áp sơ kiện u_C(0)
            const aux = elementAuxMap.get(el.id)!.i_init;
            stampVsrcR(A, b, p, n, aux, el.initialVoltage ?? 0);
          } else {
            // Backward Euler: i = (C/dt)*u - (C/dt)*u_prev
            const C = Math.max(0, el.capacitance ?? 1e-6);
            const Geq = C / actualDt;
            const Ieq = Geq * (prevUc.get(el.id) ?? 0);
            stampCondR(A, p, n, Geq);
            // Ieq đi từ p sang n (rời p, vào n) => b[p] += Ieq? Không: i_C = Geq*u - Ieq rời p!
            // Đợi: phương trình tại nút p là +Geq(Vp-Vn) - Ieq = 0 => Geq(Vp-Vn) = +Ieq => b[p] += Ieq, b[n] -= Ieq!
            addB(b, p, Ieq);
            addB(b, n, -Ieq);
            // giữ biến i_init khỏi suy biến
            const aux = elementAuxMap.get(el.id)!.i_init;
            addR(A, aux, aux, 1);
          }
          break;
        }
        case 'INDUCTOR': {
          const p = getPinNode(el.id, '1');
          const n = getPinNode(el.id, '2');
          const aux = elementAuxMap.get(el.id)!.i;
          addR(A, p, aux, 1);
          addR(A, aux, p, 1);
          addR(A, n, aux, -1);
          addR(A, aux, n, -1);
          const L = Math.max(0, el.inductance ?? 0.1);
          const R_eq = L / dtStep;
          if (R_eq > 0) {
            addR(A, aux, aux, -R_eq);
            addB(b, aux, -R_eq * (prevIl.get(el.id) ?? 0));
          }
          break;
        }
        case 'MUTUAL': {
          if (el.l1Id && el.l2Id && el.l1Id !== el.l2Id) {
            const aux1 = elementAuxMap.get(el.l1Id)?.i;
            const aux2 = elementAuxMap.get(el.l2Id)?.i;
            if (aux1 !== undefined && aux2 !== undefined) {
              const s = el.dotPolarity ?? 1;
              const Rm = ((el.mutualM ?? 0) * s) / dtStep;
              addR(A, aux1, aux2, -Rm);
              addR(A, aux2, aux1, -Rm);
              addB(b, aux1, -Rm * (prevIl.get(el.l2Id) ?? 0));
              addB(b, aux2, -Rm * (prevIl.get(el.l1Id) ?? 0));
            }
          }
          break;
        }
        case 'VCVS': {
          const p = getPinNode(el.id, 'p');
          const n = getPinNode(el.id, 'n');
          const aux = elementAuxMap.get(el.id)!.i;
          const cp = nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1;
          const cn = nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1;
          const mu = el.gain ?? 1;
          addR(A, p, aux, 1);
          addR(A, aux, p, 1);
          addR(A, n, aux, -1);
          addR(A, aux, n, -1);
          addR(A, aux, cp, -mu);
          addR(A, aux, cn, mu);
          break;
        }
        case 'CCVS': {
          const p = getPinNode(el.id, 'p');
          const n = getPinNode(el.id, 'n');
          const aux = elementAuxMap.get(el.id)!.i;
          const r = el.gain ?? 1;
          const ctrlIdx = el.ctrlElementId ? senseBranchVar.get(el.ctrlElementId) : undefined;
          addR(A, p, aux, 1);
          addR(A, aux, p, 1);
          addR(A, n, aux, -1);
          addR(A, aux, n, -1);
          if (ctrlIdx !== undefined) addR(A, aux, ctrlIdx, -r);
          break;
        }
        case 'VCCS': {
          const p = getEffPin1(el, 'p');
          const n = getPinNode(el.id, 'n');
          const cp = nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1;
          const cn = nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1;
          const g = el.gain ?? 0;
          addR(A, p, cp, -g);
          addR(A, p, cn, g);
          addR(A, n, cp, g);
          addR(A, n, cn, -g);
          break;
        }
        case 'CCCS': {
          const p = getEffPin1(el, 'p');
          const n = getPinNode(el.id, 'n');
          const beta = el.gain ?? 0;
          const ctrlIdx = el.ctrlElementId ? senseBranchVar.get(el.ctrlElementId) : undefined;
          if (ctrlIdx !== undefined) {
            addR(A, p, ctrlIdx, -beta);
            addR(A, n, ctrlIdx, beta);
          }
          break;
        }
        case 'OPAMP': {
          const vp = getPinNode(el.id, 'vp');
          const vn = getPinNode(el.id, 'vn');
          const vout = getPinNode(el.id, 'out');
          const aux = elementAuxMap.get(el.id)!.i;
          addR(A, vout, aux, 1);
          addR(A, aux, vp, 1);
          addR(A, aux, vn, -1);
          break;
        }
        case 'ONE_PORT': {
          const vInst = getOnePortTransientValue(el, t);
          if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
            const p = getPinNode(el.id, '1');
            const n = getPinNode(el.id, '2');
            const mid = internalNodes.get(el.id)!.mid;
            const aux = elementAuxMap.get(el.id)!.i;
            const R = Math.max(1e-9, el.onePortZ?.re ?? 50);
            stampVsrcR(A, b, mid, n, aux, vInst);
            stampCondR(A, p, mid, 1 / R);
          } else {
            const p = getEffPin1(el, '1');
            const n = getPinNode(el.id, '2');
            const G = Math.max(0, el.onePortZ?.re ?? 0.02);
            stampCondR(A, p, n, G);
            addB(b, p, vInst);
            addB(b, n, -vInst);
          }
          break;
        }
        case 'TWO_PORT': {
          const p1 = getPinNode(el.id, '1');
          const p1p = getPinNode(el.id, '1p');
          const p2 = getPinNode(el.id, '2');
          const p2p = getPinNode(el.id, '2p');
          const k11 = el.m11?.re ?? 20;
          const k12 = el.m12?.re ?? 10;
          const k21 = el.m21?.re ?? 10;
          const k22 = el.m22?.re ?? 20;
          const tpType = el.twoPortType ?? 'Z';
          if (tpType === 'Y') {
            const stampRow = (np: number, nn: number, vp: number, vn: number, y: number) => {
              addR(A, np, vp, y);
              addR(A, np, vn, -y);
              addR(A, nn, vp, -y);
              addR(A, nn, vn, y);
            };
            stampRow(p1, p1p, p1, p1p, k11);
            stampRow(p1, p1p, p2, p2p, k12);
            stampRow(p2, p2p, p1, p1p, k21);
            stampRow(p2, p2p, p2, p2p, k22);
          } else if (tpType === 'Z') {
            const i1 = elementAuxMap.get(el.id)!.i1;
            const i2 = elementAuxMap.get(el.id)!.i2;
            addR(A, p1, i1, 1); addR(A, i1, p1, 1);
            addR(A, p1p, i1, -1); addR(A, i1, p1p, -1);
            addR(A, p2, i2, 1); addR(A, i2, p2, 1);
            addR(A, p2p, i2, -1); addR(A, i2, p2p, -1);
            addR(A, i1, i1, -k11); addR(A, i1, i2, -k12);
            addR(A, i2, i1, -k21); addR(A, i2, i2, -k22);
          } else {
            const i1 = elementAuxMap.get(el.id)!.i1;
            const i2 = elementAuxMap.get(el.id)!.i2;
            addR(A, p1, i1, 1); addR(A, p1p, i1, -1);
            addR(A, p2, i2, 1); addR(A, p2p, i2, -1);
            addR(A, i1, p1, 1); addR(A, i1, p1p, -1);
            addR(A, i1, p2, -k11); addR(A, i1, p2p, k11);
            addR(A, i1, i2, k12);
            addR(A, i2, i1, 1);
            addR(A, i2, p2, -k21); addR(A, i2, p2p, k21);
            addR(A, i2, i2, k22);
          }
          break;
        }
        case 'THREE_PHASE_SRC': {
          const A_n = getPinNode(el.id, 'A');
          const B_n = getPinNode(el.id, 'B');
          const C_n = getPinNode(el.id, 'C');
          const N_n = getPinNode(el.id, 'N');
          const w = 2 * Math.PI * (el.tpFreqHz ?? 50);
          const U = el.tpVoltageRms ?? 220;
          const phiA = ((el.tpPhaseADeg ?? 0) * Math.PI) / 180;
          const seqSign = (el.tpSequence ?? 'ABC') === 'ABC' ? 1 : -1;
          const aux = elementAuxMap.get(el.id)!;
          if ((el.tpConnection ?? 'Y') === 'Y') {
            const UphPeak = ((el.tpVoltageMode ?? 'PHASE') === 'PHASE' ? U : U / SQRT3) * SQRT2;
            const va = UphPeak * Math.cos(w * t + phiA);
            const vb = UphPeak * Math.cos(w * t + phiA - ((2 * Math.PI) / 3) * seqSign);
            const vc = UphPeak * Math.cos(w * t + phiA + ((2 * Math.PI) / 3) * seqSign);
            stampVsrcR(A, b, A_n, N_n, aux.ia, va);
            stampVsrcR(A, b, B_n, N_n, aux.ib, vb);
            stampVsrcR(A, b, C_n, N_n, aux.ic, vc);
          } else {
            const UlinePeak = ((el.tpVoltageMode ?? 'LINE') === 'LINE' ? U : U * SQRT3) * SQRT2;
            const vab = UlinePeak * Math.cos(w * t + phiA + (Math.PI / 6) * seqSign);
            const vbc = UlinePeak * Math.cos(w * t + phiA - (Math.PI / 2) * seqSign);
            const vca = UlinePeak * Math.cos(w * t + phiA + ((5 * Math.PI) / 6) * seqSign);
            const nodes = internalNodes.get(el.id)!;
            stampVsrcR(A, b, nodes.ab, B_n, aux.iab, vab);
            stampCondR(A, A_n, nodes.ab, 1e5);
            stampVsrcR(A, b, nodes.bc, C_n, aux.ibc, vbc);
            stampCondR(A, B_n, nodes.bc, 1e5);
            stampVsrcR(A, b, nodes.ca, A_n, aux.ica, vca);
            stampCondR(A, C_n, nodes.ca, 1e5);
          }
          break;
        }
        case 'THREE_PHASE_LINE':
        case 'THREE_PHASE_LOAD': {
          for (const br of tpBranchesByEl.get(el.id) ?? []) {
            const iHist = getTpIHist(br);
            stampCondR(A, br.p, br.n, br.gEq);
            if (iHist !== 0) {
              addB(b, br.p, -iHist);
              addB(b, br.n, iHist);
            }
          }
          break;
        }
      }
    }

    const x = solveLinearReal(A, b);
    if (!x) {
      return {
        mode: 'TRANSIENT',
        success: false,
        diagnostics: [
          ...diagnostics,
          {
            level: 'error',
            text: `Lỗi giải quá độ tại bước t = ${t.toExponential(2)} s (ma trận suy biến).`,
          },
        ],
        nodeMap: netlist.nodeMap,
        allNodeIds: netlist.allNodeIds,
        autoGroundUsed: netlist.autoGroundUsed,
        nodes: [],
        elements: [],
      };
    }

    times.push(t);
    const getV = (idx: number) => (idx >= 0 ? x[idx] : 0);
    for (const nid of netlist.allNodeIds) {
      const idx = nodeIdToIdx.get(nid) ?? -1;
      nodeVoltages[nid].push(getV(idx));
    }
    const updateCompanionBranch = (br: ReactiveCompanionBranch) => {
      const iBr = br.gEq * (getV(br.p) - getV(br.n)) + getTpIHist(br);
      lastTpCurrent.set(br.id, iBr);
      if (br.kind === 'L') {
        prevTpState.set(br.id, iBr);
      } else if (br.kind === 'C') {
        prevTpState.set(br.id, (prevTpState.get(br.id) ?? 0) + br.reactR * iBr);
      }
    };
    for (const branches of tpBranchesByEl.values()) {
      for (const br of branches) updateCompanionBranch(br);
    }
    for (const br of impBranchByEl.values()) {
      updateCompanionBranch(br);
    }

    for (const el of elements) {
      if (el.type === 'GND' || el.type === 'MUTUAL') continue;
      let u = 0;
      let iVal = 0;
      if (el.type === 'V_SRC' || el.type === 'VCVS' || el.type === 'CCVS') {
        u = getV(getPinNode(el.id, 'p')) - getV(getPinNode(el.id, 'n'));
        iVal = x[elementAuxMap.get(el.id)!.i];
      } else if (el.type === 'I_SRC') {
        u = getV(getPinNode(el.id, 'p')) - getV(getPinNode(el.id, 'n'));
        iVal = -getSourceTransientValue(el, t);
      } else if (el.type === 'RESISTOR') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '2'));
        iVal = u / Math.max(1e-9, el.resistance ?? 100);
      } else if (el.type === 'IMPEDANCE') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '2'));
        iVal = lastTpCurrent.get(el.id) ?? 0;
      } else if (el.type === 'CAPACITOR') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '2'));
        if (isT0) {
          iVal = x[elementAuxMap.get(el.id)!.i_init];
        } else {
          const C = Math.max(0, el.capacitance ?? 1e-6);
          iVal = (C / actualDt) * (u - (prevUc.get(el.id) ?? 0));
        }
        prevUc.set(el.id, u);
      } else if (el.type === 'INDUCTOR') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '2'));
        iVal = x[elementAuxMap.get(el.id)!.i];
        prevIl.set(el.id, iVal);
      } else if (el.type === 'OPAMP') {
        u = getV(getPinNode(el.id, 'out'));
        iVal = x[elementAuxMap.get(el.id)!.i];
      } else if (el.type === 'VCCS') {
        u = getV(getPinNode(el.id, 'p')) - getV(getPinNode(el.id, 'n'));
        const vp = getV(nodeIdToIdx.get(el.ctrlNodePos ?? '1') ?? -1);
        const vn = getV(nodeIdToIdx.get(el.ctrlNodeNeg ?? '0') ?? -1);
        iVal = -(el.gain ?? 0) * (vp - vn);
      } else if (el.type === 'CCCS') {
        u = getV(getPinNode(el.id, 'p')) - getV(getPinNode(el.id, 'n'));
        const cIdx = el.ctrlElementId ? senseBranchVar.get(el.ctrlElementId) : undefined;
        iVal = cIdx !== undefined ? -(el.gain ?? 0) * x[cIdx] : 0;
      } else if (el.type === 'THREE_PHASE_SRC') {
        u = getV(getPinNode(el.id, 'A')) - getV(getPinNode(el.id, 'N'));
        const aux = elementAuxMap.get(el.id)!;
        iVal = (el.tpConnection ?? 'Y') === 'Y' ? x[aux.ia] : x[aux.iab] - x[aux.ica];
      } else if (el.type === 'THREE_PHASE_LINE') {
        u = getV(getPinNode(el.id, 'A1')) - getV(getPinNode(el.id, 'A2'));
        iVal = lastTpCurrent.get(`${el.id}:A`) ?? 0;
      } else if (el.type === 'THREE_PHASE_LOAD') {
        const Va = getV(getPinNode(el.id, 'A'));
        const Vb = getV(getPinNode(el.id, 'B'));
        if ((el.loadConnection ?? 'Y') === 'Y') {
          const nStar =
            el.loadNeutralConnected === false
              ? internalNodes.get(el.id)!.nstar
              : getPinNode(el.id, 'N');
          u = Va - getV(nStar);
          iVal = lastTpCurrent.get(`${el.id}:A`) ?? 0;
        } else {
          u = Va - Vb;
          iVal = (lastTpCurrent.get(`${el.id}:AB`) ?? 0) - (lastTpCurrent.get(`${el.id}:CA`) ?? 0);
        }
      } else if (el.type === 'ONE_PORT') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '2'));
        if ((el.onePortMode ?? 'THEVENIN') === 'THEVENIN') {
          iVal = x[elementAuxMap.get(el.id)!.i];
        } else {
          const G = Math.max(0, el.onePortZ?.re ?? 0.02);
          iVal = G * u - getOnePortTransientValue(el, t);
        }
      } else if (el.type === 'TWO_PORT') {
        u = getV(getPinNode(el.id, '1')) - getV(getPinNode(el.id, '1p'));
        const aux = elementAuxMap.get(el.id);
        if (aux?.i1 !== undefined) {
          iVal = x[aux.i1];
        } else {
          const u2 = getV(getPinNode(el.id, '2')) - getV(getPinNode(el.id, '2p'));
          const k11 = el.m11?.re ?? 20;
          const k12 = el.m12?.re ?? 10;
          iVal = k11 * u + k12 * u2;
        }
      }
      elementVoltages[el.id].push(u);
      elementCurrents[el.id].push(iVal);
    }
  }

  // Lấy mẫu điểm cuối làm tóm tắt
  const lastIdx = times.length - 1;
  const nodes: NodeVoltageResult[] = netlist.allNodeIds.map((nid) => {
    const arr = nodeVoltages[nid];
    const finalV = arr[lastIdx] ?? 0;
    const rms = Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / Math.max(1, arr.length));
    return {
      nodeId: nid,
      dc: finalV,
      rms,
      instantaneous: `u(${tEnd}s) = ${finalV.toFixed(3)} V`,
      harmonics: [],
    };
  });

  const elResults: ElementBranchResult[] = elements
    .filter((e) => e.type !== 'GND' && e.type !== 'MUTUAL')
    .map((el) => {
      const uArr = elementVoltages[el.id];
      const iArr = elementCurrents[el.id];
      const uFinal = uArr[lastIdx] ?? 0;
      const iFinal = iArr[lastIdx] ?? 0;
      const uRms = Math.sqrt(uArr.reduce((s, v) => s + v * v, 0) / Math.max(1, uArr.length));
      const iRms = Math.sqrt(iArr.reduce((s, v) => s + v * v, 0) / Math.max(1, iArr.length));
      const pAvg = uArr.reduce((s, v, idx) => s + v * iArr[idx], 0) / Math.max(1, uArr.length);
      return {
        elementId: el.id,
        name: el.name,
        type: el.type,
        voltageRms: uRms,
        voltageDc: uFinal,
        currentRms: iRms,
        currentDc: iFinal,
        pWatts: pAvg,
        qVars: 0,
        sVA: uRms * iRms,
        instantaneousCurrent: `i(${tEnd}s) = ${iFinal.toFixed(4)} A`,
      };
    });

  const transient: TransientSeries = {
    times,
    nodeVoltages,
    elementCurrents,
    elementVoltages,
  };

  return {
    mode: 'TRANSIENT',
    success: true,
    diagnostics,
    nodeMap: netlist.nodeMap,
    allNodeIds: netlist.allNodeIds,
    autoGroundUsed: netlist.autoGroundUsed,
    nodes,
    elements: elResults,
    transient,
  };
}

/**
 * Hàm giải mô phỏng chính cho tất cả 4 chế độ (DC, DC_SS, AC, TRANSIENT).
 */
export function runSimulation(
  state: CircuitState,
  mode: SimulationMode,
  options?: { dt?: number; tEnd?: number },
): SimulationResult {
  const netlist = buildNetlist(state.elements, state.wires);
  const diagnostics: DiagnosticMessage[] = [...netlist.diagnostics];

  if (state.elements.length === 0) {
    return {
      mode,
      success: false,
      diagnostics: [{ level: 'warning', text: 'Mạch điện đang trống. Hãy kéo thả phần tử vào sơ đồ.' }],
      nodeMap: netlist.nodeMap,
      allNodeIds: netlist.allNodeIds,
      autoGroundUsed: false,
      nodes: [],
      elements: [],
    };
  }

  // Kiểm tra tham chiếu hỗ cảm và nguồn phụ thuộc
  for (const el of state.elements) {
    if (el.type === 'MUTUAL') {
      if (!el.l1Id || !el.l2Id) {
        diagnostics.push({
          level: 'warning',
          text: `Hỗ cảm ${el.name}: chưa chọn đủ hai cuộn dây L1, L2.`,
        });
        continue;
      }
      if (el.l1Id === el.l2Id) {
        diagnostics.push({
          level: 'warning',
          text: `Hỗ cảm ${el.name}: L1 và L2 phải là hai cuộn dây khác nhau.`,
        });
        continue;
      }
      const l1 = state.elements.find((e) => e.id === el.l1Id && e.type === 'INDUCTOR');
      const l2 = state.elements.find((e) => e.id === el.l2Id && e.type === 'INDUCTOR');
      if (!l1 || !l2) {
        diagnostics.push({
          level: 'warning',
          text: `Hỗ cảm ${el.name}: cuộn dây tham chiếu không còn tồn tại trong sơ đồ.`,
        });
      } else {
        const maxM = Math.sqrt((l1.inductance ?? 0) * (l2.inductance ?? 0));
        if (Math.abs(el.mutualM ?? 0) > maxM + 1e-12) {
          diagnostics.push({
            level: 'warning',
            text: `Hỗ cảm ${el.name}: |M| = ${Math.abs(el.mutualM ?? 0)} H lớn hơn √(L1·L2) = ${maxM.toFixed(4)} H (hệ số ghép k > 1).`,
          });
        }
      }
    } else if (el.type === 'CCVS' || el.type === 'CCCS') {
      const ctrlEl = el.ctrlElementId
        ? state.elements.find((e) => e.id === el.ctrlElementId)
        : undefined;
      if (!ctrlEl || ctrlEl.type === 'GND' || ctrlEl.type === 'MUTUAL') {
        diagnostics.push({
          level: 'warning',
          text: `Nguồn phụ thuộc ${el.name}: phần tử điều khiển dòng chưa hợp lệ hoặc đã bị xoá.`,
        });
      }
    } else if (el.type === 'VCVS' || el.type === 'VCCS') {
      const cp = el.ctrlNodePos ?? '1';
      const cn = el.ctrlNodeNeg ?? '0';
      if (!netlist.allNodeIds.includes(cp) || !netlist.allNodeIds.includes(cn)) {
        const missing = !netlist.allNodeIds.includes(cp) ? cp : cn;
        diagnostics.push({
          level: 'warning',
          text: `Nguồn phụ thuộc ${el.name}: nút điều khiển "${missing}" chưa có trong sơ đồ hiện tại.`,
        });
      }
    }
  }

  if (mode === 'TRANSIENT') {
    const res = runTransientSimulation(
      state,
      netlist,
      options?.dt ?? 0.0002,
      options?.tEnd ?? 0.04,
    );
    res.diagnostics = [...diagnostics, ...res.diagnostics.filter((d) => !diagnostics.some((x) => x.text === d.text))];
    return res;
  }

  // Thu thập tất cả tần số nguồn độc lập
  const freqs = new Set<number>();
  const addFreq = (f: number) => {
    const clean = f <= 1e-9 ? 0 : f;
    for (const existing of freqs) {
      if (Math.abs(existing - clean) < 1e-6) return;
    }
    freqs.add(clean);
  };

  if (mode === 'DC' || mode === 'DC_SS') {
    freqs.add(0);
    const hasAcContent = state.elements.some((el) => {
      if (el.type === 'V_SRC' || el.type === 'I_SRC') {
        return getSourceComponents(el).some((c) => c.freqHz > 0 && c.phasorRms.mag() > 1e-12);
      }
      if (el.type === 'ONE_PORT') {
        return (el.onePortFreqHz ?? 50) > 0 && Math.abs(el.onePortMag ?? 0) > 1e-12;
      }
      if (el.type === 'THREE_PHASE_SRC') {
        return (el.tpFreqHz ?? 50) > 0 && Math.abs(el.tpVoltageRms ?? 220) > 1e-12;
      }
      return false;
    });
    if (hasAcContent) {
      diagnostics.push({
        level: 'info',
        text: 'Chế độ DC chỉ giải thành phần một chiều (0 Hz); các thành phần xoay chiều (AC/sóng hài) tạm thời được triệt tiêu.',
      });
    }
    const hasReactiveZInDc = state.elements.some(
      (el) => el.type === 'IMPEDANCE' && Math.abs(el.impedance?.im ?? 0) > 1e-12,
    );
    if (hasReactiveZInDc) {
      diagnostics.push({
        level: 'info',
        text: 'Chế độ DC chỉ xét phần thực R của tổng trở Z (bỏ qua phần ảo jX). Chuyển sang chế độ Xoay chiều (AC) để mô phỏng tổng trở phức.',
      });
    }
  } else {
    for (const el of state.elements) {
      if (el.type === 'V_SRC' || el.type === 'I_SRC') {
        for (const s of getSourceComponents(el)) {
          if (s.phasorRms.mag() > 1e-12) addFreq(s.freqHz);
        }
      } else if (el.type === 'ONE_PORT') {
        if ((el.onePortMag ?? 0) !== 0) addFreq(Math.max(0, el.onePortFreqHz ?? 50));
      } else if (el.type === 'THREE_PHASE_SRC') {
        addFreq(Math.max(0, el.tpFreqHz ?? 50));
      }
    }
    if (freqs.size === 0) freqs.add(50);
  }

  const freqList = Array.from(freqs).sort((a, b) => a - b);
  const acFreqs = freqList.filter((f) => f > 0);
  const singleFrequencyHz = acFreqs.length === 1 && !freqs.has(0) ? acFreqs[0] : null;

  if (mode === 'AC' && freqList.length > 1) {
    diagnostics.push({
      level: 'info',
      text: `Mạch nguồn hỗn hợp (${freqList.length} tần số): đang áp dụng xếp chồng tuyến tính tại ${freqList
        .map((f) => (f === 0 ? '0 Hz (DC)' : `${f} Hz`))
        .join(', ')}.`,
    });
  }

  if (mode === 'AC' && acFreqs.length > 1) {
    const hasStaticReactiveBlock = state.elements.some((el) => {
      if (el.type === 'IMPEDANCE') return Math.abs(el.impedance?.im ?? 0) > 1e-12;
      if (el.type === 'ONE_PORT') return Math.abs(el.onePortZ?.im ?? 0) > 1e-12;
      if (el.type === 'TWO_PORT') {
        return [el.m11, el.m12, el.m21, el.m22].some((m) => Math.abs(m?.im ?? 0) > 1e-12);
      }
      if (el.type === 'THREE_PHASE_LINE') {
        return (
          Math.abs(el.lineZ?.im ?? 0) > 1e-12 ||
          (el.hasNeutral !== false && Math.abs(el.lineZn?.im ?? 0) > 1e-12)
        );
      }
      if (el.type === 'THREE_PHASE_LOAD') {
        return (
          Math.abs(el.loadZa?.im ?? 0) > 1e-12 ||
          (el.loadSymmetric === false &&
            (Math.abs(el.loadZb?.im ?? 0) > 1e-12 || Math.abs(el.loadZc?.im ?? 0) > 1e-12))
        );
      }
      return false;
    });
    if (hasStaticReactiveBlock) {
      diagnostics.push({
        level: 'warning',
        text: 'Mạch có phần tử tổng trở R + jX tĩnh (tổng trở Z/một cửa/hai cửa/3 pha): phần ảo jX giữ nguyên giá trị theo thiết lập khi xếp chồng nhiều tần số AC.',
      });
    }
  }

  // Giải MNA cho từng tần số và xếp chồng kết quả
  const nodeAccum = new Map<
    string,
    {
      dc: number;
      acSqSum: number;
      harmonics: HarmonicComponent[];
      singlePhasor?: Complex;
    }
  >();
  for (const nid of netlist.allNodeIds) {
    nodeAccum.set(nid, { dc: 0, acSqSum: 0, harmonics: [] });
  }

  type ThreePhaseDetails = NonNullable<ElementBranchResult['threePhaseDetails']>;
  const elemAccum = new Map<
    string,
    {
      uDc: number;
      uAcSqSum: number;
      iDc: number;
      iAcSqSum: number;
      pSum: number;
      qSum: number;
      uHarmonics: HarmonicComponent[];
      iHarmonics: HarmonicComponent[];
      uSingle?: Complex;
      iSingle?: Complex;
      threePhase?: ThreePhaseDetails;
      threePhaseAccum?: {
        pTotal: number;
        qTotal: number;
        iaSq: number;
        ibSq: number;
        icSq: number;
        inSq: number;
        hasNeutral: boolean;
        uNeutSq: number;
        hasNeutralShift: boolean;
        bestScore: number;
        bestSample: ThreePhaseDetails;
      };
    }
  >();
  for (const el of state.elements) {
    if (el.type === 'GND' || el.type === 'MUTUAL') continue;
    elemAccum.set(el.id, {
      uDc: 0,
      uAcSqSum: 0,
      iDc: 0,
      iAcSqSum: 0,
      pSum: 0,
      qSum: 0,
      uHarmonics: [],
      iHarmonics: [],
    });
  }

  for (const f of freqList) {
    const solved = solveSingleFrequencyMna(state.elements, netlist, f, mode);
    if (!solved.success || !solved.x || !solved.sys) {
      return {
        mode,
        success: false,
        diagnostics: [...diagnostics, { level: 'error', text: solved.error ?? 'Lỗi giải mạch.' }],
        nodeMap: netlist.nodeMap,
        allNodeIds: netlist.allNodeIds,
        autoGroundUsed: netlist.autoGroundUsed,
        nodes: [],
        elements: [],
      };
    }

    for (const nid of netlist.allNodeIds) {
      const V = solved.nodeVoltages.get(nid) ?? Complex.zero();
      const acc = nodeAccum.get(nid)!;
      if (f === 0) {
        acc.dc += V.re;
      } else {
        const mag = V.mag();
        acc.acSqSum += mag * mag;
        acc.harmonics.push({
          freqHz: f,
          rms: mag,
          peak: mag * SQRT2,
          phaseDeg: V.deg(),
        });
        if (singleFrequencyHz !== null) {
          acc.singlePhasor = V;
        }
      }
    }

    for (const el of state.elements) {
      if (el.type === 'GND' || el.type === 'MUTUAL') continue;
      const br = extractElementBranchAtFreq(el, netlist, solved.x, solved.sys, f, mode);
      const acc = elemAccum.get(el.id)!;
      if (f === 0) {
        acc.uDc += br.U.re;
        acc.iDc += br.I.re;
        acc.pSum += br.S.re;
      } else {
        const uMag = br.U.mag();
        const iMag = br.I.mag();
        acc.uAcSqSum += uMag * uMag;
        acc.iAcSqSum += iMag * iMag;
        acc.pSum += br.S.re;
        acc.qSum += br.S.im;
        acc.uHarmonics.push({ freqHz: f, rms: uMag, peak: uMag * SQRT2, phaseDeg: br.U.deg() });
        acc.iHarmonics.push({ freqHz: f, rms: iMag, peak: iMag * SQRT2, phaseDeg: br.I.deg() });
        if (singleFrequencyHz !== null) {
          acc.uSingle = br.U;
          acc.iSingle = br.I;
          if (br.threePhase) acc.threePhase = br.threePhase;
        }
      }
      if (singleFrequencyHz === null && br.threePhase) {
        const tp = br.threePhase;
        const score = tp.iaMag + tp.ibMag + tp.icMag + (f > 0 ? 1e-9 : 0);
        if (!acc.threePhaseAccum) {
          acc.threePhaseAccum = {
            pTotal: tp.pTotal,
            qTotal: tp.qTotal,
            iaSq: tp.iaMag * tp.iaMag,
            ibSq: tp.ibMag * tp.ibMag,
            icSq: tp.icMag * tp.icMag,
            inSq: (tp.inMag ?? 0) * (tp.inMag ?? 0),
            hasNeutral: tp.inMag !== undefined,
            uNeutSq: (tp.uNeutralShift ?? 0) * (tp.uNeutralShift ?? 0),
            hasNeutralShift: tp.uNeutralShift !== undefined,
            bestScore: score,
            bestSample: tp,
          };
        } else {
          const tpa = acc.threePhaseAccum;
          tpa.pTotal += tp.pTotal;
          tpa.qTotal += tp.qTotal;
          tpa.iaSq += tp.iaMag * tp.iaMag;
          tpa.ibSq += tp.ibMag * tp.ibMag;
          tpa.icSq += tp.icMag * tp.icMag;
          if (tp.inMag !== undefined) {
            tpa.hasNeutral = true;
            tpa.inSq += tp.inMag * tp.inMag;
          }
          if (tp.uNeutralShift !== undefined) {
            tpa.hasNeutralShift = true;
            tpa.uNeutSq += tp.uNeutralShift * tp.uNeutralShift;
          }
          if (score > tpa.bestScore) {
            tpa.bestScore = score;
            tpa.bestSample = tp;
          }
        }
      }
    }
  }

  const nodes: NodeVoltageResult[] = netlist.allNodeIds.map((nid) => {
    const acc = nodeAccum.get(nid)!;
    const rms = Math.hypot(acc.dc, Math.sqrt(acc.acSqSum));
    return {
      nodeId: nid,
      dc: acc.dc,
      rms,
      phasorMag: acc.singlePhasor?.mag(),
      phasorDeg: acc.singlePhasor?.deg(),
      instantaneous: formatInstantaneous(acc.dc, acc.harmonics),
      harmonics: acc.harmonics,
    };
  });

  let pGenerated = 0;
  let pConsumed = 0;
  let qGenerated = 0;
  let qConsumed = 0;

  const isPassiveNoCouplingTransfer = (t: CircuitElement['type']) =>
    t === 'RESISTOR' ||
    t === 'CAPACITOR' ||
    t === 'IMPEDANCE' ||
    t === 'TWO_PORT' ||
    t === 'THREE_PHASE_LINE' ||
    t === 'THREE_PHASE_LOAD';

  const elementResults: ElementBranchResult[] = state.elements
    .filter((e) => e.type !== 'GND' && e.type !== 'MUTUAL')
    .map((el) => {
      const acc = elemAccum.get(el.id)!;
      const uRms = Math.hypot(acc.uDc, Math.sqrt(acc.uAcSqSum));
      const iRms = Math.hypot(acc.iDc, Math.sqrt(acc.iAcSqSum));
      if (el.type === 'INDUCTOR') {
        // Tổng công suất tác dụng trao đổi qua hỗ cảm triệt tiêu nhau (P_L1 + P_L2 = 0),
        // không tính vào tổng phát nguồn; chỉ tính Q của cuộn dây.
        if (acc.qSum >= 0) qConsumed += acc.qSum;
        else qGenerated += -acc.qSum;
      } else if (isPassiveNoCouplingTransfer(el.type)) {
        if (acc.pSum >= 0) pConsumed += acc.pSum;
        else pGenerated += -acc.pSum;
        if (acc.qSum >= 0) qConsumed += acc.qSum;
        else qGenerated += -acc.qSum;
      } else {
        if (acc.pSum >= 0) pConsumed += acc.pSum;
        else pGenerated += -acc.pSum;
        if (acc.qSum >= 0) qConsumed += acc.qSum;
        else qGenerated += -acc.qSum;
      }

      const threePhaseDetails =
        acc.threePhase ??
        (acc.threePhaseAccum
          ? {
              iaMag: Math.sqrt(acc.threePhaseAccum.iaSq),
              iaDeg: acc.threePhaseAccum.bestSample.iaDeg,
              ibMag: Math.sqrt(acc.threePhaseAccum.ibSq),
              ibDeg: acc.threePhaseAccum.bestSample.ibDeg,
              icMag: Math.sqrt(acc.threePhaseAccum.icSq),
              icDeg: acc.threePhaseAccum.bestSample.icDeg,
              ...(acc.threePhaseAccum.hasNeutral
                ? {
                    inMag: Math.sqrt(acc.threePhaseAccum.inSq),
                    inDeg: acc.threePhaseAccum.bestSample.inDeg,
                  }
                : {}),
              ...(acc.threePhaseAccum.hasNeutralShift
                ? { uNeutralShift: Math.sqrt(acc.threePhaseAccum.uNeutSq) }
                : {}),
              pTotal: acc.threePhaseAccum.pTotal,
              qTotal: acc.threePhaseAccum.qTotal,
              sTotal: Math.hypot(acc.threePhaseAccum.pTotal, acc.threePhaseAccum.qTotal),
            }
          : undefined);

      return {
        elementId: el.id,
        name: el.name,
        type: el.type,
        voltageRms: uRms,
        voltageDc: acc.uDc,
        voltagePhasorMag: acc.uSingle?.mag(),
        voltagePhasorDeg: acc.uSingle?.deg(),
        currentRms: iRms,
        currentDc: acc.iDc,
        currentPhasorMag: acc.iSingle?.mag(),
        currentPhasorDeg: acc.iSingle?.deg(),
        pWatts: acc.pSum,
        qVars: acc.qSum,
        sVA: threePhaseDetails ? threePhaseDetails.sTotal : uRms * iRms,
        instantaneousCurrent: formatInstantaneous(acc.iDc, acc.iHarmonics),
        instantaneousVoltage: formatInstantaneous(acc.uDc, acc.uHarmonics),
        voltageHarmonics: acc.uHarmonics,
        currentHarmonics: acc.iHarmonics,
        threePhaseDetails,
      };
    });

  return {
    mode,
    success: true,
    diagnostics,
    nodeMap: netlist.nodeMap,
    allNodeIds: netlist.allNodeIds,
    autoGroundUsed: netlist.autoGroundUsed,
    singleFrequencyHz,
    frequenciesHz: freqList,
    nodes,
    elements: elementResults,
    powerBalance: {
      pGenerated,
      pConsumed,
      qGenerated,
      qConsumed,
    },
  };
}

/**
 * Trình trích xuất tương đương Thévenin / Norton giữa 2 nút (nodeA, nodeB).
 */
export function extractTheveninNorton(
  state: CircuitState,
  nodeA: string,
  nodeB: string,
  freqHz: number,
): TheveninNortonResult {
  if (nodeA === nodeB) {
    return {
      success: false,
      error: 'Hai nút trích xuất phải khác nhau.',
      freqHz,
      vth: { re: 0, im: 0 },
      zth: { re: 0, im: 0 },
      inorton: { re: 0, im: 0 },
      ynorton: { re: 0, im: 0 },
    };
  }

  const netlist = buildNetlist(state.elements, state.wires);
  const mode = freqHz === 0 ? 'DC_SS' : 'AC';

  // Bước 1: Tính điện áp hở mạch Vth = Va - Vb khi mạch đang hoạt động
  const openRes = solveSingleFrequencyMna(state.elements, netlist, freqHz, mode);
  if (!openRes.success) {
    return {
      success: false,
      error: openRes.error ?? 'Không thể giải mạch hở.',
      freqHz,
      vth: { re: 0, im: 0 },
      zth: { re: 0, im: 0 },
      inorton: { re: 0, im: 0 },
      ynorton: { re: 0, im: 0 },
    };
  }
  const Va = openRes.nodeVoltages.get(nodeA) ?? Complex.zero();
  const Vb = openRes.nodeVoltages.get(nodeB) ?? Complex.zero();
  const Vth = Va.sub(Vb);

  // Bước 2: Triệt tiêu mọi nguồn độc lập, bơm dòng thử Itest = 1A từ nodeB sang nodeA
  const testRes = solveSingleFrequencyMna(state.elements, netlist, freqHz, mode, {
    disableIndependentSources: true,
    extraStamp: ({ b, getNodeIdx }) => {
      const ia = getNodeIdx(nodeA);
      const ib = getNodeIdx(nodeB);
      if (ia >= 0) addRhs(b, ia, Complex.one());
      if (ib >= 0) addRhs(b, ib, Complex.one().neg());
    },
  });

  if (!testRes.success) {
    return {
      success: false,
      error: testRes.error ?? 'Không thể tính tổng trở tương đương Zth.',
      freqHz,
      vth: { re: Vth.re, im: Vth.im },
      zth: { re: 0, im: 0 },
      inorton: { re: 0, im: 0 },
      ynorton: { re: 0, im: 0 },
    };
  }

  const Zth = (testRes.nodeVoltages.get(nodeA) ?? Complex.zero()).sub(
    testRes.nodeVoltages.get(nodeB) ?? Complex.zero(),
  );

  // Bảo vệ trường hợp ngắn mạch lý tưởng Zth ~ 0
  const Yth = Zth.mag() > 1e-10 ? Zth.inv() : new Complex(1e10, 0);
  const In = Zth.mag() > 1e-10 ? Vth.div(Zth) : Complex.zero();

  return {
    success: true,
    freqHz,
    vth: { re: Vth.re, im: Vth.im },
    zth: { re: Zth.re, im: Zth.im },
    inorton: { re: In.re, im: In.im },
    ynorton: { re: Yth.re, im: Yth.im },
  };
}

/**
 * Trình trích xuất ma trận thông số mạng hai cửa [Z], [Y], [A]
 * giữa Cửa 1 (p1Pos, p1Neg) và Cửa 2 (p2Pos, p2Neg) (đã triệt tiêu nguồn độc lập).
 */
export function extractTwoPort(
  state: CircuitState,
  p1Pos: string,
  p1Neg: string,
  p2Pos: string,
  p2Neg: string,
  freqHz: number,
): TwoPortExtractResult {
  if (p1Pos === p1Neg || p2Pos === p2Neg) {
    return {
      success: false,
      error: 'Hai cực của mỗi cửa phải khác nhau.',
      freqHz,
    };
  }
  const netlist = buildNetlist(state.elements, state.wires);
  const mode = freqHz === 0 ? 'DC_SS' : 'AC';

  // Tính [Z]: Bơm I1 = 1A vào cửa 1 (hở cửa 2), sau đó bơm I2 = 1A vào cửa 2 (hở cửa 1)
  const runCurrentTest = (pos: string, neg: string) =>
    solveSingleFrequencyMna(state.elements, netlist, freqHz, mode, {
      disableIndependentSources: true,
      extraStamp: ({ b, getNodeIdx }) => {
        const ip = getNodeIdx(pos);
        const inn = getNodeIdx(neg);
        if (ip >= 0) addRhs(b, ip, Complex.one());
        if (inn >= 0) addRhs(b, inn, Complex.one().neg());
      },
    });

  const zTest1 = runCurrentTest(p1Pos, p1Neg);
  const zTest2 = runCurrentTest(p2Pos, p2Neg);

  let Z: [[Complex, Complex], [Complex, Complex]] | undefined;
  if (zTest1.success && zTest2.success) {
    const getDiff = (m: Map<string, Complex>, a: string, b: string) =>
      (m.get(a) ?? Complex.zero()).sub(m.get(b) ?? Complex.zero());
    const z11 = getDiff(zTest1.nodeVoltages, p1Pos, p1Neg);
    const z21 = getDiff(zTest1.nodeVoltages, p2Pos, p2Neg);
    const z12 = getDiff(zTest2.nodeVoltages, p1Pos, p1Neg);
    const z22 = getDiff(zTest2.nodeVoltages, p2Pos, p2Neg);
    if (z11.mag() < 1e9 && z22.mag() < 1e9) {
      Z = [
        [z11, z12],
        [z21, z22],
      ];
    }
  }

  // Tính [Y]: Áp V1 = 1V, V2 = 0V; sau đó V1 = 0V, V2 = 1V
  const runVoltageTest = (v1Val: Complex, v2Val: Complex) => {
    let aux1Idx = -1;
    let aux2Idx = -1;
    const res = solveSingleFrequencyMna(state.elements, netlist, freqHz, mode, {
      disableIndependentSources: true,
      extraAuxCount: 2,
      extraStamp: ({ A, b, getNodeIdx, allocAux }) => {
        aux1Idx = allocAux();
        aux2Idx = allocAux();
        stampVoltageSource(A, b, getNodeIdx(p1Pos), getNodeIdx(p1Neg), aux1Idx, v1Val);
        stampVoltageSource(A, b, getNodeIdx(p2Pos), getNodeIdx(p2Neg), aux2Idx, v2Val);
      },
    });
    if (!res.success || !res.x) return null;
    // Lưu ý: dòng trong stampVoltageSource đi từ + sang - bên trong nguồn (tức đi VÀO nút + từ mạch ngoài).
    // Dòng đi vào mạng hai cửa tại cực + chính là -x[auxIdx]!
    return {
      I1: res.x[aux1Idx].neg(),
      I2: res.x[aux2Idx].neg(),
    };
  };

  const yTest1 = runVoltageTest(Complex.one(), Complex.zero());
  const yTest2 = runVoltageTest(Complex.zero(), Complex.one());

  let Y: [[Complex, Complex], [Complex, Complex]] | undefined;
  if (yTest1 && yTest2) {
    if (yTest1.I1.mag() < 1e9 && yTest2.I2.mag() < 1e9) {
      Y = [
        [yTest1.I1, yTest2.I1],
        [yTest1.I2, yTest2.I2],
      ];
    }
  }

  let A_mat: [[Complex, Complex], [Complex, Complex]] | undefined;
  if (Z && Z[1][0].mag() > 1e-10) {
    const detZ = Z[0][0].mul(Z[1][1]).sub(Z[0][1].mul(Z[1][0]));
    A_mat = [
      [Z[0][0].div(Z[1][0]), detZ.div(Z[1][0])],
      [Complex.one().div(Z[1][0]), Z[1][1].div(Z[1][0])],
    ];
  } else if (Y && Y[1][0].mag() > 1e-10) {
    const detY = Y[0][0].mul(Y[1][1]).sub(Y[0][1].mul(Y[1][0]));
    A_mat = [
      [Y[1][1].neg().div(Y[1][0]), Complex.one().neg().div(Y[1][0])],
      [detY.neg().div(Y[1][0]), Y[0][0].neg().div(Y[1][0])],
    ];
  }

  if (!Z && !Y && !A_mat) {
    return {
      success: false,
      error: 'Không thể trích xuất thông số mạng hai cửa giữa hai cặp nút đã chọn (kiểm tra kết nối giữa cửa 1 và cửa 2).',
      freqHz,
    };
  }

  const mapM = (m?: [[Complex, Complex], [Complex, Complex]]): [[ComplexInput, ComplexInput], [ComplexInput, ComplexInput]] | undefined =>
    m
      ? [
          [{ re: m[0][0].re, im: m[0][0].im }, { re: m[0][1].re, im: m[0][1].im }],
          [{ re: m[1][0].re, im: m[1][0].im }, { re: m[1][1].re, im: m[1][1].im }],
        ]
      : undefined;

  return {
    success: true,
    freqHz,
    Z: mapM(Z),
    Y: mapM(Y),
    A: mapM(A_mat),
  };
}
