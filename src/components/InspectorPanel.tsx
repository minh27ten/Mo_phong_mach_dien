import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  CheckCircle2,
  GitBranch,
  Plus,
  RotateCw,
  Sliders,
  Table2,
  Trash2,
} from 'lucide-react';
import {
  CircuitElement,
  CircuitState,
  ComplexInput,
  HarmonicComponent,
  MaxPowerConstraintMode,
  MaxPowerResult,
  SimulationResult,
  SourceHarmonic,
  TheveninNortonResult,
  TwoPortExtractResult,
  Wire,
} from '../types/circuit';
import { Complex } from '../engine/complex';
import {
  getComponentMeta,
  getElementWorldPins,
  getMutualDotPins,
  getMutualValueMode,
  isMutualCouplableType,
  normalizeRotation,
} from '../engine/pins';
import {
  extractTheveninNorton,
  extractTwoPort,
  findMaxPowerImpedance,
  getSourceComponents,
  getSourceHarmonicSummary,
} from '../engine/mna';
import { DraftNumInput } from './DraftNumInput';
import { TransientPlot } from './TransientPlot';

export type InspectorTab = 'PROPS' | 'RESULTS' | 'PLOT' | 'EQUIV';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  circuit: CircuitState;
  allNodeIds: string[];
  nodeMap?: Record<string, string>;
  selectedElement: CircuitElement | null;
  selectedWire: Wire | null;
  simulationResult: SimulationResult | null;
  onSelectElement?: (id: string) => void;
  onUpdateElement: (id: string, patch: Partial<CircuitElement>) => void;
  onRotateElement: (id: string, deltaDeg?: number) => void;
  onDeleteElement: (id: string) => void;
  onDeleteWire: (id: string) => void;
  onRunTransientNow: () => void;
  onApplyMaxPowerImpedance?: (params: {
    nodeA: string;
    nodeB: string;
    freqHz: number;
    zOpt: ComplexInput;
    targetElementId?: string;
  }) => void;
}

const INPUT_CLASS =
  'w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all';

const SELECT_CLASS =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all';

const NumField: React.FC<{
  label: string;
  value: number;
  min?: number;
  unit?: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, unit, onChange }) => (
  <label className="block">
    <span className="block text-[11px] font-medium text-slate-600 mb-1">
      {label} {unit ? <span className="text-slate-400 font-normal">({unit})</span> : null}
    </span>
    <DraftNumInput value={value} min={min} onChange={onChange} className={INPUT_CLASS} />
  </label>
);

const ComplexField: React.FC<{
  label: string;
  value?: ComplexInput;
  unit?: string;
  onChange: (val: ComplexInput) => void;
}> = ({ label, value = { re: 0, im: 0 }, unit, onChange }) => (
  <div>
    <div className="text-[11px] font-medium text-slate-600 mb-1">
      {label} {unit ? <span className="text-slate-400 font-normal">({unit})</span> : null}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
        <span className="px-2 text-[11px] font-mono text-slate-400 bg-slate-50 border-r border-slate-200 py-1.5 select-none">
          Re
        </span>
        <DraftNumInput
          ariaLabel={`${label} phần thực`}
          value={value.re}
          onChange={(re) => onChange({ re, im: value.im })}
          className="w-full px-2 py-1.5 text-xs font-mono tabular-nums focus:outline-none"
        />
      </div>
      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
        <span className="px-2 text-[11px] font-mono text-slate-400 bg-slate-50 border-r border-slate-200 py-1.5 select-none">
          j·Im
        </span>
        <DraftNumInput
          ariaLabel={`${label} phần ảo`}
          value={value.im}
          onChange={(im) => onChange({ re: value.re, im })}
          className="w-full px-2 py-1.5 text-xs font-mono tabular-nums focus:outline-none"
        />
      </div>
    </div>
  </div>
);

