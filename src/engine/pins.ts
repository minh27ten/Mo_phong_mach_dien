import { CircuitElement, ComponentType, PinDef } from '../types/circuit';

export const GRID_SIZE = 20;

export interface ComponentMeta {
  type: ComponentType;
  label: string;
  shortLabel: string;
  category: 'source' | 'passive' | 'dependent' | 'network' | 'threephase';
  categoryLabel: string;
  prefix: string;
  description: string;
}

export const COMPONENT_CATALOG: ComponentMeta[] = [
  {
    type: 'GND',
    label: 'Nút đất (GND)',
    shortLabel: 'GND',
    category: 'source',
    categoryLabel: 'Nguồn & Điểm chuẩn',
    prefix: 'GND',
    description: 'Điểm tham chiếu điện thế 0 V (Nút 0).',
  },
  {
    type: 'V_SRC',
    label: 'Nguồn áp độc lập',
    shortLabel: 'Nguồn E',
    category: 'source',
    categoryLabel: 'Nguồn & Điểm chuẩn',
    prefix: 'E',
    description: 'Nguồn áp DC, AC hình sin, hỗn hợp đa hài hoặc Step.',
  },
  {
    type: 'I_SRC',
    label: 'Nguồn dòng độc lập',
    shortLabel: 'Nguồn J',
    category: 'source',
    categoryLabel: 'Nguồn & Điểm chuẩn',
    prefix: 'J',
    description: 'Nguồn dòng DC, AC hình sin, hỗn hợp đa hài hoặc Step.',
  },
  {
    type: 'RESISTOR',
    label: 'Điện trở (R)',
    shortLabel: 'Điện trở',
    category: 'passive',
    categoryLabel: 'Phần tử thụ động & Hỗ cảm',
    prefix: 'R',
    description: 'Phần tử tiêu tán điện trở thuần (Ω).',
  },
  {
    type: 'CAPACITOR',
    label: 'Tụ điện (C)',
    shortLabel: 'Tụ điện',
    category: 'passive',
    categoryLabel: 'Phần tử thụ động & Hỗ cảm',
    prefix: 'C',
    description: 'Phần tử điện dung (F) kèm sơ kiện u_C(0).',
  },
  {
    type: 'INDUCTOR',
    label: 'Cuộn dây / Điện cảm (L)',
    shortLabel: 'Cuộn dây',
    category: 'passive',
    categoryLabel: 'Phần tử thụ động & Hỗ cảm',
    prefix: 'L',
    description: 'Phần tử tự cảm (H) kèm sơ kiện i_L(0) và cực tính.',
  },
  {
    type: 'MUTUAL',
    label: 'Hỗ cảm (M)',
    shortLabel: 'Hỗ cảm M',
    category: 'passive',
    categoryLabel: 'Phần tử thụ động & Hỗ cảm',
    prefix: 'M',
    description: 'Ghép từ trường giữa hai cuộn dây L1, L2.',
  },
  {
    type: 'VCVS',
    label: 'Nguồn áp phụ thuộc áp (VCVS)',
    shortLabel: 'VCVS (μU)',
    category: 'dependent',
    categoryLabel: 'Nguồn phụ thuộc & Op-Amp',
    prefix: 'Ev',
    description: 'Nguồn áp điều khiển bởi điện áp cặp nút (hệ số μ).',
  },
  {
    type: 'CCVS',
    label: 'Nguồn áp phụ thuộc dòng (CCVS)',
    shortLabel: 'CCVS (rI)',
    category: 'dependent',
    categoryLabel: 'Nguồn phụ thuộc & Op-Amp',
    prefix: 'Er',
    description: 'Nguồn áp điều khiển bởi dòng nhánh (hệ số r, Ω).',
  },
  {
    type: 'VCCS',
    label: 'Nguồn dòng phụ thuộc áp (VCCS)',
    shortLabel: 'VCCS (gU)',
    category: 'dependent',
    categoryLabel: 'Nguồn phụ thuộc & Op-Amp',
    prefix: 'Jg',
    description: 'Nguồn dòng điều khiển bởi điện áp cặp nút (hệ số g, S).',
  },
  {
    type: 'CCCS',
    label: 'Nguồn dòng phụ thuộc dòng (CCCS)',
    shortLabel: 'CCCS (βI)',
    category: 'dependent',
    categoryLabel: 'Nguồn phụ thuộc & Op-Amp',
    prefix: 'Jb',
    description: 'Nguồn dòng điều khiển bởi dòng nhánh (hệ số β).',
  },
  {
    type: 'OPAMP',
    label: 'Op-Amp lý tưởng',
    shortLabel: 'Op-Amp',
    category: 'dependent',
    categoryLabel: 'Nguồn phụ thuộc & Op-Amp',
    prefix: 'OA',
    description: 'Khuếch đại thuật toán lý tưởng (V+ = V-, I_in = 0).',
  },
  {
    type: 'ONE_PORT',
    label: 'Mạng một cửa',
    shortLabel: '1-Cửa',
    category: 'network',
    categoryLabel: 'Mạng 1 cửa & 2 cửa',
    prefix: 'P1',
    description: 'Tương đương Thévenin (Vth, Zth) hoặc Norton (In, Yth).',
  },
  {
    type: 'TWO_PORT',
    label: 'Mạng hai cửa',
    shortLabel: '2-Cửa',
    category: 'network',
    categoryLabel: 'Mạng 1 cửa & 2 cửa',
    prefix: 'P2',
    description: 'Mạng 4 cực nhập trực tiếp ma trận [Z], [Y] hoặc [A].',
  },
  {
    type: 'THREE_PHASE_SRC',
    label: 'Nguồn ba pha đối xứng',
    shortLabel: 'Nguồn 3φ',
    category: 'threephase',
    categoryLabel: 'Hệ thống điện ba pha',
    prefix: 'G3',
    description: 'Nguồn áp 3 pha đấu Sao (Y) hoặc Tam giác (Δ).',
  },
  {
    type: 'THREE_PHASE_LINE',
    label: 'Đường dây truyền tải ba pha',
    shortLabel: 'ĐD 3φ',
    category: 'threephase',
    categoryLabel: 'Hệ thống điện ba pha',
    prefix: 'DZ',
    description: 'Đường dây 3 pha 4 dây (Zd pha và Zn trung tính).',
  },
  {
    type: 'THREE_PHASE_LOAD',
    label: 'Phụ tải ba pha',
    shortLabel: 'Tải 3φ',
    category: 'threephase',
    categoryLabel: 'Hệ thống điện ba pha',
    prefix: 'T3',
    description: 'Phụ tải 3 pha đấu Y/Δ hỗ trợ đối xứng & không đối xứng.',
  },
];

