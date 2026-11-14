import React from 'react';
import { CircuitElement, ComponentType } from '../types/circuit';
import { formatEngValue, getLocalPins } from '../engine/pins';

interface SymbolProps {
  type: ComponentType;
  element?: CircuitElement;
  selected?: boolean;
  hasDotAtPin1?: boolean;
  hasDotAtPin2?: boolean;
  isPaletteIcon?: boolean;
}

export const ComponentSymbol: React.FC<SymbolProps> = ({
  type,
  element,
  selected = false,
  hasDotAtPin1 = false,
  hasDotAtPin2 = false,
  isPaletteIcon = false,
}) => {
  const stroke = selected ? '#2563EB' : '#0F172A';
  const accent = '#2563EB';
  const muted = '#64748B';
  const sw = isPaletteIcon ? 2 : 1.75;

  const renderGlyph = () => {
    switch (type) {
      case 'GND':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round">
            <line x1={0} y1={-20} x2={0} y2={0} />
            <line x1={-14} y1={0} x2={14} y2={0} />
            <line x1={-9} y1={6} x2={9} y2={6} />
            <line x1={-4} y1={12} x2={4} y2={12} />
          </g>
        );
      case 'V_SRC':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={0} y1={-40} x2={0} y2={-18} />
            <line x1={0} y1={18} x2={0} y2={40} />
            <circle cx={0} cy={0} r={18} fill="#FFFFFF" />
            <line x1={-4} y1={-8} x2={4} y2={-8} strokeWidth={1.5} />
            <line x1={0} y1={-12} x2={0} y2={-4} strokeWidth={1.5} />
            {element?.waveform === 'AC' ? (
              <path
                d="M -7 5 Q -3.5 0, 0 5 T 7 5"
                stroke={accent}
                strokeWidth={1.5}
                fill="none"
              />
            ) : element?.waveform === 'MIXED' ? (
              <g stroke={accent} strokeWidth={1.45} fill="none">
                <line x1={-6} y1={1.5} x2={6} y2={1.5} />
                <path d="M -7 8 Q -3.5 3.5, 0 8 T 7 8" />
              </g>
            ) : element?.waveform === 'STEP' ? (
              <polyline points="-7,8 -2,8 -2,2 7,2" stroke={accent} strokeWidth={1.5} fill="none" />
            ) : (
              <line x1={-4} y1={8} x2={4} y2={8} strokeWidth={1.5} />
            )}
          </g>
        );
      case 'I_SRC':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={0} y1={-40} x2={0} y2={-18} />
            <line x1={0} y1={18} x2={0} y2={40} />
            <circle cx={0} cy={0} r={18} fill="#FFFFFF" />
            {element?.waveform === 'MIXED' ? (
              <g stroke={accent} strokeWidth={1.5} fill="none">
                <line x1={-5} y1={9} x2={-5} y2={-9} />
                <polyline points="-9,-4 -5,-10 -1,-4" />
                <line x1={2} y1={-3} x2={11} y2={-3} strokeWidth={1.35} />
                <path d="M 1 4 Q 3.5 0, 6 4 T 11 4" strokeWidth={1.35} />
              </g>
            ) : (
              <>
                <line x1={0} y1={10} x2={0} y2={-9} stroke={accent} strokeWidth={1.75} />
                <polyline points="-5,-4 0,-10 5,-4" stroke={accent} strokeWidth={1.75} fill="none" />
              </>
            )}
          </g>
        );
      case 'RESISTOR':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-40} y1={0} x2={-20} y2={0} />
            <line x1={20} y1={0} x2={40} y2={0} />
            {/* Chuẩn IEC hình chữ nhật */}
            <rect x={-20} y={-8} width={40} height={16} rx={1.5} fill="#FFFFFF" />
          </g>
        );
      case 'CAPACITOR':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-40} y1={0} x2={-4} y2={0} />
            <line x1={4} y1={0} x2={40} y2={0} />
            <line x1={-4} y1={-14} x2={-4} y2={14} strokeWidth={2.2} />
            <line x1={4} y1={-14} x2={4} y2={14} strokeWidth={2.2} />
            {!isPaletteIcon && (
              <text x={-14} y={-10} fontSize={9} fill={muted} stroke="none" className="font-mono">
                +
              </text>
            )}
          </g>
        );
      case 'INDUCTOR':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-40} y1={0} x2={-24} y2={0} />
            <line x1={24} y1={0} x2={40} y2={0} />
            <path d="M -24 0 A 6 7 0 0 1 -12 0 A 6 7 0 0 1 0 0 A 6 7 0 0 1 12 0 A 6 7 0 0 1 24 0" />
            {hasDotAtPin1 && <circle cx={-22} cy={-10} r={2.8} fill="#DC2626" stroke="none" />}
            {hasDotAtPin2 && <circle cx={22} cy={-10} r={2.8} fill="#DC2626" stroke="none" />}
          </g>
        );
      case 'MUTUAL':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <rect
              x={-26}
              y={-14}
              width={52}
              height={28}
              rx={4}
              fill="#FFFBEB"
              stroke="#D97706"
              strokeDasharray="3 2"
            />
            <text
              x={0}
              y={-1}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="#B45309"
              stroke="none"
              className="font-mono"
            >
              M
            </text>
            <path d="M -14 7 Q 0 13 14 7" stroke="#D97706" strokeWidth={1.4} fill="none" />
            <polyline points="-10,10 -14,7 -10,5" stroke="#D97706" strokeWidth={1.2} />
            <polyline points="10,10 14,7 10,5" stroke="#D97706" strokeWidth={1.2} />
          </g>
        );
      case 'VCVS':
      case 'CCVS':
      case 'VCCS':
      case 'CCCS': {
        const isVoltage = type === 'VCVS' || type === 'CCVS';
        const tag = type === 'VCVS' ? 'μU' : type === 'CCVS' ? 'rI' : type === 'VCCS' ? 'gU' : 'βI';
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={0} y1={-40} x2={0} y2={-20} />
            <line x1={0} y1={20} x2={0} y2={40} />
            <polygon points="0,-20 20,0 0,20 -20,0" fill="#FFFFFF" />
            {isVoltage ? (
              <>
                <line x1={-3} y1={-9} x2={3} y2={-9} strokeWidth={1.4} />
                <line x1={0} y1={-12} x2={0} y2={-6} strokeWidth={1.4} />
                <line x1={-3} y1={9} x2={3} y2={9} strokeWidth={1.4} />
              </>
            ) : (
              <>
                <line x1={0} y1={10} x2={0} y2={-9} stroke={accent} strokeWidth={1.6} />
                <polyline points="-4,-5 0,-10 4,-5" stroke={accent} strokeWidth={1.5} />
              </>
            )}
            {!isPaletteIcon && (
              <text
                x={24}
                y={-8}
                fontSize={10}
                fontWeight={600}
                fill={accent}
                stroke="none"
                className="font-mono"
              >
                {tag}
              </text>
            )}
          </g>
        );
      }
      case 'ONE_PORT':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-40} y1={0} x2={-24} y2={0} />
            <line x1={24} y1={0} x2={40} y2={0} />
            <rect x={-24} y={-15} width={48} height={30} rx={3} fill="#FFFFFF" />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill={stroke}
              stroke="none"
              className="font-mono"
            >
              {element?.onePortMode === 'NORTON' ? 'N' : 'Th'}
            </text>
          </g>
        );
      case 'TWO_PORT':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-60} y1={-40} x2={-32} y2={-40} />
            <line x1={-60} y1={40} x2={-32} y2={40} />
            <line x1={32} y1={-40} x2={60} y2={-40} />
            <line x1={32} y1={40} x2={60} y2={40} />
            <rect x={-32} y={-48} width={64} height={96} rx={4} fill="#FFFFFF" />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill={accent}
              stroke="none"
              className="font-mono"
            >
              [{element?.twoPortType ?? 'Z'}]
            </text>
            {!isPaletteIcon && (
              <>
                <text x={-26} y={-36} fontSize={9} fill={muted} stroke="none" className="font-mono">1</text>
                <text x={-26} y={43} fontSize={9} fill={muted} stroke="none" className="font-mono">1'</text>
                <text x={20} y={-36} fontSize={9} fill={muted} stroke="none" className="font-mono">2</text>
                <text x={20} y={43} fontSize={9} fill={muted} stroke="none" className="font-mono">2'</text>
              </>
            )}
          </g>
        );
      case 'OPAMP': {
        const inv = element?.opampInvertPins ?? false;
        const yPlus = inv ? 20 : -20;
        const yMinus = inv ? -20 : 20;
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-40} y1={-20} x2={-24} y2={-20} />
            <line x1={-40} y1={20} x2={-24} y2={20} />
            <line x1={26} y1={0} x2={40} y2={0} />
            <polygon points="-24,-32 26,0 -24,32" fill="#FFFFFF" />
            <text x={-18} y={yPlus + 4} fontSize={12} fontWeight={700} fill="#059669" stroke="none">
              +
            </text>
            <text x={-18} y={yMinus + 4} fontSize={13} fontWeight={700} fill="#DC2626" stroke="none">
              −
            </text>
          </g>
        );
      }
      case 'THREE_PHASE_SRC':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={32} y1={-60} x2={60} y2={-60} stroke="#DC2626" />
            <line x1={32} y1={-20} x2={60} y2={-20} stroke="#D97706" />
            <line x1={32} y1={20} x2={60} y2={20} stroke="#2563EB" />
            <line x1={32} y1={60} x2={60} y2={60} stroke="#64748B" strokeDasharray="3 2" />
            <rect x={-36} y={-70} width={68} height={140} rx={4} fill="#FFFFFF" />
            <circle cx={-4} cy={-12} r={16} stroke={accent} />
            {element?.tpConnection === 'DELTA' ? (
              <polygon points="-4,-22 5,-4 -13,-4" stroke={accent} strokeWidth={1.5} />
            ) : (
              <g stroke={accent} strokeWidth={1.5}>
                <line x1={-4} y1={-12} x2={-4} y2={-22} />
                <line x1={-4} y1={-12} x2={5} y2={-6} />
                <line x1={-4} y1={-12} x2={-13} y2={-6} />
              </g>
            )}
            <text x={-4} y={22} textAnchor="middle" fontSize={11} fontWeight={700} fill={stroke} stroke="none" className="font-mono">
              3φ
            </text>
            {!isPaletteIcon && (
              <>
                <text x={20} y={-56} fontSize={9} fontWeight={700} fill="#DC2626" stroke="none" className="font-mono">A</text>
                <text x={20} y={-16} fontSize={9} fontWeight={700} fill="#D97706" stroke="none" className="font-mono">B</text>
                <text x={20} y={24} fontSize={9} fontWeight={700} fill="#2563EB" stroke="none" className="font-mono">C</text>
                <text x={20} y={64} fontSize={9} fontWeight={700} fill="#64748B" stroke="none" className="font-mono">N</text>
              </>
            )}
          </g>
        );
      case 'THREE_PHASE_LINE':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-60} y1={-60} x2={60} y2={-60} stroke="#DC2626" />
            <line x1={-60} y1={-20} x2={60} y2={-20} stroke="#D97706" />
            <line x1={-60} y1={20} x2={60} y2={20} stroke="#2563EB" />
            <line x1={-60} y1={60} x2={60} y2={60} stroke="#64748B" strokeDasharray="3 2" />
            <rect x={-26} y={-68} width={52} height={136} rx={3} fill="#F8FAFC" />
            <rect x={-16} y={-64} width={32} height={8} fill="#FFFFFF" stroke="#DC2626" strokeWidth={1.3} />
            <rect x={-16} y={-24} width={32} height={8} fill="#FFFFFF" stroke="#D97706" strokeWidth={1.3} />
            <rect x={-16} y={16} width={32} height={8} fill="#FFFFFF" stroke="#2563EB" strokeWidth={1.3} />
            <rect x={-16} y={56} width={32} height={8} fill="#FFFFFF" stroke="#64748B" strokeWidth={1.3} />
          </g>
        );
      case 'THREE_PHASE_LOAD':
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none">
            <line x1={-60} y1={-60} x2={-32} y2={-60} stroke="#DC2626" />
            <line x1={-60} y1={-20} x2={-32} y2={-20} stroke="#D97706" />
            <line x1={-60} y1={20} x2={-32} y2={20} stroke="#2563EB" />
            <line x1={-60} y1={60} x2={-32} y2={60} stroke="#64748B" strokeDasharray="3 2" />
            <rect x={-32} y={-70} width={68} height={140} rx={4} fill="#FFFFFF" />
            <text x={2} y={-8} textAnchor="middle" fontSize={12} fontWeight={700} fill={stroke} stroke="none" className="font-mono">
              TẢI 3φ
            </text>
            <text x={2} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill={accent} stroke="none" className="font-mono">
              {element?.loadConnection === 'DELTA' ? 'Δ' : 'Y'}
            </text>
          </g>
        );
    }
  };

  if (isPaletteIcon) {
    const isLarge =
      type === 'THREE_PHASE_SRC' ||
      type === 'THREE_PHASE_LINE' ||
      type === 'THREE_PHASE_LOAD' ||
      type === 'TWO_PORT';
    const vb = isLarge ? '-75 -78 150 156' : '-48 -48 96 96';
    return (
      <svg viewBox={vb} className="w-9 h-9 shrink-0">
        {renderGlyph()}
      </svg>
    );
  }

  return <g>{renderGlyph()}</g>;
};