function SegmentedField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (val: T) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-600 mb-1">{label}</div>
      <div
        className="grid gap-1 p-0.5 bg-slate-100/90 border border-slate-200/70 rounded-lg"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`py-1 px-1.5 rounded-md text-[11px] font-medium transition-all truncate ${
                active
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeTab,
  onChangeTab,
  circuit,
  allNodeIds,
  nodeMap,
  selectedElement,
  selectedWire,
  simulationResult,
  onSelectElement,
  onUpdateElement,
  onRotateElement,
  onDeleteElement,
  onDeleteWire,
  onRunTransientNow,
  onApplyMaxPowerImpedance,
}) => {
  // State cho Trình trích xuất tương đương & Tối ưu công suất
  const [eqMode, setEqMode] = useState<'ONE_PORT' | 'MAX_POWER' | 'TWO_PORT'>('ONE_PORT');
  const [eqFreq, setEqFreq] = useState<number>(50);
  const [thNodeA, setThNodeA] = useState<string>('1');
  const [thNodeB, setThNodeB] = useState<string>('0');
  const [tp1Pos, setTp1Pos] = useState<string>('1');
  const [tp1Neg, setTp1Neg] = useState<string>('0');
  const [tp2Pos, setTp2Pos] = useState<string>('2');
  const [tp2Neg, setTp2Neg] = useState<string>('0');
  const [thResult, setThResult] = useState<TheveninNortonResult | null>(null);
  const [tpResult, setTpResult] = useState<TwoPortExtractResult | null>(null);
  const [mpConstraint, setMpConstraint] = useState<MaxPowerConstraintMode>('CONJUGATE');
  const [mpFixedX, setMpFixedX] = useState<number>(0);
  const [mpFixedAngle, setMpFixedAngle] = useState<number>(0);
  const [mpTargetElId, setMpTargetElId] = useState<string>('');
  const [mpResult, setMpResult] = useState<MaxPowerResult | null>(null);
  const [mpHoverIdx, setMpHoverIdx] = useState<number | null>(null);
  const [resultInspectTarget, setResultInspectTarget] = useState<
    { kind: 'NODE' | 'ELEMENT'; id: string } | null
  >(null);
  const [impInputMode, setImpInputMode] = useState<'RECT' | 'POLAR'>('RECT');
  const [impPolarDraft, setImpPolarDraft] = useState<{
    elId: string;
    srcRe: number;
    srcIm: number;
    mag: number;
    deg: number;
  }>({
    elId: '',
    srcRe: 40,
    srcIm: 30,
    mag: 50,
    deg: 36.86989765,
  });

  const activeFrequencies = useMemo(() => {
    const freqs = new Set<number>();
    if (simulationResult?.frequenciesHz?.length) {
      for (const f of simulationResult.frequenciesHz) freqs.add(f);
    } else {
      for (const el of circuit.elements) {
        if (el.type === 'V_SRC' || el.type === 'I_SRC') {
          for (const c of getSourceComponents(el)) {
            if (c.phasorRms.mag() > 1e-12) freqs.add(c.freqHz);
          }
        } else if (el.type === 'ONE_PORT' && (el.onePortMag ?? 0) !== 0) {
          freqs.add(Math.max(0, el.onePortFreqHz ?? 50));
        } else if (el.type === 'THREE_PHASE_SRC') {
          freqs.add(Math.max(0, el.tpFreqHz ?? 50));
        }
      }
    }
    return Array.from(freqs).sort((a, b) => a - b);
  }, [simulationResult, circuit.elements]);

  const couplableElements = useMemo(
    () => circuit.elements.filter((e) => isMutualCouplableType(e.type)),
    [circuit.elements],
  );
  const branchElements = useMemo(
    () => circuit.elements.filter((e) => e.type !== 'GND' && e.type !== 'MUTUAL'),
    [circuit.elements],
  );
  const passiveLoadCandidates = useMemo(
    () =>
      circuit.elements.filter(
        (e) =>
          e.type === 'IMPEDANCE' ||
          e.type === 'RESISTOR' ||
          e.type === 'CAPACITOR' ||
          e.type === 'INDUCTOR',
      ),
    [circuit.elements],
  );
  const activeMpTargetId = passiveLoadCandidates.some((e) => e.id === mpTargetElId)
    ? mpTargetElId
    : '';
  const activeMpTargetPins = useMemo(() => {
    if (!activeMpTargetId) return null;
    const el = circuit.elements.find((e) => e.id === activeMpTargetId);
    if (!el) return null;
    const pins = getElementWorldPins(el);
    if (pins.length !== 2) return null;
    return {
      el,
      nodeA: nodeMap?.[pins[0].key] ?? '0',
      nodeB: nodeMap?.[pins[1].key] ?? '0',
    };
  }, [activeMpTargetId, circuit.elements, nodeMap]);

  const handleExtract = () => {
    if (eqMode === 'ONE_PORT') {
      const a = allNodeIds.includes(thNodeA) ? thNodeA : (allNodeIds[1] ?? '0');
      const b = allNodeIds.includes(thNodeB) ? thNodeB : '0';
      setThResult(extractTheveninNorton(circuit, a, b, eqFreq));
    } else if (eqMode === 'MAX_POWER') {
      const a = allNodeIds.includes(thNodeA) ? thNodeA : (allNodeIds[1] ?? '0');
      const b = allNodeIds.includes(thNodeB) ? thNodeB : '0';
      setMpHoverIdx(null);
      setMpResult(
        findMaxPowerImpedance(circuit, a, b, eqFreq, {
          constraintMode: mpConstraint,
          fixedX: mpFixedX,
          fixedAngleDeg: mpFixedAngle,
          excludeElementId: activeMpTargetId || undefined,
        }),
      );
    } else {
      const n1p = allNodeIds.includes(tp1Pos) ? tp1Pos : (allNodeIds[1] ?? '0');
      const n1n = allNodeIds.includes(tp1Neg) ? tp1Neg : '0';
      const n2p = allNodeIds.includes(tp2Pos) ? tp2Pos : (allNodeIds[2] ?? allNodeIds[1] ?? '0');
      const n2n = allNodeIds.includes(tp2Neg) ? tp2Neg : '0';
      setTpResult(extractTwoPort(circuit, n1p, n1n, n2p, n2n, eqFreq));
    }
  };

  const formatC = (c: ComplexInput) => {
    const z = new Complex(c.re, c.im);
    return `${z.formatRect(3)} (${z.formatPolar(3)})`;
  };

  const renderElementEditor = (el: CircuitElement) => {
    const meta = getComponentMeta(el.type);
    const update = (patch: Partial<CircuitElement>) => onUpdateElement(el.id, patch);

    return (
      <div className="space-y-3.5">
        <div className="space-y-2.5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{meta.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{meta.description}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onRotateElement(el.id, 90)}
                aria-label={`Xoay phần tử ${el.name} 90 độ`}
                title="Xoay 90° (Phím R) · Shift+R: +45°"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteElement(el.id)}
                aria-label={`Xóa phần tử ${el.name}`}
                title="Xóa phần tử (Del)"
                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Ký hiệu phần tử */}
          <label className="flex items-center gap-2 bg-slate-50/70 border border-slate-200/80 rounded-lg px-2.5 py-1.5 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
            <span className="text-[11px] font-medium text-slate-500 shrink-0">Ký hiệu</span>
            <input
              type="text"
              value={el.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full min-w-0 bg-transparent text-xs font-mono font-semibold text-slate-900 focus:outline-none text-right"
            />
          </label>

          {/* Chọn góc quay linh kiện (bước 45° & góc tùy ý) */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-600">Góc xoay</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onRotateElement(el.id, -45)}
                  title="Xoay ngược −45°"
                  aria-label={`Xoay ${el.name} trừ 45 độ`}
                  className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[11px] font-mono text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  −45°
                </button>
                <div className="flex items-center bg-slate-50/70 border border-slate-200/80 rounded-md px-1.5 py-0.5 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all">
                  <DraftNumInput
                    ariaLabel="Góc xoay phần tử (độ)"
                    value={normalizeRotation(el.rotation)}
                    onChange={(val) => update({ rotation: normalizeRotation(val) })}
                    className="w-11 bg-transparent text-xs font-mono tabular-nums font-semibold text-slate-900 text-right focus:outline-none"
                  />
                  <span className="text-[11px] font-mono text-slate-400 ml-0.5">°</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRotateElement(el.id, 45)}
                  title="Xoay +45° (Shift+R)"
                  aria-label={`Xoay ${el.name} cộng 45 độ`}
                  className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[11px] font-mono text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  +45°
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const active = Math.abs(normalizeRotation(el.rotation) - deg) < 0.05;
                return (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => update({ rotation: deg })}
                    title={deg === 315 ? '315° (−45°)' : deg === 225 ? '225° (−135°)' : `Đặt góc ${deg}°`}
                    className={`py-0.5 rounded-md text-[10.5px] font-mono tabular-nums border transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                        : 'bg-slate-50/60 border-slate-200/70 text-slate-600 hover:bg-slate-100/70'
                    }`}
                  >
                    {deg}°
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {(el.type === 'V_SRC' || el.type === 'I_SRC') && (() => {
          const unit = el.type === 'V_SRC' ? 'V' : 'A';
          const harmonics = el.harmonics ?? [];
          const mixedSummary = el.waveform === 'MIXED' ? getSourceHarmonicSummary(el) : null;
          const handleWaveformChange = (wf: 'DC' | 'AC' | 'STEP' | 'MIXED') => {
            if (wf === 'MIXED' && (!el.harmonics || el.harmonics.length === 0)) {
              const fallbackAmp = el.acValue ?? (el.type === 'V_SRC' ? 220 : 5);
              update({
                waveform: 'MIXED',
                mixedDcValue: el.mixedDcValue ?? el.dcValue ?? 12,
                harmonics: [
                  {
                    id: 'h1',
                    freqHz: el.freqHz ?? 50,
                    amplitude: fallbackAmp,
                    phaseDeg: el.phaseDeg ?? 0,
                  },
                ],
              });
              return;
            }
            if (wf === 'MIXED' && el.mixedDcValue === undefined) {
              update({ waveform: 'MIXED', mixedDcValue: el.dcValue ?? 12 });
              return;
            }
            update({ waveform: wf });
          };
          const updateHarmonic = (idx: number, patch: Partial<SourceHarmonic>) => {
            const next = harmonics.map((h, i) => (i === idx ? { ...h, ...patch } : h));
            update({ harmonics: next });
          };
          const addHarmonic = () => {
            const maxF = harmonics.reduce((m, h) => Math.max(m, h.freqHz ?? 0), 0);
            const nextFreq = maxF > 0 ? maxF + 100 : 50;
            const next: SourceHarmonic = {
              id: `h_${Date.now()}_${harmonics.length + 1}`,
              freqHz: nextFreq,
              amplitude: el.type === 'V_SRC' ? 40 : 1,
              phaseDeg: 0,
            };
            update({ harmonics: [...harmonics, next] });
          };
          const removeHarmonic = (idx: number) => {
            update({ harmonics: harmonics.filter((_, i) => i !== idx) });
          };

          return (
            <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
              <SegmentedField
                label="Dạng sóng nguồn"
                value={el.waveform ?? 'DC'}
                options={[
                  { value: 'DC', label: 'DC' },
                  { value: 'AC', label: 'AC Sin' },
                  { value: 'MIXED', label: 'Hỗn hợp' },
                  { value: 'STEP', label: 'Step' },
                ]}
                onChange={handleWaveformChange}
              />

              {(el.waveform ?? 'DC') === 'DC' && (
                <NumField
                  label="Giá trị một chiều"
                  unit={unit}
                  value={el.dcValue ?? 12}
                  onChange={(v) => update({ dcValue: v })}
                />
              )}

              {el.waveform === 'AC' && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <NumField
                      label={el.amplitudeType === 'PEAK' ? 'Biên độ đỉnh' : 'Hiệu dụng'}
                      unit={unit}
                      value={el.acValue ?? 220}
                      onChange={(v) => update({ acValue: v })}
                    />
                    <SegmentedField
                      label="Kiểu biên độ"
                      value={el.amplitudeType ?? 'RMS'}
                      options={[
                        { value: 'RMS', label: 'RMS' },
                        { value: 'PEAK', label: 'Đỉnh' },
                      ]}
                      onChange={(at) => update({ amplitudeType: at })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <NumField
                      label="Tần số"
                      unit="Hz"
                      min={0}
                      value={el.freqHz ?? 50}
                      onChange={(v) => update({ freqHz: Math.max(0, v) })}
                    />
                    <NumField
                      label="Góc pha đầu"
                      unit="°"
                      value={el.phaseDeg ?? 0}
                      onChange={(v) => update({ phaseDeg: v })}
                    />
                  </div>
                </>
              )}

              {el.waveform === 'MIXED' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <NumField
                      label="Thành phần DC"
                      unit={unit}
                      value={el.mixedDcValue ?? el.dcValue ?? 0}
                      onChange={(v) => update({ mixedDcValue: v })}
                    />
                    <SegmentedField
                      label="Kiểu biên độ AC"
                      value={el.amplitudeType ?? 'RMS'}
                      options={[
                        { value: 'RMS', label: 'RMS' },
                        { value: 'PEAK', label: 'Đỉnh' },
                      ]}
                      onChange={(at) => update({ amplitudeType: at })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-600">
                        Các sóng hài / tần số ({harmonics.length})
                      </span>
                      <button
                        type="button"
                        onClick={addHarmonic}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-md transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Thêm hài
                      </button>
                    </div>

                    {harmonics.length === 0 ? (
                      <div className="text-[11px] text-slate-400 bg-white border border-dashed border-slate-200 rounded-lg px-2.5 py-2 text-center">
                        Chưa có thành phần xoay chiều (chỉ còn DC).
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-[1fr_1fr_0.85fr_24px] gap-1.5 px-1 text-[10px] font-medium text-slate-500">
                          <span>f (Hz)</span>
                          <span>{el.amplitudeType === 'PEAK' ? `Đỉnh (${unit})` : `RMS (${unit})`}</span>
                          <span>Pha (°)</span>
                          <span />
                        </div>
                        {harmonics.map((h, idx) => (
                          <div
                            key={h.id}
                            className="grid grid-cols-[1fr_1fr_0.85fr_24px] gap-1.5 items-center"
                          >
                            <DraftNumInput
                              ariaLabel={`Hài ${idx + 1} tần số`}
                              value={h.freqHz}
                              min={0}
                              onChange={(v) => updateHarmonic(idx, { freqHz: Math.max(0, v) })}
                              className="min-w-0 w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                            />
                            <DraftNumInput
                              ariaLabel={`Hài ${idx + 1} biên độ`}
                              value={h.amplitude}
                              onChange={(v) => updateHarmonic(idx, { amplitude: v })}
                              className="min-w-0 w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                            />
                            <DraftNumInput
                              ariaLabel={`Hài ${idx + 1} pha`}
                              value={h.phaseDeg}
                              onChange={(v) => updateHarmonic(idx, { phaseDeg: v })}
                              className="min-w-0 w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeHarmonic(idx)}
                              title="Xoá sóng hài này"
                              aria-label={`Xoá sóng hài ${idx + 1}`}
                              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {mixedSummary && (
                    <div className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Biểu thức tổng hợp</span>
                        <span className="font-mono font-semibold text-blue-700">
                          Tổng RMS = {mixedSummary.totalRms.toFixed(3)} {unit}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-800 break-words">
                        {el.type === 'V_SRC' ? 'u(t)' : 'i(t)'} = {mixedSummary.instantaneous}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {el.waveform === 'STEP' && (
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="Trước đóng"
                    unit={unit}
                    value={el.stepInit ?? 0}
                    onChange={(v) => update({ stepInit: v })}
                  />
                  <NumField
                    label="Sau đóng"
                    unit={unit}
                    value={el.stepFinal ?? 12}
                    onChange={(v) => update({ stepFinal: v })}
                  />
                  <NumField
                    label="Thời điểm"
                    unit="s"
                    min={0}
                    value={el.stepTime ?? 0}
                    onChange={(v) => update({ stepTime: Math.max(0, v) })}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {el.type === 'RESISTOR' && (
          <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <NumField
              label="Điện trở (R)"
              unit="Ω"
              min={1e-6}
              value={el.resistance ?? 100}
              onChange={(v) => update({ resistance: Math.max(1e-6, v) })}
            />
          </div>
        )}

        {el.type === 'CAPACITOR' && (
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <NumField
              label="Điện dung (C)"
              unit="F"
              min={0}
              value={el.capacitance ?? 100e-6}
              onChange={(v) => update({ capacitance: Math.max(0, v) })}
            />
            <NumField
              label="Sơ kiện u_C(0)"
              unit="V"
              value={el.initialVoltage ?? 0}
              onChange={(v) => update({ initialVoltage: v })}
            />
          </div>
        )}

        {el.type === 'INDUCTOR' && (
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <NumField
              label="Độ tự cảm (L)"
              unit="H"
              min={0}
              value={el.inductance ?? 0.1}
              onChange={(v) => update({ inductance: Math.max(0, v) })}
            />
            <NumField
              label="Sơ kiện i_L(0)"
              unit="A"
              value={el.initialCurrent ?? 0}
              onChange={(v) => update({ initialCurrent: v })}
            />
          </div>
        )}

        {el.type === 'IMPEDANCE' && (() => {
          const zRect = el.impedance ?? { re: 40, im: 30 };
          const zC = new Complex(zRect.re, zRect.im);
          const zMag = zC.mag();
          const zDeg = zC.deg();
          const yC = zMag >= 1e-12 ? zC.inv() : null;
          const curPolar =
            impPolarDraft.elId === el.id &&
            impPolarDraft.srcRe === zRect.re &&
            impPolarDraft.srcIm === zRect.im
              ? impPolarDraft
              : {
                  elId: el.id,
                  srcRe: zRect.re,
                  srcIm: zRect.im,
                  mag: Number(zMag.toPrecision(10)),
                  deg: Number(zDeg.toPrecision(10)),
                };
          const handleImpModeChange = (nextMode: 'RECT' | 'POLAR') => {
            if (nextMode === 'POLAR') {
              setImpPolarDraft({
                elId: el.id,
                srcRe: zRect.re,
                srcIm: zRect.im,
                mag: Number(zMag.toPrecision(10)),
                deg: Number(zDeg.toPrecision(10)),
              });
            }
            setImpInputMode(nextMode);
          };
          const handlePolarUpdate = (nextMag: number, nextDeg: number) => {
            const safeMag = Math.max(0, nextMag);
            const c = Complex.fromPolar(safeMag, nextDeg);
            const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12)));
            const nextRe = clean(c.re);
            const nextIm = clean(c.im);
            setImpPolarDraft({ elId: el.id, srcRe: nextRe, srcIm: nextIm, mag: safeMag, deg: nextDeg });
            update({ impedance: { re: nextRe, im: nextIm } });
          };
          const kindLabel =
            zRect.im > 1e-9
              ? 'Tính cảm (R − L)'
              : zRect.im < -1e-9
                ? 'Tính dung (R − C)'
                : 'Thuần trở (R)';

          return (
            <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
              <SegmentedField
                label="Dạng nhập tổng trở"
                value={impInputMode}
                options={[
                  { value: 'RECT', label: 'Đại số (R + jX)' },
                  { value: 'POLAR', label: 'Cực (|Z| ∠ φ°)' },
                ]}
                onChange={handleImpModeChange}
              />

              {impInputMode === 'RECT' ? (
                <ComplexField
                  label="Tổng trở phức Z = R + jX"
                  unit="Ω"
                  value={zRect}
                  onChange={(v) => update({ impedance: v })}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <NumField
                    label="Mô-đun |Z|"
                    unit="Ω"
                    min={0}
                    value={curPolar.mag}
                    onChange={(m) => handlePolarUpdate(m, curPolar.deg)}
                  />
                  <NumField
                    label="Góc tổng trở φ"
                    unit="°"
                    value={curPolar.deg}
                    onChange={(d) => handlePolarUpdate(curPolar.mag, d)}
                  />
                </div>
              )}

              <div className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Tính chất nhánh</span>
                  <span className="font-medium text-blue-700">{kindLabel}</span>
                </div>
                <div className="font-mono tabular-nums text-slate-800">
                  Z = {zC.formatRect(3)} Ω ({zC.formatPolar(3)} Ω)
                </div>
                <div className="font-mono tabular-nums text-slate-500">
                  Y = {yC ? `${yC.formatRect(4)} S` : '∞ (ngắn mạch)'}
                </div>
              </div>
            </div>
          );
        })()}

        {el.type === 'MUTUAL' && (() => {
          const mMode = getMutualValueMode(el, circuit.elements);
          const { pin1, pin2, polaritySign } = getMutualDotPins(el);
          const el1 = circuit.elements.find((e) => e.id === el.l1Id);
          const el2 = circuit.elements.find((e) => e.id === el.l2Id);
          const formatBranchLabel = (item: CircuitElement) =>
            item.type === 'INDUCTOR'
              ? `${item.name} (${item.inductance ?? 0.1} H)`
              : `${item.name} (${new Complex(item.impedance?.re ?? 40, item.impedance?.im ?? 30).formatRect(3)} Ω)`;
          const getDotPinLabels = (item?: CircuitElement) => {
            if (!item) return { p1: 'Chân 1', p2: 'Chân 2' };
            const pins = getElementWorldPins(item);
            const n1 = pins[0] && nodeMap?.[pins[0].key];
            const n2 = pins[1] && nodeMap?.[pins[1].key];
            return {
              p1: n1 ? `Chân 1 (Nút ${n1})` : 'Chân 1',
              p2: n2 ? `Chân 2 (Nút ${n2})` : 'Chân 2',
            };
          };
          const handleBranchSelect = (slot: 'l1Id' | 'l2Id', nextId: string) => {
            const b1 = slot === 'l1Id' ? circuit.elements.find((e) => e.id === nextId) : el1;
            const b2 = slot === 'l2Id' ? circuit.elements.find((e) => e.id === nextId) : el2;
            const autoMode: 'M_HENRY' | 'Z_OHM' =
              b1?.type === 'IMPEDANCE' || b2?.type === 'IMPEDANCE'
                ? 'Z_OHM'
                : b1?.type === 'INDUCTOR' && b2?.type === 'INDUCTOR'
                  ? 'M_HENRY'
                  : mMode;
            update({
              [slot]: nextId,
              mutualValueMode: autoMode,
              mutualZ: el.mutualZ ?? { re: 0, im: 10 },
            });
          };
          const handleDotChange = (which: 1 | 2, nextPin: 1 | 2) => {
            const nextPin1 = which === 1 ? nextPin : pin1;
            const nextPin2 = which === 2 ? nextPin : pin2;
            update({
              l1DotPin: nextPin1,
              l2DotPin: nextPin2,
              dotPolarity: nextPin1 === nextPin2 ? 1 : -1,
            });
          };
          const dotLabels1 = getDotPinLabels(el1);
          const dotLabels2 = getDotPinLabels(el2);
          const zmC = new Complex(el.mutualZ?.re ?? 0, el.mutualZ?.im ?? 10);

          return (
            <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Phần tử thứ nhất (L1 / Z1)
                  </span>
                  <select
                    value={el.l1Id ?? ''}
                    onChange={(e) => handleBranchSelect('l1Id', e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="">— Chọn L hoặc Z thứ nhất —</option>
                    {couplableElements.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatBranchLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <SegmentedField
                  label="Chấm cực (•) trên phần tử 1"
                  value={pin1}
                  options={[
                    { value: 1, label: dotLabels1.p1 },
                    { value: 2, label: dotLabels1.p2 },
                  ]}
                  onChange={(p) => handleDotChange(1, p)}
                />
              </div>

              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Phần tử thứ hai (L2 / Z2)
                  </span>
                  <select
                    value={el.l2Id ?? ''}
                    onChange={(e) => handleBranchSelect('l2Id', e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="">— Chọn L hoặc Z thứ hai —</option>
                    {couplableElements.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatBranchLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <SegmentedField
                  label="Chấm cực (•) trên phần tử 2"
                  value={pin2}
                  options={[
                    { value: 1, label: dotLabels2.p1 },
                    { value: 2, label: dotLabels2.p2 },
                  ]}
                  onChange={(p) => handleDotChange(2, p)}
                />
              </div>

              <SegmentedField
                label="Đơn vị hỗ cảm"
                value={mMode}
                options={[
                  { value: 'Z_OHM', label: 'Tổng trở Z_M (Ω)' },
                  { value: 'M_HENRY', label: 'Hệ số M (H)' },
                ]}
                onChange={(nextMode) =>
                  update({
                    mutualValueMode: nextMode,
                    mutualZ: el.mutualZ ?? { re: 0, im: 10 },
                    mutualM: el.mutualM ?? 0.05,
                  })
                }
              />

              {mMode === 'Z_OHM' ? (
                <ComplexField
                  label="Tổng trở hỗ cảm Z_M = R_M + jX_M"
                  unit="Ω"
                  value={el.mutualZ ?? { re: 0, im: 10 }}
                  onChange={(v) => update({ mutualZ: v })}
                />
              ) : (
                <NumField
                  label="Hệ số hỗ cảm (M)"
                  unit="H"
                  min={0}
                  value={el.mutualM ?? 0.05}
                  onChange={(v) => update({ mutualM: Math.max(0, v) })}
                />
              )}

              <div className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Chiều cực tính</span>
                  <span className="font-medium text-amber-700">
                    {polaritySign === 1 ? 'Cùng cực (+Z_M)' : 'Ngược cực (−Z_M)'}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-700">
                  {mMode === 'Z_OHM'
                    ? `Z_M = ${polaritySign < 0 ? '−(' : ''}${zmC.formatRect(3)}${polaritySign < 0 ? ')' : ''} Ω`
                    : `M = ${polaritySign < 0 ? '−' : '+'}${el.mutualM ?? 0.05} H`}
                </div>
              </div>
            </div>
          );
        })()}

        {(el.type === 'VCVS' || el.type === 'VCCS') && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <NumField
              label={el.type === 'VCVS' ? 'Hệ số khuếch đại áp (μ)' : 'Điện dẫn truyền đạt (g)'}
              unit={el.type === 'VCVS' ? 'V/V' : 'S'}
              value={el.gain ?? 1}
              onChange={(v) => update({ gain: v })}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-600 mb-1">Nút điều khiển (+)</span>
                <select
                  value={el.ctrlNodePos ?? '1'}
                  onChange={(e) => update({ ctrlNodePos: e.target.value })}
                  className={`${SELECT_CLASS} font-mono`}
                >
                  {allNodeIds.map((nid) => (
                    <option key={nid} value={nid}>
                      Nút {nid}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-600 mb-1">Nút điều khiển (−)</span>
                <select
                  value={el.ctrlNodeNeg ?? '0'}
                  onChange={(e) => update({ ctrlNodeNeg: e.target.value })}
                  className={`${SELECT_CLASS} font-mono`}
                >
                  {allNodeIds.map((nid) => (
                    <option key={nid} value={nid}>
                      Nút {nid}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {(el.type === 'CCVS' || el.type === 'CCCS') && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <NumField
              label={el.type === 'CCVS' ? 'Điện trở truyền đạt (r)' : 'Hệ số khuếch đại dòng (β)'}
              unit={el.type === 'CCVS' ? 'Ω' : 'A/A'}
              value={el.gain ?? 1}
              onChange={(v) => update({ gain: v })}
            />
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-600 mb-1">
                Nhánh mang dòng điều khiển (1 → 2)
              </span>
              <select
                value={el.ctrlElementId ?? ''}
                onChange={(e) => update({ ctrlElementId: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">— Chọn phần tử cảm biến dòng —</option>
                {branchElements
                  .filter((b) => b.id !== el.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({getComponentMeta(b.type).shortLabel})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        {el.type === 'OPAMP' && (
          <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(el.opampInvertPins)}
                onChange={(e) => update({ opampInvertPins: e.target.checked })}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Đảo vị trí hai cực ngõ vào (+ ở dưới, − ở trên)</span>
            </label>
          </div>
        )}

        {el.type === 'ONE_PORT' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <SegmentedField
              label="Dạng tương đương"
              value={el.onePortMode ?? 'THEVENIN'}
              options={[
                { value: 'THEVENIN', label: 'Thévenin (Vth, Zth)' },
                { value: 'NORTON', label: 'Norton (In, Yth)' },
              ]}
              onChange={(m) => update({ onePortMode: m })}
            />
            <div className="grid grid-cols-3 gap-2">
              <NumField
                label={el.onePortMode === 'NORTON' ? 'In (RMS)' : 'Vth (RMS)'}
                unit={el.onePortMode === 'NORTON' ? 'A' : 'V'}
                value={el.onePortMag ?? 10}
                onChange={(v) => update({ onePortMag: v })}
              />
              <NumField
                label="Pha"
                unit="°"
                value={el.onePortPhaseDeg ?? 0}
                onChange={(v) => update({ onePortPhaseDeg: v })}
              />
              <NumField
                label="Tần số"
                unit="Hz"
                min={0}
                value={el.onePortFreqHz ?? 50}
                onChange={(v) => update({ onePortFreqHz: Math.max(0, v) })}
              />
            </div>
            <ComplexField
              label={el.onePortMode === 'NORTON' ? 'Tổng dẫn tương đương Yth' : 'Tổng trở tương đương Zth'}
              unit={el.onePortMode === 'NORTON' ? 'S' : 'Ω'}
              value={el.onePortZ}
              onChange={(v) => update({ onePortZ: v })}
            />
          </div>
        )}

        {el.type === 'TWO_PORT' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <SegmentedField
              label="Hệ thông số mạng hai cửa"
              value={el.twoPortType ?? 'Z'}
              options={[
                { value: 'Z', label: '[Z] (Ω)' },
                { value: 'Y', label: '[Y] (S)' },
                { value: 'A', label: '[A] (ABCD)' },
              ]}
              onChange={(tp) => update({ twoPortType: tp })}
            />
            <div className="space-y-2.5">
              <ComplexField
                label={el.twoPortType === 'A' ? 'Thông số A (A11)' : `${el.twoPortType ?? 'Z'}11`}
                value={el.m11}
                onChange={(v) => update({ m11: v })}
              />
              <ComplexField
                label={el.twoPortType === 'A' ? 'Thông số B (A12)' : `${el.twoPortType ?? 'Z'}12`}
                value={el.m12}
                onChange={(v) => update({ m12: v })}
              />
              <ComplexField
                label={el.twoPortType === 'A' ? 'Thông số C (A21)' : `${el.twoPortType ?? 'Z'}21`}
                value={el.m21}
                onChange={(v) => update({ m21: v })}
              />
              <ComplexField
                label={el.twoPortType === 'A' ? 'Thông số D (A22)' : `${el.twoPortType ?? 'Z'}22`}
                value={el.m22}
                onChange={(v) => update({ m22: v })}
              />
            </div>
          </div>
        )}

        {el.type === 'THREE_PHASE_SRC' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <div className="grid grid-cols-2 gap-2.5">
              <SegmentedField
                label="Kiểu đấu dây"
                value={el.tpConnection ?? 'Y'}
                options={[
                  { value: 'Y', label: 'Sao (Y)' },
                  { value: 'DELTA', label: 'Δ' },
                ]}
                onChange={(c) => update({ tpConnection: c })}
              />
              <SegmentedField
                label="Điện áp nhập"
                value={el.tpVoltageMode ?? 'PHASE'}
                options={[
                  { value: 'PHASE', label: 'U pha' },
                  { value: 'LINE', label: 'U dây' },
                ]}
                onChange={(m) => update({ tpVoltageMode: m })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumField
                label={el.tpVoltageMode === 'LINE' ? 'U_dây' : 'U_pha'}
                unit="V"
                min={0}
                value={el.tpVoltageRms ?? 220}
                onChange={(v) => update({ tpVoltageRms: Math.max(0, v) })}
              />
              <NumField
                label="Tần số"
                unit="Hz"
                min={0}
                value={el.tpFreqHz ?? 50}
                onChange={(v) => update({ tpFreqHz: Math.max(0, v) })}
              />
              <NumField
                label="Pha A"
                unit="°"
                value={el.tpPhaseADeg ?? 0}
                onChange={(v) => update({ tpPhaseADeg: v })}
              />
            </div>
            <SegmentedField
              label="Thứ tự pha"
              value={el.tpSequence ?? 'ABC'}
              options={[
                { value: 'ABC', label: 'Thuận (ABC)' },
                { value: 'ACB', label: 'Nghịch (ACB)' },
              ]}
              onChange={(s) => update({ tpSequence: s })}
            />
          </div>
        )}

        {el.type === 'THREE_PHASE_LINE' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <ComplexField
              label="Tổng trở dây pha Zd"
              unit="Ω"
              value={el.lineZ}
              onChange={(v) => update({ lineZ: v })}
            />
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={el.hasNeutral !== false}
                onChange={(e) => update({ hasNeutral: e.target.checked })}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Có dây trung tính (N1 – N2)</span>
            </label>
            {el.hasNeutral !== false && (
              <ComplexField
                label="Tổng trở dây trung tính Zn"
                unit="Ω"
                value={el.lineZn}
                onChange={(v) => update({ lineZn: v })}
              />
            )}
          </div>
        )}

        {el.type === 'THREE_PHASE_LOAD' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <div className="grid grid-cols-2 gap-2.5 items-end">
              <SegmentedField
                label="Kiểu đấu tải"
                value={el.loadConnection ?? 'Y'}
                options={[
                  { value: 'Y', label: 'Sao (Y)' },
                  { value: 'DELTA', label: 'Δ' },
                ]}
                onChange={(c) => update({ loadConnection: c })}
              />
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  checked={el.loadSymmetric !== false}
                  onChange={(e) => update({ loadSymmetric: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Tải đối xứng</span>
              </label>
            </div>

            {(el.loadConnection ?? 'Y') === 'Y' && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={el.loadNeutralConnected !== false}
                  onChange={(e) => update({ loadNeutralConnected: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Nối điểm trung tính tải với dây N</span>
              </label>
            )}

            <ComplexField
              label={el.loadSymmetric !== false ? 'Tổng trở mỗi pha Z' : 'Tổng trở pha A (ZA / ZAB)'}
              unit="Ω"
              value={el.loadZa}
              onChange={(v) => update({ loadZa: v })}
            />

            {el.loadSymmetric === false && (
              <>
                <ComplexField
                  label="Tổng trở pha B (ZB / ZBC)"
                  unit="Ω"
                  value={el.loadZb}
                  onChange={(v) => update({ loadZb: v })}
                />
                <ComplexField
                  label="Tổng trở pha C (ZC / ZCA)"
                  unit="Ω"
                  value={el.loadZc}
                  onChange={(v) => update({ loadZc: v })}
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Thanh thông số và kết quả"
      className="w-96 shrink-0 bg-white border-l border-slate-200/90 flex flex-col h-full"
    >
      {/* Tab Bar */}
      <div className="p-2 border-b border-slate-100 bg-white">
        <div
          role="tablist"
          className="grid grid-cols-4 bg-slate-100/90 p-1 rounded-xl gap-1"
        >
          {(
            [
              { id: 'PROPS', label: 'Thông số', Icon: Sliders, hasDot: Boolean(selectedElement || selectedWire) },
              { id: 'RESULTS', label: 'Kết quả', Icon: Table2, hasDot: Boolean(simulationResult?.success) },
              { id: 'PLOT', label: 'Đồ thị', Icon: Activity, hasDot: Boolean(simulationResult?.transient) },
              { id: 'EQUIV', label: 'Tương đương', Icon: Calculator, hasDot: false },
            ] as const
          ).map(({ id, label, Icon, hasDot }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onChangeTab(id)}
                className={`relative flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-600' : ''}`} />
                <span>{label}</span>
                {hasDot && !active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500/75" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'PROPS' && (
          <>
            {selectedElement ? (
              renderElementEditor(selectedElement)
            ) : selectedWire ? (
              <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">Đoạn dây dẫn</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {selectedWire.points.length} đỉnh tọa độ trực giao
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteWire(selectedWire.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-medium hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa dây</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-10 px-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 space-y-2">
                <GitBranch className="w-6 h-6 text-slate-300 mx-auto" />
                <div className="text-xs font-semibold text-slate-700">Chưa chọn đối tượng</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Nhấp vào linh kiện hoặc dây dẫn trên bản vẽ để chỉnh sửa giá trị, xoay hướng hoặc xóa.
                </p>
                <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-slate-400">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">W: Nối dây</span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">R: Xoay</span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">Del: Xóa</span>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'RESULTS' && (
          <div className="space-y-4">
            {!simulationResult ? (
              <div className="text-center py-12 px-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Sơ đồ vừa thay đổi. Nhấn <strong className="text-slate-700">Chạy mô phỏng</strong> ở góc trên bên phải để cập nhật điện áp nút, dòng nhánh và công suất.
                </p>
              </div>
            ) : !simulationResult.success ? (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1.5">
                <div className="font-semibold">Mô phỏng không thành công</div>
                {simulationResult.diagnostics.map((d, i) => (
                  <p key={i}>{d.text}</p>
                ))}
              </div>
            ) : (() => {
              const inspectedNode =
                resultInspectTarget?.kind === 'NODE'
                  ? simulationResult.nodes.find((n) => n.nodeId === resultInspectTarget.id)
                  : undefined;
              const inspectedElement =
                inspectedNode
                  ? undefined
                  : (resultInspectTarget?.kind === 'ELEMENT'
                      ? simulationResult.elements.find((e) => e.elementId === resultInspectTarget.id)
                      : undefined) ??
                    (selectedElement
                      ? simulationResult.elements.find((e) => e.elementId === selectedElement.id)
                      : undefined) ??
                    simulationResult.elements[0];

              const freqRows = Array.from(
                new Set([
                  ...(simulationResult.frequenciesHz ?? []),
                  ...(inspectedElement?.voltageHarmonics?.map((h) => h.freqHz) ?? []),
                  ...(inspectedElement?.currentHarmonics?.map((h) => h.freqHz) ?? []),
                ]),
              )
                .filter((f) => f > 0)
                .sort((a, b) => a - b);

              return (
              <>
                {simulationResult.mode === 'AC' &&
                  (simulationResult.frequenciesHz?.length ?? 0) > 1 && (
                    <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/80 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-800">
                        <span>Xếp chồng đa tần số</span>
                        <span>{simulationResult.frequenciesHz!.length} thành phần</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {simulationResult.frequenciesHz!.map((f) => (
                          <span
                            key={f}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-white text-indigo-700 border border-indigo-200/80 rounded-md"
                          >
                            {f === 0 ? '0 Hz (DC)' : `${f} Hz`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {simulationResult.powerBalance && (
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Cân bằng công suất
                      </span>
                      {Math.abs(
                        simulationResult.powerBalance.pGenerated -
                          simulationResult.powerBalance.pConsumed,
                      ) < 0.05 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Khớp lý thuyết
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-white rounded-lg border border-slate-200/70 px-2.5 py-2">
                        <div className="text-[10px] text-slate-500">Tổng phát</div>
                        <div className="text-xs font-mono font-semibold tabular-nums text-emerald-700 mt-0.5">
                          P = {simulationResult.powerBalance.pGenerated.toFixed(2)} W
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          Q = {simulationResult.powerBalance.qGenerated.toFixed(2)} var
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200/70 px-2.5 py-2">
                        <div className="text-[10px] text-slate-500">Tổng tiêu thụ</div>
                        <div className="text-xs font-mono font-semibold tabular-nums text-blue-700 mt-0.5">
                          P = {simulationResult.powerBalance.pConsumed.toFixed(2)} W
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          Q = {simulationResult.powerBalance.qConsumed.toFixed(2)} var
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bảng điện áp nút */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-800">
                      Điện thế các nút
                    </h3>
                    <span className="text-[10px] text-slate-400">Nhấp dòng để xem phổ hài</span>
                  </div>
                  <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 px-2.5 text-left font-medium">Nút</th>
                          <th className="py-2 px-2.5 text-right font-medium">
                            {simulationResult.singleFrequencyHz ? 'Phức (RMS ∠ °)' : 'Hiệu dụng / DC'}
                          </th>
                          <th className="py-2 px-2.5 text-right font-medium">Biểu thức tức thời</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {simulationResult.nodes.map((n) => {
                          const isNodeInspected = inspectedNode?.nodeId === n.nodeId;
                          return (
                            <tr
                              key={n.nodeId}
                              onClick={() => setResultInspectTarget({ kind: 'NODE', id: n.nodeId })}
                              className={`cursor-pointer transition-colors ${
                                isNodeInspected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <td className="py-1.5 px-2.5 font-semibold text-slate-800">N{n.nodeId}</td>
                              <td className="py-1.5 px-2.5 text-right text-slate-800">
                                {simulationResult.singleFrequencyHz && n.phasorMag !== undefined
                                  ? `${n.phasorMag.toFixed(2)} ∠ ${n.phasorDeg?.toFixed(1)}°`
                                  : `${(simulationResult.mode === 'AC' ? n.rms : n.dc).toFixed(3)} V`}
                              </td>
                              <td
                                className="py-1.5 px-2.5 text-right text-slate-500 truncate max-w-[136px]"
                                title={n.instantaneous}
                              >
                                {n.instantaneous}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bảng dòng và công suất từng phần tử */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-800">
                      Dòng điện & Công suất phần tử
                    </h3>
                    {onSelectElement && (
                      <span className="text-[10px] text-slate-400">Nhấp dòng để chọn</span>
                    )}
                  </div>
                  <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 px-2 text-left font-medium">Phần tử</th>
                          <th className="py-2 px-2 text-right font-medium">U (V)</th>
                          <th className="py-2 px-2 text-right font-medium">I (A)</th>
                          <th className="py-2 px-2 text-right font-medium">P (W)</th>
                          <th className="py-2 px-2 text-right font-medium">Q (var)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {simulationResult.elements.map((e) => {
                          const isRowSelected =
                            inspectedElement?.elementId === e.elementId ||
                            selectedElement?.id === e.elementId;
                          return (
                            <React.Fragment key={e.elementId}>
                              <tr
                                onClick={() => {
                                  setResultInspectTarget({ kind: 'ELEMENT', id: e.elementId });
                                  onSelectElement?.(e.elementId);
                                }}
                                className={`transition-colors cursor-pointer ${
                                  isRowSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                                }`}
                              >
                                <td className="py-1.5 px-2 font-semibold text-slate-800">{e.name}</td>
                                <td className="py-1.5 px-2 text-right text-slate-700">
                                  {simulationResult.singleFrequencyHz && e.voltagePhasorMag !== undefined
                                    ? `${e.voltagePhasorMag.toFixed(1)}∠${e.voltagePhasorDeg?.toFixed(0)}°`
                                    : (simulationResult.mode === 'AC' ? e.voltageRms : e.voltageDc).toFixed(2)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-700">
                                  {simulationResult.singleFrequencyHz && e.currentPhasorMag !== undefined
                                    ? `${e.currentPhasorMag.toFixed(2)}∠${e.currentPhasorDeg?.toFixed(0)}°`
                                    : (simulationResult.mode === 'AC' ? e.currentRms : e.currentDc).toFixed(3)}
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-right font-medium ${
                                    e.pWatts < -1e-4 ? 'text-emerald-700' : 'text-slate-800'
                                  }`}
                                >
                                  {e.pWatts.toFixed(2)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600">
                                  {e.qVars.toFixed(2)}
                                </td>
                              </tr>
                              {e.threePhaseDetails && (
                                <tr className="bg-slate-50/60 text-[10px] text-slate-600">
                                  <td colSpan={5} className="px-2 py-1">
                                    IA={e.threePhaseDetails.iaMag.toFixed(2)}∠{e.threePhaseDetails.iaDeg.toFixed(0)}° ·{' '}
                                    IB={e.threePhaseDetails.ibMag.toFixed(2)}∠{e.threePhaseDetails.ibDeg.toFixed(0)}° ·{' '}
                                    IC={e.threePhaseDetails.icMag.toFixed(2)}∠{e.threePhaseDetails.icDeg.toFixed(0)}°
                                    {e.threePhaseDetails.inMag !== undefined && (
                                      <> · IN={e.threePhaseDetails.inMag.toFixed(2)} A</>
                                    )}
                                    {e.threePhaseDetails.uNeutralShift !== undefined && (
                                      <> · Lệch N'N={e.threePhaseDetails.uNeutralShift.toFixed(2)} V</>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Quy ước thụ động: P &gt; 0 là tiêu thụ, P &lt; 0 là phát công suất.
                  </p>
                </div>

                {/* Chi tiết phổ hài & biểu thức tức thời đầy đủ */}
                {(inspectedNode || inspectedElement) && (
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/90 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        {inspectedNode
                          ? `Phổ hài & Tức thời · Nút N${inspectedNode.nodeId}`
                          : `Phổ hài & Tức thời · ${inspectedElement!.name}`}
                      </h4>
                    </div>

                    {inspectedNode ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5">
                            <span className="block text-[10px] font-sans text-slate-500">Thành phần DC</span>
                            <span className="font-semibold text-slate-800">
                              {inspectedNode.dc.toFixed(3)} V
                            </span>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5">
                            <span className="block text-[10px] font-sans text-slate-500">Tổng RMS</span>
                            <span className="font-semibold text-blue-700">
                              {inspectedNode.rms.toFixed(3)} V
                            </span>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5 text-[11px] font-mono text-slate-800 break-words">
                          v(t) = {inspectedNode.instantaneous}
                        </div>
                        {inspectedNode.harmonics.length > 0 && (
                          <div className="border border-slate-200/80 rounded-lg overflow-hidden bg-white">
                            <table className="w-full text-[10px] font-mono tabular-nums">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-sans">
                                <tr>
                                  <th className="py-1 px-2 text-left font-medium">f (Hz)</th>
                                  <th className="py-1 px-2 text-right font-medium">RMS (V)</th>
                                  <th className="py-1 px-2 text-right font-medium">Đỉnh (V)</th>
                                  <th className="py-1 px-2 text-right font-medium">Pha (°)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {inspectedNode.harmonics.map((h: HarmonicComponent) => (
                                  <tr key={h.freqHz}>
                                    <td className="py-1 px-2 text-slate-700">{h.freqHz}</td>
                                    <td className="py-1 px-2 text-right text-slate-800">{h.rms.toFixed(3)}</td>
                                    <td className="py-1 px-2 text-right text-slate-600">{h.peak.toFixed(3)}</td>
                                    <td className="py-1 px-2 text-right text-slate-600">{h.phaseDeg.toFixed(1)}°</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : inspectedElement ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono tabular-nums">
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                            <span className="block text-[10px] font-sans text-slate-500">U_rms / I_rms</span>
                            <span className="font-semibold text-slate-800">
                              {inspectedElement.voltageRms.toFixed(2)}V / {inspectedElement.currentRms.toFixed(3)}A
                            </span>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                            <span className="block text-[10px] font-sans text-slate-500">U_dc / I_dc</span>
                            <span className="font-semibold text-slate-700">
                              {inspectedElement.voltageDc.toFixed(2)}V / {inspectedElement.currentDc.toFixed(3)}A
                            </span>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                            <span className="block text-[10px] font-sans text-slate-500">S (VA) · PF</span>
                            <span className="font-semibold text-blue-700">
                              {inspectedElement.sVA.toFixed(2)} ·{' '}
                              {inspectedElement.sVA > 1e-9
                                ? (Math.abs(inspectedElement.pWatts) / inspectedElement.sVA).toFixed(3)
                                : '—'}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {inspectedElement.instantaneousVoltage && (
                            <div className="bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5 text-[11px] font-mono text-slate-800 break-words">
                              u(t) = {inspectedElement.instantaneousVoltage}
                            </div>
                          )}
                          <div className="bg-white rounded-lg border border-slate-200/80 px-2.5 py-1.5 text-[11px] font-mono text-slate-800 break-words">
                            i(t) = {inspectedElement.instantaneousCurrent}
                          </div>
                        </div>
                        {freqRows.length > 0 && (
                          <div className="border border-slate-200/80 rounded-lg overflow-hidden bg-white">
                            <table className="w-full text-[10px] font-mono tabular-nums">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-sans">
                                <tr>
                                  <th className="py-1 px-2 text-left font-medium">Tần số</th>
                                  <th className="py-1 px-2 text-right font-medium">U (RMS ∠ °)</th>
                                  <th className="py-1 px-2 text-right font-medium">I (RMS ∠ °)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(simulationResult.frequenciesHz?.includes(0) ||
                                  Math.abs(inspectedElement.voltageDc) > 1e-6 ||
                                  Math.abs(inspectedElement.currentDc) > 1e-6) && (
                                  <tr>
                                    <td className="py-1 px-2 text-slate-700">0 Hz (DC)</td>
                                    <td className="py-1 px-2 text-right text-slate-800">
                                      {inspectedElement.voltageDc.toFixed(3)} V
                                    </td>
                                    <td className="py-1 px-2 text-right text-slate-800">
                                      {inspectedElement.currentDc.toFixed(4)} A
                                    </td>
                                  </tr>
                                )}
                                {freqRows.map((f) => {
                                  const uh = inspectedElement.voltageHarmonics?.find(
                                    (h) => Math.abs(h.freqHz - f) < 1e-6,
                                  );
                                  const ih = inspectedElement.currentHarmonics?.find(
                                    (h) => Math.abs(h.freqHz - f) < 1e-6,
                                  );
                                  return (
                                    <tr key={f}>
                                      <td className="py-1 px-2 text-slate-700">{f} Hz</td>
                                      <td className="py-1 px-2 text-right text-slate-800">
                                        {uh ? `${uh.rms.toFixed(2)} ∠ ${uh.phaseDeg.toFixed(1)}°` : '—'}
                                      </td>
                                      <td className="py-1 px-2 text-right text-slate-800">
                                        {ih ? `${ih.rms.toFixed(3)} ∠ ${ih.phaseDeg.toFixed(1)}°` : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </>
              );
            })()}
          </div>
        )}

        {activeTab === 'PLOT' && (
          <div>
            {simulationResult?.mode === 'TRANSIENT' && simulationResult.transient ? (
              <TransientPlot transient={simulationResult.transient} elements={circuit.elements} />
            ) : (
              <div className="text-center py-10 px-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 space-y-3">
                <Activity className="w-7 h-7 text-slate-300 mx-auto" />
                <div className="text-xs font-semibold text-slate-800">Chưa có dữ liệu đồ thị quá độ</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Chuyển sang chế độ Quá độ (Transient) và chạy mô phỏng để quan sát dạng sóng u(t), i(t).
                </p>
                <button
                  type="button"
                  onClick={onRunTransientNow}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-2xs"
                >
                  Chạy mô phỏng Quá độ ngay
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'EQUIV' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setEqMode('ONE_PORT')}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap ${
                  eqMode === 'ONE_PORT'
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Thévenin
              </button>
              <button
                type="button"
                onClick={() => setEqMode('MAX_POWER')}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap ${
                  eqMode === 'MAX_POWER'
                    ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-blue-200/80 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tìm Z (P_max)
              </button>
              <button
                type="button"
                onClick={() => setEqMode('TWO_PORT')}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap ${
                  eqMode === 'TWO_PORT'
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mạng 2 cửa
              </button>
            </div>

            <div className="space-y-1.5">
              <NumField
                label="Tần số trích xuất (0 Hz = DC)"
                unit="Hz"
                min={0}
                value={eqFreq}
                onChange={(v) => setEqFreq(Math.max(0, v))}
              />
              {activeFrequencies.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-slate-400 mr-0.5">Tần số trong mạch:</span>
                  {activeFrequencies.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEqFreq(f)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md border transition-colors ${
                        Math.abs(eqFreq - f) < 1e-6
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {f === 0 ? '0 Hz (DC)' : `${f} Hz`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {eqMode === 'ONE_PORT' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">Nút cực dương (a)</span>
                  <select
                    value={allNodeIds.includes(thNodeA) ? thNodeA : (allNodeIds[1] ?? '0')}
                    onChange={(e) => setThNodeA(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Nút {nid}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">Nút cực âm (b)</span>
                  <select
                    value={allNodeIds.includes(thNodeB) ? thNodeB : '0'}
                    onChange={(e) => setThNodeB(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Nút {nid}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : eqMode === 'MAX_POWER' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-600 mb-1">
                      Nhánh tải Z đang đặt sẵn (tùy chọn)
                    </span>
                    <select
                      value={activeMpTargetId}
                      onChange={(e) => setMpTargetElId(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      <option value="">— Cổng để hở (chọn 2 nút a, b bên dưới) —</option>
                      {passiveLoadCandidates.map((el) => (
                        <option key={el.id} value={el.id}>
                          {el.name} ({getComponentMeta(el.type).shortLabel})
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedElement &&
                    passiveLoadCandidates.some((e) => e.id === selectedElement.id) &&
                    activeMpTargetId !== selectedElement.id && (
                      <button
                        type="button"
                        onClick={() => setMpTargetElId(selectedElement.id)}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Dùng phần tử đang chọn ({selectedElement.name})
                      </button>
                    )}
                </div>

                {activeMpTargetPins ? (
                  <div className="px-2.5 py-2 rounded-lg bg-blue-50/70 border border-blue-200/70 text-[11px] text-blue-900">
                    Đang xét mạng 1 cửa tại hai đầu <span className="font-mono font-semibold">{activeMpTargetPins.el.name}</span>:{' '}
                    <span className="font-mono font-semibold">
                      Nút {activeMpTargetPins.nodeA} ↔ Nút {activeMpTargetPins.nodeB}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Cực dương cổng (a)</span>
                      <select
                        value={allNodeIds.includes(thNodeA) ? thNodeA : (allNodeIds[1] ?? '0')}
                        onChange={(e) => setThNodeA(e.target.value)}
                        className={`${SELECT_CLASS} font-mono`}
                      >
                        {allNodeIds.map((nid) => (
                          <option key={nid} value={nid}>
                            Nút {nid}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Cực âm cổng (b)</span>
                      <select
                        value={allNodeIds.includes(thNodeB) ? thNodeB : '0'}
                        onChange={(e) => setThNodeB(e.target.value)}
                        className={`${SELECT_CLASS} font-mono`}
                      >
                        {allNodeIds.map((nid) => (
                          <option key={nid} value={nid}>
                            Nút {nid}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Điều kiện biến thiên của tải Z
                  </span>
                  <select
                    value={mpConstraint}
                    onChange={(e) => setMpConstraint(e.target.value as MaxPowerConstraintMode)}
                    className={SELECT_CLASS}
                  >
                    <option value="CONJUGATE">Tự do Z = R + jX (Liên hợp Z = Z_th*)</option>
                    <option value="PURE_RESISTIVE">Thuần trở Z = R (X = 0, R = |Z_th|)</option>
                    <option value="FIXED_X">Cố định phần ảo X, thay đổi R</option>
                    <option value="FIXED_ANGLE">Cố định góc pha φ (cos φ), thay đổi |Z|</option>
                  </select>
                </label>

                {mpConstraint === 'FIXED_X' && (
                  <NumField
                    label="Điện kháng tải cố định (X)"
                    unit="Ω"
                    value={mpFixedX}
                    onChange={setMpFixedX}
                  />
                )}
                {mpConstraint === 'FIXED_ANGLE' && (
                  <NumField
                    label="Góc pha tải cố định (φ)"
                    unit="°"
                    value={mpFixedAngle}
                    onChange={setMpFixedAngle}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="text-[11px] font-medium text-slate-700">Cửa 1 (1, 1')</div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Cửa 1 cực dương"
                    value={allNodeIds.includes(tp1Pos) ? tp1Pos : (allNodeIds[1] ?? '0')}
                    onChange={(e) => setTp1Pos(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Cực 1: Nút {nid}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Cửa 1 cực âm"
                    value={allNodeIds.includes(tp1Neg) ? tp1Neg : '0'}
                    onChange={(e) => setTp1Neg(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Cực 1': Nút {nid}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] font-medium text-slate-700 pt-1">Cửa 2 (2, 2')</div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Cửa 2 cực dương"
                    value={allNodeIds.includes(tp2Pos) ? tp2Pos : (allNodeIds[2] ?? allNodeIds[1] ?? '0')}
                    onChange={(e) => setTp2Pos(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Cực 2: Nút {nid}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Cửa 2 cực âm"
                    value={allNodeIds.includes(tp2Neg) ? tp2Neg : '0'}
                    onChange={(e) => setTp2Neg(e.target.value)}
                    className={`${SELECT_CLASS} font-mono`}
                  >
                    {allNodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        Cực 2': Nút {nid}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleExtract}
              className="w-full py-2 px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-2xs"
            >
              {eqMode === 'MAX_POWER' ? 'Tìm Z tối ưu & Mô phỏng kiểm chứng' : 'Trích xuất thông số tương đương'}
            </button>

            {eqMode === 'MAX_POWER' && mpResult && (
              <div className="space-y-3">
                {!mpResult.success ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {mpResult.error}
                  </div>
                ) : (() => {
                  const zOptC = new Complex(mpResult.zOpt.re, mpResult.zOpt.im);
                  const iLoadC = new Complex(mpResult.iLoad.re, mpResult.iLoad.im);
                  const uLoadC = new Complex(mpResult.uLoad.re, mpResult.uLoad.im);
                  const pts = mpResult.sweepPoints;
                  const W = 330;
                  const H = 152;
                  const PAD = { top: 14, right: 12, bottom: 24, left: 42 };
                  const pw = W - PAD.left - PAD.right;
                  const ph = H - PAD.top - PAD.bottom;
                  const maxX = Math.max(1e-6, pts[pts.length - 1]?.param ?? mpResult.optParam * 3);
                  const maxY = Math.max(1e-6, mpResult.pMax * 1.15);
                  const mx = (v: number) => PAD.left + (v / maxX) * pw;
                  const my = (p: number) => PAD.top + (1 - p / maxY) * ph;
                  const polyPts = pts.map((pt) => `${mx(pt.param).toFixed(1)},${my(pt.powerW).toFixed(1)}`).join(' ');
                  const hoverPt = mpHoverIdx !== null ? pts[mpHoverIdx] : undefined;

                  return (
                    <div className="border border-slate-200/90 rounded-xl p-3 bg-slate-50/70 space-y-3 text-xs">
                      {mpResult.warning && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                          {mpResult.warning}
                        </div>
                      )}

                      <div className="bg-white rounded-lg border border-blue-200/80 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                            Tổng trở tối ưu Z_opt ({mpResult.freqHz === 0 ? 'DC' : `${mpResult.freqHz} Hz`})
                          </span>
                          {Math.abs(mpResult.pMax - mpResult.pSimulated) < 1e-2 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Khớp MNA
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-mono font-bold text-slate-900">
                          Z_opt = {zOptC.formatRect(3)} Ω
                        </div>
                        <div className="text-[11px] font-mono text-slate-600">
                          Dạng cực: {zOptC.formatPolar(3)} Ω
                        </div>
                        <div className="pt-1 border-t border-slate-100 flex items-baseline justify-between">
                          <span className="text-[11px] text-slate-600">Công suất cực đại P_max:</span>
                          <span className="text-sm font-mono font-bold text-emerald-700">
                            {mpResult.pMax.toFixed(3)} W
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums text-[11px]">
                        <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                          <span className="block text-[10px] font-sans text-slate-500">V_th (a − b)</span>
                          <span className="font-semibold text-slate-800">{new Complex(mpResult.vth.re, mpResult.vth.im).formatPolar(2)} V</span>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                          <span className="block text-[10px] font-sans text-slate-500">Z_th</span>
                          <span className="font-semibold text-slate-800">{new Complex(mpResult.zth.re, mpResult.zth.im).formatRect(2)} Ω</span>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                          <span className="block text-[10px] font-sans text-slate-500">U_tải / I_tải</span>
                          <span className="font-semibold text-slate-800">
                            {uLoadC.mag().toFixed(2)}V / {iLoadC.mag().toFixed(3)}A
                          </span>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200/80 px-2 py-1.5">
                          <span className="block text-[10px] font-sans text-slate-500">cos φ · η_Thévenin</span>
                          <span className="font-semibold text-slate-800">
                            {mpResult.powerFactor.toFixed(3)} · {mpResult.theveninEfficiencyPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {pts.length >= 2 && (
                        <div className="bg-white rounded-lg border border-slate-200/80 p-2 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>Đường cong P theo {mpResult.sweepParamLabel}</span>
                            <span className="font-mono text-blue-700 font-semibold">
                              Đỉnh: {mpResult.optParam.toFixed(2)} Ω → {mpResult.pMax.toFixed(2)} W
                            </span>
                          </div>
                          <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="w-full h-auto cursor-crosshair select-none"
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const rx = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
                              const targetParam = Math.max(0, Math.min(maxX, (rx / pw) * maxX));
                              let bestIdx = 0;
                              let bestDiff = Infinity;
                              pts.forEach((p, idx) => {
                                const d = Math.abs(p.param - targetParam);
                                if (d < bestDiff) {
                                  bestDiff = d;
                                  bestIdx = idx;
                                }
                              });
                              setMpHoverIdx(bestIdx);
                            }}
                            onMouseLeave={() => setMpHoverIdx(null)}
                          >
                            {[0, 0.5, 1].map((f, idx) => (
                              <g key={idx}>
                                <line
                                  x1={PAD.left}
                                  y1={PAD.top + f * ph}
                                  x2={W - PAD.right}
                                  y2={PAD.top + f * ph}
                                  stroke="#F1F5F9"
                                  strokeWidth={1}
                                />
                                <text
                                  x={PAD.left - 4}
                                  y={PAD.top + f * ph + 3}
                                  textAnchor="end"
                                  fontSize={8}
                                  fill="#64748B"
                                  className="font-mono"
                                >
                                  {((1 - f) * maxY).toFixed(maxY >= 10 ? 0 : 2)}
                                </text>
                              </g>
                            ))}
                            <rect x={PAD.left} y={PAD.top} width={pw} height={ph} fill="none" stroke="#E2E8F0" />
                            <line
                              x1={mx(mpResult.optParam)}
                              y1={my(mpResult.pMax)}
                              x2={mx(mpResult.optParam)}
                              y2={PAD.top + ph}
                              stroke="#93C5FD"
                              strokeDasharray="3 2"
                            />
                            <polyline
                              points={polyPts}
                              fill="none"
                              stroke="#2563EB"
                              strokeWidth={2}
                              strokeLinejoin="round"
                            />
                            <circle
                              cx={mx(mpResult.optParam)}
                              cy={my(mpResult.pMax)}
                              r={3.5}
                              fill="#059669"
                              stroke="#FFFFFF"
                              strokeWidth={1.2}
                            />
                            {hoverPt && (
                              <circle
                                cx={mx(hoverPt.param)}
                                cy={my(hoverPt.powerW)}
                                r={3}
                                fill="#2563EB"
                                stroke="#FFFFFF"
                                strokeWidth={1.2}
                              />
                            )}
                            <text x={PAD.left} y={H - 6} fontSize={8} fill="#64748B" className="font-mono">
                              0
                            </text>
                            <text
                              x={mx(mpResult.optParam)}
                              y={H - 6}
                              textAnchor="middle"
                              fontSize={8}
                              fontWeight={600}
                              fill="#059669"
                              className="font-mono"
                            >
                              {mpResult.optParam.toFixed(1)}Ω
                            </text>
                            <text
                              x={W - PAD.right}
                              y={H - 6}
                              textAnchor="end"
                              fontSize={8}
                              fill="#64748B"
                              className="font-mono"
                            >
                              {maxX.toFixed(1)}Ω
                            </text>
                          </svg>
                          {hoverPt && (
                            <div className="text-[10px] font-mono text-slate-600 text-right">
                              {mpResult.sweepParamLabel.replace(/\s*\([^)]+\)/, '')} = {hoverPt.param.toFixed(2)} Ω → P = {hoverPt.powerW.toFixed(3)} W
                            </div>
                          )}
                        </div>
                      )}

                      {onApplyMaxPowerImpedance && (
                        <button
                          type="button"
                          onClick={() =>
                            onApplyMaxPowerImpedance({
                              nodeA: mpResult.nodeA,
                              nodeB: mpResult.nodeB,
                              freqHz: mpResult.freqHz,
                              zOpt: mpResult.zOpt,
                              targetElementId: activeMpTargetId || undefined,
                            })
                          }
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-2xs"
                        >
                          {activeMpTargetPins
                            ? `Áp dụng Z_opt cho ${activeMpTargetPins.el.name} & Mô phỏng`
                            : `Gắn Z_opt vào cổng (N${mpResult.nodeA} − N${mpResult.nodeB}) & Mô phỏng`}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {eqMode === 'ONE_PORT' && thResult && (
              <div className="border border-slate-200/90 rounded-xl p-3 bg-slate-50/70 space-y-2 text-xs">
                {!thResult.success ? (
                  <p className="text-rose-700">{thResult.error}</p>
                ) : (
                  <div className="space-y-1.5 font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500">V_th = </span>
                      <span className="font-semibold text-slate-900">{formatC(thResult.vth)} V</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Z_th = </span>
                      <span className="font-semibold text-slate-900">{formatC(thResult.zth)} Ω</span>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5">
                      <span className="text-slate-500">I_N  = </span>
                      <span className="font-semibold text-slate-900">{formatC(thResult.inorton)} A</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Y_th = </span>
                      <span className="font-semibold text-slate-900">{formatC(thResult.ynorton)} S</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {eqMode === 'TWO_PORT' && tpResult && (
              <div className="space-y-3">
                {!tpResult.success ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {tpResult.error}
                  </div>
                ) : (
                  (['Z', 'Y', 'A'] as const).map((matKey) => {
                    const mat = tpResult[matKey];
                    if (!mat) return null;
                    return (
                      <div key={matKey} className="border border-slate-200/90 rounded-xl p-2.5 bg-slate-50/70">
                        <div className="text-xs font-semibold text-slate-800 mb-1.5">
                          Ma trận [{matKey}] {matKey === 'Z' ? '(Ω)' : matKey === 'Y' ? '(S)' : '(ABCD)'}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums text-[11px]">
                          <div className="bg-white border border-slate-200/80 rounded-lg px-2 py-1">
                            {new Complex(mat[0][0].re, mat[0][0].im).formatRect(3)}
                          </div>
                          <div className="bg-white border border-slate-200/80 rounded-lg px-2 py-1">
                            {new Complex(mat[0][1].re, mat[0][1].im).formatRect(3)}
                          </div>
                          <div className="bg-white border border-slate-200/80 rounded-lg px-2 py-1">
                            {new Complex(mat[1][0].re, mat[1][0].im).formatRect(3)}
                          </div>
                          <div className="bg-white border border-slate-200/80 rounded-lg px-2 py-1">
                            {new Complex(mat[1][1].re, mat[1][1].im).formatRect(3)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