export function getComponentMeta(type: ComponentType): ComponentMeta {
  return COMPONENT_CATALOG.find((c) => c.type === type)!;
}

const VALID_COMPONENT_TYPES = new Set<string>(COMPONENT_CATALOG.map((c) => c.type));

export function isValidComponentType(type: unknown): type is ComponentType {
  return typeof type === 'string' && VALID_COMPONENT_TYPES.has(type);
}

export function hasVerticalPins(el: Pick<CircuitElement, 'type' | 'rotation'>): boolean {
  const verticallyOrientedByDefault =
    el.type === 'V_SRC' ||
    el.type === 'I_SRC' ||
    el.type === 'VCVS' ||
    el.type === 'CCVS' ||
    el.type === 'VCCS' ||
    el.type === 'CCCS';
  return verticallyOrientedByDefault
    ? el.rotation === 0 || el.rotation === 180
    : el.rotation === 90 || el.rotation === 270;
}

export function getLocalPins(el: Pick<CircuitElement, 'type' | 'opampInvertPins'>): PinDef[] {
  switch (el.type) {
    case 'GND':
      return [{ id: 'gnd', label: '0', dx: 0, dy: -20 }];
    case 'V_SRC':
    case 'I_SRC':
    case 'VCVS':
    case 'CCVS':
    case 'VCCS':
    case 'CCCS':
      return [
        { id: 'p', label: '+', dx: 0, dy: -40 },
        { id: 'n', label: '-', dx: 0, dy: 40 },
      ];
    case 'RESISTOR':
    case 'CAPACITOR':
    case 'INDUCTOR':
    case 'ONE_PORT':
      return [
        { id: '1', label: '1', dx: -40, dy: 0 },
        { id: '2', label: '2', dx: 40, dy: 0 },
      ];
    case 'MUTUAL':
      return [];
    case 'TWO_PORT':
      return [
        { id: '1', label: '1', dx: -60, dy: -40 },
        { id: '1p', label: "1'", dx: -60, dy: 40 },
        { id: '2', label: '2', dx: 60, dy: -40 },
        { id: '2p', label: "2'", dx: 60, dy: 40 },
      ];
    case 'OPAMP':
      return [
        { id: 'vp', label: '+', dx: -40, dy: el.opampInvertPins ? 20 : -20 },
        { id: 'vn', label: '-', dx: -40, dy: el.opampInvertPins ? -20 : 20 },
        { id: 'out', label: 'Out', dx: 40, dy: 0 },
      ];
    case 'THREE_PHASE_SRC':
      return [
        { id: 'A', label: 'A', dx: 60, dy: -60 },
        { id: 'B', label: 'B', dx: 60, dy: -20 },
        { id: 'C', label: 'C', dx: 60, dy: 20 },
        { id: 'N', label: 'N', dx: 60, dy: 60 },
      ];
    case 'THREE_PHASE_LINE':
      return [
        { id: 'A1', label: 'A1', dx: -60, dy: -60 },
        { id: 'B1', label: 'B1', dx: -60, dy: -20 },
        { id: 'C1', label: 'C1', dx: -60, dy: 20 },
        { id: 'N1', label: 'N1', dx: -60, dy: 60 },
        { id: 'A2', label: 'A2', dx: 60, dy: -60 },
        { id: 'B2', label: 'B2', dx: 60, dy: -20 },
        { id: 'C2', label: 'C2', dx: 60, dy: 20 },
        { id: 'N2', label: 'N2', dx: 60, dy: 60 },
      ];
    case 'THREE_PHASE_LOAD':
      return [
        { id: 'A', label: 'A', dx: -60, dy: -60 },
        { id: 'B', label: 'B', dx: -60, dy: -20 },
        { id: 'C', label: 'C', dx: -60, dy: 20 },
        { id: 'N', label: 'N', dx: -60, dy: 60 },
      ];
  }
}

