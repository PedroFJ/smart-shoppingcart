import { Product, sections } from "../data/sampleData";
import { ShoppingItem } from "../state/types";

export const searchStopWords = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "the", "of", "for"]);

const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));

export function filterBySearch<T extends Product | ShoppingItem>(items: T[], searchText: string): T[] {
  const searchQuery = parseSearchQuery(searchText);

  if (searchQuery.groups.length === 0) {
    return items;
  }

  if (searchQuery.hasExplicitOperator) {
    return items.filter((item) => matchesSearchGroups(item, searchQuery.groups));
  }

  const andMatches = items.filter((item) => {
    return matchesSearchGroups(item, [searchQuery.implicitTerms]);
  });

  if (andMatches.length > 0) {
    return andMatches;
  }

  return items.filter((item) => {
    return matchesSearchGroups(item, searchQuery.implicitTerms.map((term) => [term]));
  });
}

export function matchesSearchGroups(product: Product | ShoppingItem, searchGroups: string[][]): boolean {
  const searchableText = [
    product.name,
    product.brand,
    product.note,
    sectionNameById.get(product.sectionId),
    "quantity" in product ? product.quantity : product.defaultQuantity
  ]
    .filter(Boolean)
    .join(" ");

  const normalizedSearchableText = normalizeForMatching(searchableText);
  return searchGroups.some((group) => {
    return group.every((term) => normalizedSearchableText.includes(term));
  });
}

export function parseSearchQuery(searchText: string): {
  groups: string[][];
  hasExplicitOperator: boolean;
  implicitTerms: string[];
} {
  const tokens = normalizeForMatching(searchText)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => Boolean(term) && !searchStopWords.has(term));
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let pendingOperator: "and" | "or" = "or";
  let hasExplicitOperator = false;
  const implicitTerms: string[] = [];

  tokens.forEach((token) => {
    if (isSearchAndOperator(token)) {
      pendingOperator = "and";
      hasExplicitOperator = true;
      return;
    }

    if (isSearchOrOperator(token)) {
      pendingOperator = "or";
      hasExplicitOperator = true;
      return;
    }

    implicitTerms.push(token);

    if (pendingOperator === "and" && currentGroup.length > 0) {
      currentGroup.push(token);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }

      currentGroup = [token];
    }

    pendingOperator = "or";
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return { groups, hasExplicitOperator, implicitTerms };
}

export function isSearchAndOperator(token: string): boolean {
  return token === "and" || token === "e";
}

export function isSearchOrOperator(token: string): boolean {
  return token === "or" || token === "ou";
}

export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}
