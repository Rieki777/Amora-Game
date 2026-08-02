/**
 * The radial map's layout (S20): a PURE function of the data — no DOM, no
 * randomness, no time. Determinism is the feature: a member's spatial memory
 * of "permaculture is at two o'clock" must survive every visit, so positions
 * depend only on sortOrder and index, never on render order or jitter.
 */
export interface LayoutCircle {
  id: string;
  order: number;
  memberCount: number;
  roles: Array<{ id: string; vacant: boolean }>;
  questCount: number;
}

export interface CirclePosition {
  id: string;
  x: number;
  y: number;
  r: number;
  angle: number;
  roles: Array<{ id: string; x: number; y: number; vacant: boolean }>;
  /** Quest satellites rendered; the rest collapse into a "+n more" chip. */
  questDots: Array<{ x: number; y: number }>;
  questOverflow: number;
}

export interface MapLayout {
  width: number;
  height: number;
  center: { x: number; y: number };
  circles: CirclePosition[];
}

export const CANVAS = 1000;
const ORBIT_RADIUS = 340;
const MIN_CIRCLE_R = 34;
const CIRCLE_R_K = 9;
const ROLE_ORBIT = 62;
const QUEST_ORBIT = 92;
export const QUEST_DISPLAY_CAP = 5;

// ── The nested layout (S70): circles INSIDE the village, sub-circles inside
// their parents, roles on each circle's inner edge — the sociocracy picture.
// Same discipline as layoutMap: pure, deterministic, jitter-free.

export interface NestedInput {
  id: string;
  parentId: string | null;
  order: number;
  memberCount: number;
  roles: Array<{ id: string; vacant: boolean }>;
  questCount: number;
}

export interface NestedCircle {
  id: string;
  x: number;
  y: number;
  r: number;
  depth: number;
  roles: Array<{ id: string; x: number; y: number; vacant: boolean }>;
  questDots: Array<{ x: number; y: number }>;
  questOverflow: number;
}

export interface NestedLayout {
  width: number;
  height: number;
  village: {
    x: number;
    y: number;
    r: number;
    /** Roles held at the village level (no circle): seats on the outer ring. */
    roles: Array<{ id: string; x: number; y: number; vacant: boolean }>;
  };
  circles: NestedCircle[];
}

const ROLE_DOT_R = 11;
const ROLE_RING_INSET = 20;
const PACK_GAP = 14;

/** The radius a circle needs for its own contents: name, role ring, quests. */
function ownRadius(c: NestedInput): number {
  const base = MIN_CIRCLE_R + CIRCLE_R_K * Math.log(1 + c.memberCount);
  // The role ring must hold every dot without crowding: circumference from
  // dot count, radius from circumference.
  const ringR = (c.roles.length * ROLE_DOT_R * 2.6) / (2 * Math.PI);
  return Math.max(base, ringR + ROLE_RING_INSET + 6);
}

interface PackedNode {
  input: NestedInput;
  r: number;
  /** Offset from the PARENT's center. */
  dx: number;
  dy: number;
  children: PackedNode[];
}

/**
 * Pack children inside a parent: the largest sits at the center, the rest on
 * one ring around it, spaced by their own sizes. With the handful of circles
 * a village has, the ring reads organic and stays deterministic; a physics
 * pack would jitter with every data change.
 */
function packChildren(children: PackedNode[]): number {
  if (children.length === 0) return 0;
  const sorted = [...children].sort(
    (a, b) => b.r - a.r || a.input.order - b.input.order || a.input.id.localeCompare(b.input.id),
  );
  const [biggest, ...rest] = sorted;
  biggest.dx = 0;
  biggest.dy = 0;
  if (rest.length === 0) return biggest.r;

  // Ring radius: clear the center circle, and give the ring's circumference
  // room for every satellite's diameter plus breathing space.
  const maxSat = Math.max(...rest.map((c) => c.r));
  const byDistance = biggest.r + maxSat + PACK_GAP;
  const byCircumference = (rest.reduce((s, c) => s + 2 * c.r + PACK_GAP, 0)) / (2 * Math.PI) + maxSat * 0.2;
  const ringR = Math.max(byDistance, byCircumference);

  // Arc-proportional placement: each satellite gets arc length proportional
  // to its diameter, so a big circle never overlaps its small neighbour.
  const total = rest.reduce((s, c) => s + 2 * c.r + PACK_GAP, 0);
  let arc = 0;
  for (const c of rest) {
    const mid = arc + (2 * c.r + PACK_GAP) / 2;
    const angle = -Math.PI / 2 + (2 * Math.PI * mid) / total;
    c.dx = ringR * Math.cos(angle);
    c.dy = ringR * Math.sin(angle);
    arc += 2 * c.r + PACK_GAP;
  }
  return ringR + maxSat;
}

/** Nested layout: the village encloses its circles; sub-circles nest inside.
 *  Roles with no circle are the village's own seats and sit on its ring. */
