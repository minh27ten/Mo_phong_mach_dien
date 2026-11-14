import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable,
  Download,
  MousePointer,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  CircuitElement,
  CircuitState,
  ComponentType,
  SimulationMode,
  SimulationResult,
  WirePoint,
} from './types/circuit';
import { createDefaultElement, isValidComponentType } from './engine/pins';
import { buildNetlist } from './engine/netlist';
import { runSimulation } from './engine/mna';
import { CIRCUIT_PRESETS, CircuitPreset } from './data/presets';
import { PaletteSidebar } from './components/PaletteSidebar';
import { EditorTool, SchematicCanvas } from './components/SchematicCanvas';
import { InspectorPanel, InspectorTab } from './components/InspectorPanel';
import { DraftNumInput } from './components/DraftNumInput';

function cloneState(s: CircuitState): CircuitState {
  return JSON.parse(JSON.stringify(s));
}

export default function App() {
  const initialPreset = CIRCUIT_PRESETS[0];
  const [circuit, setCircuit] = useState<CircuitState>(() => cloneState(initialPreset.state));
  const [historyPast, setHistoryPast] = useState<CircuitState[]>([]);
  const [historyFuture, setHistoryFuture] = useState<CircuitState[]>([]);

  const [activePresetId, setActivePresetId] = useState<string>(initialPreset.id);
  const [mode, setMode] = useState<SimulationMode>(initialPreset.recommendedMode);
  const [dt, setDt] = useState<number>(initialPreset.transientConfig?.dt ?? 0.0002);
  const [tEnd, setTEnd] = useState<number>(initialPreset.transientConfig?.tEnd ?? 0.04);

  const [tool, setTool] = useState<EditorTool>('SELECT');
  const [placingType, setPlacingType] = useState<ComponentType | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('RESULTS');

  const [showPalette, setShowPalette] = useState<boolean>(true);
  const [showInspector, setShowInspector] = useState<boolean>(true);
  const [fitTrigger, setFitTrigger] = useState<number>(1);

  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(() =>
    runSimulation(initialPreset.state, initialPreset.recommendedMode),
  );
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const netlist = useMemo(() => buildNetlist(circuit.elements, circuit.wires), [circuit]);

  const pushHistory = useCallback((snapshot: CircuitState) => {
    setHistoryPast((prev) => [...prev.slice(-39), cloneState(snapshot)]);
    setHistoryFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((f) => [cloneState(circuit), ...f]);
    setCircuit(previous);
    setSelectedElementId((sel) =>
      sel && previous.elements.some((el) => el.id === sel) ? sel : null,
    );
    setSelectedWireId((sel) =>
      sel && previous.wires.some((w) => w.id === sel) ? sel : null,
    );
    setSimulationResult(null);
  }, [circuit, historyPast]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((p) => [...p, cloneState(circuit)]);
    setCircuit(next);
    setSelectedElementId((sel) =>
      sel && next.elements.some((el) => el.id === sel) ? sel : null,
    );
    setSelectedWireId((sel) =>
      sel && next.wires.some((w) => w.id === sel) ? sel : null,
    );
    setSimulationResult(null);
  }, [circuit, historyFuture]);

  const handleRunSimulation = useCallback(
    (overrideMode?: SimulationMode) => {
      const targetMode = overrideMode ?? mode;
      if (overrideMode) setMode(overrideMode);
      const res = runSimulation(circuit, targetMode, { dt, tEnd });
      setSimulationResult(res);
      setShowInspector(true);
      if (targetMode === 'TRANSIENT' && res.success) {
        setInspectorTab('PLOT');
      } else {
        setInspectorTab('RESULTS');
      }
    },
    [circuit, mode, dt, tEnd],
  );

  const handleLoadPreset = (preset: CircuitPreset) => {
    pushHistory(circuit);
    const next = cloneState(preset.state);
    setCircuit(next);
    setActivePresetId(preset.id);
    setMode(preset.recommendedMode);
    if (preset.transientConfig) {
      setDt(preset.transientConfig.dt);
      setTEnd(preset.transientConfig.tEnd);
    }
    setSelectedElementId(null);
    setSelectedWireId(null);
    setPlacingType(null);
    setFitTrigger((n) => n + 1);
    const res = runSimulation(next, preset.recommendedMode, preset.transientConfig);
    setSimulationResult(res);
    setInspectorTab('RESULTS');
  };

  const handlePlaceComponent = (type: ComponentType, x: number, y: number) => {
    pushHistory(circuit);
    const newEl = createDefaultElement(type, x, y, circuit.elements);
    setCircuit((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedElementId(newEl.id);
    setSelectedWireId(null);
    setPlacingType(null);
    setShowInspector(true);
    setInspectorTab('PROPS');
    setSimulationResult(null);
  };

  const handleMoveElement = useCallback((id: string, x: number, y: number) => {
    setCircuit((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
    }));
    setSimulationResult(null);
  }, []);

  const handleUpdateElement = (id: string, patch: Partial<CircuitElement>) => {
    pushHistory(circuit);
    setCircuit((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
    setSimulationResult(null);
  };

  const handleRotateElement = useCallback(
    (id: string) => {
      pushHistory(circuit);
      setCircuit((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id
            ? { ...el, rotation: ((el.rotation + 90) % 360) as CircuitElement['rotation'] }
            : el,
        ),
      }));
      setSimulationResult(null);
    },
    [circuit, pushHistory],
  );

  const handleDeleteElement = useCallback(
    (id: string) => {
      pushHistory(circuit);
      setCircuit((prev) => ({
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }));
      setSelectedElementId(null);
      setSimulationResult(null);
    },
    [circuit, pushHistory],
  );

  const handleDeleteWire = useCallback(
    (id: string) => {
      pushHistory(circuit);
      setCircuit((prev) => ({
        ...prev,
        wires: prev.wires.filter((w) => w.id !== id),
      }));
      setSelectedWireId(null);
      setSimulationResult(null);
    },
    [circuit, pushHistory],
  );

  const handleAddWire = (points: WirePoint[]) => {
    pushHistory(circuit);
    const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setCircuit((prev) => ({ ...prev, wires: [...prev.wires, { id, points }] }));
    setSimulationResult(null);
  };

  const handleClearCanvas = () => {
    pushHistory(circuit);
    setCircuit({ elements: [], wires: [] });
    setActivePresetId('empty');
    setSelectedElementId(null);
    setSelectedWireId(null);
    setPlacingType(null);
    setSimulationResult(null);
  };

  const handleExportJson = () => {
    const payload = JSON.stringify({ version: 1, mode, dt, tEnd, circuit }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mach-dien-${activePresetId || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawCircuit = parsed?.circuit ?? parsed;
        if (
          !rawCircuit ||
          typeof rawCircuit !== 'object' ||
          !Array.isArray(rawCircuit.elements) ||
          !Array.isArray(rawCircuit.wires)
        ) {
          throw new Error('Cấu trúc tệp JSON không hợp lệ.');
        }
        const validElements = rawCircuit.elements.every(
          (el: unknown) =>
            Boolean(el) &&
            typeof el === 'object' &&
            typeof (el as CircuitElement).id === 'string' &&
            typeof (el as CircuitElement).name === 'string' &&
            isValidComponentType((el as CircuitElement).type) &&
            Number.isFinite((el as CircuitElement).x) &&
            Number.isFinite((el as CircuitElement).y) &&
            [0, 90, 180, 270].includes((el as CircuitElement).rotation),
        );
        const validWires = rawCircuit.wires.every(
          (w: unknown) =>
            Boolean(w) &&
            typeof w === 'object' &&
            typeof (w as { id?: unknown }).id === 'string' &&
            Array.isArray((w as { points?: unknown }).points) &&
            (w as { points: WirePoint[] }).points.every(
              (p) => Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y),
            ),
        );
        if (!validElements || !validWires) {
          throw new Error('Dữ liệu phần tử hoặc dây dẫn trong tệp JSON không hợp lệ.');
        }

        const nextCircuit: CircuitState = {
          elements: rawCircuit.elements,
          wires: rawCircuit.wires,
        };
        const validModes: SimulationMode[] = ['DC', 'DC_SS', 'AC', 'TRANSIENT'];
        const parsedMode = validModes.includes(parsed?.mode) ? (parsed.mode as SimulationMode) : undefined;
        const targetMode: SimulationMode = parsedMode ?? mode;
        const nextDt = typeof parsed?.dt === 'number' && Number.isFinite(parsed.dt) && parsed.dt > 0 ? parsed.dt : dt;
        const nextTEnd =
          typeof parsed?.tEnd === 'number' && Number.isFinite(parsed.tEnd) && parsed.tEnd > 0
            ? parsed.tEnd
            : tEnd;

        pushHistory(circuit);
        setCircuit(nextCircuit);
        setActivePresetId('custom');
        if (parsedMode) setMode(parsedMode);
        setDt(nextDt);
        setTEnd(nextTEnd);
        setImportError(null);
        setSelectedElementId(null);
        setSelectedWireId(null);
        setFitTrigger((n) => n + 1);
        const res = runSimulation(nextCircuit, targetMode, { dt: nextDt, tEnd: nextTEnd });
        setSimulationResult(res);
        if (targetMode === 'TRANSIENT' && res.success) {
          setInspectorTab('PLOT');
        } else if (inspectorTab === 'PLOT') {
          setInspectorTab('RESULTS');
        }
      } catch {
        setImportError('Không thể đọc tệp JSON sơ đồ mạch (định dạng hoặc phần tử không hợp lệ).');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Phím tắt: V (chọn), W (nối dây), R (xoay), Delete/Backspace (xóa), Esc (hủy), Ctrl+Z / Ctrl+Shift+Z, Ctrl+Enter (chạy)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (inInput) {
          (e.target as HTMLElement).blur();
          window.requestAnimationFrame(() => handleRunSimulation());
        } else {
          handleRunSimulation();
        }
        return;
      }

      if (inInput) return;

      if (e.key === 'Escape') {
        setPlacingType(null);
        setTool('SELECT');
      } else if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        setTool('SELECT');
        setPlacingType(null);
      } else if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) {
        setTool((prev) => (prev === 'WIRE' ? 'SELECT' : 'WIRE'));
        setPlacingType(null);
      } else if ((e.key === 'r' || e.key === 'R') && selectedElementId && !e.ctrlKey && !e.metaKey) {
        handleRotateElement(selectedElementId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId) handleDeleteElement(selectedElementId);
        else if (selectedWireId) handleDeleteWire(selectedWireId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedElementId,
    selectedWireId,
    handleRotateElement,
    handleDeleteElement,
    handleDeleteWire,
    handleUndo,
    handleRedo,
    handleRunSimulation,
  ]);

  const selectedElement = useMemo(
    () => circuit.elements.find((e) => e.id === selectedElementId) ?? null,
    [circuit.elements, selectedElementId],
  );
  const selectedWire = useMemo(
    () => circuit.wires.find((w) => w.id === selectedWireId) ?? null,
    [circuit.wires, selectedWireId],
  );

  const needsRerun = simulationResult === null && circuit.elements.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden">
      {/* Top Bar: Thương hiệu — Mạch mẫu — Nút chạy mô phỏng */}
      <header className="h-12 shrink-0 bg-white border-b border-slate-200/90 px-4 flex items-center justify-between gap-4">
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
            <Zap className="w-4 h-4 fill-current" />
          </span>
          <span>MạchĐiệnLab</span>
        </a>

        <nav
          aria-label="Mạch mẫu tích hợp"
          className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70 overflow-x-auto max-w-full"
        >
          {CIRCUIT_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadPreset(preset)}
                title={`${preset.title} — ${preset.subtitle}`}
                className={`whitespace-nowrap shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {preset.shortTitle}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleClearCanvas}
            className={`whitespace-nowrap shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              activePresetId === 'empty'
                ? 'bg-white text-rose-700 shadow-2xs ring-1 ring-rose-200 font-semibold'
                : 'text-slate-600 hover:text-rose-700 hover:bg-white/50'
            }`}
          >
            Mạch trống
          </button>
        </nav>

        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleRunSimulation()}
            title="Chạy mô phỏng (Ctrl+Enter)"
            className="relative inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:scale-[0.99] transition-all shadow-2xs whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Chạy mô phỏng</span>
            {needsRerun && (
              <span
                className="w-2 h-2 rounded-full bg-amber-300 ring-2 ring-blue-600"
                title="Mạch vừa thay đổi, nhấn để cập nhật kết quả"
              />
            )}
          </button>
        </div>
      </header>

      {/* Workspace Toolbar: Bố cục gọn — Chế độ phân tích — Công cụ vẽ & Tệp */}
      <div className="h-11 shrink-0 bg-white/80 backdrop-blur-sm border-b border-slate-200/80 px-3 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            aria-label={showPalette ? 'Thu gọn thư viện phần tử' : 'Mở thư viện phần tử'}
            title={showPalette ? 'Ẩn thư viện bên trái' : 'Hiện thư viện bên trái'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            {showPalette ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <div className="w-px h-4 bg-slate-200" />

          {/* Chọn chế độ mô phỏng */}
          <div className="flex items-center gap-0.5 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/70">
            {(
              [
                { id: 'DC', label: 'Một chiều (DC)' },
                { id: 'DC_SS', label: 'Xác lập DC' },
                { id: 'AC', label: 'Xoay chiều (AC)' },
                { id: 'TRANSIENT', label: 'Quá độ' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  const res = runSimulation(circuit, m.id, { dt, tEnd });
                  setSimulationResult(res);
                  setShowInspector(true);
                  if (m.id === 'TRANSIENT' && res.success) setInspectorTab('PLOT');
                  else setInspectorTab('RESULTS');
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  mode === m.id
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'TRANSIENT' && (
            <div className="flex items-center gap-2 pl-1 text-[11px] font-mono tabular-nums">
              <label className="flex items-center gap-1 text-slate-600">
                <span>Δt:</span>
                <DraftNumInput
                  ariaLabel="Bước thời gian Δt"
                  value={dt}
                  min={1e-6}
                  onChange={(v) => setDt(v)}
                  className="w-20 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:border-blue-500"
                />
                <span>s</span>
              </label>
              <label className="flex items-center gap-1 text-slate-600">
                <span>T_end:</span>
                <DraftNumInput
                  ariaLabel="Thời gian kết thúc T_end"
                  value={tEnd}
                  min={1e-4}
                  onChange={(v) => setTEnd(v)}
                  className="w-16 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:border-blue-500"
                />
                <span>s</span>
              </label>
            </div>
          )}
        </div>

        {/* Công cụ chỉnh sửa & JSON */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-0.5 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setTool('SELECT');
                setPlacingType(null);
              }}
              title="Chọn & Di chuyển (Phím V)"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'SELECT' && !placingType
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Chọn</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTool('WIRE');
                setPlacingType(null);
              }}
              title="Vẽ dây dẫn trực giao (Phím W)"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'WIRE'
                  ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cable className="w-3.5 h-3.5" />
              <span>Nối dây</span>
            </button>
          </div>

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            disabled={!selectedElementId}
            onClick={() => selectedElementId && handleRotateElement(selectedElementId)}
            aria-label="Xoay phần tử đang chọn"
            title="Xoay 90° (R)"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!selectedElementId && !selectedWireId}
            onClick={() => {
              if (selectedElementId) handleDeleteElement(selectedElementId);
              else if (selectedWireId) handleDeleteWire(selectedWireId);
            }}
            aria-label="Xóa đối tượng đang chọn"
            title="Xóa (Delete)"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            disabled={historyPast.length === 0}
            onClick={handleUndo}
            aria-label="Hoàn tác"
            title="Hoàn tác (Ctrl+Z)"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={historyFuture.length === 0}
            onClick={handleRedo}
            aria-label="Làm lại"
            title="Làm lại (Ctrl+Shift+Z)"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất JSON</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Nhập JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => setShowInspector((v) => !v)}
            aria-label={showInspector ? 'Thu gọn thanh thông số và kết quả' : 'Mở thanh thông số và kết quả'}
            title={showInspector ? 'Ẩn bảng bên phải' : 'Hiện bảng bên phải'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            {showInspector ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {importError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-1.5 text-xs text-rose-800 flex items-center justify-between">
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="font-medium underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main 3-Column Split Workbench */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {showPalette && (
          <PaletteSidebar
            placingType={placingType}
            onSelectPlaceType={(t) => {
              setPlacingType(t);
              if (t) setTool('SELECT');
            }}
          />
        )}

        <SchematicCanvas
          elements={circuit.elements}
          wires={circuit.wires}
          netlist={netlist}
          selectedElementId={selectedElementId}
          selectedWireId={selectedWireId}
          tool={tool}
          placingType={placingType}
          simulationResult={simulationResult}
          fitTrigger={fitTrigger}
          onSelectElement={(id) => {
            setSelectedElementId(id);
            if (id) {
              setShowInspector(true);
              setInspectorTab('PROPS');
            }
          }}
          onSelectWire={setSelectedWireId}
          onPlaceComponent={handlePlaceComponent}
          onBeginDragElement={() => pushHistory(circuit)}
          onMoveElement={handleMoveElement}
          onRotateElement={handleRotateElement}
          onDeleteElement={handleDeleteElement}
          onDeleteWire={handleDeleteWire}
          onAddWire={handleAddWire}
          onCancelPlace={() => setPlacingType(null)}
        />

        {showInspector && (
          <InspectorPanel
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            circuit={circuit}
            allNodeIds={netlist.allNodeIds}
            selectedElement={selectedElement}
            selectedWire={selectedWire}
            simulationResult={simulationResult}
            onSelectElement={(id) => {
              setSelectedElementId(id);
              setSelectedWireId(null);
            }}
            onUpdateElement={handleUpdateElement}
            onRotateElement={handleRotateElement}
            onDeleteElement={handleDeleteElement}
            onDeleteWire={handleDeleteWire}
            onRunTransientNow={() => handleRunSimulation('TRANSIENT')}
          />
        )}
      </main>
    </div>
  );
}
