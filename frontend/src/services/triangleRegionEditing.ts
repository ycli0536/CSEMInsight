import type {
  TriangleMesh,
  TriangleModelResponse,
  TriangleResistivityComponent,
  TriangleResistivityComponentKey,
  TriangleResistivityViewKey,
} from '@/types';

export const ANISOTROPY_RATIO_VIEW = 'anisotropyRatio';
export const ANISOTROPY_RATIO_LABEL = 'Rho-z / Rho-h';

const FALLBACK_COMPONENTS: TriangleResistivityComponent[] = [
  { key: 'rho', label: 'Rho', column: 'Rho' },
];

export type RegionRhoByComponent = Map<
  TriangleResistivityComponentKey,
  Map<number, number>
>;

export interface TriangleRegionEditPatch {
  previousRhoByRegion: Map<number, number>;
  nextRhoByRegion: Map<number, number>;
  skippedRegionIds: number[];
  /** Component the patch edits; absent for isotropic models. */
  componentKey?: TriangleResistivityComponentKey;
}

export interface ApplySetRhoEditOptions {
  currentRhoByRegion: Map<number, number>;
  regionWeights: Map<number, number>;
  targetRho: number;
  componentKey?: TriangleResistivityComponentKey;
}

export interface DeriveTriangleResistivityValuesOptions {
  mesh: TriangleMesh;
  rhoByRegion: Map<number, number>;
}

function isEditableRho(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getResistivityComponents(
  model: TriangleModelResponse | null,
): TriangleResistivityComponent[] {
  const components = model?.constrainedMesh?.resistivityComponents;
  return components?.length ? components : FALLBACK_COMPONENTS;
}

export function buildRegionRhoMap(
  model: TriangleModelResponse | null,
  componentKey: TriangleResistivityComponentKey = 'rho',
) {
  const rhoByRegion = new Map<number, number>();

  model?.constrainedMesh?.regionResistivity.forEach((item) => {
    // `rho` mirrors the file's first rho column, and is the only component a
    // backend that predates the anisotropic payload reports.
    const value = componentKey === 'rho' ? item.rho : item[componentKey];
    if (isEditableRho(value)) {
      rhoByRegion.set(item.regionId, value);
    }
  });

  return rhoByRegion;
}

/** One rho map per component present in the loaded .resistivity file. */
export function buildRegionRhoMaps(
  model: TriangleModelResponse | null,
): RegionRhoByComponent {
  return new Map(
    getResistivityComponents(model).map((component) => [
      component.key,
      buildRegionRhoMap(model, component.key),
    ]),
  );
}

export function buildAnisotropyRatioMap(rhoByComponent: RegionRhoByComponent) {
  const verticalRho = rhoByComponent.get('rhoZ');
  const horizontalRho = rhoByComponent.get('rhoH');
  const ratioByRegion = new Map<number, number>();

  if (!verticalRho || !horizontalRho) {
    return ratioByRegion;
  }

  verticalRho.forEach((rhoZ, regionId) => {
    const rhoH = horizontalRho.get(regionId);
    if (isEditableRho(rhoH)) {
      ratioByRegion.set(regionId, rhoZ / rhoH);
    }
  });

  return ratioByRegion;
}

/** Values to render for the selected view: one component, or their ratio. */
export function getDisplayedRhoByRegion(
  rhoByComponent: RegionRhoByComponent,
  viewKey: TriangleResistivityViewKey,
) {
  if (viewKey === ANISOTROPY_RATIO_VIEW) {
    return buildAnisotropyRatioMap(rhoByComponent);
  }

  return rhoByComponent.get(viewKey) ?? new Map<number, number>();
}

export function applySetRhoEdit(
  options: ApplySetRhoEditOptions,
): TriangleRegionEditPatch {
  const { currentRhoByRegion, regionWeights, targetRho, componentKey } = options;
  const previousRhoByRegion = new Map<number, number>();
  const nextRhoByRegion = new Map<number, number>();
  const skippedRegionIds: number[] = [];

  if (!isEditableRho(targetRho)) {
    return {
      previousRhoByRegion,
      nextRhoByRegion,
      skippedRegionIds: Array.from(regionWeights.keys()),
      componentKey,
    };
  }

  const targetLog = Math.log10(targetRho);

  regionWeights.forEach((weight, regionId) => {
    const currentRho = currentRhoByRegion.get(regionId);
    if (!isEditableRho(currentRho)) {
      skippedRegionIds.push(regionId);
      return;
    }

    const safeWeight = Math.min(Math.max(weight, 0), 1);
    const nextLog = Math.log10(currentRho) * (1 - safeWeight) + targetLog * safeWeight;

    previousRhoByRegion.set(regionId, currentRho);
    nextRhoByRegion.set(regionId, 10 ** nextLog);
  });

  return {
    previousRhoByRegion,
    nextRhoByRegion,
    skippedRegionIds,
    componentKey,
  };
}

/** Apply `mutate` to the single component map a patch targets. */
export function withPatchedComponent(
  rhoByComponent: RegionRhoByComponent,
  patch: TriangleRegionEditPatch,
  mutate: (rhoByRegion: Map<number, number>) => Map<number, number>,
): RegionRhoByComponent {
  const componentKey = patch.componentKey ?? 'rho';
  const currentRhoByRegion = rhoByComponent.get(componentKey);
  if (!currentRhoByRegion) {
    return rhoByComponent;
  }

  const next = new Map(rhoByComponent);
  next.set(componentKey, mutate(currentRhoByRegion));
  return next;
}

export function applyEditPatch(
  currentRhoByRegion: Map<number, number>,
  patch: TriangleRegionEditPatch,
) {
  const nextRhoByRegion = new Map(currentRhoByRegion);
  patch.nextRhoByRegion.forEach((rho, regionId) => {
    nextRhoByRegion.set(regionId, rho);
  });

  return nextRhoByRegion;
}

export function revertEditPatch(
  currentRhoByRegion: Map<number, number>,
  patch: TriangleRegionEditPatch,
) {
  const nextRhoByRegion = new Map(currentRhoByRegion);
  patch.previousRhoByRegion.forEach((rho, regionId) => {
    nextRhoByRegion.set(regionId, rho);
  });

  return nextRhoByRegion;
}

export function deriveTriangleResistivityValues(
  options: DeriveTriangleResistivityValuesOptions,
) {
  const { mesh, rhoByRegion } = options;

  return mesh.triangles.map((_, triangleIndex) => {
    const regionId = mesh.triangleRegionIds?.[triangleIndex] ?? null;
    if (regionId === null) {
      return null;
    }

    return rhoByRegion.get(regionId) ?? null;
  });
}
