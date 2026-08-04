import type { ShoppingItem } from "../state/types";

export function buildNextShoppingList(
  items: ShoppingItem[],
  tripItemIds: Set<string> | null
): ShoppingItem[] {
  return items
    .filter((item) => {
      const wasInTrip = tripItemIds?.has(item.id) ?? true;

      if (!wasInTrip) {
        return item.status === "needed";
      }

      return item.status === "needed" || item.status === "missing" || item.status === "skipped";
    })
    .map((item) => ({
      ...item,
      status: "needed" as const
    }));
}
