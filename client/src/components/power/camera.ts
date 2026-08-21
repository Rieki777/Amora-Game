/**
 * The power map's camera (0083, spec 1): pure state, van Wijk motion.
 *
 * A view is `[cx, cy, w]`: the point the camera looks at and the width of
 * world it shows, exactly the triple Bostock's zoomable circle packing
 * drives through `interpolateZoom`. `cameraAfter` is a pure reducer over
 * that state, so every promise the spec makes about the camera is a unit
 * test here instead of a hope in a component:
 *
 *   - tap a circle, a crumb or a search result: the camera flies to it;
 *   - tap the background or press Esc: out one level, to the given parent;
 *   - tap a SEAT: the camera does not move. Not a pixel. The seat opens its
 *     card; yanking the world under a finger that asked about a person is
 *     the mis-tap Holaspirit's one-gesture zoom teaches against.
 *
 * The component owns only the clock: it feeds `transition` a start and an
 * end and animates `at(t)` over `duration(reduced)` ms. 400 ms flat, 0
 * under reduced motion, per the adopted interaction spec.
 */
import { interpolateZoom } from "d3-interpolate";

export type CameraView = [number, number, number];

/** What the camera can look at: a circle's disc, or the whole village. */
export interface CameraTarget {
  /** The focused circle id, or null for the village root. */
  id: string | null;
  cx: number;
  cy: number;
  r: number;
}

export interface CameraState {
  focus: CameraTarget;
  view: CameraView;
}

export type CameraEvent =
  /** Tap a circle, tap a crumb, or pick a search result: fly to it. */
  | { kind: "focus"; target: CameraTarget }
  /** Tap the focused ring's background, or Esc: out one level. The caller
   *  names the parent, because the reducer holds no layout. */
  | { kind: "out"; target: CameraTarget }
  /** Tap a seat. The card opens elsewhere; the camera holds still. */
  | { kind: "seat"; seatId: string };

/** World-units of margin around a focused circle, the spec's `2r + margin`. */
export const FOCUS_MARGIN = 24;

export const ZOOM_MS = 400;

export function viewFor(target: CameraTarget): CameraView {
  return [target.cx, target.cy, 2 * target.r + FOCUS_MARGIN];
}

export function cameraFor(target: CameraTarget): CameraState {
  return { focus: target, view: viewFor(target) };
}

/** The pure reducer. A seat event returns the SAME state object, which is
 *  the strongest form of "the camera did not move" a test can ask for. */
export function cameraAfter(state: CameraState, event: CameraEvent): CameraState {
  if (event.kind === "seat") return state;
  return cameraFor(event.target);
}

/**
 * The flight between two views. `at(t)` for t in 0..1; `duration(reduced)`
 * is the whole clock: 400 ms, or 0 under reduced motion so the next frame
 * simply IS the destination.
 */
export function transition(from: CameraView, to: CameraView) {
  const zoom = interpolateZoom(from, to);
  return {
    // The endpoints are the INPUTS, exactly. interpolateZoom(1) lands within
    // float dust of `to` (…99999999999997), and a camera that rests a
    // sixteenth-decimal off its target re-renders forever against a memoised
    // viewBox string. Snapping the ends costs nothing mid-flight.
    at: (t: number): CameraView => {
      if (t <= 0) return [...from] as CameraView;
      if (t >= 1) return [...to] as CameraView;
      return zoom(t);
    },
    duration: (reducedMotion: boolean): number => (reducedMotion ? 0 : ZOOM_MS),
  };
}

/**
 * The viewBox string for a view, given the picture's aspect (height/width).
 * One place, because writing `x y w h` by hand in two components is how the
 * camera and the export drift apart.
 */
export function viewBoxFor(view: CameraView, aspect = 1): string {
  const [cx, cy, w] = view;
  const h = w * aspect;
  return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
}

/**
 * The focus id the URL should carry (`?focus=`), so a view is a link and
 * Back works. Null means the URL carries nothing.
 */
export function focusParam(state: CameraState): string | null {
  return state.focus.id;
}
