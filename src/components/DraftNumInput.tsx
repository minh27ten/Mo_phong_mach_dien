import React, { useEffect, useRef, useState } from 'react';

const NUMERIC_DRAFT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function formatDraftNumber(val: number): string {
  return Number.isFinite(val) ? String(val) : '0';
}

function parseDraftNumber(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized || !NUMERIC_DRAFT_RE.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

interface DraftNumInputProps {
  value: number;
  min?: number;
  max?: number;
  ariaLabel?: string;
  className?: string;
  onChange: (val: number) => void;
}

/**
 * Ô nhập số mượt mà: giữ nguyên chuỗi đang gõ ("-", "0.", "1e-") để không nuốt ký tự,
 * chỉ ghi nhận giá trị hợp lệ và chuẩn hóa lại khi blur/Enter.
 */
export const DraftNumInput: React.FC<DraftNumInputProps> = ({
  value,
  min,
  max,
  ariaLabel,
  className = '',
  onChange,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<string>(() => formatDraftNumber(value));

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(formatDraftNumber(value));
    }
  }, [value]);

  const clampValue = (v: number): number => {
    let out = v;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseDraftNumber(raw);
        if (parsed !== null) {
          const withinBounds =
            (min === undefined || parsed >= min) && (max === undefined || parsed <= max);
          if (withinBounds) {
            onChange(parsed);
          }
        }
      }}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed === '') {
          const fallback = clampValue(0);
          onChange(fallback);
          setDraft(String(fallback));
          return;
        }
        const parsed = parseDraftNumber(draft);
        if (parsed !== null) {
          const clamped = clampValue(parsed);
          onChange(clamped);
          setDraft(String(clamped));
        } else {
          setDraft(formatDraftNumber(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          inputRef.current?.blur();
        }
      }}
      className={className}
    />
  );
};
