import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  CircuitElement,
  CircuitState,
  ComplexInput,
  ComponentType,
  SimulationMode,
  SimulationResult,
  Wire,
  WirePoint,
} from './types/circuit';
import {
  createDefaultElement,
  getElementWorldPins,
  isValidComponentType,
  normalizeRotation,
  snapToGrid,
} from './engine/pins';
import { buildNetlist } from './engine/netlist';
import { runSimulation } from './engine/mna';
import { CIRCUIT_PRESETS, CircuitPreset } from './data/presets';
import { PaletteSidebar } from './components/PaletteSidebar';
import { EditorTool, SchematicCanvas } from './components/SchematicCanvas';
import { InspectorPanel, InspectorTab } from './components/InspectorPanel';

function cloneState(s: CircuitState): CircuitState {
  return JSON.parse(JSON.stringify(s));
}

interface SavePickerWindow extends Window {
  __CIRCUITLAB_DESKTOP__?: boolean;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    name?: string;
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
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
  const [presetMenuOpen, setPresetMenuOpen] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFilename, setExportFilename] = useState<string>('mach-dien');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [presetMenuOpen]);

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
    (id: string, deltaDeg = 90) => {
      pushHistory(circuit);
      setCircuit((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? { ...el, rotation: normalizeRotation(el.rotation + deltaDeg) } : el,
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

  const handleApplyMaxPowerImpedance = (params: {
    nodeA: string;
    nodeB: string;
    freqHz: number;
    zOpt: ComplexInput;
    targetElementId?: string;
  }) => {
    pushHistory(circuit);
    const clean = (v: number) => (Math.abs(v) < 1e-11 ? 0 : Number(v.toPrecision(8)));
    const zClean: ComplexInput = { re: clean(params.zOpt.re), im: clean(params.zOpt.im) };
    const targetMode: SimulationMode = params.freqHz === 0 ? 'DC' : 'AC';
    let nextCircuit: CircuitState;
    let focusId: string;

    if (params.targetElementId) {
      focusId = params.targetElementId;
      nextCircuit = {
        ...circuit,
        elements: circuit.elements.map((el) => {
          if (el.id !== params.targetElementId) return el;
          if (el.type === 'RESISTOR' && Math.abs(zClean.im) < 1e-9) {
            return { ...el, resistance: Math.max(1e-6, zClean.re) };
          }
          return {
            ...el,
            type: 'IMPEDANCE',
            impedance: zClean,
          };
        }),
      };
    } else {
      const pointsForNode = (nid: string): WirePoint[] => {
        const pts: WirePoint[] = [];
        for (const el of circuit.elements) {
          for (const pin of getElementWorldPins(el)) {
            if (netlist.nodeMap[pin.key] === nid) pts.push({ x: pin.x, y: pin.y });
          }
        }
        for (const w of circuit.wires) {
          if (netlist.wireNodeIds.get(w.id) === nid) {
            pts.push(...w.points);
          }
        }
        return pts;
      };
      const ptsA = pointsForNode(params.nodeA);
      const ptsB = pointsForNode(params.nodeB);
      let ptA = ptsA[0] ?? { x: 200, y: 120 };
      let ptB = ptsB[0] ?? { x: 200, y: 240 };
      let bestScore = -Infinity;
      for (const a of ptsA) {
        for (const b of ptsB) {
          const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          const score = Math.max(a.x, b.x) * 2 - dist * 0.25;
          if (score > bestScore) {
            bestScore = score;
            ptA = a;
            ptB = b;
          }
        }
      }

      let cx = snapToGrid(Math.max(ptA.x, ptB.x) + 80);
      let cy = snapToGrid((ptA.y + ptB.y) / 2);
      if (Math.abs(ptA.y - ptB.y) < 40) {
        cy = snapToGrid(Math.min(ptA.y, ptB.y) + 60);
      }
      while (circuit.elements.some((e) => Math.abs(e.x - cx) < 80 && Math.abs(e.y - cy) < 80)) {
        cx += 80;
      }

      const newEl = createDefaultElement('IMPEDANCE', cx, cy, circuit.elements);
      newEl.rotation = ptA.y <= ptB.y ? 90 : 270;
      newEl.impedance = zClean;
      focusId = newEl.id;

      const pins = getElementWorldPins(newEl);
      const pin1 = pins.find((p) => p.pinId === '1')!;
      const pin2 = pins.find((p) => p.pinId === '2')!;
      const mkWire = (suffix: string, p: WirePoint, target: WirePoint): Wire => {
        const goesThroughBody = (p.y < cy && target.y > p.y) || (p.y > cy && target.y < p.y);
        const pts: WirePoint[] =
          p.x === target.x || p.y === target.y
            ? [p, target]
            : goesThroughBody
              ? [p, { x: cx - 40, y: p.y }, { x: cx - 40, y: target.y }, target]
              : [p, { x: p.x, y: target.y }, target];
        return {
          id: `w_${Date.now()}_${suffix}_${Math.random().toString(36).slice(2, 5)}`,
          points: pts,
        };
      };
      const newWires: Wire[] = [];
      if (pin1.x !== ptA.x || pin1.y !== ptA.y) {
        newWires.push(mkWire('a', { x: pin1.x, y: pin1.y }, ptA));
      }
      if (pin2.x !== ptB.x || pin2.y !== ptB.y) {
        newWires.push(mkWire('b', { x: pin2.x, y: pin2.y }, ptB));
      }

      nextCircuit = {
        elements: [...circuit.elements, newEl],
        wires: [...circuit.wires, ...newWires],
      };
    }

    setCircuit(nextCircuit);
    setMode(targetMode);
    setSelectedElementId(focusId);
    setSelectedWireId(null);
    setFitTrigger((n) => n + 1);
    const res = runSimulation(nextCircuit, targetMode, { dt, tEnd });
    setSimulationResult(res);
    setInspectorTab('RESULTS');
  };

  const defaultExportBaseName = useMemo(() => `mach-dien-${activePresetId || 'custom'}`, [activePresetId]);

  const buildExportPayload = useCallback(
    () => JSON.stringify({ version: 1, mode, dt, tEnd, circuit }, null, 2),
    [mode, dt, tEnd, circuit],
  );

  const triggerBrowserDownload = useCallback(
    (fileName: string, payload: string) => {
      const clean = fileName.trim() || defaultExportBaseName;
      const finalName = clean.toLowerCase().endsWith('.json') ? clean : `${clean}.json`;
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      a.click();
      URL.revokeObjectURL(url);
      return finalName;
    },
    [defaultExportBaseName],
  );

  const handleExportJson = useCallback(async () => {
    const payload = buildExportPayload();
    const suggestedName = `${defaultExportBaseName}.json`;
    const win = window as SavePickerWindow;

    if (win.__CIRCUITLAB_DESKTOP__) {
      triggerBrowserDownload(suggestedName, payload);
      return;
    }

    if (typeof win.showSaveFilePicker === 'function') {
      try {
        const handle = await win.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Tệp mạch điện JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(payload);
        await writable.close();
        showToast(`Đã lưu tệp ${handle.name || suggestedName}`);
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
      }
    }

    setExportFilename(defaultExportBaseName);
    setShowExportModal(true);
  }, [buildExportPayload, defaultExportBaseName, showToast, triggerBrowserDownload]);

  const handleConfirmFallbackExport = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildExportPayload();
    const savedName = triggerBrowserDownload(exportFilename, payload);
    setShowExportModal(false);
    showToast(`Đã xuất tệp ${savedName}`);
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
          (el: unknown) => {
            if (!el || typeof el !== 'object') return false;
            const c = el as CircuitElement;
            const validWf =
              c.waveform === undefined || ['DC', 'AC', 'STEP', 'MIXED'].includes(c.waveform);
            const validHarmonics =
              c.harmonics === undefined ||
              (Array.isArray(c.harmonics) &&
                c.harmonics.every(
                  (h) =>
                    Boolean(h) &&
                    typeof h === 'object' &&
                    typeof h.id === 'string' &&
                    Number.isFinite(h.freqHz) &&
                    Number.isFinite(h.amplitude) &&
                    Number.isFinite(h.phaseDeg),
                ));
            const validImpedance =
              c.impedance === undefined ||
              (Boolean(c.impedance) &&
                typeof c.impedance === 'object' &&
                Number.isFinite(c.impedance.re) &&
                Number.isFinite(c.impedance.im));
            const validMutualZ =
              c.mutualZ === undefined ||
              (Boolean(c.mutualZ) &&
                typeof c.mutualZ === 'object' &&
                Number.isFinite(c.mutualZ.re) &&
                Number.isFinite(c.mutualZ.im));
            const validMutualMode =
              c.mutualValueMode === undefined ||
              ['M_HENRY', 'Z_OHM'].includes(c.mutualValueMode);
            const validDotPins =
              (c.l1DotPin === undefined || c.l1DotPin === 1 || c.l1DotPin === 2) &&
              (c.l2DotPin === undefined || c.l2DotPin === 1 || c.l2DotPin === 2);
            return (
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              isValidComponentType(c.type) &&
              Number.isFinite(c.x) &&
              Number.isFinite(c.y) &&
              typeof c.rotation === 'number' &&
              Number.isFinite(c.rotation) &&
              validWf &&
              validHarmonics &&
              validImpedance &&
              validMutualZ &&
              validMutualMode &&
              validDotPins
            );
          },
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
          elements: (rawCircuit.elements as CircuitElement[]).map((item) => ({
            ...item,
            rotation: normalizeRotation(item.rotation),
          })),
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

  // Phím tắt: V (chọn), W (nối dây), R (xoay), Delete/Backspace (xóa), Esc (hủy), Ctrl+Z / Ctrl+Shift+Z, Ctrl+S (lưu), Ctrl+Enter (chạy)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (showExportModal) {
          setShowExportModal(false);
          return;
        }
        if (showHelpModal) {
          setShowHelpModal(false);
          return;
        }
        if (presetMenuOpen) {
          setPresetMenuOpen(false);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleExportJson();
        return;
      }

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
        handleRotateElement(selectedElementId, e.shiftKey ? 45 : 90);
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
    showExportModal,
    showHelpModal,
    presetMenuOpen,
    handleRotateElement,
    handleDeleteElement,
    handleDeleteWire,
    handleUndo,
    handleRedo,
    handleRunSimulation,
    handleExportJson,
  ]);

  const selectedElement = useMemo(
    () => circuit.elements.find((e) => e.id === selectedElementId) ?? null,
    [circuit.elements, selectedElementId],
  );
  const selectedWire = useMemo(
    () => circuit.wires.find((w) => w.id === selectedWireId) ?? null,
    [circuit.wires, selectedWireId],
  );
  const activePreset = useMemo(
    () => CIRCUIT_PRESETS.find((p) => p.id === activePresetId) ?? null,
    [activePresetId],
  );

  const needsRerun = simulationResult === null && circuit.elements.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden">
      {/* Thanh tiêu đề hợp nhất tối giản: Bố cục — Thương hiệu & Mạch mẫu — Chế độ — Tệp & Mô phỏng */}
      <header className="h-12 shrink-0 bg-white border-b border-slate-200/80 px-3 flex items-center justify-between gap-2 z-30">
        {/* Trái: Nút thu gọn thư viện, Logo & Menu Mạch mẫu */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            aria-label={showPalette ? 'Thu gọn thư viện linh kiện' : 'Mở thư viện linh kiện'}
            title={showPalette ? 'Ẩn thư viện linh kiện' : 'Hiện thư viện linh kiện'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            {showPalette ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <a
            href="#top"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <span className="w-6.5 h-6.5 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
              <Zap className="w-3.5 h-3.5 fill-current" />
            </span>
            <span className="hidden sm:inline">MạchĐiệnLab</span>
          </a>

          <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

          {/* Dropdown chọn mạch mẫu gọn gàng */}
          <div ref={presetMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setPresetMenuOpen((v) => !v)}
              aria-expanded={presetMenuOpen}
              aria-haspopup="menu"
              title="Chọn mạch mẫu hoặc tạo mạch trống"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all whitespace-nowrap ${
                presetMenuOpen
                  ? 'bg-slate-100 border-slate-300 text-slate-900'
                  : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="max-w-[130px] truncate">
                {activePreset
                  ? activePreset.shortTitle
                  : activePresetId === 'empty'
                    ? 'Mạch trống'
                    : 'Mạch tùy chỉnh'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {presetMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50"
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Mạch mẫu tích hợp
                </div>
                <div className="space-y-0.5">
                  {CIRCUIT_PRESETS.map((preset) => {
                    const isActive = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          handleLoadPreset(preset);
                          setPresetMenuOpen(false);
                        }}
                        className={`w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                          isActive ? 'bg-blue-50/90 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{preset.title}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{preset.subtitle}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {preset.recommendedMode === 'TRANSIENT' ? 'Quá độ' : preset.recommendedMode}
                          </span>
                          {isActive && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="my-1 border-t border-slate-100" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    handleClearCanvas();
                    setPresetMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activePresetId === 'empty'
                      ? 'bg-rose-50 text-rose-700'
                      : 'text-rose-600 hover:bg-rose-50/70'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Tạo mạch trống mới</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Giữa: Bộ chọn 4 chế độ mô phỏng */}
        <div
          role="group"
          aria-label="Chế độ mô phỏng"
          className="flex items-center gap-0.5 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/70 shrink-0"
        >
          {(
            [
              { id: 'DC', label: 'DC', title: 'Phân tích một chiều (DC)' },
              { id: 'DC_SS', label: 'Xác lập DC', title: 'Xác lập một chiều (C hở mạch, L ngắn mạch)' },
              { id: 'AC', label: 'AC', title: 'Xoay chiều xác lập & đa tần số (AC Phasor)' },
              { id: 'TRANSIENT', label: 'Quá độ', title: 'Phân tích quá độ miền thời gian (Backward Euler)' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.title}
              onClick={() => {
                setMode(m.id);
                const res = runSimulation(circuit, m.id, { dt, tEnd });
                setSimulationResult(res);
                setShowInspector(true);
                if (m.id === 'TRANSIENT' && res.success) setInspectorTab('PLOT');
                else setInspectorTab('RESULTS');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                mode === m.id
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Phải: Tệp JSON, Hướng dẫn nhanh, Chạy mô phỏng & Toggle bảng phải */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Mở tệp mạch điện (.json)"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Nhập</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportJson()}
            title="Lưu mạch điện thành tệp JSON (Ctrl+S)"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Xuất JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            aria-label="Hướng dẫn nhanh và phím tắt"
            title="Hướng dẫn nhanh & Phím tắt"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleRunSimulation()}
            title="Chạy mô phỏng (Ctrl+Enter)"
            className="relative inline-flex items-center gap-1.5 ml-1 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:scale-[0.99] transition-all shadow-2xs whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Chạy</span>
            {needsRerun && (
              <span
                className="w-2 h-2 rounded-full bg-amber-300 ring-2 ring-blue-600"
                title="Mạch vừa thay đổi, nhấn để cập nhật kết quả"
              />
            )}
          </button>

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

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
      </header>

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
          mode={mode}
          dt={dt}
          tEnd={tEnd}
          canUndo={historyPast.length > 0}
          canRedo={historyFuture.length > 0}
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
          onSelectTool={setTool}
          onChangeDt={setDt}
          onChangeTEnd={setTEnd}
          onUndo={handleUndo}
          onRedo={handleRedo}
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
            nodeMap={netlist.nodeMap}
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
            onApplyMaxPowerImpedance={handleApplyMaxPowerImpedance}
          />
        )}
      </main>

      {/* Hộp thoại đặt tên tệp dự phòng khi trình duyệt không hỗ trợ showSaveFilePicker */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4"
          onMouseDown={() => setShowExportModal(false)}
        >
          <form
            onSubmit={handleConfirmFallbackExport}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Lưu sơ đồ mạch (JSON)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đặt tên tệp trước khi tải về máy ({circuit.elements.length} phần tử, {circuit.wires.length} dây).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                aria-label="Đóng hộp thoại lưu tệp"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Tên tệp lưu</span>
              <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                <input
                  type="text"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={exportFilename}
                  onChange={(e) => setExportFilename(e.target.value)}
                  placeholder="mach-dien"
                  className="flex-1 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
                />
                <span className="px-3 py-2 text-xs font-mono text-slate-500 bg-slate-50 border-l border-slate-200">
                  .json
                </span>
              </div>
            </label>

            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2">
              Trình duyệt hiện tại không cấp API chọn thư mục trực tiếp (thường gặp trên Firefox, Safari hoặc mở tệp cục bộ <code className="font-mono">file://</code>). Tệp sẽ tải về thư mục mặc định hoặc theo tùy chọn hỏi vị trí lưu của trình duyệt.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Lưu tệp</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Hộp thoại Hướng dẫn nhanh & Phím tắt */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4"
          onMouseDown={() => setShowHelpModal(false)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Làm quen nhanh · MạchĐiệnLab v1.5</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thao tác thiết kế sơ đồ & mô phỏng mạch điện trực quan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                aria-label="Đóng hướng dẫn"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="font-semibold text-blue-700">1. Đặt & Xoay góc</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Kéo từ cột trái hoặc click đặt lên lưới. Nhấn <kbd className="px-1 bg-white border rounded font-mono">R</kbd> (90°), <kbd className="px-1 bg-white border rounded font-mono">Shift+R</kbd> (45°) hoặc nhập góc tùy ý.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="font-semibold text-blue-700">2. Nối dây linh hoạt</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Nhấn <kbd className="px-1 bg-white border rounded font-mono">W</kbd> hoặc click chân linh kiện. Giữ <kbd className="px-1 bg-white border rounded font-mono">Shift</kbd> để nối thẳng/chéo 45°.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1">
                <div className="font-semibold text-blue-700">3. Chạy mô phỏng</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Chọn chế độ ở thanh trên rồi bấm <strong>Chạy</strong> (<kbd className="px-1 bg-white border rounded font-mono">Ctrl+Enter</kbd>).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Phím tắt thường dùng
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {[
                  ['V / W', 'Công cụ Chọn / Nối dây'],
                  ['Space', 'Đảo góc bẻ khi nối dây'],
                  ['Shift (nối dây)', 'Nối đường thẳng / chéo 45°'],
                  ['R / Shift + R', 'Xoay phần tử 90° / +45°'],
                  ['F', 'Khớp sơ đồ vào khung nhìn'],
                  ['Del', 'Xóa phần tử hoặc dây đang chọn'],
                  ['Ctrl + Z / Y', 'Hoàn tác / Làm lại'],
                  ['Ctrl + S', 'Lưu sơ đồ ra tệp JSON'],
                  ['Ctrl + Enter', 'Chạy mô phỏng ngay'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100">
                    <span className="text-slate-600">{desc}</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 border border-slate-200 rounded text-slate-700 shrink-0">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thông báo xác nhận thao tác lưu tệp */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs px-3.5 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
