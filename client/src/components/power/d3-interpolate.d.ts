/**
 * The one function this lane imports from d3-interpolate, typed here so the
 * dependency list stays exactly "d3-interpolate" (coordinator amendment 1)
 * without pulling a second @types package for one signature.
 *
 * `interpolateZoom` is van Wijk and Nuij's smooth pan-and-zoom: hand it two
 * views `[cx, cy, w]` and it returns an interpolator whose `duration` is the
 * path's natural length in ms (the camera clamps it to its own).
 */
declare module "d3-interpolate" {
  export interface ZoomInterpolator {
    (t: number): [number, number, number];
    duration: number;
    rho(rho: number): ZoomInterpolator;
  }
  export function interpolateZoom(
    a: [number, number, number],
    b: [number, number, number],
  ): ZoomInterpolator;
}
