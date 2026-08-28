import { describe, expect, it } from 'vitest';

import {
  getResistivityColumnInfo,
  getResistivityParameterGroup,
  getResistivityParameterInfo,
  getResistivityParameterLabel,
  RESISTIVITY_PARAMETER_GROUP_LABELS,
  RESISTIVITY_PARAMETER_GROUP_ORDER,
} from '@/config/resistivityParameterInfo';

/** Every key of the fixture in backend/test_data, in file order. */
const MARE2DEM_1_1_KEYS = [
  'Format',
  'Model File',
  'Data File',
  'Joint inversion weight',
  'Settings File',
  'Maximum Iterations',
  'Bounds Transform',
  'Global Bounds',
  'Roughness Penalty Method',
  'Roughness Weights (y,z)',
  'Penalty Cut Weight',
  'Roughness With Prejudice',
  'Min. Gradient Support Weight',
  'Print Level',
  'Target Misfit',
  'Misfit Decrease Threshold',
  'Converge Slowly',
  'Log10 Lagrange Value',
  'Model Roughness',
  'Model Misfit',
  'Date/Time',
  'Anisotropy',
  'Number of regions',
];

describe('resistivityParameterInfo', () => {
  it('documents every parameter a MARE2DEM 1.1 file writes', () => {
    const undocumented = MARE2DEM_1_1_KEYS.filter(
      (key) => !getResistivityParameterInfo(key),
    );

    expect(undocumented).toEqual([]);
  });

  it('matches keys case-insensitively, as the reader does', () => {
    // readResistivityFile lower-cases the keyword before matching, so a file
    // that shouts its keys still resolves.
    expect(getResistivityParameterInfo('GLOBAL BOUNDS')).toBe(
      getResistivityParameterInfo('Global Bounds'),
    );
    expect(getResistivityParameterInfo('  anisotropy  ')?.allowed).toContain('tiz');
  });

  it('names the accepted values the solver validates against', () => {
    expect(getResistivityParameterInfo('Bounds Transform')?.allowed).toEqual([
      'exponential',
      'bandpass',
    ]);
    expect(getResistivityParameterInfo('Roughness Penalty Method')?.allowed).toEqual([
      'gradient',
      'first_difference',
    ]);
    expect(getResistivityParameterInfo('Joint inversion weight')?.allowed).toEqual([
      'unity',
      'data_count',
      'misfit_balanced_data_count',
      'misfit',
    ]);
  });

  it('folds deprecated spellings onto the name the UI should show', () => {
    expect(getResistivityParameterLabel('Debug Level')).toBe('Print Level');
    expect(getResistivityParameterLabel('Lagrange Value')).toBe('Log10 Lagrange Value');
    // An undocumented key keeps whatever the file called it.
    expect(getResistivityParameterLabel('Some Future Keyword')).toBe(
      'Some Future Keyword',
    );
  });

  it('files an unknown key rather than dropping it', () => {
    expect(getResistivityParameterGroup('Some Future Keyword')).toBe('files');
    expect(RESISTIVITY_PARAMETER_GROUP_ORDER).toContain('files');
  });

  it('has a label and an ordering slot for every group it assigns', () => {
    const groups = MARE2DEM_1_1_KEYS.map(getResistivityParameterGroup);

    for (const group of groups) {
      expect(RESISTIVITY_PARAMETER_GROUP_LABELS[group]).toBeTruthy();
      expect(RESISTIVITY_PARAMETER_GROUP_ORDER).toContain(group);
    }
  });

  describe('table columns', () => {
    it('describes the isotropic layout', () => {
      for (const column of ['#', 'Rho', 'Param', 'Lower', 'Upper', 'Prej', 'Weight']) {
        expect(getResistivityColumnInfo(column)?.description).toBeTruthy();
      }
    });

    it('strips the direction qualifier an anisotropic header carries', () => {
      // "Rho-z" and "Weight z/xy" are the same quantity as "Rho" and "Weight";
      // the qualifier is added by the parser to keep column names unique.
      expect(getResistivityColumnInfo('Rho-z')).toBe(getResistivityColumnInfo('Rho'));
      expect(getResistivityColumnInfo('Rho-xy')).toBe(getResistivityColumnInfo('Rho'));
      expect(getResistivityColumnInfo('Param z')).toBe(getResistivityColumnInfo('Param'));
      expect(getResistivityColumnInfo('Lower xy')).toBe(getResistivityColumnInfo('Lower'));
      expect(getResistivityColumnInfo('Weight z/xy')).toBe(
        getResistivityColumnInfo('Weight'),
      );
    });

    it('says a zero pair falls through to the global bounds', () => {
      // The single most confusable thing about the table: 0,0 does not mean
      // "unbounded", it means "use Global Bounds".
      expect(getResistivityColumnInfo('Lower')?.description).toMatch(/Global Bounds/);
      expect(getResistivityColumnInfo('Upper')?.description).toMatch(/Global Bounds/);
    });

    it('says a zero weight disables the prejudice', () => {
      expect(getResistivityColumnInfo('Weight')?.description).toMatch(/0 disables/i);
      expect(getResistivityColumnInfo('Prej')?.description).toMatch(/Weight is above 0/i);
    });

    it('leaves a column it has never heard of undocumented', () => {
      expect(getResistivityColumnInfo('Column 12')).toBeUndefined();
    });
  });
});
