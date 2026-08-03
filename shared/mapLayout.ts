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
  /** The circle's name. The layout sizes the circle to hold it. */
  name?: string;
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
/** Rough advance width of one character as a fraction of font size. */
const CHAR_W = 0.55;
/** The size a circle name should be readable at; circles are sized to it. */
const LABEL_TARGET_FONT = 12;
const PACK_GAP = 14;
/** Clears the boundary seats and their stroke; nothing draws past this. */
const VILLAGE_PAD = ROLE_DOT_R + 12;
/** Only reached by a village with no circles yet, so it never looks broken. */
const MIN_CANVAS = 320;

/**
 * The radius a circle needs to hold its NAME inside its seat ring.
 *
 * A circle was sized by member count and seat count only, so "Intergenerational
 * Wisdom Council" was asked to fit inside a 40-unit circle. It could not, and
 * the label either ran across its neighbours or had to be shrunk past reading.
 * Sizing the circle to its name instead means every label fits, and the pack
 * spaces the circles to match.
 *
 * A word cannot be broken, so the longest one sets the floor.
 */
export function radiusForLabel(name: string): number {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const longest = Math.max(...words.map((w) => w.length));
  const needed = longest * LABEL_TARGET_FONT * CHAR_W;
  // The chord across the clear interior is about 1.8r at the widest line.
  const innerR = needed / 1.8;
  return innerR + ROLE_RING_INSET + ROLE_DOT_R;
}

/** The radius a circle needs for its own contents: name, role ring, quests. */
function ownRadius(c: NestedInput): number {
  const base = MIN_CIRCLE_R + CIRCLE_R_K * Math.log(1 + c.memberCount);
  // The role ring must hold every dot without crowding: circumference from
  // dot count, radius from circumference.
  const ringR = (c.roles.length * ROLE_DOT_R * 2.6) / (2 * Math.PI);
  return Math.max(base, ringR + ROLE_RING_INSET + 6, radiusForLabel(c.name ?? ""));
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
  // The canvas HUGS the village.
  //
  // This was `Math.max(CANVAS, …)` with CANVAS = 1000, so a village needing
  // a 340 radius still drew into a 1000-square viewBox: the picture occupied
  // under half the area and the rest was margin the browser then scaled down
  // to fit. The map looked tiny on a wide screen for no reason but padding.
  //
  // The pad clears the seats that ride ON the boundary ring, plus their
  // labels. The floor only matters for a village with nothing in it yet.
  const canvas = Math.max(MIN_CANVAS, Math.ceil((villageR + VILLAGE_PAD) * 2));
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

export interface WrappedLabel {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

const MAX_LABEL_LINES = 3;
/** Below this a label is not worth rendering, so the word gets cut instead. */
const MIN_FONT = 9;

/**
 * Fit a circle's name inside the circle.
 *
 * The map drew every name as one line at a fixed size, so a long name was
 * simply wider than the circle holding it and ran through its neighbours.
 * ("Intergenerational Wisdom Council" at 17px is about 290 units wide; the
 * circle holding it is often under 140 across.)
 *
 * Pure and deterministic, like the rest of this module: same name and radius
 * in, same lines out, so the picture never reflows between visits.
 */
export function wrapLabel(name: string, radius: number, depth: number): WrappedLabel {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const base = depth === 0 ? 17 : depth === 1 ? 14 : 12;
  // The usable chord is the CLEAR interior, inside the seat ring. Measuring
  // against the full radius let a label run out under its own seat dots.
  const usable = Math.max(24, (radius - ROLE_RING_INSET - ROLE_DOT_R) * 1.8);

  let fontSize = base;
  let lines: string[] = [];
  let maxChars = 3;
  // Shrink until the name fits in the line budget, down to a readable floor.
  //
  // The exit has to check LINE WIDTH as well as line count. A greedy wrapper
  // never splits a word, so "Intergenerational" simply became a line of its
  // own and overflowed the circle at whatever size the count happened to
  // allow. Counting lines alone let that through.
  for (; fontSize >= MIN_FONT; fontSize -= 1) {
    maxChars = Math.max(3, Math.floor(usable / (fontSize * CHAR_W)));
    lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length <= maxChars) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= MAX_LABEL_LINES && lines.every((l) => l.length <= maxChars)) break;
  }

  if (lines.length > MAX_LABEL_LINES) lines = lines.slice(0, MAX_LABEL_LINES);
  // At the floor a word can still be wider than its circle, so it is cut
  // rather than allowed to run across the neighbours.
  lines = lines.map((l) => (l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l));
  if (!lines.length) lines = [""];

  return { lines, fontSize, lineHeight: Math.round(fontSize * 1.15) };
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
