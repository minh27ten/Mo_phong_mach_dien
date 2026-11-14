import React, { useEffect, useMemo, useState } from 'react';
import { CircuitElement, TransientSeries } from '../types/circuit';

interface TransientPlotProps {
  transient: TransientSeries;
  elements: CircuitElement[];
}

const TRACE_COLORS = ['#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#0891B2'];

export const TransientPlot: React.FC<TransientPlotProps> = ({ transient, elements }) => {
  const [kindFilter, setKindFilter] = useState<'ALL' | 'V' | 'I'>('ALL');

  const availableTraces = useMemo(() => {
    const list: Array<{ key: string; label: string; kind: 'V' | 'I'; values: number[] }> = [];
    for (const [nid, values] of Object.entries(transient.nodeVoltages)) {
      if (nid === '0') continue;
      list.push({ key: `node:${nid}`, label: `u(Nút ${nid}) [V]`, kind: 'V', values });
    }
    for (const el of elements) {
      if (el.type === 'GND' || el.type === 'MUTUAL') continue;
      const iVals = transient.elementCurrents[el.id];
      if (iVals) {
        list.push({ key: `curr:${el.id}`, label: `i(${el.name}) [A]`, kind: 'I', values: iVals });
      }
      const vVals = transient.elementVoltages[el.id];
      if (vVals && (el.type === 'CAPACITOR' || el.type === 'INDUCTOR' || el.type === 'RESISTOR')) {
        list.push({ key: `volt:${el.id}`, label: `u(${el.name}) [V]`, kind: 'V', values: vVals });
      }
    }
    return list;
  }, [transient, elements]);

  const filteredTraces = useMemo(
    () =>
      kindFilter === 'ALL'
        ? availableTraces
        : availableTraces.filter((tr) => tr.kind === kindFilter),
    [availableTraces, kindFilter],
  );

  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => {
    return availableTraces.slice(0, 2).map((t) => t.key);
  });

  useEffect(() => {
    const availableKeySet = new Set(availableTraces.map((t) => t.key));
    setSelectedKeys((prev) => {
      const kept = prev.filter((k) => availableKeySet.has(k));
      if (kept.length > 0) {
        return kept.length === prev.length ? prev : kept;
      }
      return availableTraces.slice(0, 2).map((t) => t.key);
    });
  }, [availableTraces]);

  const activeTraces = useMemo(() => {
    const valid = availableTraces.filter((t) => selectedKeys.includes(t.key));
    return valid.length > 0 ? valid : availableTraces.slice(0, 1);
  }, [availableTraces, selectedKeys]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter((k) => k !== key) : prev) : [...prev, key],
    );
  };

  const times = transient.times;
  const W = 380;
  const H = 230;
  const PAD = { top: 16, right: 14, bottom: 28, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { minY, maxY } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const tr of activeTraces) {
      for (const v of tr.values) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return { minY: -1, maxY: 1 };
    if (Math.abs(mx - mn) < 1e-9) return { minY: mn - 1, maxY: mx + 1 };
    const pad = (mx - mn) * 0.08;
    return { minY: mn - pad, maxY: mx + pad };
  }, [activeTraces]);

  const tMin = times[0] ?? 0;
  const tMax = times[times.length - 1] ?? 1;
  const mapX = (t: number) => PAD.left + ((t - tMin) / Math.max(1e-12, tMax - tMin)) * plotW;
  const mapY = (y: number) => PAD.top + (1 - (y - minY) / Math.max(1e-12, maxY - minY)) * plotH;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
    const ratio = Math.max(0, Math.min(1, relX / plotW));
    const idx = Math.round(ratio * (times.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div className="space-y-3">
      <div className="border border-slate-200/90 rounded-xl bg-white p-2.5 shadow-2xs">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Lưới ngang */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
            const y = PAD.top + f * plotH;
            const val = maxY - f * (maxY - minY);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#F1F5F9" strokeWidth={0.9} />
                <text
                  x={PAD.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={8.5}
                  fill="#64748B"
                  className="font-mono tabular-nums"
                >
                  {Math.abs(val) >= 100 || Math.abs(val) === 0 ? val.toFixed(1) : val.toPrecision(3)}
                </text>
              </g>
            );
          })}

          {/* Đường 0 nếu nằm trong khung */}
          {minY < 0 && maxY > 0 && (
            <line
              x1={PAD.left}
              y1={mapY(0)}
              x2={W - PAD.right}
              y2={mapY(0)}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          )}

          {/* Trục thời gian */}
          {[0, 0.5, 1].map((f, i) => {
            const tVal = tMin + f * (tMax - tMin);
            const x = PAD.left + f * plotW;
            return (
              <g key={i}>
                <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="#F1F5F9" strokeWidth={0.9} />
                <text
                  x={x}
                  y={H - PAD.bottom + 13}
                  textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                  fontSize={8.5}
                  fill="#64748B"
                  className="font-mono tabular-nums"
                >
                  {(tVal * 1000).toFixed(1)} ms
                </text>
              </g>
            );
          })}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={1}
          />

          {/* Các đường cong đồ thị */}
          {activeTraces.map((tr, tIdx) => {
            const step = Math.max(1, Math.floor(times.length / 400));
            const pts: string[] = [];
            for (let i = 0; i < times.length; i += step) {
              pts.push(`${mapX(times[i]).toFixed(1)},${mapY(tr.values[i]).toFixed(1)}`);
            }
            if ((times.length - 1) % step !== 0) {
              const last = times.length - 1;
              pts.push(`${mapX(times[last]).toFixed(1)},${mapY(tr.values[last]).toFixed(1)}`);
            }
            return (
              <polyline
                key={tr.key}
                points={pts.join(' ')}
                fill="none"
                stroke={TRACE_COLORS[tIdx % TRACE_COLORS.length]}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* Con trỏ đọc giá trị tức thời */}
          {hoverIdx !== null && times[hoverIdx] !== undefined && (
            <g>
              <line
                x1={mapX(times[hoverIdx])}
                y1={PAD.top}
                x2={mapX(times[hoverIdx])}
                y2={H - PAD.bottom}
                stroke="#0F172A"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {activeTraces.map((tr, tIdx) => (
                <circle
                  key={tr.key}
                  cx={mapX(times[hoverIdx])}
                  cy={mapY(tr.values[hoverIdx])}
                  r={3.2}
                  fill={TRACE_COLORS[tIdx % TRACE_COLORS.length]}
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                />
              ))}
            </g>
          )}
        </svg>

        {hoverIdx !== null && times[hoverIdx] !== undefined ? (
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] font-mono tabular-nums text-slate-700 flex flex-wrap items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-900">
              t = {(times[hoverIdx] * 1000).toFixed(3)} ms
            </span>
            {activeTraces.map((tr, tIdx) => (
              <span
                key={tr.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/70"
                style={{ color: TRACE_COLORS[tIdx % TRACE_COLORS.length] }}
              >
                {tr.label.replace(/\s+\[[^\]]+\]$/, '')} = {tr.values[hoverIdx].toFixed(4)}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
            Rê chuột lên đồ thị để đọc giá trị tức thời u(t), i(t)
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-700">
            Kênh tín hiệu ({activeTraces.length}/{availableTraces.length})
          </div>
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-[11px]">
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'V', label: 'Áp (u)' },
                { id: 'I', label: 'Dòng (i)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKindFilter(opt.id)}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  kindFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-52 overflow-y-auto border border-slate-200/90 rounded-xl divide-y divide-slate-100 bg-white">
          {filteredTraces.map((tr) => {
            const active = selectedKeys.includes(tr.key);
            const colorIdx = activeTraces.findIndex((a) => a.key === tr.key);
            return (
              <label
                key={tr.key}
                className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  active ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleKey(tr.key)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-mono text-slate-800 truncate">{tr.label}</span>
                </span>
                {active && colorIdx >= 0 && (
                  <span
                    className="w-4 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: TRACE_COLORS[colorIdx % TRACE_COLORS.length] }}
                  />
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};
