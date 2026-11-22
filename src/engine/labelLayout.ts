import {
  CircuitElement,
  ComponentType,
  SimulationResult,
  Wire,
  WirePoint,
} from '../types/circuit';
import { NetlistGraph } from './netlist';
import {
  getLocalPins,
  hasVerticalPins,
  normalizeRotation,
  rotatePoint,
  WorldPin,
} from './pins';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OrientedRect {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  angleDeg: number;
}

interface Segment {
  a: WirePoint;
  b: WirePoint;
}

export interface ElementTextPos {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface ElementTextLayout {
  name: ElementTextPos;
  summary: ElementTextPos;
  boxes: Rect[];
}

export interface NodeBadgeLayout {
  nodeId: string;
  pt: WirePoint;
  bx: number;
  by: number;
  boxW: number;
  boxH: number;
  vText: string;
  result?: NonNullable<SimulationResult['nodes']>[number];
  leader?: { x1: number; y1: number; x2: number; y2: number };
}

export interface BranchCurrentBadgeLayout {
  relX: number;
  relY: number;
  boxW: number;
  boxH: number;
  text: string;
}

export function getLocalHighlightBox(type: ComponentType): Rect {
  if (type.startsWith('THREE_PHASE')) {
    return { x: -68, y: -76, w: 136, h: 152 };
  }
  if (type === 'TWO_PORT') {
    return { x: -68, y: -54, w: 136, h: 108 };
  }
  if (type === 'GND') {
    return { x: -24, y: -26, w: 48, h: 48 };
  }
  if (type === 'MUTUAL') {
    return { x: -34, y: -24, w: 68, h: 48 };
  }
  if (type === 'OPAMP') {
    return { x: -44, y: -40, w: 88, h: 80 };
  }
  if (
    type === 'V_SRC' ||
    type === 'I_SRC' ||
    type === 'VCVS' ||
    type === 'CCVS' ||
    type === 'VCCS' ||
    type === 'CCCS'
  ) {
    return { x: -26, y: -44, w: 52, h: 88 };
  }
  return { x: -44, y: -26, w: 88, h: 52 };
}

export function getRotatedBoxTopExtent(box: Rect, rotation: number): number {
  const corners = [
    { dx: box.x, dy: box.y },
    { dx: box.x + box.w, dy: box.y },
    { dx: box.x, dy: box.y + box.h },
    { dx: box.x + box.w, dy: box.y + box.h },
  ];
  let minY = Infinity;
  for (const c of corners) {
    const r = rotatePoint(c.dx, c.dy, rotation);
    if (r.dy < minY) minY = r.dy;
  }
  return Math.max(24, -minY);
}

function isVerticallyOrientedByDefault(type: ComponentType): boolean {
  return (
    type === 'V_SRC' ||
    type === 'I_SRC' ||
    type === 'VCVS' ||
    type === 'CCVS' ||
    type === 'VCCS' ||
    type === 'CCCS'
  );
}

function estimateTextRect(
  elX: number,
  elY: number,
  pos: ElementTextPos,
  text: string,
  fontSize: number,
): Rect {
  const w = Math.max(14, text.length * fontSize * 0.61 + 4);
  const h = fontSize + 3;
  const rx =
    pos.anchor === 'middle'
      ? elX + pos.x - w / 2
      : pos.anchor === 'end'
        ? elX + pos.x - w
        : elX + pos.x;
  const ry = elY + pos.y - fontSize * 0.85;
  return { x: rx, y: ry, w, h };
}

export function getElementTextLayout(
  el: CircuitElement,
  summaryText: string,
): ElementTextLayout | null {
  if (el.type === 'GND') return null;

  let namePos: ElementTextPos;
  let summaryPos: ElementTextPos;

  if (el.type.startsWith('THREE_PHASE') || el.type === 'TWO_PORT') {
    const isThreePhase = el.type.startsWith('THREE_PHASE');
    const halfH = isThreePhase ? 70 : 48;
    const halfW = isThreePhase ? 36 : 32;
    const corners = [
      rotatePoint(-halfW, -halfH, el.rotation),
      rotatePoint(halfW, -halfH, el.rotation),
      rotatePoint(-halfW, halfH, el.rotation),
      rotatePoint(halfW, halfH, el.rotation),
    ];
    const minY = Math.min(...corners.map((c) => c.dy));
    const maxY = Math.max(...corners.map((c) => c.dy));
    namePos = { x: 0, y: Math.round(minY) - 8, anchor: 'middle' };
    summaryPos = { x: 0, y: Math.round(maxY) + 14, anchor: 'middle' };
  } else {
    const norm = normalizeRotation(el.rotation);
    const axisDeg =
      normalizeRotation(isVerticallyOrientedByDefault(el.type) ? norm + 90 : norm) % 180;
    const isNearHorizontal = axisDeg <= 22.5 || axisDeg >= 157.5;
    const isNearVertical = axisDeg >= 67.5 && axisDeg <= 112.5;

    if (isNearVertical) {
      const offsetX = el.type === 'OPAMP' ? -34 : -24;
      namePos = { x: offsetX, y: -3, anchor: 'end' };
      summaryPos = { x: offsetX, y: 10, anchor: 'end' };
    } else if (isNearHorizontal) {
      const hasTallBody = isVerticallyOrientedByDefault(el.type);
      const topY = el.type === 'MUTUAL' ? -20 : el.type === 'OPAMP' ? -38 : hasTallBody ? -24 : -22;
      const botY = el.type === 'OPAMP' ? 40 : hasTallBody ? 28 : 24;
      namePos = { x: 0, y: topY, anchor: 'middle' };
      summaryPos = { x: 0, y: botY, anchor: 'middle' };
    } else if (axisDeg > 90) {
      // Đường chéo `/` (VD 315° hoặc 135°): đặt nhãn gọn về góc trên-trái
      namePos = { x: -20, y: -19, anchor: 'end' };
      summaryPos = { x: -20, y: -6, anchor: 'end' };
    } else {
      // Đường chéo `\` (VD 45° hoặc 225°): đặt nhãn gọn về góc trên-phải
      namePos = { x: 20, y: -19, anchor: 'start' };
      summaryPos = { x: 20, y: -6, anchor: 'start' };
    }
  }

  return {
    name: namePos,
    summary: summaryPos,
    boxes: [
      estimateTextRect(el.x, el.y, namePos, el.name, 11),
      estimateTextRect(el.x, el.y, summaryPos, summaryText, 9.5),
    ],
  };
}

export function rectsOverlap(a: Rect, b: Rect, padX = 2, padY = 2): boolean {
  return (
    a.x < b.x + b.w + padX &&
    a.x + a.w + padX > b.x &&
    a.y < b.y + b.h + padY &&
    a.y + a.h + padY > b.y
  );
}

function getBodyHalfSize(type: ComponentType): { hw: number; hh: number } {
  switch (type) {
    case 'RESISTOR':
    case 'IMPEDANCE':
    case 'ONE_PORT':
      return { hw: 24, hh: 13 };
    case 'INDUCTOR':
      return { hw: 27, hh: 12 };
    case 'CAPACITOR':
      return { hw: 10, hh: 17 };
    case 'V_SRC':
    case 'I_SRC':
      return { hw: 21, hh: 21 };
    case 'VCVS':
    case 'CCVS':
    case 'VCCS':
    case 'CCCS':
      return { hw: 22, hh: 22 };
    case 'MUTUAL':
      return { hw: 29, hh: 17 };
    case 'GND':
      return { hw: 17, hh: 17 };
    case 'OPAMP':
      return { hw: 28, hh: 34 };
    case 'TWO_PORT':
      return { hw: 35, hh: 51 };
    case 'THREE_PHASE_SRC':
    case 'THREE_PHASE_LINE':
    case 'THREE_PHASE_LOAD':
      return { hw: 37, hh: 73 };
  }
}

function rectOverlapsOriented(r: Rect, obb: OrientedRect): boolean {
  const rad = (obb.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  const rcx = r.x + r.w / 2;
  const rcy = r.y + r.h / 2;
  const rx = r.w / 2;
  const ry = r.h / 2;
  const dx = rcx - obb.cx;
  const dy = rcy - obb.cy;

  // Trục (1, 0) & (0, 1)
  const obbHalfX = obb.hw * Math.abs(c) + obb.hh * Math.abs(s);
  if (Math.abs(dx) >= rx + obbHalfX) return false;
  const obbHalfY = obb.hw * Math.abs(s) + obb.hh * Math.abs(c);
  if (Math.abs(dy) >= ry + obbHalfY) return false;

  // Trục cục bộ (u, v) của OBB
  const du = Math.abs(dx * c + dy * s);
  const rProjU = rx * Math.abs(c) + ry * Math.abs(s);
  if (du >= obb.hw + rProjU) return false;

  const dv = Math.abs(-dx * s + dy * c);
  const rProjV = rx * Math.abs(s) + ry * Math.abs(c);
  if (dv >= obb.hh + rProjV) return false;

  return true;
}

export function rectIntersectsSegment(r: Rect, a: WirePoint, b: WirePoint, pad = 3.5): boolean {
  const xMin = r.x - pad;
  const xMax = r.x + r.w + pad;
  const yMin = r.y - pad;
  const yMax = r.y + r.h + pad;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };

  return (
    clip(-dx, a.x - xMin) &&
    clip(dx, xMax - a.x) &&
    clip(-dy, a.y - yMin) &&
    clip(dy, yMax - a.y) &&
    t0 <= t1
  );
}

function pointToRectEdgeDist(pt: WirePoint, r: Rect): number {
  const cx = Math.max(r.x, Math.min(pt.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(pt.y, r.y + r.h));
  return Math.hypot(pt.x - cx, pt.y - cy);
}

function closestBorderPoint(pt: WirePoint, r: Rect): WirePoint {
  return {
    x: Math.max(r.x, Math.min(pt.x, r.x + r.w)),
    y: Math.max(r.y, Math.min(pt.y, r.y + r.h)),
  };
}

export function computeOverlayLayout(params: {
  elements: CircuitElement[];
  wires: Wire[];
  worldPins: WorldPin[];
  netlist: NetlistGraph;
  simulationResult: SimulationResult | null;
  inductorDots: Map<string, { pin1: boolean; pin2: boolean }>;
  getSummaryText: (el: CircuitElement) => string;
}): {
  textLayouts: Map<string, ElementTextLayout>;
  nodeBadges: NodeBadgeLayout[];
  branchCurrentPositions: Map<string, BranchCurrentBadgeLayout>;
} {
  const { elements, wires, worldPins, netlist, simulationResult, inductorDots, getSummaryText } = params;

  const bodyObstacles: OrientedRect[] = [];
  const dotObstacles: Rect[] = [];
  const pinObstacles: Rect[] = [];
  const textObstacles: Rect[] = [];
  const wireSegments: Segment[] = [];
  const textLayouts = new Map<string, ElementTextLayout>();

  for (const el of elements) {
    const { hw, hh } = getBodyHalfSize(el.type);
    bodyObstacles.push({ cx: el.x, cy: el.y, hw, hh, angleDeg: normalizeRotation(el.rotation) });

    // Nhãn phần tử + ký hiệu nguồn phụ thuộc (μU, rI, gU, βI)
    const tl = getElementTextLayout(el, getSummaryText(el));
    if (tl) {
      textLayouts.set(el.id, tl);
      textObstacles.push(...tl.boxes);
    }

    if (el.type === 'VCVS' || el.type === 'CCVS' || el.type === 'VCCS' || el.type === 'CCCS') {
      const rad = ((normalizeRotation(el.rotation) % 360) * Math.PI) / 180;
      const axisVertical = Math.abs(Math.cos(rad)) > 0.75;
      const tagPos = axisVertical ? { x: 26, y: 0 } : { x: 24, y: -15 };
      textObstacles.push({
        x: el.x + tagPos.x - 10,
        y: el.y + tagPos.y - 7,
        w: 20,
        h: 14,
      });
    }

    if (el.type === 'MUTUAL' && el.l1Id && el.l2Id) {
      const l1 = elements.find((e) => e.id === el.l1Id);
      const l2 = elements.find((e) => e.id === el.l2Id);
      if (l1 && l2) {
        const stacked = Math.abs(l1.x - l2.x) < 36 && Math.abs(l1.y - l2.y) >= 36;
        let p0: WirePoint;
        let p1: WirePoint;
        let p2: WirePoint;
        if (stacked) {
          const avgX = (l1.x + l2.x) / 2;
          const dir = el.x <= avgX ? -1 : 1;
          p0 = { x: l1.x + dir * 14, y: l1.y };
          p1 = { x: avgX + dir * 48, y: (l1.y + l2.y) / 2 };
          p2 = { x: l2.x + dir * 14, y: l2.y };
        } else {
          p0 = { x: l1.x, y: l1.y - 12 };
          p1 = { x: (l1.x + l2.x) / 2, y: Math.min(l1.y, l2.y) - 34 };
          p2 = { x: l2.x, y: l2.y - 12 };
        }
        let prev = p0;
        for (let k = 1; k <= 5; k++) {
          const t = k / 5;
          const mt = 1 - t;
          const cur = {
            x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
            y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
          };
          wireSegments.push({ a: prev, b: cur });
          prev = cur;
        }
      }
    }

    // Chấm cực tính hỗ cảm • (bắt buộc không bị nhãn che)
    const dots = inductorDots.get(el.id);
    if (dots && (el.type === 'INDUCTOR' || el.type === 'IMPEDANCE')) {
      const localX = el.type === 'INDUCTOR' ? 22 : 23;
      const localY = el.type === 'INDUCTOR' ? -10 : -11;
      if (dots.pin1) {
        const r = rotatePoint(-localX, localY, el.rotation);
        dotObstacles.push({ x: el.x + r.dx - 10, y: el.y + r.dy - 10, w: 20, h: 20 });
      }
      if (dots.pin2) {
        const r = rotatePoint(localX, localY, el.rotation);
        dotObstacles.push({ x: el.x + r.dx - 10, y: el.y + r.dy - 10, w: 20, h: 20 });
      }
    }

    // Chân dẫn nối từ thân phần tử ra WorldPin
    const locals = getLocalPins(el);
    for (const lp of locals) {
      const rp = rotatePoint(lp.dx, lp.dy, el.rotation);
      wireSegments.push({
        a: { x: el.x, y: el.y },
        b: { x: Math.round(el.x + rp.dx), y: Math.round(el.y + rp.dy) },
      });
    }
  }

  for (const pin of worldPins) {
    pinObstacles.push({ x: pin.x - 8, y: pin.y - 8, w: 16, h: 16 });
  }

  for (const w of wires) {
    for (let i = 0; i < w.points.length - 1; i++) {
      wireSegments.push({ a: w.points[i], b: w.points[i + 1] });
    }
  }

  const placedBadges: Rect[] = [];

  const scoreBox = (rect: Rect, anchor: WirePoint, extraDistBias = 0): number => {
    let penalty = 0;
    for (const obb of bodyObstacles) {
      if (rectOverlapsOriented(rect, obb)) penalty += 10000;
    }
    for (const dr of dotObstacles) {
      if (rectsOverlap(rect, dr, 3, 3)) penalty += 10000;
    }
    for (const pr of pinObstacles) {
      if (rectsOverlap(rect, pr, 2, 2)) penalty += 5000;
    }
    for (const pb of placedBadges) {
      if (rectsOverlap(rect, pb, 5, 4)) penalty += 5000;
    }
    for (const tr of textObstacles) {
      if (rectsOverlap(rect, tr, 3, 2)) penalty += 4000;
    }
    for (const seg of wireSegments) {
      if (rectIntersectsSegment(rect, seg.a, seg.b, 3)) penalty += 900;
    }
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dist = Math.hypot(cx - anchor.x, cy - anchor.y);
    return penalty + dist * 0.75 + extraDistBias;
  };

  // 1. Đặt nhãn dòng điện nhánh I=... trước (mỗi nhánh gắn với 1 linh kiện cố định)
  const branchCurrentPositions = new Map<string, BranchCurrentBadgeLayout>();
  if (simulationResult?.success) {
    for (const el of elements) {
      if (el.type === 'GND' || el.type === 'MUTUAL') continue;
      const branchRes = simulationResult.elements.find((b) => b.elementId === el.id);
      if (!branchRes) continue;

      const text =
        simulationResult.singleFrequencyHz != null && branchRes.currentPhasorMag !== undefined
          ? `I=${branchRes.currentPhasorMag.toFixed(2)}∠${branchRes.currentPhasorDeg?.toFixed(0)}°A`
          : `I=${branchRes.currentRms.toFixed(3)}A`;

      const boxW = Math.max(58, text.length * 5.7 + 12);
      const boxH = 16;

      const isVerticalPins = hasVerticalPins(el);
      const isThreePhase = el.type.startsWith('THREE_PHASE');
      const isTwoPort = el.type === 'TWO_PORT';
      const norm = normalizeRotation(el.rotation);
      const axisDeg = normalizeRotation(isVerticallyOrientedByDefault(el.type) ? norm + 90 : norm) % 180;
      const isDiagonal = !isThreePhase && !isTwoPort && axisDeg > 22.5 && axisDeg < 157.5 && !(axisDeg >= 67.5 && axisDeg <= 112.5);

      const candidates: Array<{ rx: number; ry: number; bias: number }> = [];
      if (isDiagonal) {
        // Ưu tiên góc đối diện nhãn phần tử
        if (axisDeg > 90) {
          candidates.push(
            { rx: 14, ry: 12, bias: 0 },
            { rx: 16, ry: -boxH / 2, bias: 6 },
            { rx: -boxW / 2, ry: 34, bias: 10 },
            { rx: -boxW - 14, ry: 14, bias: 14 },
            { rx: -boxW / 2, ry: -44 - boxH, bias: 18 },
          );
        } else {
          candidates.push(
            { rx: -boxW - 14, ry: 12, bias: 0 },
            { rx: -boxW - 16, ry: -boxH / 2, bias: 6 },
            { rx: -boxW / 2, ry: 34, bias: 10 },
            { rx: 14, ry: 14, bias: 14 },
            { rx: -boxW / 2, ry: -44 - boxH, bias: 18 },
          );
        }
      } else if (isVerticalPins && !isThreePhase && !isTwoPort) {
        candidates.push(
          { rx: 25, ry: -boxH / 2, bias: 0 },
          { rx: 26, ry: 16, bias: 6 },
          { rx: 26, ry: -16 - boxH, bias: 8 },
          { rx: -25 - boxW, ry: 18, bias: 12 },
          { rx: -25 - boxW, ry: -20 - boxH, bias: 14 },
          { rx: 38, ry: -boxH / 2, bias: 18 },
          { rx: -boxW / 2, ry: 48, bias: 24 },
          { rx: -boxW / 2, ry: -48 - boxH, bias: 26 },
        );
      } else {
        const hasTallBody = isVerticallyOrientedByDefault(el.type);
        const belowY = isThreePhase ? 92 : isTwoPort ? 68 : el.type === 'OPAMP' ? 48 : hasTallBody ? 35 : 31;
        const aboveY = isThreePhase ? -104 - boxH : isTwoPort ? -76 - boxH : el.type === 'OPAMP' ? -52 - boxH : hasTallBody ? -40 - boxH : -38 - boxH;
        candidates.push(
          { rx: -boxW / 2, ry: belowY, bias: 0 },
          { rx: -boxW / 2, ry: aboveY, bias: 6 },
          { rx: -boxW / 2, ry: belowY + 18, bias: 12 },
          { rx: -boxW / 2, ry: aboveY - 18, bias: 14 },
          { rx: 46, ry: -boxH / 2, bias: 16 },
          { rx: -46 - boxW, ry: -boxH / 2, bias: 18 },
          { rx: 22, ry: belowY, bias: 20 },
          { rx: -22 - boxW, ry: belowY, bias: 20 },
        );
      }

      let best = candidates[0];
      let bestScore = Infinity;
      const elCenter = { x: el.x, y: el.y };
      for (const c of candidates) {
        const s = scoreBox(
          { x: el.x + c.rx, y: el.y + c.ry, w: boxW, h: boxH },
          elCenter,
          c.bias,
        );
        if (s < bestScore) {
          bestScore = s;
          best = c;
        }
      }

      placedBadges.push({
        x: el.x + best.rx,
        y: el.y + best.ry,
        w: boxW,
        h: boxH,
      });
      branchCurrentPositions.set(el.id, {
        relX: best.rx,
        relY: best.ry,
        boxW,
        boxH,
        text,
      });
    }
  }

  // 2. Gom toàn bộ điểm neo (chân linh kiện + đỉnh/trung điểm dây + ngã ba) của từng nút (nodeId !== '0')
  const anchorsByNode = new Map<string, Array<WirePoint & { kindBias: number }>>();
  const addAnchor = (nid: string | undefined, pt: WirePoint, kindBias: number) => {
    if (!nid || nid === '0') return;
    let arr = anchorsByNode.get(nid);
    if (!arr) {
      arr = [];
      anchorsByNode.set(nid, arr);
    }
    if (!arr.some((a) => Math.hypot(a.x - pt.x, a.y - pt.y) < 5)) {
      arr.push({ x: pt.x, y: pt.y, kindBias });
    }
  };

  for (const pin of worldPins) {
    addAnchor(netlist.nodeMap[pin.key], { x: pin.x, y: pin.y }, 0);
  }
  for (const jp of netlist.junctionPoints) {
    const nid = netlist.pointToNode.get(`${jp.x},${jp.y}`);
    addAnchor(nid, jp, 1);
  }
  for (const w of wires) {
    const nid = netlist.wireNodeIds.get(w.id);
    if (!nid || nid === '0') continue;
    for (let i = 0; i < w.points.length; i++) {
      addAnchor(nid, w.points[i], 3);
      if (i < w.points.length - 1) {
        const a = w.points[i];
        const b = w.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 36) {
          addAnchor(nid, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 4);
        }
      }
    }
  }

  const nodeBadges: NodeBadgeLayout[] = Array.from(anchorsByNode.entries()).map(([nodeId, anchors]) => {
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

    let bestBx = anchors[0].x + 8;
    let bestBy = anchors[0].y - 24;
    let bestAnchor: WirePoint = anchors[0];
    let bestScore = Infinity;

    const offsetsForAnchor = (pt: WirePoint, gap: number): Array<{ x: number; y: number }> => [
      { x: pt.x + gap, y: pt.y - boxH - gap + 2 },
      { x: pt.x - boxW - gap, y: pt.y - boxH - gap + 2 },
      { x: pt.x - boxW / 2, y: pt.y - boxH - gap },
      { x: pt.x + gap, y: pt.y + gap - 2 },
      { x: pt.x - boxW - gap, y: pt.y + gap - 2 },
      { x: pt.x - boxW / 2, y: pt.y + gap },
      { x: pt.x + gap + 2, y: pt.y - boxH / 2 },
      { x: pt.x - boxW - gap - 2, y: pt.y - boxH / 2 },
    ];

    for (const anchor of anchors) {
      for (const gap of [10, 20, 32, 46]) {
        for (const c of offsetsForAnchor(anchor, gap)) {
          const s = scoreBox(
            { x: c.x, y: c.y, w: boxW, h: boxH },
            anchor,
            anchor.kindBias,
          );
          if (s < bestScore) {
            bestScore = s;
            bestBx = c.x;
            bestBy = c.y;
            bestAnchor = anchor;
          }
        }
      }
    }

    if (bestScore >= 500) {
      for (const anchor of anchors) {
        if (anchor.kindBias > 2) continue;
        for (const radius of [56, 76, 98]) {
          for (let aIdx = 0; aIdx < 16; aIdx++) {
            const rad = (aIdx * Math.PI) / 8;
            const cx = anchor.x + Math.cos(rad) * radius - boxW / 2;
            const cy = anchor.y + Math.sin(rad) * radius - boxH / 2;
            const s = scoreBox({ x: cx, y: cy, w: boxW, h: boxH }, anchor, anchor.kindBias);
            if (s < bestScore) {
              bestScore = s;
              bestBx = cx;
              bestBy = cy;
              bestAnchor = anchor;
            }
          }
        }
      }
    }

    const chosenRect: Rect = { x: bestBx, y: bestBy, w: boxW, h: boxH };
    placedBadges.push(chosenRect);

    const edgeDist = pointToRectEdgeDist(bestAnchor, chosenRect);
    let leader: { x1: number; y1: number; x2: number; y2: number } | undefined;
    if (edgeDist > 13) {
      const target = closestBorderPoint(bestAnchor, chosenRect);
      leader = { x1: bestAnchor.x, y1: bestAnchor.y, x2: target.x, y2: target.y };
    }

    return {
      nodeId,
      pt: bestAnchor,
      bx: bestBx,
      by: bestBy,
      boxW,
      boxH,
      vText,
      result: nRes,
      leader,
    };
  });

  return { textLayouts, nodeBadges, branchCurrentPositions };
}
