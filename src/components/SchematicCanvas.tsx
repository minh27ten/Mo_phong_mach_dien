import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  Maximize2,
  Minus,
  MousePointer,
  Plus,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  CircuitElement,
  ComponentType,
  SimulationMode,
  SimulationResult,
  Wire,
  WirePoint,
} from '../types/circuit';
import {
  getElementWorldPins,
  getMutualDotPins,
  GRID_SIZE,
  normalizeRotation,
  snapToGrid,
  WorldPin,
} from '../engine/pins';
import {
  computeOverlayLayout,
  getLocalHighlightBox,
  getRotatedBoxTopExtent,
} from '../engine/labelLayout';
import { buildNetlist, NetlistGraph } from '../engine/netlist';
import { ComponentSymbol, getElementSummaryText } from './ComponentSymbol';
import { DraftNumInput } from './DraftNumInput';

export type EditorTool = 'SELECT' | 'WIRE_ORTHO' | 'WIRE_DIAG';

interface SchematicCanvasProps {
  elements: CircuitElement[];
  wires: Wire[];
  netlist?: NetlistGraph;
  selectedElementId: string | null;
  selectedWireId: string | null;
  tool: EditorTool;
  placingType: ComponentType | null;
  mode: SimulationMode;
  dt: number;
  tEnd: number;
  canUndo: boolean;
  canRedo: boolean;
  simulationResult: SimulationResult | null;
  fitTrigger?: number;
  onSelectElement: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onSelectTool: (tool: EditorTool) => void;
  onChangeDt: (val: number) => void;
  onChangeTEnd: (val: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPlaceComponent: (type: ComponentType, x: number, y: number) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onBeginDragElement: () => void;
  onRotateElement?: (id: string, deltaDeg?: number) => void;
  onDeleteElement?: (id: string) => void;
  onDeleteWire?: (id: string) => void;
  onAddWire: (points: WirePoint[]) => void;
  onCancelPlace: () => void;
}

function buildWirePath(
  a: WirePoint,
  b: WirePoint,
  horizontalFirst: boolean,
  direct: boolean,
): WirePoint[] {
  if (a.x === b.x && a.y === b.y) return [a];
  if (direct || a.x === b.x || a.y === b.y) return [a, b];
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [a, corner, b];
}

function simplifyPolyline(pts: WirePoint[]): WirePoint[] {
  if (pts.length <= 2) return pts;
  const out: WirePoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2) / Math.max(len1, len2);
    const sameDir = dx1 * dx2 + dy1 * dy2 >= 0;
    if (!(cross <= 1e-4 && sameDir)) {
      out.push(curr);
    }
  }
  const last = pts[pts.length - 1];
  const prev = out[out.length - 1];
  if (prev.x !== last.x || prev.y !== last.y) {
    out.push(last);
  }
  return out;
}

