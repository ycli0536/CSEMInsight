/**
 * What each entry of a MARE2DEM `.resistivity` file means.
 *
 * Descriptions are taken from the reader itself rather than from prose docs, so
 * that the accepted values and the constraints quoted here are the ones the
 * solver actually enforces. Each entry carries a comment naming the line it was
 * derived from, in the MARE2DEM source tree:
 *
 *   - `mare2dem_io.f90:readResistivityFile` -- the keyword table, the accepted
 *     values for each keyword, and the validation that rejects the rest.
 *   - `occam.f90` -- how the inversion controls are consumed.
 *   - `em2d.f90:compute_DataWeights` -- the joint inversion weighting modes.
 *
 * Those references stay in this file rather than in the UI: they are what a
 * maintainer needs to re-verify a description against the solver, and mean
 * nothing to someone reading a tooltip.
 *
 * The same goes for the inline `! ...` note a file may carry after a value. It
 * is not surfaced either -- native MARE2DEM output writes none at all (only
 * Mamba2D-written files do), so it would be a field that is usually blank and
 * never authoritative. These descriptions are the single source shown instead.
 */

/** Where a parameter sits in the inversion, used to group the inspector. */
export type ResistivityParameterGroup =
  | 'files'
  | 'inversion'
  | 'regularization'
  | 'model'
  | 'results';

export interface ResistivityParameterInfo {
  /** How to spell the name in the UI, when the file's own spelling is noisy. */
  label?: string;
  group: ResistivityParameterGroup;
  description: string;
  /** Accepted values, when the reader validates against a fixed set. */
  allowed?: string[];
  /** Constraint the reader enforces, phrased as the error it would raise. */
  constraint?: string;
}

export const RESISTIVITY_PARAMETER_GROUP_LABELS: Record<
  ResistivityParameterGroup,
  string
> = {
  files: 'Files',
  inversion: 'Inversion control',
  regularization: 'Regularization',
  model: 'Model',
  results: 'Results from inversion',
};

export const RESISTIVITY_PARAMETER_GROUP_ORDER: ResistivityParameterGroup[] = [
  'results',
  'model',
  'regularization',
  'inversion',
  'files',
];

/**
 * Keyed on the lower-cased keyword, which is how `readResistivityFile` matches
 * them -- so a file that spells a key differently in case still resolves.
 */
