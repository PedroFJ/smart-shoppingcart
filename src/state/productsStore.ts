import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Product, starterProducts } from "../data/sampleData";
import { createAppJsonStorage, readLegacyAppState, shouldImportLegacyState } from "./persistence";

const legacyState = shouldImportLegacyState() ? readLegacyAppState() : null;

type ProductsState = {
  products: Product[];
  setProducts: (products: Product[]) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
};

export const useProductsStore = create<ProductsState>()(
  persist(
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
      }))
    }),
    {
      name: "smart-shoppingcart:products-store:v1",
      storage: createAppJsonStorage()
    }
  )
);
