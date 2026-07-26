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
