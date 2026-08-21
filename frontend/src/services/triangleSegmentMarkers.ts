/**
 * Semantics of the `.poly` segment boundary marker, as MARE2DEM actually reads it.
 *
 * The marker encodes two independent things:
 *
 * - **Sign** -- a negative marker makes the segment a *penalty cut*: the roughness
 *   penalty across it is scaled down to `Penalty Cut Weight`. See
 *   `mare2dem_penaltymatrix.f90:187`, `if (inmodel%segmentmarkerlist(i) < 0)`.
 *   Zero and positive markers are ordinary boundaries.
 * - **Magnitude** -- `abs(marker) < 2` marks a segment that mesh coarsening must
 *   never drop (outer boundary, or a boundary of a fixed region such as air or
 *   seawater). See `mare2dem_worker.f90:682`. Mamba2D writes `2` exactly when the
 *   regions on both sides are free parameters, so those edges can be coarsened
 *   away outside a data subset's footprint.
 *
 * Real-world files therefore only ever carry -2, -1, 1 or 2. A `0` shows up only
 * in files written by our own Python parser, whose writer turns a missing marker
 * into 0; MARE2DEM then treats it exactly like a 1.
 */

/** Colour class used to draw a segment. Cuts are the thing worth spotting. */
export type TriangleSegmentMarkerClass = 'cut' | 'plain';

/**
 * Overlay colours, chosen against the Turbo resistivity ramp rather than by taste.
 *
 * Turbo runs #23171b -> #900d00 and spans OKLab lightness 0.222..0.892, while the
 * viewer surface (#f8fafc) sits at 0.984. That leaves very little room: white is
 * only ΔE 1.6 from the surface (invisible on a poly-only view), and red, blue,
 * orange and rose all land within ΔE 17 of some point on the Turbo path.
 *
 * Magenta survives because Turbo's path -- blue, cyan, green, yellow, orange, red --
 * never passes through it: #f000f0 is ΔE 29.0 from the nearest Turbo colour and
 * 43.9 from the surface. Black clears both as well (22.3 / 98.4) by sitting below
 * Turbo's lightness floor.
 */
export const TRIANGLE_SEGMENT_MARKER_COLORS: Record<
  TriangleSegmentMarkerClass,
  readonly [number, number, number]
> = {
  cut: [240 / 255, 0, 240 / 255],
  plain: [0, 0, 0],
};

/** CSS colours for the on-screen legend, kept in step with the buffer colours. */
export const TRIANGLE_SEGMENT_MARKER_LEGEND: ReadonlyArray<{
  markerClass: TriangleSegmentMarkerClass;
  label: string;
  css: string;
}> = [
  { markerClass: 'cut', label: 'Penalty cut', css: '#f000f0' },
  { markerClass: 'plain', label: 'Ordinary', css: '#000000' },
];

export function classifyTriangleSegmentMarker(
  marker: number | null | undefined,
): TriangleSegmentMarkerClass {
  return typeof marker === 'number' && marker < 0 ? 'cut' : 'plain';
}

/**
 * One-line description for the hover readout: the raw value plus what MARE2DEM
 * does with it.
 */
export function describeTriangleSegmentMarker(marker: number | null | undefined): string {
  if (typeof marker !== 'number' || !Number.isFinite(marker)) {
    return 'marker none';
  }

  const notes: string[] = [];
  if (marker < 0) {
    notes.push('cut');
  }
  notes.push(Math.abs(marker) < 2 ? 'fixed' : 'coarsenable');

  return `marker ${marker} (${notes.join(' · ')})`;
}
