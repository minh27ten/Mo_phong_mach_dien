import { CircuitElement, DiagnosticMessage, Wire, WirePoint } from '../types/circuit';
import { getElementWorldPins, WorldPin } from './pins';

export interface NetlistGraph {
  nodeMap: Record<string, string>; // "elId:pinId" -> nodeId ("0", "1", ...)
  allNodeIds: string[]; // sorted ["0", "1", ...]
  pinToNode: Map<string, string>;
  wireNodeIds: Map<string, string>; // wireId -> nodeId
  pointToNode: Map<string, string>; // "x,y" -> nodeId (for rendering node labels on canvas)
  junctionPoints: WirePoint[]; // T-junctions & 3+ connections for visual dots
  autoGroundUsed: boolean;
  diagnostics: DiagnosticMessage[];
}

function pointOnSegment(p: WirePoint, a: WirePoint, b: WirePoint, tol = 0.75): boolean {
  const minX = Math.min(a.x, b.x) - tol;
  const maxX = Math.max(a.x, b.x) + tol;
  const minY = Math.min(a.y, b.y) - tol;
  const maxY = Math.max(a.y, b.y) + tol;
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < tol) return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
  const dot = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
  if (dot < -tol / len || dot > 1 + tol / len) return false;
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  return cross <= tol;
}

