import { create } from "zustand";
import { Product, starterProducts } from "../data/sampleData";
import { createAppJsonStorage, persist, readLegacyAppState, shouldImportLegacyState } from "./persistence";
import { PersistedAppState } from "./types";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

type ProductsState = {
  products: Product[];
  setProducts: (products: Product[]) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  hydrateFromLegacy: (legacyState: PersistedAppState | null) => void;
};

export const useProductsStore = create<ProductsState>()(
  persist<ProductsState>(
    (set) => ({
      products: legacyState?.products ?? starterProducts,
      setProducts: (products) => set({ products }),
      upsertProduct: (product) => set((state) => {
        const exists = state.products.some((currentProduct) => currentProduct.id === product.id);

        return {
          products: exists
            ? state.products.map((currentProduct) => currentProduct.id === product.id ? product : currentProduct)
            : [...state.products, product]
        };
      }),
      deleteProduct: (productId) => set((state) => ({
        products: state.products.filter((product) => product.id !== productId)
      })),
      hydrateFromLegacy: (nextLegacyState) => {
        if (nextLegacyState?.products) {
          set({ products: nextLegacyState.products });
        }
      }
    }),
    {
      name: "smart-shoppingcart:products-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