export function layoutNestedMap(
  inputs: NestedInput[],
  villageRoles: Array<{ id: string; vacant: boolean }> = [],
): NestedLayout {
  const sorted = [...inputs].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(sorted.map((c) => [c.id, c]));

  // Build the tree; an unknown or cyclic parent becomes a top-level circle
  // rather than vanishing.
  const nodeFor = new Map<string, PackedNode>();
  for (const c of sorted) nodeFor.set(c.id, { input: c, r: 0, dx: 0, dy: 0, children: [] });
  const roots: PackedNode[] = [];
  for (const c of sorted) {
    const node = nodeFor.get(c.id)!;
    const parent = c.parentId && c.parentId !== c.id ? nodeFor.get(c.parentId) : undefined;
    if (parent && byId.has(c.parentId!)) parent.children.push(node);
    else roots.push(node);
  }

  // Radii bottom-up: a parent must hold its packed children AND its own
  // role ring outside them.
  const sizeNode = (node: PackedNode): void => {
    node.children.forEach(sizeNode);
    const contentR = packChildren(node.children);
    node.r = Math.max(ownRadius(node.input), contentR + ROLE_RING_INSET + ROLE_DOT_R + 10);
  };
  roots.forEach(sizeNode);

  // The village is the root that packs every top-level circle.
  const villageContentR = packChildren(roots);
  const villageR = villageContentR + 30;
  const canvas = Math.max(CANVAS, Math.ceil((villageR + 40) * 2));
  const center = { x: canvas / 2, y: canvas / 2 };

  // Absolute positions, then the per-circle furniture.
  const out: NestedCircle[] = [];
  const place = (node: PackedNode, px: number, py: number, depth: number): void => {
    const x = px + node.dx;
    const y = py + node.dy;
    const c = node.input;
    const ringR = node.r - ROLE_RING_INSET;
    const roles = [...c.roles].sort((a, b) => Number(a.vacant) - Number(b.vacant) || a.id.localeCompare(b.id));
    const rolePositions = roles.map((role, j) => {
      const ra = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(1, roles.length);
      return { id: role.id, vacant: role.vacant, x: x + ringR * Math.cos(ra), y: y + ringR * Math.sin(ra) };
    });
    const shownQuests = Math.min(c.questCount, QUEST_DISPLAY_CAP);
    const questDots = Array.from({ length: shownQuests }, (_, j) => {
      // Along the bottom-inside arc, out of the role ring's way.
      const qa = Math.PI / 2 + ((j - (shownQuests - 1) / 2) * 0.28);
      return { x: x + (ringR - 18) * Math.cos(qa), y: y + (ringR - 18) * Math.sin(qa) };
    });
    out.push({
      id: c.id, x, y, r: node.r, depth,
      roles: rolePositions, questDots,
      questOverflow: Math.max(0, c.questCount - shownQuests),
    });
    node.children.forEach((child) => place(child, x, y, depth + 1));
  };
  roots.forEach((root) => place(root, center.x, center.y, 0));

  // Village-level seats ride the boundary ring itself, spread across the top
  // arc where no circle label competes, vacant last as everywhere else.
  const vRoles = [...villageRoles].sort(
    (a, b) => Number(a.vacant) - Number(b.vacant) || a.id.localeCompare(b.id),
  );
  const arcSpan = Math.min(Math.PI * 0.9, vRoles.length * 0.24);
  const villageSeatDots = vRoles.map((role, j) => {
    const a = -Math.PI / 2 + (vRoles.length === 1 ? 0 : arcSpan * (j / (vRoles.length - 1) - 0.5));
    return { id: role.id, vacant: role.vacant, x: center.x + villageR * Math.cos(a), y: center.y + villageR * Math.sin(a) };
  });

  return {
    width: canvas,
    height: canvas,
    village: { x: center.x, y: center.y, r: villageR, roles: villageSeatDots },
    circles: out,
  };
}

/** Deterministic radial layout. Circles sit on one orbit, first at 12 o'clock. */
export function layoutMap(circles: LayoutCircle[]): MapLayout {
  const center = { x: CANVAS / 2, y: CANVAS / 2 };
  const sorted = [...circles].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const n = Math.max(1, sorted.length);

  const positioned = sorted.map((c, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const cx = center.x + ORBIT_RADIUS * Math.cos(angle);
    const cy = center.y + ORBIT_RADIUS * Math.sin(angle);
    const r = MIN_CIRCLE_R + CIRCLE_R_K * Math.log(1 + c.memberCount);

    // Roles orbit their circle evenly, vacant seats LAST so filled seats
    // cluster at the top of the arc.
    const roles = [...c.roles].sort((a, b) => Number(a.vacant) - Number(b.vacant) || a.id.localeCompare(b.id));
    const rolePositions = roles.map((role, j) => {
      const ra = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(1, roles.length);
      return { id: role.id, vacant: role.vacant, x: cx + ROLE_ORBIT * Math.cos(ra), y: cy + ROLE_ORBIT * Math.sin(ra) };
    });

    const shownQuests = Math.min(c.questCount, QUEST_DISPLAY_CAP);
    const questDots = Array.from({ length: shownQuests }, (_, j) => {
      const qa = -Math.PI / 2 + (2 * Math.PI * (j + 0.5)) / Math.max(1, shownQuests);
      return { x: cx + QUEST_ORBIT * Math.cos(qa), y: cy + QUEST_ORBIT * Math.sin(qa) };
    });

    return {
      id: c.id,
      x: cx,
      y: cy,
      r,
      angle,
      roles: rolePositions,
      questDots,
      questOverflow: Math.max(0, c.questCount - shownQuests),
    };
  });

  return { width: CANVAS, height: CANVAS, center, circles: positioned };
}
