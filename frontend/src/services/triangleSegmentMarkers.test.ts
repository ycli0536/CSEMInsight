import { describe, expect, it } from 'vitest';

import {
  classifyTriangleSegmentMarker,
  describeTriangleSegmentMarker,
} from './triangleSegmentMarkers';

describe('triangleSegmentMarkers', () => {
  it('classifies only negative markers as penalty cuts', () => {
    // MARE2DEM's test is `marker < 0` (mare2dem_penaltymatrix.f90:187) -- the
    // magnitude is a separate flag, so 1 and 2 are ordinary boundaries.
    expect(classifyTriangleSegmentMarker(-2)).toBe('cut');
    expect(classifyTriangleSegmentMarker(-1)).toBe('cut');
    expect(classifyTriangleSegmentMarker(0)).toBe('plain');
    expect(classifyTriangleSegmentMarker(1)).toBe('plain');
    expect(classifyTriangleSegmentMarker(2)).toBe('plain');
  });

  it('treats a missing marker as an ordinary boundary', () => {
    expect(classifyTriangleSegmentMarker(null)).toBe('plain');
    expect(classifyTriangleSegmentMarker(undefined)).toBe('plain');
  });

  it('describes both halves of the marker semantics', () => {
    expect(describeTriangleSegmentMarker(-2)).toBe('marker -2 (cut · coarsenable)');
    expect(describeTriangleSegmentMarker(-1)).toBe('marker -1 (cut · fixed)');
    expect(describeTriangleSegmentMarker(1)).toBe('marker 1 (fixed)');
    expect(describeTriangleSegmentMarker(2)).toBe('marker 2 (coarsenable)');
    expect(describeTriangleSegmentMarker(0)).toBe('marker 0 (fixed)');
    expect(describeTriangleSegmentMarker(null)).toBe('marker none');
  });
});