const PARAMETER_INFO: Record<string, ResistivityParameterInfo> = {
  // mare2dem_io.f90:241
  format: {
    group: 'files',
    description:
      'Version of the .resistivity layout. Anything else is rejected and the run stops.',
    allowed: ['mare2dem_1.0', 'mare2dem_1.1'],
  },
  // mare2dem_io.f90:254
  'model file': {
    group: 'files',
    description: 'The .poly file holding the mesh geometry these regions index into.',
  },
  // mare2dem_io.f90:259
  'data file': {
    group: 'files',
    description: 'The .data file of observations the inversion is fitting.',
  },
  // mare2dem_io.f90:264
  'data group file': {
    group: 'files',
    description:
      'Optional file assigning data to groups, which are then weighted separately.',
  },
  // mare2dem_io.f90:274
  'settings file': {
    group: 'files',
    description: 'Forward-solver settings (mare2dem.settings).',
  },
  // mare2dem_io.f90:279
  'penalty file': {
    group: 'files',
    description: 'Optional file supplying a custom roughness penalty matrix.',
  },
  // em2d.f90:390 -- the weighting formulas, not just the accepted names.
  'joint inversion weight': {
    group: 'inversion',
    description:
      'How data groups are weighted against each other in a joint inversion. "data_count" normalizes each group by sqrt(n) so a well-fit model gives each group chi^2 ~ 1; the "misfit" variants additionally scale by the group\'s current RMS, pushing the inversion toward whichever group fits worst.',
    allowed: ['unity', 'data_count', 'misfit_balanced_data_count', 'misfit'],
  },
  // mare2dem_io.f90:284
  'maximum iterations': {
    group: 'inversion',
    description: 'Cap on Occam iterations before the run stops regardless of misfit.',
  },
  // mare2dem_io.f90:287
  'bounds transform': {
    group: 'model',
    description:
      'Function mapping bounded resistivity onto the unbounded variable the inversion actually solves for, so bounds are never violated.',
    allowed: ['exponential', 'bandpass'],
  },
  // mare2dem_io.f90:300 for parsing; :678 for the fallback onto free parameters.
  'global bounds': {
    group: 'model',
    description:
      'Default lower,upper resistivity limits in ohm-m, applied to every free parameter whose own Lower/Upper pair is 0,0. Stored linear, used as log10.',
    constraint: 'Two comma-separated values; reversed pairs are swapped silently.',
  },
  // mare2dem_io.f90:365
  'roughness penalty method': {
    group: 'regularization',
    description:
      'Operator measuring model roughness. "gradient" penalizes the spatial derivative; "first_difference" penalizes differences between adjacent regions.',
    allowed: ['gradient', 'first_difference'],
  },
  // mare2dem_io.f90:380
  'roughness weights (y,z)': {
    group: 'regularization',
    description:
      'Relative roughness penalty along y (horizontal) and z (vertical). A larger y weight smooths more laterally, favouring layered structure.',
    constraint: 'Both must be positive and non-zero.',
  },
  // mare2dem_io.f90:414
  'penalty cut weight': {
    group: 'regularization',
    description:
      'Roughness weight applied across penalty-cut segments. Lower values let resistivity jump more freely across the cut; 0 removes the penalty there entirely.',
    constraint: 'Must be non-negative.',
  },
  // mare2dem_io.f90:427
  'roughness with prejudice': {
    group: 'regularization',
    description:
      'When yes, roughness is measured against the prejudice model rather than against a flat model, using the norm ||R(m - m_prej)||^2.',
    allowed: ['yes', 'no'],
  },
  // mare2dem_io.f90:446 -- beta_mgs; :458 is where a non-zero value enables MGS.
  'min. gradient support weight': {
    group: 'regularization',
    description:
      'Beta for the Minimum Gradient Support penalty, which favours a few sharp boundaries over broad smooth gradients. Any value above 0 turns MGS on.',
    constraint: 'Must be non-negative. 0 means no MGS.',
  },
  // mare2dem_io.f90:464
  'aniso. penalty weight': {
    group: 'regularization',
    description:
      'Penalty on the difference between anisotropic components, pulling the model toward isotropy unless the data demand otherwise.',
    constraint: 'Must be non-negative.',
  },
  // mare2dem_io.f90:477
  'aniso. ratio roughness weight': {
    group: 'regularization',
    description: 'Roughness penalty applied to the anisotropy ratio itself.',
    constraint: 'Must be non-negative.',
  },
  // mare2dem_io.f90:493
  'print level': {
    group: 'inversion',
    description: 'Verbosity of the solver log.',
  },
  // mare2dem_io.f90:493 -- read by the same case as 'print level'.
  'debug level': {
    label: 'Print Level',
    group: 'inversion',
    description: 'Older spelling of Print Level; read identically.',
  },
  // mare2dem_io.f90:498
  'target misfit': {
    group: 'inversion',
    description:
      'RMS misfit the inversion is aiming for. 1.0 means fitting the data to within their assigned error bars.',
  },
  // occam.f90:1231 -- rms <= rmsThreshold*startingRMS ends the iteration.
  'misfit decrease threshold': {
    group: 'inversion',
    description:
      'An iteration ends once RMS drops below this fraction of the RMS it started at, so the Jacobian is rebuilt rather than over-used.',
    constraint: '0 <= n < 1.',
  },
  // occam.f90:390 -- targetRMS = max(startingRMS*rmsThreshold, targetRMS).
  'converge slowly': {
    group: 'inversion',
    description:
      'When yes, each iteration aims at max(starting RMS * Misfit Decrease Threshold, Target Misfit) instead of the target directly -- a gentler descent that resists overshooting into structure the data do not support.',
    allowed: ['yes', 'no'],
  },
  // mare2dem_io.f90:519 -- read by the same case as 'log10 lagrange value'.
  'lagrange value': {
    label: 'Log10 Lagrange Value',
    group: 'results',
    description: 'Older spelling of Log10 Lagrange Value; read identically.',
  },
  // mare2dem_io.f90:519
  'log10 lagrange value': {
    group: 'results',
    description:
      'log10 of the Occam regularization trade-off parameter reached at this iteration. Large values mean smoothing dominates; it falls as the inversion starts fitting data.',
  },
  // mare2dem_io.f90:526
  'model roughness': {
    group: 'results',
    description:
      'Roughness of this model under the chosen penalty. Written by the inversion; rising roughness at flat misfit is the usual sign of fitting noise.',
  },
  // mare2dem_io.f90:533
  'model misfit': {
    group: 'results',
    description:
      'RMS misfit this model achieves. Compare against Target Misfit to see whether the inversion converged.',
  },
  // mare2dem_io.f90:539 -- the reader's case body is a bare "skip".
  'date/time': {
    group: 'results',
    description:
      'When the inversion wrote this file. Recorded for provenance only -- the reader skips it.',
  },
  // mare2dem_io.f90:503
  iteration: {
    group: 'results',
    description:
      'Ignored on read: the iteration number is taken from the file name instead.',
  },
  // mare2dem_io.f90:552 -- each case sets nRhoPerRegion, which is the count below.
  anisotropy: {
    group: 'model',
    description:
      'Anisotropy model, which sets how many resistivity values each region carries: isotropic 1; isotropic_complex, tix, tiy, tiz and tiz_ratio 2; triaxial 3; isotropic_ip (Cole-Cole) 4. This decides the column layout of the table below.',
    allowed: [
      'isotropic',
      'isotropic_complex',
      'isotropic_ip',
      'tix',
      'tiy',
      'tiz',
      'tiz_ratio',
      'triaxial',
    ],
  },
  // mare2dem_io.f90:578 -- nRhoParams = nRegions * nRhoPerRegion.
  'number of regions': {
    group: 'model',
    description:
      'Region count, and therefore the number of rows the reader expects in the table below. Total free parameters = regions x values per region.',
  },
  // mare2dem_io.f90:334 -- kept only to load pre-November-2020 files.
  'roughness penalty': {
    group: 'regularization',
    description:
      'Deprecated by the November 2020 format; still read so older files load. Use Roughness Penalty Method and Min. Gradient Support Weight instead.',
  },
};

