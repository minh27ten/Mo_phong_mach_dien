import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Cable,
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
  hasVerticalPins,
  snapToGrid,
  WorldPin,
} from '../engine/pins';
import { buildNetlist, NetlistGraph } from '../engine/netlist';
import { ComponentSymbol, getElementSummaryText } from './ComponentSymbol';
import { DraftNumInput } from './DraftNumInput';

export type EditorTool = 'SELECT' | 'WIRE';

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
  onRotateElement?: (id: string) => void;
  onDeleteElement?: (id: string) => void;
  onDeleteWire?: (id: string) => void;
  onAddWire: (points: WirePoint[]) => void;
  onCancelPlace: () => void;
}

function getElementHighlightBox(el: CircuitElement): { x: number; y: number; w: number; h: number } {
  const isVertical = hasVerticalPins(el);
  if (el.type.startsWith('THREE_PHASE')) {
    return isVertical ? { x: -76, y: -68, w: 152, h: 136 } : { x: -68, y: -76, w: 136, h: 152 };
  }
  if (el.type === 'TWO_PORT') {
    return isVertical ? { x: -54, y: -68, w: 108, h: 136 } : { x: -68, y: -54, w: 136, h: 108 };
  }
  if (el.type === 'GND') {
    return { x: -24, y: -26, w: 48, h: 48 };
  }
  if (el.type === 'MUTUAL') {
    return isVertical ? { x: -24, y: -34, w: 48, h: 68 } : { x: -34, y: -24, w: 68, h: 48 };
  }
  if (el.type === 'OPAMP') {
    return isVertical ? { x: -40, y: -44, w: 80, h: 88 } : { x: -44, y: -40, w: 88, h: 80 };
  }
  return isVertical ? { x: -26, y: -44, w: 52, h: 88 } : { x: -44, y: -26, w: 88, h: 52 };
}

