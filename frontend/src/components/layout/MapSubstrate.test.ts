import { describe, expect, it } from 'vitest';

import { getMapLayerProps } from '@/lib/mapLayers';


describe('getMapLayerProps', () => {
  it('returns url and attribution for known map layer', () => {
    const props = getMapLayerProps('satellite');

    expect(props.url).toBeTruthy();
    expect(props.attribution).toBeTruthy();
  });

  it('includes subdomains when present', () => {
    const props = getMapLayerProps('carto-dark');

    expect('subdomains' in props).toBe(true);
  });
});
