export type PickEvent<TSectionId extends string = string> = {
  productId: string;
  sectionId: TSectionId;
  pickedAt: number;
  action: "picked" | "missing" | "skipped";
};

export type InferredRoute<TSectionId extends string = string> = {
  sectionIds: TSectionId[];
  confidence: number;
};

export function inferSectionRoute<TSectionId extends string>(
  picks: PickEvent<TSectionId>[],
  fallbackRoute: TSectionId[]
): InferredRoute<TSectionId> {
  const trainingSections = picks
    .filter((pick) => pick.action === "picked")
    .sort((a, b) => a.pickedAt - b.pickedAt)
    .map((pick) => pick.sectionId);

  const collapsedSections = trainingSections.filter((sectionId, index) => {
    return index === 0 || trainingSections[index - 1] !== sectionId;
  });

  const learned = uniqueInOrder(collapsedSections);
  const missingFallbackSections = fallbackRoute.filter((sectionId) => !learned.includes(sectionId));
  const sectionIds = [...learned, ...missingFallbackSections];

  return {
    sectionIds,
    confidence: calculateConfidence(learned.length, fallbackRoute.length)
  };
}

export function sortByRoute<TItem extends { sectionId: string }>(
  items: TItem[],
  route: string[],
  getLabel?: (item: TItem) => string
): TItem[] {
  const routePosition = new Map(route.map((sectionId, index) => [sectionId, index]));

  return [...items].sort((a, b) => {
    const aPosition = routePosition.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = routePosition.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER;

    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }

    if (getLabel) {
      return getLabel(a).localeCompare(getLabel(b), "pt-PT", { sensitivity: "base" });
    }

    return 0;
  });
}

function uniqueInOrder<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function calculateConfidence(learnedSectionCount: number, fallbackSectionCount: number): number {
  if (fallbackSectionCount === 0) {
    return 0;
  }

  return Number(Math.min(1, learnedSectionCount / fallbackSectionCount).toFixed(2));
}
