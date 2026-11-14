import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  CheckCircle2,
  GitBranch,
  RotateCw,
  Sliders,
  Table2,
  Trash2,
} from 'lucide-react';
import {
  CircuitElement,
  CircuitState,
  ComplexInput,
  SimulationResult,
  TheveninNortonResult,
  TwoPortExtractResult,
  Wire,
} from '../types/circuit';
import { Complex } from '../engine/complex';
import { getComponentMeta } from '../engine/pins';
import { extractTheveninNorton, extractTwoPort } from '../engine/mna';
import { DraftNumInput } from './DraftNumInput';
import { TransientPlot } from './TransientPlot';

export type InspectorTab = 'PROPS' | 'RESULTS' | 'PLOT' | 'EQUIV';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  circuit: CircuitState;
  allNodeIds: string[];
  selectedElement: CircuitElement | null;
  selectedWire: Wire | null;
  simulationResult: SimulationResult | null;
  onSelectElement?: (id: string) => void;
  onUpdateElement: (id: string, patch: Partial<CircuitElement>) => void;
  onRotateElement: (id: string) => void;
  onDeleteElement: (id: string) => void;
  onDeleteWire: (id: string) => void;
  onRunTransientNow: () => void;
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
  selectedElement,
  selectedWire,
  simulationResult,
  onSelectElement,
  onUpdateElement,
  onRotateElement,
  onDeleteElement,
  onDeleteWire,
  onRunTransientNow,
}) => {
  // State cho Trình trích xuất tương đương
  const [eqMode, setEqMode] = useState<'ONE_PORT' | 'TWO_PORT'>('ONE_PORT');
  const [eqFreq, setEqFreq] = useState<number>(50);
  const [thNodeA, setThNodeA] = useState<string>('1');
  const [thNodeB, setThNodeB] = useState<string>('0');
  const [tp1Pos, setTp1Pos] = useState<string>('1');
  const [tp1Neg, setTp1Neg] = useState<string>('0');
  const [tp2Pos, setTp2Pos] = useState<string>('2');
  const [tp2Neg, setTp2Neg] = useState<string>('0');
  const [thResult, setThResult] = useState<TheveninNortonResult | null>(null);
  const [tpResult, setTpResult] = useState<TwoPortExtractResult | null>(null);

  const inductors = useMemo(
    () => circuit.elements.filter((e) => e.type === 'INDUCTOR'),
    [circuit.elements],
  );
  const branchElements = useMemo(
    () => circuit.elements.filter((e) => e.type !== 'GND' && e.type !== 'MUTUAL'),
    [circuit.elements],
  );

  const handleExtract = () => {
    if (eqMode === 'ONE_PORT') {
      const a = allNodeIds.includes(thNodeA) ? thNodeA : (allNodeIds[1] ?? '0');
      const b = allNodeIds.includes(thNodeB) ? thNodeB : '0';
      setThResult(extractTheveninNorton(circuit, a, b, eqFreq));
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
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 truncate">{meta.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{meta.description}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onRotateElement(el.id)}
              aria-label={`Xoay phần tử ${el.name} 90 độ`}
              title="Xoay 90° (Phím R)"
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

        {/* Thẻ định danh cơ bản */}
        <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-600 mb-1">Ký hiệu</span>
            <input
              type="text"
              value={el.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </label>
          <div className="block">
            <span className="block text-[11px] font-medium text-slate-600 mb-1">Góc xoay</span>
            <div className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200/80 rounded-lg text-slate-700">
              {el.rotation}°
            </div>
          </div>
        </div>

        {(el.type === 'V_SRC' || el.type === 'I_SRC') && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <SegmentedField
              label="Dạng sóng nguồn"
              value={el.waveform ?? 'DC'}
              options={[
                { value: 'DC', label: 'DC' },
                { value: 'AC', label: 'AC Sin' },
                { value: 'STEP', label: 'Step' },
              ]}
              onChange={(wf) => update({ waveform: wf })}
            />

            {(el.waveform ?? 'DC') === 'DC' && (
              <NumField
                label="Giá trị một chiều"
                unit={el.type === 'V_SRC' ? 'V' : 'A'}
                value={el.dcValue ?? 12}
                onChange={(v) => update({ dcValue: v })}
              />
            )}

            {el.waveform === 'AC' && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <NumField
                    label={el.amplitudeType === 'PEAK' ? 'Biên độ đỉnh' : 'Hiệu dụng'}
                    unit={el.type === 'V_SRC' ? 'V' : 'A'}
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

            {el.waveform === 'STEP' && (
              <div className="grid grid-cols-3 gap-2">
                <NumField
                  label="Trước đóng"
                  unit={el.type === 'V_SRC' ? 'V' : 'A'}
                  value={el.stepInit ?? 0}
                  onChange={(v) => update({ stepInit: v })}
                />
                <NumField
                  label="Sau đóng"
                  unit={el.type === 'V_SRC' ? 'V' : 'A'}
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
        )}

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

        {el.type === 'MUTUAL' && (
          <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-600 mb-1">Cuộn dây thứ nhất (L1)</span>
              <select
                value={el.l1Id ?? ''}
                onChange={(e) => update({ l1Id: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">— Chọn cuộn dây L1 —</option>
                {inductors.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.inductance} H)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-600 mb-1">Cuộn dây thứ hai (L2)</span>
              <select
                value={el.l2Id ?? ''}
                onChange={(e) => update({ l2Id: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">— Chọn cuộn dây L2 —</option>
                {inductors.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.inductance} H)
                  </option>
                ))}
              </select>
            </label>
            <NumField
              label="Hệ số hỗ cảm (M)"
              unit="H"
              min={0}
              value={el.mutualM ?? 0.05}
              onChange={(v) => update({ mutualM: Math.max(0, v) })}
            />
            <SegmentedField
              label="Cực cùng tính (•)"
              value={el.dotPolarity ?? 1}
              options={[
                { value: 1, label: 'Cùng cực (1–1)' },
                { value: -1, label: 'Ngược cực (1–2)' },
              ]}
              onChange={(pol) => update({ dotPolarity: pol })}
            />
          </div>
        )}

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
              <div className="text-center py-12 px-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40">
                <GitBranch className="w-7 h-7 text-slate-300 mx-auto mb-2.5" />
                <div className="text-xs font-semibold text-slate-700">Chưa chọn phần tử</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Nhấp vào một linh kiện hoặc dây dẫn trên sơ đồ để chỉnh sửa thông số, xoay hướng hoặc xóa.
                </p>
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
            ) : (
              <>
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
                  <h3 className="text-xs font-semibold text-slate-800 mb-1.5">
                    Điện thế các nút
                  </h3>
                  <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 px-2.5 text-left font-medium">Nút</th>
                          <th className="py-2 px-2.5 text-right font-medium">
                            {simulationResult.singleFrequencyHz ? 'Phức (RMS ∠ °)' : 'Giá trị (V)'}
                          </th>
                          <th className="py-2 px-2.5 text-right font-medium">Biểu thức tức thời</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {simulationResult.nodes.map((n) => (
                          <tr key={n.nodeId} className="hover:bg-slate-50/80 transition-colors">
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
                        ))}
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
                          const isRowSelected = selectedElement?.id === e.elementId;
                          return (
                            <React.Fragment key={e.elementId}>
                              <tr
                                onClick={() => onSelectElement?.(e.elementId)}
                                className={`transition-colors ${
                                  onSelectElement ? 'cursor-pointer' : ''
                                } ${
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
              </>
            )}
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
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setEqMode('ONE_PORT')}
                className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all ${
                  eqMode === 'ONE_PORT'
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Thévenin / Norton
              </button>
              <button
                type="button"
                onClick={() => setEqMode('TWO_PORT')}
                className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all ${
                  eqMode === 'TWO_PORT'
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mạng 2 cửa [Z, Y, A]
              </button>
            </div>

            <NumField
              label="Tần số trích xuất (0 Hz = DC)"
              unit="Hz"
              min={0}
              value={eqFreq}
              onChange={(v) => setEqFreq(Math.max(0, v))}
            />

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
              Trích xuất thông số tương đương
            </button>

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
