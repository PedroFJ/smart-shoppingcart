import { sections, type Product, type SectionId } from "../data/sampleData";
import type { ShoppingItem } from "../state/types";
import { getFruitVegSortPrefix, getProductSortLabel, includesAny } from "./productFormat";
import { normalizeForMatching } from "./search";

export type StoreRouteStop = {
  id: string;
  name: string;
};

export const CART_DRAG_STEP = 86;

export const supercorRouteStops: StoreRouteStop[] = [
  { id: "frutas", name: "Frutas" },
  { id: "legumes", name: "Legumes" },
  { id: "peixaria", name: "Peixaria" },
  { id: "conservas", name: "Conservas" },
  { id: "carne-refrigerada", name: "Carne refrigerada" },
  { id: "talho", name: "Talho" },
  { id: "azeites-oleos", name: "Azeites e Óleos" },
  { id: "charcutaria", name: "Charcutaria" },
  { id: "cereais", name: "Cereais" },
  { id: "leite-cafe", name: "Leite e Café" },
  { id: "laticinios", name: "Laticínios" },
  { id: "ovos", name: "Ovos" },
  { id: "congelados", name: "Congelados" },
  { id: "vinho-cerveja-aguas", name: "Vinho, cerveja e águas" },
  { id: "arroz-massas", name: "Arroz e massas" },
  { id: "produtos-banho", name: "Produtos de banho" },
  { id: "higiene-pessoal", name: "Higiene pessoal" },
  { id: "guardanapos-papel", name: "Guardanapos e papel" },
  { id: "limpeza-casa", name: "Produtos de limpeza da casa" },
  { id: "pao", name: "Pão" }
];

export const defaultSupercorStopOrder = supercorRouteStops.map((stop) => stop.id);

const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));

export function sortShoppingItems(items: ShoppingItem[], route: SectionId[], locale: string): ShoppingItem[] {
  const routePosition = new Map(route.map((sectionId, index) => [sectionId, index]));

  return [...items].sort((a, b) => {
    const aPosition = routePosition.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = routePosition.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER;

    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }

    if (a.customOrder !== undefined || b.customOrder !== undefined) {
      return (a.customOrder ?? Number.MAX_SAFE_INTEGER) - (b.customOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return getProductSortLabel(a).localeCompare(getProductSortLabel(b), locale, { sensitivity: "base" });
  });
}

export function sortPickingItems(
  items: ShoppingItem[],
  storeId: string,
  fallbackRoute: SectionId[],
  stopOrder: string[],
  manualOrder?: string[]
): ShoppingItem[] {
  const routeSortedItems = storeId === "supercor"
    ? sortSupercorPickingItems(items, stopOrder)
    : sortShoppingItems(items, fallbackRoute, "pt-PT");
  return applyManualProductOrder(routeSortedItems, manualOrder);
}

export function sortSupercorPickingItems(items: ShoppingItem[], stopOrder: string[]): ShoppingItem[] {
  const routePosition = new Map(completeStoreStopOrder(stopOrder).map((stopId, index) => [stopId, index]));

  return [...items].sort((a, b) => {
    const aStop = getSupercorRouteStopId(a);
    const bStop = getSupercorRouteStopId(b);
    const aPosition = routePosition.get(aStop) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = routePosition.get(bStop) ?? Number.MAX_SAFE_INTEGER;

    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }

    return getProductSortLabel(a).localeCompare(getProductSortLabel(b), "pt-PT", { sensitivity: "base" });
  });
}

