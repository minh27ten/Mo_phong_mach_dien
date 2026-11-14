export type ComponentType =
  | 'GND'
  | 'V_SRC'
  | 'I_SRC'
  | 'RESISTOR'
  | 'CAPACITOR'
  | 'INDUCTOR'
  | 'MUTUAL'
  | 'VCVS'
  | 'CCVS'
  | 'VCCS'
  | 'CCCS'
  | 'ONE_PORT'
  | 'TWO_PORT'
  | 'OPAMP'
  | 'THREE_PHASE_SRC'
  | 'THREE_PHASE_LINE'
  | 'THREE_PHASE_LOAD';

export type SimulationMode = 'DC' | 'DC_SS' | 'AC' | 'TRANSIENT';

export type SourceWaveform = 'DC' | 'AC' | 'STEP' | 'MIXED';

export type AmplitudeType = 'RMS' | 'PEAK';

export interface SourceHarmonic {
  id: string;
  freqHz: number;
  amplitude: number;
  phaseDeg: number;
}

export type ComplexInput = {
  re: number;
  im: number;
};

export interface PinDef {
  id: string;
  label: string;
  dx: number;
  dy: number;
}

export interface CircuitElement {
  id: string;
  name: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;

  // Nguồn độc lập (V_SRC, I_SRC)
  waveform?: SourceWaveform;
  dcValue?: number;
  acValue?: number;
  mixedDcValue?: number;
  harmonics?: SourceHarmonic[];
  amplitudeType?: AmplitudeType;
  phaseDeg?: number;
  freqHz?: number;
  stepInit?: number;
  stepFinal?: number;
  stepTime?: number;

  // Phần tử thụ động (R, C, L)
  resistance?: number;
  capacitance?: number;
  inductance?: number;
  initialVoltage?: number; // u_C(0)
  initialCurrent?: number; // i_L(0)

  // Hỗ cảm (MUTUAL)
  l1Id?: string;
  l2Id?: string;
  mutualM?: number;
  dotPolarity?: 1 | -1; // 1 = cùng tính tại chân 1, -1 = ngược tính

  // Nguồn phụ thuộc (VCVS, CCVS, VCCS, CCCS)
  gain?: number; // mu, r, g, beta
  ctrlNodePos?: string; // Node ID (string number like "1", "0")
  ctrlNodeNeg?: string;
  ctrlElementId?: string;

  // Mạng một cửa (ONE_PORT)
  onePortMode?: 'THEVENIN' | 'NORTON';
  onePortMag?: number; // Vth hoặc In (RMS hoặc DC)
  onePortPhaseDeg?: number;
  onePortFreqHz?: number; // 0 = DC, >0 = AC
  onePortZ?: ComplexInput; // Zth (nếu THEVENIN) hoặc Yth (nếu NORTON)

  // Mạng hai cửa (TWO_PORT)
  twoPortType?: 'Z' | 'Y' | 'A';
  m11?: ComplexInput;
  m12?: ComplexInput;
  m21?: ComplexInput;
  m22?: ComplexInput;

  // Op-Amp
  opampInvertPins?: boolean;

  // Nguồn ba pha (THREE_PHASE_SRC)
  tpConnection?: 'Y' | 'DELTA';
  tpVoltageMode?: 'PHASE' | 'LINE';
  tpVoltageRms?: number;
  tpFreqHz?: number;
  tpPhaseADeg?: number;
  tpSequence?: 'ABC' | 'ACB';

  // Đường dây ba pha (THREE_PHASE_LINE)
  lineZ?: ComplexInput;
  lineZn?: ComplexInput;
  hasNeutral?: boolean;

  // Phụ tải ba pha (THREE_PHASE_LOAD)
  loadConnection?: 'Y' | 'DELTA';
  loadNeutralConnected?: boolean;
  loadSymmetric?: boolean;
  loadZa?: ComplexInput;
  loadZb?: ComplexInput;
  loadZc?: ComplexInput;
}

export interface WirePoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  points: WirePoint[];
}

export interface CircuitState {
  elements: CircuitElement[];
  wires: Wire[];
}

export interface DiagnosticMessage {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface HarmonicComponent {
  freqHz: number;
  rms: number;
  peak: number;
  phaseDeg: number;
}

export interface NodeVoltageResult {
  nodeId: string;
  dc: number;
  rms: number;
  phasorMag?: number; // RMS nếu đơn tần số
  phasorDeg?: number;
  instantaneous: string;
  harmonics: HarmonicComponent[];
}

export interface ElementBranchResult {
  elementId: string;
  name: string;
  type: ComponentType;
  voltageRms: number;
  voltageDc: number;
  voltagePhasorMag?: number;
  voltagePhasorDeg?: number;
  currentRms: number;
  currentDc: number;
  currentPhasorMag?: number;
  currentPhasorDeg?: number;
  pWatts: number; // >0 tiêu thụ, <0 phát
  qVars: number;
  sVA: number;
  instantaneousCurrent: string;
  instantaneousVoltage?: string;
  voltageHarmonics?: HarmonicComponent[];
  currentHarmonics?: HarmonicComponent[];
  // Thông tin bổ sung cho phần tử 3 pha
  threePhaseDetails?: {
    iaMag: number;
    iaDeg: number;
    ibMag: number;
    ibDeg: number;
    icMag: number;
    icDeg: number;
    inMag?: number;
    inDeg?: number;
    uNeutralShift?: number;
    pTotal: number;
    qTotal: number;
    sTotal: number;
  };
}

export interface TransientSeries {
  times: number[];
  nodeVoltages: Record<string, number[]>;
  elementCurrents: Record<string, number[]>;
  elementVoltages: Record<string, number[]>;
}

export interface SimulationResult {
  mode: SimulationMode;
  success: boolean;
  diagnostics: DiagnosticMessage[];
  nodeMap: Record<string, string>; // "elId:pinId" -> nodeId
  allNodeIds: string[];
  autoGroundUsed: boolean;
  singleFrequencyHz?: number | null; // khác null nếu AC chỉ có 1 tần số > 0
  frequenciesHz?: number[];
  nodes: NodeVoltageResult[];
  elements: ElementBranchResult[];
  transient?: TransientSeries;
  powerBalance?: {
    pGenerated: number;
    pConsumed: number;
    qGenerated: number;
    qConsumed: number;
  };
}

export interface TheveninNortonResult {
  success: boolean;
  error?: string;
  freqHz: number;
  vth: ComplexInput;
  zth: ComplexInput;
  inorton: ComplexInput;
  ynorton: ComplexInput;
}

export interface TwoPortExtractResult {
  success: boolean;
  error?: string;
  freqHz: number;
  Z?: [[ComplexInput, ComplexInput], [ComplexInput, ComplexInput]];
  Y?: [[ComplexInput, ComplexInput], [ComplexInput, ComplexInput]];
  A?: [[ComplexInput, ComplexInput], [ComplexInput, ComplexInput]];
}