export function getElementSummaryText(el: CircuitElement): string {
  switch (el.type) {
    case 'GND':
      return '0 V';
    case 'V_SRC': {
      if (el.waveform === 'AC')
        return `${el.acValue ?? 220}V ∠${el.phaseDeg ?? 0}° (${el.freqHz ?? 50}Hz)`;
      if (el.waveform === 'MIXED') {
        const dc = el.mixedDcValue ?? el.dcValue ?? 0;
        const freqs = (el.harmonics ?? []).filter((h) => Math.abs(h.amplitude) > 0).map((h) => h.freqHz);
        if (freqs.length === 0) return `${dc} V`;
        const freqText = `${freqs.slice(0, 2).join('/')}${freqs.length > 2 ? '…' : ''}Hz`;
        return `${dc}V + ${freqText}`;
      }
      if (el.waveform === 'STEP') return `Step ${el.stepInit ?? 0}→${el.stepFinal ?? 12}V`;
      return `${el.dcValue ?? 12} V`;
    }
    case 'I_SRC': {
      if (el.waveform === 'AC') return `${el.acValue ?? 5}A ∠${el.phaseDeg ?? 0}°`;
      if (el.waveform === 'MIXED') {
        const dc = el.mixedDcValue ?? el.dcValue ?? 0;
        const freqs = (el.harmonics ?? []).filter((h) => Math.abs(h.amplitude) > 0).map((h) => h.freqHz);
        if (freqs.length === 0) return `${dc} A`;
        const freqText = `${freqs.slice(0, 2).join('/')}${freqs.length > 2 ? '…' : ''}Hz`;
        return `${dc}A + ${freqText}`;
      }
      if (el.waveform === 'STEP') return `Step ${el.stepInit ?? 0}→${el.stepFinal ?? 2}A`;
      return `${el.dcValue ?? 2} A`;
    }
    case 'RESISTOR':
      return formatEngValue(el.resistance ?? 100, 'Ω');
    case 'CAPACITOR':
      return formatEngValue(el.capacitance ?? 100e-6, 'F');
    case 'INDUCTOR':
      return formatEngValue(el.inductance ?? 0.1, 'H');
    case 'MUTUAL':
      return `M = ${formatEngValue(el.mutualM ?? 0.05, 'H')}`;
    case 'VCVS':
      return `μ = ${el.gain ?? 2}`;
    case 'CCVS':
      return `r = ${el.gain ?? 10} Ω`;
    case 'VCCS':
      return `g = ${el.gain ?? 0.05} S`;
    case 'CCCS':
      return `β = ${el.gain ?? 2}`;
    case 'OPAMP':
      return 'Lý tưởng';
    case 'ONE_PORT':
      return `${el.onePortMode === 'NORTON' ? 'In' : 'Vth'}=${el.onePortMag ?? 10}`;
    case 'TWO_PORT':
      return `Ma trận [${el.twoPortType ?? 'Z'}]`;
    case 'THREE_PHASE_SRC':
      return `${el.tpConnection ?? 'Y'} ${el.tpVoltageRms ?? 220}V`;
    case 'THREE_PHASE_LINE':
      return `Zd=${el.lineZ?.re ?? 1.5}+j${el.lineZ?.im ?? 3}`;
    case 'THREE_PHASE_LOAD':
      return `${el.loadConnection ?? 'Y'} ${el.loadSymmetric !== false ? 'Đối xứng' : 'Lệch pha'}`;
  }
}

export function getPinBadgeOffset(el: CircuitElement, pinId: string) {
  const pin = getLocalPins(el).find((p) => p.id === pinId);
  return pin ?? { id: pinId, label: pinId, dx: 0, dy: 0 };
}