/** What each column of the per-region table controls. */
const COLUMN_INFO: Record<string, ResistivityParameterInfo> = {
  // mare2dem_io.f90:616 -- the leading field of each row, read into iskip.
  '#': {
    group: 'model',
    description: 'Region number, matching the region order in the .poly file.',
  },
  region: {
    group: 'model',
    description: 'Region number, matching the region order in the .poly file.',
  },
  // mare2dem_io.f90:705 -- pm = log10(rhoParams).
  rho: {
    group: 'model',
    description:
      "This region's resistivity in ohm-m, written linear. The inversion solves for log10 of it.",
  },
  // mare2dem_io.f90:651 -- nFree = count(iFreeParam > 0).
  param: {
    group: 'model',
    description:
      'Free-parameter number. 0 fixes the region at its current resistivity; any value above 0 lets the inversion update it.',
  },
  // mare2dem_io.f90:699 -- both bounds must exceed 0 or lBoundMe stays false.
  lower: {
    group: 'model',
    description:
      'Per-region lower resistivity bound in ohm-m. Only applied when both Lower and Upper are above 0; otherwise the region falls back to Global Bounds.',
  },
  upper: {
    group: 'model',
    description:
      'Per-region upper resistivity bound in ohm-m. Only applied when both Lower and Upper are above 0; otherwise the region falls back to Global Bounds.',
  },
  // mare2dem_io.f90:707 -- premod is read only when prewts > 0.
  prej: {
    group: 'model',
    description:
      'Prejudice resistivity in ohm-m -- the value this region is pulled toward. Read only when its Weight is above 0.',
  },
  // mare2dem_io.f90:707 -- prewts = abs(prejTemp), so the sign is discarded.
  weight: {
    group: 'model',
    description:
      'Strength of the pull toward Prej, linear. 0 disables the prejudice for this region; the sign is discarded.',
  },
};

/**
 * Strip the anisotropy qualifier an anisotropic header appends, so that
 * "Lower xy" and "Prej z/xy" resolve to the same description as "Lower" and
 * "Prej". Qualifiers are attached by the parser, not by the solver.
 */
function baseColumnName(column: string): string {
  return column.trim().toLowerCase().split(' ')[0].replace(/-.*$/, '');
}

export function getResistivityParameterInfo(
  key: string,
): ResistivityParameterInfo | undefined {
  return PARAMETER_INFO[key.trim().toLowerCase()];
}

export function getResistivityColumnInfo(
  column: string,
): ResistivityParameterInfo | undefined {
  const normalized = column.trim().toLowerCase();
  return COLUMN_INFO[normalized] ?? COLUMN_INFO[baseColumnName(column)];
}

export function getResistivityParameterGroup(
  key: string,
): ResistivityParameterGroup {
  // Unrecognized keys are grouped with the files rather than dropped: a file
  // may carry a keyword this build does not know about, and hiding it would be
  // worse than filing it imprecisely.
  return getResistivityParameterInfo(key)?.group ?? 'files';
}

export function getResistivityParameterLabel(key: string): string {
  return getResistivityParameterInfo(key)?.label ?? key;
}