class DSU {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

export function buildNetlist(elements: CircuitElement[], wires: Wire[]): NetlistGraph {
  const diagnostics: DiagnosticMessage[] = [];
  const elementById = new Map<string, CircuitElement>();
  const allPins: WorldPin[] = [];
  for (const el of elements) {
    elementById.set(el.id, el);
    allPins.push(...getElementWorldPins(el));
  }

  // Collect entities to union:
  // 0 .. allPins.length - 1: component pins
  // allPins.length .. allPins.length + wireSegments.length - 1: wire segments (each wire is connected across its polyline)
  const wireStartIdx = allPins.length;
  const dsu = new DSU(allPins.length + wires.length);

  // 1. Pins at identical coordinates merge
  const coordBuckets = new Map<string, number[]>();
  allPins.forEach((pin, idx) => {
    const k = `${pin.x},${pin.y}`;
    const arr = coordBuckets.get(k);
    if (arr) {
      arr.push(idx);
    } else {
      coordBuckets.set(k, [idx]);
    }
  });
  for (const indices of coordBuckets.values()) {
    for (let i = 1; i < indices.length; i++) {
      dsu.union(indices[0], indices[i]);
    }
  }

  // 2. Pins lying on any wire segment merge with that wire
  wires.forEach((wire, wIdx) => {
    const wNode = wireStartIdx + wIdx;
    if (wire.points.length < 2) return;
    allPins.forEach((pin, pIdx) => {
      for (let i = 0; i < wire.points.length - 1; i++) {
        if (pointOnSegment({ x: pin.x, y: pin.y }, wire.points[i], wire.points[i + 1])) {
          dsu.union(pIdx, wNode);
          break;
        }
      }
    });
  });

  // 3. Wire endpoints (and interior vertices) lying on another wire segment merge
  for (let i = 0; i < wires.length; i++) {
    const wi = wires[i];
    if (wi.points.length < 2) continue;
    for (let j = i + 1; j < wires.length; j++) {
      const wj = wires[j];
      if (wj.points.length < 2) continue;
      let connected = false;
      for (const pt of wi.points) {
        for (let s = 0; s < wj.points.length - 1; s++) {
          if (pointOnSegment(pt, wj.points[s], wj.points[s + 1])) {
            connected = true;
            break;
          }
        }
        if (connected) break;
      }
      if (!connected) {
        for (const pt of wj.points) {
          for (let s = 0; s < wi.points.length - 1; s++) {
            if (pointOnSegment(pt, wi.points[s], wi.points[s + 1])) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }
      }
      if (connected) {
        dsu.union(wireStartIdx + i, wireStartIdx + j);
      }
    }
  }

  // Determine Ground root(s)
  const gndRoots = new Set<number>();
  allPins.forEach((pin, idx) => {
    const el = elementById.get(pin.elementId);
    if (el?.type === 'GND') {
      gndRoots.add(dsu.find(idx));
    }
  });

  let autoGroundUsed = false;
  if (gndRoots.size === 0 && allPins.length > 0) {
    // Fallback: negative terminal of first independent source
    const firstSrc = elements.find(
      (e) =>
        e.type === 'V_SRC' ||
        e.type === 'I_SRC' ||
        e.type === 'THREE_PHASE_SRC' ||
        e.type === 'ONE_PORT',
    );
    if (firstSrc) {
      const isTpDelta =
        firstSrc.type === 'THREE_PHASE_SRC' && (firstSrc.tpConnection ?? 'Y') === 'DELTA';
      const negPinId =
        firstSrc.type === 'THREE_PHASE_SRC'
          ? isTpDelta
            ? 'C'
            : 'N'
          : firstSrc.type === 'ONE_PORT'
            ? '2'
            : 'n';
      const pIdx = allPins.findIndex(
        (p) => p.elementId === firstSrc.id && p.pinId === negPinId,
      );
      if (pIdx >= 0) {
        gndRoots.add(dsu.find(pIdx));
        autoGroundUsed = true;
        diagnostics.push({
          level: 'info',
          text: `Chưa có ký hiệu Đất (GND): tự động chọn ${
            isTpDelta
              ? 'pha C'
              : negPinId === 'N'
                ? 'cực trung tính N'
                : 'cực âm (-)'
          } của ${firstSrc.name} làm Nút 0.`,
        });
      }
    }
    if (gndRoots.size === 0) {
      // Last fallback: last pin of first element
      gndRoots.add(dsu.find(allPins.length - 1));
      autoGroundUsed = true;
      diagnostics.push({
        level: 'info',
        text: 'Chưa có ký hiệu Đất (GND): tự động chọn một nút tham chiếu làm Nút 0.',
      });
    }
  }

  // Assign deterministic sequential Node IDs ("0" for GND, "1", "2", ... ordered top-left to bottom-right)
  const rootGroups = new Map<number, { minY: number; minX: number }>();
  allPins.forEach((pin, idx) => {
    const r = dsu.find(idx);
    const cur = rootGroups.get(r);
    if (!cur) {
      rootGroups.set(r, { minX: pin.x, minY: pin.y });
    } else if (pin.y < cur.minY || (pin.y === cur.minY && pin.x < cur.minX)) {
      rootGroups.set(r, { minX: pin.x, minY: pin.y });
    }
  });
  wires.forEach((w, wIdx) => {
    if (w.points.length === 0) return;
    const r = dsu.find(wireStartIdx + wIdx);
    const pt = w.points[0];
    const cur = rootGroups.get(r);
    if (!cur) {
      rootGroups.set(r, { minX: pt.x, minY: pt.y });
    } else if (pt.y < cur.minY || (pt.y === cur.minY && pt.x < cur.minX)) {
      rootGroups.set(r, { minX: pt.x, minY: pt.y });
    }
  });

  const sortedRoots = Array.from(rootGroups.entries())
    .filter(([r]) => !gndRoots.has(r))
    .sort((a, b) => (a[1].minY !== b[1].minY ? a[1].minY - b[1].minY : a[1].minX - b[1].minX))
    .map(([r]) => r);

  const rootToNodeId = new Map<number, string>();
  for (const gr of gndRoots) {
    rootToNodeId.set(gr, '0');
  }
  sortedRoots.forEach((r, idx) => {
    rootToNodeId.set(r, String(idx + 1));
  });

  const nodeMap: Record<string, string> = {};
  const pinToNode = new Map<string, string>();
  const pointToNode = new Map<string, string>();

  allPins.forEach((pin, idx) => {
    const nodeId = rootToNodeId.get(dsu.find(idx)) ?? '0';
    nodeMap[pin.key] = nodeId;
    pinToNode.set(pin.key, nodeId);
    pointToNode.set(`${pin.x},${pin.y}`, nodeId);
  });

  const wireNodeIds = new Map<string, string>();
  wires.forEach((w, wIdx) => {
    const nodeId = rootToNodeId.get(dsu.find(wireStartIdx + wIdx)) ?? '0';
    wireNodeIds.set(w.id, nodeId);
    for (const pt of w.points) {
      pointToNode.set(`${pt.x},${pt.y}`, nodeId);
    }
  });

  // Compute junction dots where >=3 wire endpoints/pins/T-junctions meet
  const vertexHits = new Map<string, { pt: WirePoint; count: number }>();
  const bump = (pt: WirePoint) => {
    const k = `${pt.x},${pt.y}`;
    const cur = vertexHits.get(k);
    if (cur) cur.count++;
    else vertexHits.set(k, { pt, count: 1 });
  };
  allPins.forEach((p) => bump({ x: p.x, y: p.y }));
  wires.forEach((w) => {
    if (w.points.length >= 2) {
      bump(w.points[0]);
      bump(w.points[w.points.length - 1]);
    }
  });
  // Also check T-junctions: endpoint or pin lying strictly inside another wire segment
  const junctionPoints: WirePoint[] = [];
  const addedJunctions = new Set<string>();
  const addJunction = (pt: WirePoint) => {
    const k = `${pt.x},${pt.y}`;
    if (!addedJunctions.has(k)) {
      addedJunctions.add(k);
      junctionPoints.push(pt);
    }
  };
  for (const { pt, count } of vertexHits.values()) {
    if (count >= 3) {
      addJunction(pt);
    } else if (count >= 1) {
      // Check if pt lies strictly inside some wire segment (not its endpoint)
      for (const w of wires) {
        for (let s = 0; s < w.points.length - 1; s++) {
          const a = w.points[s];
          const b = w.points[s + 1];
          const isEnd =
            Math.hypot(pt.x - a.x, pt.y - a.y) <= 0.75 ||
            Math.hypot(pt.x - b.x, pt.y - b.y) <= 0.75;
          if (!isEnd && pointOnSegment(pt, a, b)) {
            addJunction(pt);
          }
        }
      }
    }
  }

  // Diagnostic checks: floating pins (degree 1 node)
  const nodeDegree = new Map<string, number>();
  allPins.forEach((pin) => {
    const el = elementById.get(pin.elementId);
    if (el?.type === 'GND') return;
    // Ignore optional N pin on 3-phase elements if unconnected
    if (
      (el?.type === 'THREE_PHASE_SRC' ||
        el?.type === 'THREE_PHASE_LOAD' ||
        el?.type === 'THREE_PHASE_LINE') &&
      (pin.pinId === 'N' || pin.pinId === 'N1' || pin.pinId === 'N2')
    ) {
      return;
    }
    const nid = nodeMap[pin.key];
    nodeDegree.set(nid, (nodeDegree.get(nid) ?? 0) + 1);
  });
  for (const [nid, deg] of nodeDegree.entries()) {
    if (deg === 1 && nid !== '0') {
      diagnostics.push({
        level: 'warning',
        text: `Nút ${nid} chỉ nối với 1 cực linh kiện (nút hở mạch / lơ lửng).`,
      });
    }
  }

  const allNodeIds = Array.from(new Set(['0', ...Object.values(nodeMap)])).sort(
    (a, b) => Number(a) - Number(b),
  );

  return {
    nodeMap,
    allNodeIds,
    pinToNode,
    wireNodeIds,
    pointToNode,
    junctionPoints,
    autoGroundUsed,
    diagnostics,
  };
}