function pointTouchesWire(pt: WirePoint, wires: Wire[], tol = 0.75): boolean {
  return wires.some((w) =>
    w.points.some((a, idx) => {
      if (idx === w.points.length - 1) return false;
      const b = w.points[idx + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      if (lenSq < 1e-6) return Math.hypot(pt.x - a.x, pt.y - a.y) <= tol;
      const t = Math.max(0, Math.min(1, ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / lenSq));
      return Math.hypot(pt.x - (a.x + t * abx), pt.y - (a.y + t * aby)) <= tol;
    }),
  );
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  elements,
  wires,
  netlist: netlistProp,
  selectedElementId,
  selectedWireId,
  tool,
  placingType,
  mode,
  dt,
  tEnd,
  canUndo,
  canRedo,
  simulationResult,
  fitTrigger = 0,
  onSelectElement,
  onSelectWire,
  onSelectTool,
  onChangeDt,
  onChangeTEnd,
  onUndo,
  onRedo,
  onPlaceComponent,
  onMoveElement,
  onBeginDragElement,
  onRotateElement,
  onDeleteElement,
  onDeleteWire,
  onAddWire,
  onCancelPlace,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [showOverlays, setShowOverlays] = useState(true);

  const viewRef = useRef({ zoom: 1, pan: { x: 80, y: 60 } });
  viewRef.current = { zoom, pan };

  const [cursorWorld, setCursorWorld] = useState<WirePoint>({ x: 0, y: 0 });
  const [wireDraft, setWireDraft] = useState<WirePoint[] | null>(null);
  const [draftDirectOverride, setDraftDirectOverride] = useState<boolean | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [horizontalFirst, setHorizontalFirst] = useState(true);
  const [manualBendLock, setManualBendLock] = useState(false);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  const dragStateRef = useRef<{
    kind: 'PAN' | 'ELEMENT' | null;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    elementId?: string;
    elemStartX?: number;
    elemStartY?: number;
    lastMovedX?: number;
    lastMovedY?: number;
    moved?: boolean;
  }>({ kind: null, startClientX: 0, startClientY: 0, startPanX: 0, startPanY: 0 });

  const netlist = useMemo(
    () => netlistProp ?? buildNetlist(elements, wires),
    [netlistProp, elements, wires],
  );

  const { pinsByElementId, worldPins } = useMemo(() => {
    const map = new Map<string, WorldPin[]>();
    const flat: WorldPin[] = [];
    for (const el of elements) {
      const pins = getElementWorldPins(el);
      map.set(el.id, pins);
      flat.push(...pins);
    }
    return { pinsByElementId: map, worldPins: flat };
  }, [elements]);

  // Hỗ cảm: xác định cuộn dây / tổng trở Z nào có chấm cực tính •
  const inductorDots = useMemo(() => {
    const map = new Map<string, { pin1: boolean; pin2: boolean }>();
    const addDot = (id: string, pin: 1 | 2) => {
      const cur = map.get(id) ?? { pin1: false, pin2: false };
      map.set(id, {
        pin1: cur.pin1 || pin === 1,
        pin2: cur.pin2 || pin === 2,
      });
    };
    for (const el of elements) {
      if (el.type === 'MUTUAL' && el.l1Id && el.l2Id && el.l1Id !== el.l2Id) {
        const { pin1, pin2 } = getMutualDotPins(el);
        addDot(el.l1Id, pin1);
        addDot(el.l2Id, pin2);
      }
    }
    return map;
  }, [elements]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number, snap = true): WirePoint => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const wx = (clientX - rect.left - pan.x) / zoom;
      const wy = (clientY - rect.top - pan.y) / zoom;
      return snap ? { x: snapToGrid(wx), y: snapToGrid(wy) } : { x: wx, y: wy };
    },
    [pan, zoom],
  );

  const isWireTool = tool === 'WIRE_ORTHO' || tool === 'WIRE_DIAG';

  // Bắt điểm ưu tiên chân linh kiện xoay góc (off-grid), rồi đến dây dẫn và lưới 20px
  const resolveWireTarget = useCallback(
    (clientX: number, clientY: number): WirePoint => {
      const raw = clientToWorld(clientX, clientY, false);
      let bestPin: WorldPin | null = null;
      let bestPinDist = 14;
      for (const pin of worldPins) {
        const d = Math.hypot(raw.x - pin.x, raw.y - pin.y);
        if (d < bestPinDist) {
          bestPinDist = d;
          bestPin = pin;
        }
      }
      if (bestPin) return { x: bestPin.x, y: bestPin.y };

      const gridPt = { x: snapToGrid(raw.x), y: snapToGrid(raw.y) };
      if (wireDraft || isWireTool) {
        if (pointTouchesWire(gridPt, wires, 0.75) && Math.hypot(raw.x - gridPt.x, raw.y - gridPt.y) <= 12) {
          return gridPt;
        }
        let bestVertex: WirePoint | null = null;
        let bestVertexDist = 10;
        let bestWirePt: WirePoint | null = null;
        let bestWireDist = 8;
        for (const w of wires) {
          for (const vp of w.points) {
            const vd = Math.hypot(raw.x - vp.x, raw.y - vp.y);
            if (vd < bestVertexDist) {
              bestVertexDist = vd;
              bestVertex = vp;
            }
          }
          for (let i = 0; i < w.points.length - 1; i++) {
            const a = w.points[i];
            const b = w.points[i + 1];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const lenSq = abx * abx + aby * aby;
            if (lenSq < 1e-6) continue;
            const t = Math.max(0, Math.min(1, ((raw.x - a.x) * abx + (raw.y - a.y) * aby) / lenSq));
            const px = a.x + t * abx;
            const py = a.y + t * aby;
            const d = Math.hypot(raw.x - px, raw.y - py);
            if (d < bestWireDist) {
              bestWireDist = d;
              bestWirePt = { x: Math.round(px), y: Math.round(py) };
            }
          }
        }
        if (bestVertex) return { x: bestVertex.x, y: bestVertex.y };
        if (bestWirePt) return bestWirePt;
      }

      return gridPt;
    },
    [clientToWorld, worldPins, wireDraft, isWireTool, wires],
  );

  const baseDirectWire = draftDirectOverride ?? (tool === 'WIRE_DIAG');
  const useDirectWire = baseDirectWire !== shiftHeld;

  const handleFitView = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || elements.length === 0) {
      setZoom(1);
      setPan({ x: 80, y: 60 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x - 80);
      minY = Math.min(minY, el.y - 80);
      maxX = Math.max(maxX, el.x + 80);
      maxY = Math.max(maxY, el.y + 80);
    }
    for (const w of wires) {
      for (const p of w.points) {
        minX = Math.min(minX, p.x - 20);
        minY = Math.min(minY, p.y - 20);
        maxX = Math.max(maxX, p.x + 20);
        maxY = Math.max(maxY, p.y + 20);
      }
    }
    const w = Math.max(200, maxX - minX);
    const h = Math.max(200, maxY - minY);
    const nextZoom = Math.max(
      0.45,
      Math.min(1.25, Math.min((rect.width - 100) / w, (rect.height - 110) / h)),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - cx * nextZoom,
      y: rect.height / 2 - cy * nextZoom,
    });
  }, [elements, wires]);

  // Tự động căn giữa sơ đồ khi tải trang lần đầu hoặc nạp mạch mẫu
  useEffect(() => {
    const timer = window.requestAnimationFrame(() => {
      handleFitView();
    });
    return () => window.cancelAnimationFrame(timer);
    // Chỉ chạy lại theo fitTrigger (nạp mạch mẫu / khởi tạo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTrigger]);

  // Phím tắt cục bộ của Canvas: Space (đổi hướng gấp khúc dây), Shift (nối thẳng/chéo), F (khớp khung nhìn), Esc (hủy dây đang vẽ)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' && wireDraft) {
        setWireDraft(null);
        setDraftDirectOverride(null);
        setManualBendLock(false);
      } else if (e.code === 'Space' && wireDraft) {
        e.preventDefault();
        setManualBendLock(true);
        setHorizontalFirst((prev) => !prev);
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleFitView();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [wireDraft, handleFitView]);

  const finishWireAt = (targetPt: WirePoint, directOverride?: boolean) => {
    if (!wireDraft || wireDraft.length === 0) return;
    const last = wireDraft[wireDraft.length - 1];
    const direct = directOverride ?? useDirectWire;
    const seg = buildWirePath(last, targetPt, horizontalFirst, direct);
    const full = simplifyPolyline([...wireDraft, ...seg.slice(1)]);
    if (full.length >= 2) {
      onAddWire(full);
    }
    setWireDraft(null);
    setDraftDirectOverride(null);
    setManualBendLock(false);
  };

  const handlePinClick = (e: React.MouseEvent, pinPt: WirePoint, elRotation = 0) => {
    e.stopPropagation();
    if (placingType) return;
    if (!wireDraft) {
      const isAngled = Math.abs(normalizeRotation(elRotation) % 90) > 0.5;
      setDraftDirectOverride(tool === 'SELECT' && isAngled ? true : null);
      setWireDraft([pinPt]);
      setHorizontalFirst(true);
      setManualBendLock(false);
    } else {
      const direct = baseDirectWire !== e.shiftKey;
      finishWireAt(pinPt, direct);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      if (wireDraft) {
        setWireDraft(null);
        setDraftDirectOverride(null);
        setManualBendLock(false);
      } else if (placingType) {
        onCancelPlace();
      }
      return;
    }

    if (placingType) {
      const gridPt = clientToWorld(e.clientX, e.clientY, true);
      onPlaceComponent(placingType, gridPt.x, gridPt.y);
      return;
    }

    const pt = resolveWireTarget(e.clientX, e.clientY);

    if (wireDraft) {
      const last = wireDraft[wireDraft.length - 1];
      const direct = baseDirectWire !== e.shiftKey;
      const seg = buildWirePath(last, pt, horizontalFirst, direct);
      const nextPts = simplifyPolyline([...wireDraft, ...seg.slice(1)]);
      const hitPin = worldPins.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= 1.5);
      const hitWire = pointTouchesWire(pt, wires);
      if (hitPin || hitWire) {
        if (nextPts.length >= 2) onAddWire(nextPts);
        setWireDraft(null);
        setDraftDirectOverride(null);
        setManualBendLock(false);
      } else {
        setWireDraft(nextPts);
        setManualBendLock(false);
      }
      return;
    }

    if (isWireTool) {
      setDraftDirectOverride(null);
      setWireDraft([pt]);
      setManualBendLock(false);
      return;
    }

    onSelectElement(null);
    onSelectWire(null);
    dragStateRef.current = {
      kind: 'PAN',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = isWireTool || wireDraft ? resolveWireTarget(e.clientX, e.clientY) : clientToWorld(e.clientX, e.clientY, true);
    setCursorWorld(pt);

    if (wireDraft && wireDraft.length > 0 && !manualBendLock) {
      const last = wireDraft[wireDraft.length - 1];
      const dx = Math.abs(pt.x - last.x);
      const dy = Math.abs(pt.y - last.y);
      if (dx > 0 && dy > 0 && (dx < 20 || dy < 20)) {
        setHorizontalFirst(dx >= dy);
      }
    }

    const drag = dragStateRef.current;
    if (drag.kind === 'PAN') {
      setPan({
        x: drag.startPanX + (e.clientX - drag.startClientX),
        y: drag.startPanY + (e.clientY - drag.startClientY),
      });
    } else if (drag.kind === 'ELEMENT' && drag.elementId) {
      const dx = (e.clientX - drag.startClientX) / zoom;
      const dy = (e.clientY - drag.startClientY) / zoom;
      const nextX = snapToGrid((drag.elemStartX ?? 0) + dx);
      const nextY = snapToGrid((drag.elemStartY ?? 0) + dy);
      if (!drag.moved && (nextX !== drag.elemStartX || nextY !== drag.elemStartY)) {
        drag.moved = true;
        onBeginDragElement();
      }
      if (drag.moved && (nextX !== drag.lastMovedX || nextY !== drag.lastMovedY)) {
        drag.lastMovedX = nextX;
        drag.lastMovedY = nextY;
        onMoveElement(drag.elementId, nextX, nextY);
      }
    }
  };

  const handleSvgMouseUp = useCallback(() => {
    dragStateRef.current = {
      kind: null,
      startClientX: 0,
      startClientY: 0,
      startPanX: viewRef.current.pan.x,
      startPanY: viewRef.current.pan.y,
    };
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleSvgMouseUp);
    return () => window.removeEventListener('mouseup', handleSvgMouseUp);
  }, [handleSvgMouseUp]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const { zoom: curZoom, pan: curPan } = viewRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      const nextZoom = Math.max(0.35, Math.min(2.5, curZoom * factor));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setPan({
        x: mx - ((mx - curPan.x) / curZoom) * nextZoom,
        y: my - ((my - curPan.y) / curZoom) * nextZoom,
      });
      setZoom(nextZoom);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/circuit-component') as ComponentType;
    if (!type) return;
    const pt = clientToWorld(e.clientX, e.clientY, true);
    onPlaceComponent(type, pt.x, pt.y);
  };

  // Bố cục chống đè nhãn phần tử, dòng nhánh và điện áp nút
  const { textLayouts, nodeBadges, branchCurrentPositions } = useMemo(
    () =>
      computeOverlayLayout({
        elements,
        wires,
        worldPins,
        netlist,
        simulationResult,
        inductorDots,
        getSummaryText: (el) => getElementSummaryText(el, elements),
      }),
    [elements, wires, worldPins, netlist, simulationResult, inductorDots],
  );

  const previewWirePoints = useMemo(() => {
    if (!wireDraft || wireDraft.length === 0) return null;
    const last = wireDraft[wireDraft.length - 1];
    const seg = buildWirePath(last, cursorWorld, horizontalFirst, useDirectWire);
    return simplifyPolyline([...wireDraft, ...seg.slice(1)]);
  }, [wireDraft, cursorWorld, horizontalFirst, useDirectWire]);

  const cursorSnapTarget = useMemo(() => {
    if (!wireDraft && !isWireTool) return null;
    const pin = worldPins.find((p) => Math.hypot(p.x - cursorWorld.x, p.y - cursorWorld.y) <= 1.5);
    if (pin) return { kind: 'PIN' as const, x: pin.x, y: pin.y, label: pin.label };
    if (wireDraft && pointTouchesWire(cursorWorld, wires)) {
      return { kind: 'WIRE' as const, x: cursorWorld.x, y: cursorWorld.y, label: 'Nối T' };
    }
    return null;
  }, [wireDraft, isWireTool, worldPins, wires, cursorWorld]);

  const activeDiagGuide = useMemo(() => {
    if (!wireDraft || wireDraft.length === 0 || !useDirectWire) return null;
    const last = wireDraft[wireDraft.length - 1];
    const dx = cursorWorld.x - last.x;
    const dy = cursorWorld.y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) return null;
    const deg = ((Math.round((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360;
    return {
      x: (last.x + cursorWorld.x) / 2,
      y: (last.y + cursorWorld.y) / 2 - 14,
      label: `${deg}°`,
      isCardinalOr45: deg % 45 === 0,
    };
  }, [wireDraft, cursorWorld, useDirectWire]);

  const selectedElement = useMemo(
    () => (selectedElementId ? elements.find((e) => e.id === selectedElementId) ?? null : null),
    [elements, selectedElementId],
  );

  const selectedWireMid = useMemo(() => {
    if (!selectedWireId) return null;
    const w = wires.find((item) => item.id === selectedWireId);
    if (!w || w.points.length < 2) return null;
    const midIdx = Math.floor((w.points.length - 1) / 2);
    const p0 = w.points[midIdx];
    const p1 = w.points[midIdx + 1];
    return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  }, [wires, selectedWireId]);

  const activeDiagnostics = simulationResult?.diagnostics ?? netlist.diagnostics;

  return (
    <div
      className="relative flex-1 h-full bg-[#F8FAFC] overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        data-testid="schematic-canvas"
        className={`w-full h-full block ${
          placingType || isWireTool || wireDraft
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onDoubleClick={(e) => {
          if (!wireDraft || wireDraft.length === 0) return;
          e.stopPropagation();
          const pt = resolveWireTarget(e.clientX, e.clientY);
          finishWireAt(pt, baseDirectWire !== e.shiftKey);
        }}
      >
        <defs>
          <pattern
            id="circuit-grid"
            width={GRID_SIZE * zoom}
            height={GRID_SIZE * zoom}
            patternUnits="userSpaceOnUse"
            x={pan.x}
            y={pan.y}
          >
            <circle cx={1} cy={1} r={0.95} fill="#CBD5E1" fillOpacity={0.85} />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="#FFFFFF" />
        <rect width="100%" height="100%" fill="url(#circuit-grid)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Đường liên kết hỗ cảm M / Z_M */}
          {elements
            .filter((el) => el.type === 'MUTUAL' && el.l1Id && el.l2Id)
            .map((m) => {
              const l1 = elements.find((e) => e.id === m.l1Id);
              const l2 = elements.find((e) => e.id === m.l2Id);
              if (!l1 || !l2) return null;
              const isStackedVertically =
                Math.abs(l1.x - l2.x) < 36 && Math.abs(l1.y - l2.y) >= 36;
              let d: string;
              if (isStackedVertically) {
                const avgX = (l1.x + l2.x) / 2;
                const dir = m.x <= avgX ? -1 : 1;
                d = `M ${l1.x + dir * 14} ${l1.y} Q ${avgX + dir * 48} ${(l1.y + l2.y) / 2} ${l2.x + dir * 14} ${l2.y}`;
              } else {
                const mx = (l1.x + l2.x) / 2;
                const my = Math.min(l1.y, l2.y) - 34;
                d = `M ${l1.x} ${l1.y - 12} Q ${mx} ${my} ${l2.x} ${l2.y - 12}`;
              }
              return (
                <path
                  key={`arc-${m.id}`}
                  d={d}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              );
            })}

          {/* Dây dẫn */}
          {wires.map((w) => {
            const isSel = selectedWireId === w.id;
            const isHovered = hoveredWireId === w.id && !isSel && !wireDraft;
            const ptsStr = w.points.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <g
                key={w.id}
                onMouseDown={(e) => {
                  if (wireDraft) return;
                  e.stopPropagation();
                  onSelectWire(w.id);
                  onSelectElement(null);
                }}
                onMouseEnter={() => setHoveredWireId(w.id)}
                onMouseLeave={() => setHoveredWireId((prev) => (prev === w.id ? null : prev))}
                className="cursor-pointer"
              >
                <polyline
                  points={ptsStr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinejoin="round"
                  pointerEvents="stroke"
                />
                {(isSel || isHovered) && (
                  <polyline
                    points={ptsStr}
                    fill="none"
                    stroke={isSel ? '#DBEAFE' : '#E2E8F0'}
                    strokeWidth={6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                )}
                <polyline
                  points={ptsStr}
                  fill="none"
                  stroke={isSel ? '#2563EB' : '#0F172A'}
                  strokeWidth={isSel ? 2.4 : 1.85}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Xem trước dây đang vẽ */}
          {previewWirePoints && previewWirePoints.length >= 2 && (
            <>
              <polyline
                points={previewWirePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#2563EB"
                strokeWidth={2}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
              {activeDiagGuide && (
                <g transform={`translate(${activeDiagGuide.x}, ${activeDiagGuide.y})`} pointerEvents="none">
                  <rect
                    x={-17}
                    y={-9}
                    width={34}
                    height={16}
                    rx={4}
                    fill={activeDiagGuide.isCardinalOr45 ? '#1D4ED8' : '#0F172A'}
                    fillOpacity={0.92}
                  />
                  <text
                    x={0}
                    y={2}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="#FFFFFF"
                    className="font-mono tabular-nums"
                  >
                    {activeDiagGuide.label}
                  </text>
                </g>
              )}
            </>
          )}

          {/* Vòng bắt điểm trên dây / chân khi nối dây */}
          {cursorSnapTarget && (
            <g transform={`translate(${cursorSnapTarget.x}, ${cursorSnapTarget.y})`} pointerEvents="none">
              <circle
                cx={0}
                cy={0}
                r={7}
                fill={cursorSnapTarget.kind === 'PIN' ? '#DBEAFE' : '#DCFCE7'}
                fillOpacity={0.85}
                stroke={cursorSnapTarget.kind === 'PIN' ? '#2563EB' : '#16A34A'}
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Điểm nối ngã ba (Junction dots) */}
          {netlist.junctionPoints.map((jp, idx) => (
            <circle
              key={`jp-${idx}`}
              cx={jp.x}
              cy={jp.y}
              r={3.5}
              fill="#0F172A"
              pointerEvents="none"
            />
          ))}

          {/* Các phần tử mạch điện */}
          {elements.map((el) => {
            const isSel = selectedElementId === el.id;
            const isElHovered = hoveredElementId === el.id && !isSel && !placingType && !wireDraft;
            const highlightBox = getLocalHighlightBox(el.type);
            const dotInfo = inductorDots.get(el.id);
            const branchBadge = branchCurrentPositions.get(el.id);
            const textLayout = textLayouts.get(el.id);
            const pins = pinsByElementId.get(el.id) ?? [];

            return (
              <g
                key={el.id}
                transform={`translate(${el.x}, ${el.y})`}
                onMouseEnter={() => setHoveredElementId(el.id)}
                onMouseLeave={() => setHoveredElementId((prev) => (prev === el.id ? null : prev))}
                onMouseDown={(e) => {
                  if (placingType || wireDraft) return;
                  e.stopPropagation();
                  onSelectElement(el.id);
                  onSelectWire(null);
                  dragStateRef.current = {
                    kind: 'ELEMENT',
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startPanX: pan.x,
                    startPanY: pan.y,
                    elementId: el.id,
                    elemStartX: el.x,
                    elemStartY: el.y,
                    lastMovedX: el.x,
                    lastMovedY: el.y,
                    moved: false,
                  };
                }}
                className="cursor-pointer"
              >
                <g transform={`rotate(${el.rotation})`}>
                  {(isSel || isElHovered) && (
                    <rect
                      x={highlightBox.x}
                      y={highlightBox.y}
                      width={highlightBox.w}
                      height={highlightBox.h}
                      rx={8}
                      fill={isSel ? '#EFF6FF' : '#F1F5F9'}
                      fillOpacity={isSel ? 0.55 : 0.65}
                      stroke={isSel ? '#3B82F6' : '#CBD5E1'}
                      strokeWidth={isSel ? 1.3 : 1}
                      strokeDasharray={isSel ? '4 2' : undefined}
                      pointerEvents="none"
                    />
                  )}
                  <ComponentSymbol
                    type={el.type}
                    element={el}
                    selected={isSel}
                    hasDotAtPin1={dotInfo?.pin1}
                    hasDotAtPin2={dotInfo?.pin2}
                  />
                </g>

                {/* Nhãn tên và giá trị phần tử tự tránh thân & chân linh kiện */}
                {textLayout && (
                  <g pointerEvents="none">
                    <text
                      x={textLayout.name.x}
                      y={textLayout.name.y}
                      textAnchor={textLayout.name.anchor}
                      fontSize={11}
                      fontWeight={600}
                      fill={isSel ? '#1D4ED8' : '#0F172A'}
                      className="font-mono"
                    >
                      {el.name}
                    </text>
                    <text
                      x={textLayout.summary.x}
                      y={textLayout.summary.y}
                      textAnchor={textLayout.summary.anchor}
                      fontSize={9.5}
                      fill="#475569"
                      className="font-mono"
                    >
                      {getElementSummaryText(el, elements)}
                    </text>
                  </g>
                )}

                {/* Nhãn kết quả dòng nhánh động kích thước, tránh chồng lấn */}
                {showOverlays && branchBadge && (
                  <g transform={`translate(${branchBadge.relX}, ${branchBadge.relY})`} pointerEvents="none">
                    <rect
                      x={0}
                      y={0}
                      width={branchBadge.boxW}
                      height={branchBadge.boxH}
                      rx={4}
                      fill="#FFFBEB"
                      stroke="#F59E0B"
                      strokeWidth={0.85}
                    />
                    <text
                      x={branchBadge.boxW / 2}
                      y={11}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={600}
                      fill="#92400E"
                      className="font-mono tabular-nums"
                    >
                      {branchBadge.text}
                    </text>
                  </g>
                )}

                {/* Chân kết nối kèm halo và nhãn tên chân khi hover */}
                {pins.map((pin) => {
                  const isPinHovered = hoveredPinKey === pin.key;
                  const rx = pin.x - el.x;
                  const ry = pin.y - el.y;
                  return (
                    <g
                      key={pin.key}
                      transform={`translate(${rx}, ${ry})`}
                      onMouseDown={(e) => handlePinClick(e, { x: pin.x, y: pin.y }, el.rotation)}
                      onMouseEnter={() => setHoveredPinKey(pin.key)}
                      onMouseLeave={() =>
                        setHoveredPinKey((prev) => (prev === pin.key ? null : prev))
                      }
                      className="cursor-crosshair"
                    >
                      <circle cx={0} cy={0} r={10} fill="transparent" pointerEvents="all" />
                      {isPinHovered && (
                        <circle
                          cx={0}
                          cy={0}
                          r={6.5}
                          fill="#DBEAFE"
                          stroke="#2563EB"
                          strokeWidth={1.2}
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        cx={0}
                        cy={0}
                        r={isPinHovered ? 3.8 : 3.1}
                        fill={isPinHovered ? '#2563EB' : '#FFFFFF'}
                        stroke={wireDraft || isPinHovered ? '#2563EB' : '#475569'}
                        strokeWidth={1.5}
                      />
                      {isPinHovered && pin.label && (
                        <g transform="translate(8, -12)" pointerEvents="none">
                          <rect
                            x={0}
                            y={-10}
                            width={Math.max(18, pin.label.length * 6.5 + 8)}
                            height={15}
                            rx={3}
                            fill="#0F172A"
                          />
                          <text
                            x={Math.max(18, pin.label.length * 6.5 + 8) / 2}
                            y={0.5}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight={600}
                            fill="#FFFFFF"
                            className="font-mono"
                          >
                            {pin.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Nhãn nút & điện áp nút trực tiếp trên sơ đồ */}
          {showOverlays &&
            nodeBadges.map(({ nodeId, bx, by, boxW, boxH, vText, result, leader }) => (
              <g key={`nb-${nodeId}`} pointerEvents="none">
                {leader && (
                  <line
                    x1={leader.x1}
                    y1={leader.y1}
                    x2={leader.x2}
                    y2={leader.y2}
                    stroke="#94A3B8"
                    strokeWidth={0.9}
                    strokeDasharray="2.5 2.5"
                  />
                )}
                <g transform={`translate(${bx}, ${by})`}>
                  <rect
                    x={0}
                    y={0}
                    width={boxW}
                    height={boxH}
                    rx={4}
                    fill={result ? '#EFF6FF' : '#F8FAFC'}
                    stroke={result ? '#3B82F6' : '#CBD5E1'}
                    strokeWidth={0.85}
                  />
                  <text
                    x={boxW / 2}
                    y={11}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={result ? '#1E40AF' : '#475569'}
                    className="font-mono tabular-nums"
                  >
                    {vText}
                  </text>
                </g>
              </g>
            ))}

          {/* Bóng mờ phần tử đang chọn để đặt */}
          {placingType && (
            <g transform={`translate(${cursorWorld.x}, ${cursorWorld.y})`} opacity={0.65} pointerEvents="none">
              <ComponentSymbol type={placingType} selected />
            </g>
          )}
        </g>
      </svg>

      {/* Pill thao tác nhanh ngay trên phần tử / dây được chọn */}
      {!placingType && !wireDraft && selectedElement && (onRotateElement || onDeleteElement) && (() => {
        const box = getLocalHighlightBox(selectedElement.type);
        const offsetPx = getRotatedBoxTopExtent(box, selectedElement.rotation) * zoom + 12;
        const normRot = normalizeRotation(selectedElement.rotation);
        return (
          <div
            style={{
              left: `${Math.max(96, selectedElement.x * zoom + pan.x)}px`,
              top: `${Math.max(64, selectedElement.y * zoom + pan.y - offsetPx)}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute -translate-x-1/2 -translate-y-full z-20 flex items-center gap-1 px-1.5 py-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-md"
          >
            <span className="text-[11px] font-mono font-semibold text-slate-700 px-1.5">
              {selectedElement.name}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-slate-400 pr-1">
              {normRot}°
            </span>
            <div className="w-px h-3.5 bg-slate-200" />
            {onRotateElement && (
              <>
                <button
                  type="button"
                  onClick={() => onRotateElement(selectedElement.id, 45)}
                  title="Xoay +45° (Shift+R)"
                  aria-label={`Xoay ${selectedElement.name} 45 độ`}
                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded text-[11px] font-medium font-mono text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span>+45°</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRotateElement(selectedElement.id, 90)}
                  title="Xoay 90° (Phím R)"
                  aria-label={`Xoay nhanh ${selectedElement.name}`}
                  className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>90°</span>
                </button>
              </>
            )}
            {onDeleteElement && (
              <button
                type="button"
                onClick={() => onDeleteElement(selectedElement.id)}
                title="Xóa phần tử (Del)"
                aria-label={`Xóa nhanh ${selectedElement.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa</span>
              </button>
            )}
          </div>
        );
      })()}

      {!placingType && !wireDraft && !selectedElement && selectedWireMid && selectedWireId && onDeleteWire && (
        <div
          style={{
            left: `${Math.max(96, selectedWireMid.x * zoom + pan.x)}px`,
            top: `${Math.max(64, selectedWireMid.y * zoom + pan.y - 16)}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -translate-x-1/2 -translate-y-full z-20 flex items-center gap-1 px-1.5 py-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-md"
        >
          <span className="text-[11px] font-medium text-slate-600 px-1.5">Dây nối</span>
          <button
            type="button"
            onClick={() => onDeleteWire(selectedWireId)}
            aria-label="Xóa nhanh dây dẫn"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xóa dây</span>
          </button>
        </div>
      )}

      {/* Thanh công cụ vẽ nổi tối giản & thiết lập Quá độ (trên giữa khung vẽ) */}
      <div className="absolute top-3 inset-x-3 flex flex-col items-center gap-2 pointer-events-none z-20">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="pointer-events-auto flex items-center gap-0.5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-1 shadow-sm"
          >
            <button
              type="button"
              onClick={() => {
                onSelectTool('SELECT');
                onCancelPlace();
              }}
              title="Chọn & Di chuyển (V)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'SELECT' && !placingType
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Chọn</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftDirectOverride(null);
                onSelectTool('WIRE_ORTHO');
                onCancelPlace();
              }}
              title="Nối dây vuông góc 90° (W)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'WIRE_ORTHO'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12.5V4.5H12.5" />
                <circle cx="3.5" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              <span>Dây vuông</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftDirectOverride(null);
                onSelectTool('WIRE_DIAG');
                onCancelPlace();
              }}
              title="Nối dây thẳng / chéo góc bất kỳ (D)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'WIRE_DIAG'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" />
                <circle cx="3.5" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="3.5" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              <span>Dây chéo</span>
            </button>

            <div className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              disabled={!selectedElementId || !onRotateElement}
              onClick={() => selectedElementId && onRotateElement?.(selectedElementId, 45)}
              aria-label="Xoay phần tử 45 độ"
              title="Xoay +45° (Shift+R)"
              className="px-1.5 py-1 rounded-lg text-[11px] font-mono font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
            >
              +45°
            </button>
            <button
              type="button"
              disabled={!selectedElementId || !onRotateElement}
              onClick={() => selectedElementId && onRotateElement?.(selectedElementId, 90)}
              aria-label="Xoay phần tử 90 độ"
              title="Xoay 90° (R)"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={(!selectedElementId || !onDeleteElement) && (!selectedWireId || !onDeleteWire)}
              onClick={() => {
                if (selectedElementId) onDeleteElement?.(selectedElementId);
                else if (selectedWireId) onDeleteWire?.(selectedWireId);
              }}
              aria-label="Xóa đối tượng đang chọn"
              title="Xóa (Delete)"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              aria-label="Hoàn tác"
              title="Hoàn tác (Ctrl+Z)"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              aria-label="Làm lại"
              title="Làm lại (Ctrl+Shift+Z)"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {mode === 'TRANSIENT' && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex items-center gap-2.5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl px-2.5 py-1 shadow-sm text-[11px] font-mono tabular-nums"
            >
              <label className="flex items-center gap-1 text-slate-600">
                <span>Δt</span>
                <DraftNumInput
                  ariaLabel="Bước thời gian Δt"
                  value={dt}
                  min={1e-6}
                  onChange={onChangeDt}
                  className="w-18 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                />
                <span className="text-slate-400">s</span>
              </label>
              <div className="w-px h-3.5 bg-slate-200" />
              <label className="flex items-center gap-1 text-slate-600">
                <span>T_end</span>
                <DraftNumInput
                  ariaLabel="Thời gian kết thúc T_end"
                  value={tEnd}
                  min={1e-4}
                  onChange={onChangeTEnd}
                  className="w-14 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                />
                <span className="text-slate-400">s</span>
              </label>
            </div>
          )}
        </div>

        {(placingType || wireDraft || isWireTool) && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className={`bg-slate-900/90 backdrop-blur-md text-white text-[11px] px-3 py-1 rounded-full shadow-md flex items-center gap-2 ${
              placingType ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span>
              {placingType
                ? 'Nhấp vào lưới để đặt phần tử · Chuột phải hoặc Esc để hủy'
                : wireDraft
                  ? useDirectWire
                    ? 'Đang nối thẳng / chéo: Nhấp chân đích hoặc nhấp đúp · Giữ Shift: bẻ góc 90° · Esc hủy'
                    : 'Đang nối vuông 90°: Nhấp chân đích hoặc nhấp đúp · Space đổi góc · Giữ Shift: dây chéo · Esc hủy'
                  : tool === 'WIRE_DIAG'
                    ? 'Dây chéo: Nhấp điểm đầu hoặc chân linh kiện · Giữ Shift để nối vuông 90°'
                    : 'Dây vuông 90°: Nhấp điểm đầu hoặc chân linh kiện · Giữ Shift để nối chéo'}
            </span>
          </div>
        )}
      </div>

      {/* Bảng chẩn đoán mạch điện (góc dưới trái) */}
      {activeDiagnostics.length > 0 && (
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-290px)] sm:max-w-md space-y-1.5 z-10">
          {activeDiagnostics.slice(0, 3).map((d, i) => {
            const styles =
              d.level === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : d.level === 'warning'
                  ? 'bg-amber-50/95 border-amber-200 text-amber-900'
                  : 'bg-blue-50/95 border-blue-200 text-blue-900';
            const Icon = d.level === 'error' ? AlertCircle : d.level === 'warning' ? AlertTriangle : Info;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs backdrop-blur-md shadow-sm ${styles}`}
              >
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{d.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Trạng thái trống */}
      {elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl px-7 py-6 text-center max-w-sm shadow-sm space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Bản vẽ đang trống</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Kéo linh kiện từ thư viện bên trái lên lưới, nhấp chân linh kiện (hoặc phím <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">W</kbd>) để nối dây, hoặc mở <strong>Mạch mẫu</strong> ở góc trên.
            </p>
          </div>
        </div>
      )}

      {/* Bộ điều khiển Zoom & Lớp hiển thị (góc dưới phải) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-1 shadow-sm z-10">
        <button
          type="button"
          onClick={() => setShowOverlays((v) => !v)}
          title={showOverlays ? 'Ẩn nhãn nút & kết quả trên sơ đồ' : 'Hiện nhãn nút & kết quả trên sơ đồ'}
          aria-label="Bật tắt nhãn kết quả trên sơ đồ"
          className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
            showOverlays ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {showOverlays ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline whitespace-nowrap">Nhãn mạch</span>
        </button>
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.35, z / 1.15))}
          aria-label="Thu nhỏ sơ đồ"
          title="Thu nhỏ"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-mono tabular-nums text-slate-700 px-1 min-w-[44px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
          aria-label="Phóng to sơ đồ"
          title="Phóng to"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleFitView}
          aria-label="Khớp toàn bộ mạch vào khung nhìn"
          title="Khớp khung nhìn (Phím F)"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