export interface WorldPin {
  elementId: string;
  pinId: string;
  label: string;
  x: number;
  y: number;
  key: string; // `${elementId}:${pinId}`
}

export function rotatePoint(dx: number, dy: number, rotation: 0 | 90 | 180 | 270): { dx: number; dy: number } {
  switch (rotation) {
    case 0:
      return { dx, dy };
    case 90:
      return { dx: -dy, dy: dx };
    case 180:
      return { dx: -dx, dy: -dy };
    case 270:
      return { dx: dy, dy: -dx };
  }
}

export function getElementWorldPins(el: CircuitElement): WorldPin[] {
  const locals = getLocalPins(el);
  return locals.map((pin) => {
    const r = rotatePoint(pin.dx, pin.dy, el.rotation);
    const x = Math.round(el.x + r.dx);
    const y = Math.round(el.y + r.dy);
    return {
      elementId: el.id,
      pinId: pin.id,
      label: pin.label,
      x,
      y,
      key: `${el.id}:${pin.id}`,
    };
  });
}

export function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

export function createDefaultElement(
  type: ComponentType,
  x: number,
  y: number,
  existingElements: CircuitElement[],
  idOverride?: string,
): CircuitElement {
  const meta = getComponentMeta(type);
  const existingNames = new Set(existingElements.map((e) => e.name));
  let idx = 1;
  while (existingNames.has(`${meta.prefix}${idx}`)) {
    idx++;
  }
  const name = type === 'GND' ? 'GND' : `${meta.prefix}${idx}`;
  const id = idOverride ?? `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const base: CircuitElement = {
    id,
    name,
    type,
    x: snapToGrid(x),
    y: snapToGrid(y),
    rotation: 0,
  };

  switch (type) {
    case 'GND':
      return base;
    case 'V_SRC':
      return {
        ...base,
        waveform: 'AC',
        dcValue: 12,
        acValue: 220,
        mixedDcValue: 12,
        harmonics: [
          { id: 'h1', freqHz: 50, amplitude: 220, phaseDeg: 0 },
          { id: 'h2', freqHz: 150, amplitude: 40, phaseDeg: -30 },
        ],
        amplitudeType: 'RMS',
        phaseDeg: 0,
        freqHz: 50,
        stepInit: 0,
        stepFinal: 12,
        stepTime: 0,
      };
    case 'I_SRC':
      return {
        ...base,
        waveform: 'DC',
        dcValue: 2,
        acValue: 5,
        mixedDcValue: 2,
        harmonics: [
          { id: 'h1', freqHz: 50, amplitude: 3, phaseDeg: 0 },
        ],
        amplitudeType: 'RMS',
        phaseDeg: 0,
        freqHz: 50,
        stepInit: 0,
        stepFinal: 2,
        stepTime: 0,
      };
    case 'RESISTOR':
      return { ...base, resistance: 100 };
    case 'CAPACITOR':
      return { ...base, capacitance: 100e-6, initialVoltage: 0 };
    case 'INDUCTOR':
      return { ...base, inductance: 0.1, initialCurrent: 0 };
    case 'MUTUAL': {
      const inductors = existingElements.filter((e) => e.type === 'INDUCTOR');
      return {
        ...base,
        l1Id: inductors[0]?.id ?? '',
        l2Id: inductors[1]?.id ?? '',
        mutualM: 0.05,
        dotPolarity: 1,
      };
    }
    case 'VCVS':
      return { ...base, gain: 2, ctrlNodePos: '1', ctrlNodeNeg: '0' };
    case 'CCVS':
      return { ...base, gain: 10, ctrlElementId: '' };
    case 'VCCS':
      return { ...base, gain: 0.05, ctrlNodePos: '1', ctrlNodeNeg: '0' };
    case 'CCCS':
      return { ...base, gain: 2, ctrlElementId: '' };
    case 'ONE_PORT':
      return {
        ...base,
        onePortMode: 'THEVENIN',
        onePortMag: 10,
        onePortPhaseDeg: 0,
        onePortFreqHz: 50,
        onePortZ: { re: 50, im: 0 },
      };
    case 'TWO_PORT':
      return {
        ...base,
        twoPortType: 'Z',
        m11: { re: 20, im: 0 },
        m12: { re: 10, im: 0 },
        m21: { re: 10, im: 0 },
        m22: { re: 20, im: 0 },
      };
    case 'OPAMP':
      return { ...base, opampInvertPins: false };
    case 'THREE_PHASE_SRC':
      return {
        ...base,
        tpConnection: 'Y',
        tpVoltageMode: 'PHASE',
        tpVoltageRms: 220,
        tpFreqHz: 50,
        tpPhaseADeg: 0,
        tpSequence: 'ABC',
      };
    case 'THREE_PHASE_LINE':
      return {
        ...base,
        lineZ: { re: 1.5, im: 3.0 },
        lineZn: { re: 2.0, im: 1.0 },
        hasNeutral: true,
      };
    case 'THREE_PHASE_LOAD':
      return {
        ...base,
        loadConnection: 'Y',
        loadNeutralConnected: true,
        loadSymmetric: true,
        loadZa: { re: 40, im: 30 },
        loadZb: { re: 40, im: 30 },
        loadZc: { re: 40, im: 30 },
      };
  }
}

export function formatEngValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return `— ${unit}`;
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${+(value / 1e6).toPrecision(4)} M${unit}`;
  if (abs >= 1e3) return `${+(value / 1e3).toPrecision(4)} k${unit}`;
  if (abs >= 1) return `${+value.toPrecision(4)} ${unit}`;
  if (abs >= 1e-3) return `${+(value * 1e3).toPrecision(4)} m${unit}`;
  if (abs >= 1e-6) return `${+(value * 1e6).toPrecision(4)} μ${unit}`;
  if (abs >= 1e-9) return `${+(value * 1e9).toPrecision(4)} n${unit}`;
  return `${value.toExponential(2)} ${unit}`;
}
