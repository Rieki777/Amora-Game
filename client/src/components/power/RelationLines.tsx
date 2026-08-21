/**
 * Links on demand (0083, spec 8). Off by default, never all at once:
 *
 *   - double links draw as two short arcs between a sub-circle and its
 *     parent (leader down, delegate up: the SoFA convention);
 *   - org_relations draw as thin dashed chords, for the FOCUSED circle only;
 *   - the escalation relation draws as a thin arrow, because "if I disagree,
 *     where do I go" deserves a direction.
 *
 * Everything here connects NODES: the schema has no person endpoints, so
 * there is nothing to filter and nothing to leak.
 */
import type { PowerCircle, PowerRelation, PowerRelationType, PowerSeat } from "./types";

interface Point {
  x: number;
  y: number;
}

/** A shallow arc between two points, bowing `bend` of the distance sideways. */
function chord(a: Point, b: Point, bend: number): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return `M ${a.x} ${a.y} Q ${mx + nx * len * bend} ${my + ny * len * bend} ${b.x} ${b.y}`;
}

export default function RelationLines({
  focusId,
  relations,
  types,
  circles,
  seats,
  pointFor,
}: {
  /** Chords draw for this circle only (spec 8's discipline). */
  focusId: string | null;
  relations: PowerRelation[];
  types: PowerRelationType[];
  circles: PowerCircle[];
  seats: PowerSeat[];
  /** Where a node sits in the CURRENT layout, or null when it is not drawn. */
  pointFor: (kind: "circle" | "org_role", id: string) => Point | null;
}) {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const touching = (r: PowerRelation): boolean => {
    if (!focusId) return false;
    const seatIn = (id: string) => seats.find((s) => s.id === id)?.circleId === focusId;
    return (
      (r.fromKind === "circle" && r.fromId === focusId) ||
      (r.toKind === "circle" && r.toId === focusId) ||
      (r.fromKind === "org_role" && seatIn(r.fromId)) ||
      (r.toKind === "org_role" && seatIn(r.toId))
    );
  };

  const drawn = relations.filter(touching);

  // Double links (SoFA): a focused circle with a parent shows the two short
  // arcs, leader down and delegate up, between the two rings.
  const focus = focusId ? circles.find((c) => c.id === focusId) : null;
  const parent = focus?.parentCircleId ? circles.find((c) => c.id === focus.parentCircleId) : null;
  const focusPt = focus ? pointFor("circle", focus.id) : null;
  const parentPt = parent ? pointFor("circle", parent.id) : null;

  return (
    <g aria-hidden="true" data-lines>
      {focusPt && parentPt && (
        <>
          <path d={chord(parentPt, focusPt, 0.12)} fill="none" stroke="var(--color-teal-deep)" strokeWidth={1.6} opacity={0.7} markerEnd="url(#power-arrow)" />
          <path d={chord(focusPt, parentPt, 0.12)} fill="none" stroke="var(--color-sage)" strokeWidth={1.6} opacity={0.7} markerEnd="url(#power-arrow)" />
        </>
      )}
      {drawn.map((r) => {
        const t = typeById.get(r.typeId);
        if (!t) return null;
        const a = pointFor(r.fromKind, r.fromId);
        const b = pointFor(r.toKind, r.toId);
        if (!a || !b) return null;
        const escalation = r.typeId === "escalation";
        return (
          <path
            key={r.id}
            d={chord(a, b, escalation ? 0.06 : 0.18)}
            fill="none"
            stroke={escalation ? "var(--color-coral, #c25b4e)" : "var(--color-teal-deep)"}
            strokeWidth={escalation ? 1.3 : 1.1}
            strokeDasharray={escalation ? undefined : "4 4"}
            opacity={0.75}
            markerEnd={escalation ? "url(#power-arrow)" : undefined}
          >
            <title>{t.label}</title>
          </path>
        );
      })}
    </g>
  );
}

/** The one arrowhead every line shares; mount once inside the SVG defs. */
export function RelationArrowDef() {
  return (
    <marker id="power-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
    </marker>
  );
}