function buildOrthogonalPath(a: WirePoint, b: WirePoint, horizontalFirst: boolean): WirePoint[] {
  if (a.x === b.x && a.y === b.y) return [a];
  if (a.x === b.x || a.y === b.y) return [a, b];
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
    const collinearX = prev.x === curr.x && curr.x === next.x;
    const collinearY = prev.y === curr.y && curr.y === next.y;
    const duplicate = prev.x === curr.x && prev.y === curr.y;
    if (!collinearX && !collinearY && !duplicate) {
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

function pointTouchesWire(pt: WirePoint, wires: Wire[]): boolean {
  return wires.some((w) =>
    w.points.some((wp, idx) => {
      if (idx === w.points.length - 1) return false;
      const a = wp;
      const b = w.points[idx + 1];
      return (
        pt.x >= Math.min(a.x, b.x) &&
        pt.x <= Math.max(a.x, b.x) &&
        pt.y >= Math.min(a.y, b.y) &&
        pt.y <= Math.max(a.y, b.y) &&
        (a.x === b.x ? pt.x === a.x : pt.y === a.y)
      );
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

  // Phím tắt cục bộ của Canvas: Space (đổi hướng gấp khúc dây), F (khớp khung nhìn), Esc (hủy dây đang vẽ)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' && wireDraft) {
        setWireDraft(null);
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wireDraft, handleFitView]);

  const finishWireAt = (targetPt: WirePoint) => {
    if (!wireDraft || wireDraft.length === 0) return;
    const last = wireDraft[wireDraft.length - 1];
    const seg = buildOrthogonalPath(last, targetPt, horizontalFirst);
    const full = simplifyPolyline([...wireDraft, ...seg.slice(1)]);
    if (full.length >= 2) {
      onAddWire(full);
    }
    setWireDraft(null);
    setManualBendLock(false);
  };

  const handlePinClick = (e: React.MouseEvent, pinPt: WirePoint) => {
    e.stopPropagation();
    if (placingType) return;
    if (!wireDraft) {
      setWireDraft([pinPt]);
      setHorizontalFirst(true);
      setManualBendLock(false);
    } else {
      finishWireAt(pinPt);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      if (wireDraft) {
        setWireDraft(null);
        setManualBendLock(false);
      } else if (placingType) {
        onCancelPlace();
      }
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY, true);

    if (placingType) {
      onPlaceComponent(placingType, pt.x, pt.y);
      return;
    }

    if (wireDraft) {
      const last = wireDraft[wireDraft.length - 1];
      const seg = buildOrthogonalPath(last, pt, horizontalFirst);
      const nextPts = simplifyPolyline([...wireDraft, ...seg.slice(1)]);
      const hitPin = worldPins.some((p) => p.x === pt.x && p.y === pt.y);
      const hitWire = pointTouchesWire(pt, wires);
      if (hitPin || hitWire) {
        if (nextPts.length >= 2) onAddWire(nextPts);
        setWireDraft(null);
        setManualBendLock(false);
      } else {
        setWireDraft(nextPts);
        setManualBendLock(false);
      }
      return;
    }

    if (tool === 'WIRE') {
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
    const pt = clientToWorld(e.clientX, e.clientY, true);
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

  // Tính toán hộp nhãn nút & dòng nhánh có chống chồng chéo hai lớp
  const { nodeBadges, branchCurrentPositions } = useMemo(() => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const collides = (x: number, y: number, w: number, h: number) =>
      placed.some(
        (p) => x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + p.h + 3 && y + h + 3 > p.y,
      );

    const firstPointByNode = new Map<string, WirePoint>();
    for (const pin of worldPins) {
      const nid = netlist.nodeMap[pin.key];
      if (!nid || nid === '0') continue;
      if (!firstPointByNode.has(nid)) {
        firstPointByNode.set(nid, { x: pin.x, y: pin.y });
      }
    }

    const nBadges = Array.from(firstPointByNode.entries()).map(([nodeId, pt]) => {
      const nRes = simulationResult?.success
        ? simulationResult.nodes.find((n) => n.nodeId === nodeId)
        : undefined;
      let vText = `N${nodeId}`;
      if (nRes) {
        if (simulationResult?.singleFrequencyHz != null && nRes.phasorMag !== undefined) {
          vText = `N${nodeId}: ${nRes.phasorMag.toFixed(1)}∠${nRes.phasorDeg?.toFixed(0)}°V`;
        } else {
          const val = simulationResult?.mode === 'AC' ? nRes.rms : nRes.dc;
          vText = `N${nodeId}: ${val.toFixed(2)}V`;
        }
      }
      const boxW = Math.max(28, vText.length * 5.7 + 12);
      const boxH = 16;
      const candidates = [
        { x: pt.x + 8, y: pt.y - 24 },
        { x: pt.x - boxW - 8, y: pt.y - 24 },
        { x: pt.x + 8, y: pt.y + 8 },
        { x: pt.x + 8, y: pt.y - 42 },
      ];
      let chosen = candidates[0];
      for (const c of candidates) {
        if (!collides(c.x, c.y, boxW, boxH)) {
          chosen = c;
          break;
        }
      }
      placed.push({ x: chosen.x, y: chosen.y, w: boxW, h: boxH });
      return { nodeId, pt, bx: chosen.x, by: chosen.y, boxW, boxH, vText, result: nRes };
    });

    const bMap = new Map<
      string,
      { relX: number; relY: number; boxW: number; boxH: number; text: string }
    >();

    if (simulationResult?.success) {
      for (const el of elements) {
        if (el.type === 'GND' || el.type === 'MUTUAL') continue;
        const branchRes = simulationResult.elements.find((b) => b.elementId === el.id);
        if (!branchRes) continue;

        const isVerticalPins = hasVerticalPins(el);

        const isThreePhase = el.type.startsWith('THREE_PHASE');
        const isTwoPort = el.type === 'TWO_PORT';
        const text =
          simulationResult.singleFrequencyHz != null && branchRes.currentPhasorMag !== undefined
            ? `I=${branchRes.currentPhasorMag.toFixed(2)}∠${branchRes.currentPhasorDeg?.toFixed(0)}°A`
            : `I=${branchRes.currentRms.toFixed(3)}A`;

        const boxW = Math.max(58, text.length * 5.7 + 12);
        const boxH = 16;

        const baseRelPositions =
          isVerticalPins && !isThreePhase && !isTwoPort
            ? [
                { rx: 24, ry: -boxH / 2 },
                { rx: 24, ry: 16 },
                { rx: -24 - boxW, ry: 18 },
              ]
            : [
                {
                  rx: -boxW / 2,
                  ry: (isThreePhase ? 96 : isTwoPort ? 72 : 34) - boxH / 2,
                },
                {
                  rx: -boxW / 2,
                  ry: (isThreePhase ? -102 : isTwoPort ? -82 : -46) - boxH / 2,
                },
                { rx: 46, ry: -boxH / 2 },
              ];

        let picked = baseRelPositions[0];
        for (const cand of baseRelPositions) {
          const wx = el.x + cand.rx;
          const wy = el.y + cand.ry;
          if (!collides(wx, wy, boxW, boxH)) {
            picked = cand;
            break;
          }
        }
        placed.push({
          x: el.x + picked.rx,
          y: el.y + picked.ry,
          w: boxW,
          h: boxH,
        });
        bMap.set(el.id, {
          relX: picked.rx,
          relY: picked.ry,
          boxW,
          boxH,
          text,
        });
      }
    }

    return { nodeBadges: nBadges, branchCurrentPositions: bMap };
  }, [worldPins, netlist, simulationResult, elements]);

  const previewWirePoints = useMemo(() => {
    if (!wireDraft || wireDraft.length === 0) return null;
    const last = wireDraft[wireDraft.length - 1];
    const seg = buildOrthogonalPath(last, cursorWorld, horizontalFirst);
    return simplifyPolyline([...wireDraft, ...seg.slice(1)]);
  }, [wireDraft, cursorWorld, horizontalFirst]);

  const cursorSnapTarget = useMemo(() => {
    if (!wireDraft && tool !== 'WIRE') return null;
    const pin = worldPins.find((p) => p.x === cursorWorld.x && p.y === cursorWorld.y);
    if (pin) return { kind: 'PIN' as const, x: pin.x, y: pin.y, label: pin.label };
    if (wireDraft && pointTouchesWire(cursorWorld, wires)) {
      return { kind: 'WIRE' as const, x: cursorWorld.x, y: cursorWorld.y, label: 'Nối T' };
    }
    return null;
  }, [wireDraft, tool, worldPins, wires, cursorWorld]);

  const selectedElement = useMemo(
    () => (selectedElementId ? elements.find((e) => e.id === selectedElementId) ?? null : null),
    [elements, selectedElementId],
  );

  const selectedWireMid = useMemo(() => {
    if (!selectedWireId) return null;
    const w = wires.find((item) => item.id === selectedWireId);
    if (!w || w.points.length < 2) return null;
    const p0 = w.points[0];
    const p1 = w.points[1];
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
          placingType || tool === 'WIRE' || wireDraft
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onDoubleClick={(e) => {
          if (!wireDraft || wireDraft.length === 0) return;
          e.stopPropagation();
          const pt = clientToWorld(e.clientX, e.clientY, true);
          finishWireAt(pt);
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
            const highlightBox = getElementHighlightBox(el);
            const dotInfo = inductorDots.get(el.id);
            const branchBadge = branchCurrentPositions.get(el.id);
            const pins = pinsByElementId.get(el.id) ?? [];

            const isVerticalPins = hasVerticalPins(el);

            const isThreePhase = el.type.startsWith('THREE_PHASE');
            const isTwoPort = el.type === 'TWO_PORT';

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

                <g transform={`rotate(${el.rotation})`}>
                  <ComponentSymbol
                    type={el.type}
                    element={el}
                    selected={isSel}
                    hasDotAtPin1={dotInfo?.pin1}
                    hasDotAtPin2={dotInfo?.pin2}
                  />
                </g>

                {/* Nhãn tên và giá trị phần tử bố trí tránh chân dây */}
                {el.type !== 'GND' &&
                  (isVerticalPins && !isThreePhase && !isTwoPort ? (
                    <g pointerEvents="none">
                      <text
                        x={-24}
                        y={-3}
                        textAnchor="end"
                        fontSize={11}
                        fontWeight={600}
                        fill={isSel ? '#1D4ED8' : '#0F172A'}
                        className="font-mono"
                      >
                        {el.name}
                      </text>
                      <text
                        x={-24}
                        y={10}
                        textAnchor="end"
                        fontSize={9.5}
                        fill="#475569"
                        className="font-mono"
                      >
                        {getElementSummaryText(el, elements)}
                      </text>
                    </g>
                  ) : (
                    <g pointerEvents="none">
                      <text
                        x={0}
                        y={isThreePhase ? -78 : isTwoPort ? -56 : el.type === 'MUTUAL' ? -20 : -22}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill={isSel ? '#1D4ED8' : '#0F172A'}
                        className="font-mono"
                      >
                        {el.name}
                      </text>
                      <text
                        x={0}
                        y={isThreePhase ? 84 : isTwoPort ? 62 : el.type === 'MUTUAL' ? 24 : 24}
                        textAnchor="middle"
                        fontSize={9.5}
                        fill="#475569"
                        className="font-mono"
                      >
                        {getElementSummaryText(el, elements)}
                      </text>
                    </g>
                  ))}

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
                      onMouseDown={(e) => handlePinClick(e, { x: pin.x, y: pin.y })}
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
            nodeBadges.map(({ nodeId, bx, by, boxW, boxH, vText, result }) => (
              <g key={`nb-${nodeId}`} transform={`translate(${bx}, ${by})`} pointerEvents="none">
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
        const box = getElementHighlightBox(selectedElement);
        const offsetPx = Math.abs(box.y) * zoom + 12;
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
            <div className="w-px h-3.5 bg-slate-200" />
            {onRotateElement && (
              <button
                type="button"
                onClick={() => onRotateElement(selectedElement.id)}
                title="Xoay 90° (Phím R)"
                aria-label={`Xoay nhanh ${selectedElement.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RotateCw className="w-3 h-3" />
                <span>Xoay</span>
              </button>
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
                onSelectTool('WIRE');
                onCancelPlace();
              }}
              title="Vẽ dây dẫn trực giao (W)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tool === 'WIRE'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Cable className="w-3.5 h-3.5" />
              <span>Nối dây</span>
            </button>

            <div className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              disabled={!selectedElementId || !onRotateElement}
              onClick={() => selectedElementId && onRotateElement?.(selectedElementId)}
              aria-label="Xoay phần tử đang chọn"
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

        {(placingType || wireDraft || tool === 'WIRE') && (
          <div className="bg-slate-900/95 backdrop-blur-md text-white text-xs px-3.5 py-1.5 rounded-full shadow-md flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span>
              {placingType
                ? 'Nhấp vào lưới để đặt phần tử · Chuột phải hoặc Esc để hủy'
                : wireDraft
                  ? 'Nhấp chân đích, nhấp đúp hoặc chạm dây để nối · Space đổi góc · Esc hủy'
                  : 'Chế độ nối dây: Nhấp chân linh kiện hoặc lưới để bắt đầu · Esc thoát'}
            </span>
          </div>
        )}
      </div>

      {/* Bảng chẩn đoán mạch điện (góc dưới trái) */}
      {activeDiagnostics.length > 0 && (
        <div className="absolute bottom-3 left-3 max-w-[calc(100%-220px)] sm:max-w-md space-y-1.5 z-10">
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