export function applyManualProductOrder(items: ShoppingItem[], manualOrder?: string[]): ShoppingItem[] {
  if (!manualOrder?.length) {
    return items;
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = manualOrder
    .map((productId) => itemById.get(productId))
    .filter((item): item is ShoppingItem => Boolean(item));
  const orderedIds = new Set(orderedItems.map((item) => item.id));
  const unorderedItems = items.filter((item) => !orderedIds.has(item.id));

  return [...orderedItems, ...unorderedItems];
}

export function clampIndex(value: number, min: number, max: number): number {
  if (max < min) {
    return -1;
  }

  return Math.min(Math.max(value, min), max);
}

export function completeSectionRoute(route: SectionId[]): SectionId[] {
  const uniqueRoute = route.filter((sectionId, index) => route.indexOf(sectionId) === index);
  const missingSections = sections
    .map((section) => section.id)
    .filter((sectionId) => !uniqueRoute.includes(sectionId));

  return [...uniqueRoute, ...missingSections];
}

export function completeStoreStopOrder(route: string[]): string[] {
  const uniqueRoute = route
    .filter(isSupercorStopId)
    .filter((stopId, index, stopRoute) => stopRoute.indexOf(stopId) === index);
  const missingStops = defaultSupercorStopOrder.filter((stopId) => !uniqueRoute.includes(stopId));

  return [...uniqueRoute, ...missingStops];
}

export function getRouteEditorItems(
  storeId: string,
  sectionRoute: SectionId[],
  stopOrder: string[]
): StoreRouteStop[] {
  if (storeId === "supercor") {
    return completeStoreStopOrder(stopOrder).map((stopId) => ({
      id: stopId,
      name: getSupercorStopName(stopId)
    }));
  }

  return completeSectionRoute(sectionRoute).map((sectionId) => ({
    id: sectionId,
    name: sectionNameById.get(sectionId) ?? sectionId
  }));
}

export function areSectionRoutesEqual(firstRoute: SectionId[], secondRoute: SectionId[]): boolean {
  const firstCompleteRoute = completeSectionRoute(firstRoute);
  const secondCompleteRoute = completeSectionRoute(secondRoute);

  return firstCompleteRoute.length === secondCompleteRoute.length
    && firstCompleteRoute.every((sectionId, index) => sectionId === secondCompleteRoute[index]);
}

export function isSupercorStopId(value: unknown): value is string {
  return typeof value === "string" && supercorRouteStops.some((stop) => stop.id === value);
}

export function getStoreRouteHint(
  storeId: string,
  fallbackRoute: SectionId[],
  stopOrder: string[],
  orderedItems: ShoppingItem[]
): string {
  const routeNames = orderedItems.length > 0
    ? orderedItems.map((item) => getStoreStopName(storeId, item))
    : getFallbackStoreRouteNames(storeId, fallbackRoute, stopOrder);
  const uniqueRouteNames = routeNames.filter((routeName, index) => routeNames.indexOf(routeName) === index);

  return uniqueRouteNames.join(" > ");
}

export function getFallbackStoreRouteNames(
  storeId: string,
  fallbackRoute: SectionId[],
  stopOrder: string[]
): string[] {
  if (storeId === "supercor") {
    return completeStoreStopOrder(stopOrder).map(getSupercorStopName);
  }

  return fallbackRoute.map((sectionId) => sectionNameById.get(sectionId) ?? sectionId);
}

export function getStoreStopName(storeId: string, product: Product): string {
  if (storeId !== "supercor") {
    return sectionNameById.get(product.sectionId) ?? product.sectionId;
  }

  const stopId = getSupercorRouteStopId(product);
  return getSupercorStopName(stopId);
}

export function getSupercorStopName(stopId: string): string {
  return supercorRouteStops.find((stop) => stop.id === stopId)?.name ?? stopId;
}

export function getSupercorRouteStopId(product: Product): string {
  const searchable = normalizeForMatching(`${product.name} ${product.brand ?? ""} ${product.note ?? ""}`);

  if (product.sectionId === "fruit-veg") {
    return getFruitVegSortPrefix(product.name) === "1-fruta" ? "frutas" : "legumes";
  }

  if (includesAny(searchable, ["peixe", "bacalhau"])) {
    return "peixaria";
  }

  if (includesAny(searchable, ["atum", "grao", "feijao frade", "tomate polpa", "tomate pedacos"])) {
    return "conservas";
  }

  if (includesAny(searchable, ["entrecosto", "talho"])) {
    return "talho";
  }

  if (product.sectionId === "fish") {
    return "peixaria";
  }

  if (product.sectionId === "meat") {
    return "carne-refrigerada";
  }

  if (includesAny(searchable, ["azeite", "oleo", "vinagre"])) {
    return "azeites-oleos";
  }

  if (includesAny(searchable, ["presunto"])) {
    return "charcutaria";
  }

  if (includesAny(searchable, ["flocos", "cereais", "cereal"])) {
    return "cereais";
  }

  if (includesAny(searchable, ["leite", "cafe"])) {
    return "leite-cafe";
  }

  if (includesAny(searchable, ["ovo", "ovos", "clara"])) {
    return "ovos";
  }

  if (product.sectionId === "dairy") {
    return "laticinios";
  }

  if (product.sectionId === "frozen") {
    return "congelados";
  }

  if (product.sectionId === "drinks" || includesAny(searchable, ["vinho", "cerveja", "agua", "coca", "tonica"])) {
    return "vinho-cerveja-aguas";
  }

  if (includesAny(searchable, ["arroz", "massa", "massas"])) {
    return "arroz-massas";
  }

  if (includesAny(searchable, ["gel banho", "shampoo", "shampo", "amaciador marta", "lactacid"])) {
    return "produtos-banho";
  }

  if (product.sectionId === "personal-care") {
    return "higiene-pessoal";
  }

  if (includesAny(searchable, ["guardanapos", "papel higienico", "rolo cozinha"])) {
    return "guardanapos-papel";
  }

  if (product.sectionId === "cleaning") {
    return "limpeza-casa";
  }

  if (product.sectionId === "bakery") {
    return "pao";
  }

  return product.sectionId === "pantry" ? "conservas" : "limpeza-casa";
}
