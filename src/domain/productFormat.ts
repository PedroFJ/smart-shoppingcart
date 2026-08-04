import { Product, sections } from "../data/sampleData";
import { ShoppingItem } from "../state/types";
import { normalizeForMatching } from "./search";

type Translate = (key: string, options?: Record<string, string>) => string;

const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));

export function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

export function getProductSortLabel(product: Product): string {
  if (product.sectionId !== "fruit-veg") {
    return product.name;
  }

  return `${getFruitVegSortPrefix(product.name)} ${product.name}`;
}

export function getFruitVegSortPrefix(productName: string): string {
  const normalizedName = normalizeForMatching(productName);
  const fruitKeywords = [
    "ananas",
    "banana",
    "frutos vermelhos",
    "kiwi",
    "laranja",
    "lima",
    "limao",
    "maca",
    "pera"
  ];
  const vegetableKeywords = [
    "agriao",
    "alface",
    "alho",
    "batata",
    "brocolo",
    "cebola",
    "cenoura",
    "chuchu",
    "coentro",
    "courgete",
    "feijao verde",
    "hortela",
    "salsa",
    "tomate"
  ];

  if (fruitKeywords.some((keyword) => normalizedName.includes(keyword))) {
    return "1-fruta";
  }

  if (vegetableKeywords.some((keyword) => normalizedName.includes(keyword))) {
    return "2-legume";
  }

  return "3-outros";
}

export function formatProductDetails(product: Product): string {
  const brand = product.brand ? `${product.brand} - ` : "";
  return `${brand}${sectionNameById.get(product.sectionId)} - ${product.defaultQuantity}`;
}

export function formatItemDetails(item: ShoppingItem): string {
  const brand = item.brand ? `${item.brand} - ` : "";
  return `${brand}${sectionNameById.get(item.sectionId)} - ${item.quantity || "1 un"}`;
}

export function formatListItemDetails(item: ShoppingItem): string {
  const brand = item.brand ? `${item.brand} - ` : "";
  return `${brand}${sectionNameById.get(item.sectionId)}`;
}

export function normalizeQuantityText(value: string): string {
  const trimmedValue = value.trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return "1 un";
  }

  if (/^\d+([,.]\d+)?$/.test(trimmedValue)) {
    return `${trimmedValue} un`;
  }

  return trimmedValue;
}

export function formatLastPicked(lastPickedAt?: string): string;
export function formatLastPicked(lastPickedAt: string | undefined, locale: string, t: Translate): string;
export function formatLastPicked(lastPickedAt?: string, locale = "pt-PT", t?: Translate): string {
  if (!lastPickedAt) {
    return t ? t("list:row.lastPicked.never") : "Última compra: nunca";
  }

  const date = new Date(lastPickedAt);

  if (Number.isNaN(date.getTime())) {
    return t ? t("list:row.lastPicked.unknown") : "Última compra: desconhecida";
  }

  return t
    ? t("list:row.lastPicked.value", { date: date.toLocaleDateString(locale) })
    : `Última compra: ${date.toLocaleDateString("pt-PT")}`;
}

export function formatLastPickedShort(lastPickedAt?: string): string {
  if (!lastPickedAt) {
    return "Nunca";
  }

  const date = new Date(lastPickedAt);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return date.toLocaleDateString("pt-PT");
}
