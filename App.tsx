import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextStyle,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle
} from "react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { defaultItinerary, Product, SectionId, sections, starterProducts } from "./src/data/sampleData";
import { inferSectionRoute, PickEvent, sortByRoute } from "./src/domain/routeInference";
import { getDeviceLocalStorage, LocalStorageLike } from "./src/lib/deviceStorage";
import { defaultSyncSpaceId, isSupabaseConfigured, supabase } from "./src/lib/supabase";

type Screen = "welcome" | "list" | "add" | "shop" | "settings" | "summary";
type MainScreen = Exclude<Screen, "summary">;
type ListStatus = "needed" | "picked" | "missing" | "skipped";
type DepartmentFilter = SectionId | "all";
type SyncStatus = "local" | "loading" | "synced" | "saving" | "offline" | "error";

type ShoppingItem = Product & {
  status: ListStatus;
  acceptsAlternatives: boolean;
  note?: string;
  quantity: string;
  lastPickedAt?: string;
  customOrder?: number;
};

type NewProductInput = {
  rawName: string;
  quantity?: string;
  note?: string;
  fallbackSectionId: SectionId;
};

type SupermarketProfile = {
  id: string;
  name: string;
  detail: string;
};

type StoreItineraries = Record<string, SectionId[]>;
type StoreProductOrders = Record<string, string[]>;
type StoreStopOrders = Record<string, string[]>;

type StoreRouteStop = {
  id: string;
  name: string;
};

type PersistedAppState = {
  version: 2;
  products: Product[];
  shoppingItems: ShoppingItem[];
  itinerary: SectionId[];
  storeItineraries: StoreItineraries;
  storeStopOrders: StoreStopOrders;
  storeProductOrders: StoreProductOrders;
  selectedStoreId: string;
  pickEvents: PickEvent<SectionId>[];
  departmentFilter: DepartmentFilter;
  listSearch: string;
  addSearch: string;
  isCheckoutLocked: boolean;
  lockedPickingIds: string[];
  activeTripItemIds: string[];
  shoppingDoneNotice: boolean;
  emptyListDefaultApplied: true;
  savedAt: string;
};

type LocalUserSettings = {
  userName: string;
  voiceSearchEnabled: boolean;
  defaultStoreId: string;
  smartStartEnabled: boolean;
};

type RemoteSnapshotRow = {
  id: string;
  state: PersistedAppState;
  updated_at: string;
  updated_by: string | null;
};

const STORAGE_KEY = "smart-shoppingcart:v1";
const LOCAL_USER_SETTINGS_KEY = "smart-shoppingcart:user-settings:v1";
const SYNC_CLIENT_ID_KEY = "smart-shoppingcart:sync-client-id";
const SYNC_SPACE_ID_KEY = "smart-shoppingcart:sync-space-id";
const CURRENT_STORAGE_VERSION = 2;
const CART_DRAG_STEP = 86;
const VOICE_SEARCH_LOCALE = "pt-PT";
const APP_VERSION = "0.1.1";
const UPDATE_CHANNEL = "staging";
const searchStopWords = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "the", "of", "for"]);
const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;
const androidNavigationBarInset = Platform.OS === "android" ? 24 : 0;
const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));
const starterProductById = new Map(starterProducts.map((product) => [product.id, product]));
const webSearchInputChromeReset = {
  outlineStyle: "none",
  outlineWidth: 0,
  outlineColor: "transparent",
  boxShadow: "none"
} as unknown as TextStyle;
const supermarketProfiles: SupermarketProfile[] = [
  { id: "supercor", name: "SuperCor", detail: "Percurso principal" },
  { id: "continente", name: "Continente", detail: "Percurso semanal" },
  { id: "pingo-doce", name: "Pingo Doce", detail: "Loja local" },
  { id: "lidl", name: "Lidl", detail: "Compra rápida" },
  { id: "auchan", name: "Auchan", detail: "Hipermercado" },
  { id: "outro", name: "Outro", detail: "Percurso por treinar" }
];
const supercorRouteStops: StoreRouteStop[] = [
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
const defaultSupercorStopOrder = supercorRouteStops.map((stop) => stop.id);
const defaultStoreItineraries: StoreItineraries = supermarketProfiles.reduce<StoreItineraries>((itineraries, store) => {
  itineraries[store.id] = defaultItinerary;
  return itineraries;
}, {});
const defaultStoreId = supermarketProfiles[0].id;
const defaultLocalUserSettings: LocalUserSettings = {
  userName: "",
  voiceSearchEnabled: true,
  defaultStoreId,
  smartStartEnabled: false
};

export default function App() {
  const { height, width } = useWindowDimensions();
  const [initialAppState] = useState(readPersistedAppState);
  const syncClientId = useRef(getOrCreateSyncClientId());
  const remoteApplyInProgress = useRef(false);
  const remoteReady = useRef(!isSupabaseConfigured);
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRunPersistence = useRef(false);
  const skipNextPersistence = useRef(false);
  const latestLocalSavedAt = useRef(initialAppState?.savedAt ?? "");
  const [localUserSettings, setLocalUserSettings] = useState(readLocalUserSettings);
  const [screen, setScreen] = useState<Screen>(() => {
    if (!localUserSettings.smartStartEnabled) {
      return "welcome";
    }

    const initialNeededItems = initialAppState?.shoppingItems?.filter((item) => item.status === "needed") ?? [];
    return initialNeededItems.length > 0 ? "list" : "add";
  });
  const [activeSyncSpaceId, setActiveSyncSpaceId] = useState(getInitialSyncSpaceId);
  const [syncSpaceDraft, setSyncSpaceDraft] = useState(() => getInitialSyncSpaceId());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? "loading" : "local");
  const [syncMessage, setSyncMessage] = useState(isSupabaseConfigured ? "A sincronizar" : "Modo local");
  const [itinerary, setItinerary] = useState<SectionId[]>(() => initialAppState?.itinerary ?? defaultItinerary);
  const [storeItineraries, setStoreItineraries] = useState<StoreItineraries>(() => {
    return initialAppState?.storeItineraries ?? defaultStoreItineraries;
  });
  const [storeStopOrders, setStoreStopOrders] = useState<StoreStopOrders>(() => {
    return initialAppState?.storeStopOrders ?? { supercor: defaultSupercorStopOrder };
  });
  const [storeProductOrders, setStoreProductOrders] = useState<StoreProductOrders>(() => {
    return initialAppState?.storeProductOrders ?? {};
  });
  const [selectedStoreId, setSelectedStoreId] = useState(() => {
    return initialAppState?.selectedStoreId ?? localUserSettings.defaultStoreId ?? defaultStoreId;
  });
  const [products, setProducts] = useState<Product[]>(() => initialAppState?.products ?? starterProducts);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() => {
    return initialAppState?.shoppingItems ?? createInitialShoppingList(initialAppState?.products ?? starterProducts);
  });
  const [pickEvents, setPickEvents] = useState<PickEvent<SectionId>[]>(() => initialAppState?.pickEvents ?? []);
  const [lastChange, setLastChange] = useState<ShoppingItem | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>(() => initialAppState?.departmentFilter ?? "all");
  const [listSearch, setListSearch] = useState(() => initialAppState?.listSearch ?? "");
  const [addSearch, setAddSearch] = useState(() => initialAppState?.addSearch ?? "");
  const [shoppingDoneNotice, setShoppingDoneNotice] = useState(() => initialAppState?.shoppingDoneNotice ?? false);
  const [isCheckoutLocked, setIsCheckoutLocked] = useState(() => initialAppState?.isCheckoutLocked ?? false);
  const [lockedPickingIds, setLockedPickingIds] = useState<Set<string> | null>(() => {
    return initialAppState?.lockedPickingIds?.length ? new Set(initialAppState.lockedPickingIds) : null;
  });
  const [activeTripItemIds, setActiveTripItemIds] = useState<Set<string> | null>(() => {
    return initialAppState?.activeTripItemIds?.length ? new Set(initialAppState.activeTripItemIds) : null;
  });

  useEffect(() => {
    setProducts((current) => current.map(normalizeExistingProduct));
    setShoppingItems((current) => current.map(normalizeExistingShoppingItem));
  }, []);

  useEffect(() => {
    writeLocalUserSettings(localUserSettings);
  }, [localUserSettings]);

  useEffect(() => {
    const syncClient = supabase;

    if (!isSupabaseConfigured || !syncClient) {
      return;
    }

    let isMounted = true;
    remoteReady.current = false;

    async function loadRemoteState() {
      setSyncStatus("loading");
      setSyncMessage(`A carregar ${activeSyncSpaceId}`);

      const { data, error } = await syncClient!
        .from("app_state_snapshots")
        .select("id,state,updated_at,updated_by")
        .eq("id", activeSyncSpaceId)
        .maybeSingle<RemoteSnapshotRow>();

      if (!isMounted) {
        return;
      }

      if (error) {
        remoteReady.current = true;
        setSyncStatus("error");
        setSyncMessage("Sync indisponível");
        console.warn("Could not load remote shopping state.", error);
        return;
      }

      if (data?.state) {
        if (initialAppState && isSavedStateNewer(initialAppState.savedAt, data.state.savedAt)) {
          remoteReady.current = true;
          pushRemoteAppState(createPersistedAppState());
          return;
        }

        remoteApplyInProgress.current = true;
        applyPersistedAppState(data.state);
        remoteApplyInProgress.current = false;
        setSyncStatus("synced");
        setSyncMessage("Sincronizado");
      } else {
        remoteReady.current = true;
        pushRemoteAppState(createPersistedAppState());
      }

      remoteReady.current = true;
    }

    loadRemoteState();

    const channel = syncClient
      .channel(`app-state-${activeSyncSpaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state_snapshots", filter: `id=eq.${activeSyncSpaceId}` },
        (payload) => {
          const nextRow = payload.new as RemoteSnapshotRow | null;

          if (!nextRow?.state || nextRow.updated_by === syncClientId.current) {
            return;
          }

          if (!isSavedStateNewer(nextRow.state.savedAt, latestLocalSavedAt.current)) {
            return;
          }

          remoteApplyInProgress.current = true;
          applyPersistedAppState(nextRow.state);
          remoteApplyInProgress.current = false;
          setSyncStatus("synced");
          setSyncMessage("Atualizado pela família");
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncStatus("synced");
          setSyncMessage("Sincronizado");
        }
      });

    return () => {
      isMounted = false;
      syncClient.removeChannel(channel);
    };
  }, [activeSyncSpaceId]);

  useEffect(() => {
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      return;
    }

    if (!hasRunPersistence.current) {
      hasRunPersistence.current = true;
      return;
    }

    const nextState = createPersistedAppState();

    latestLocalSavedAt.current = nextState.savedAt;
    writePersistedAppState(nextState);

    if (!isSupabaseConfigured || !remoteReady.current || remoteApplyInProgress.current) {
      return;
    }

    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current);
    }

    setSyncStatus("saving");
    setSyncMessage("A guardar");
    syncTimeout.current = setTimeout(() => {
      pushRemoteAppState(nextState);
    }, 600);
  }, [
    addSearch,
    departmentFilter,
    isCheckoutLocked,
    activeTripItemIds,
    itinerary,
    selectedStoreId,
    storeItineraries,
    storeStopOrders,
    storeProductOrders,
    listSearch,
    lockedPickingIds,
    pickEvents,
    products,
    shoppingDoneNotice,
    shoppingItems
  ]);

  const neededItems = useMemo(() => {
    return sortShoppingItems(shoppingItems.filter((item) => item.status === "needed"), defaultItinerary);
  }, [shoppingItems]);
  const selectedStore = supermarketProfiles.find((store) => store.id === selectedStoreId) ?? supermarketProfiles[0];
  const selectedStoreRoute = storeItineraries[selectedStoreId] ?? defaultItinerary;
  const selectedStoreStopOrder = storeStopOrders[selectedStoreId] ?? defaultSupercorStopOrder;
  const pickingItems = useMemo(() => {
    return sortPickingItems(neededItems, selectedStoreId, selectedStoreRoute, selectedStoreStopOrder, storeProductOrders[selectedStoreId]);
  }, [neededItems, selectedStoreId, selectedStoreRoute, selectedStoreStopOrder, storeProductOrders]);
  const listProductIds = useMemo(() => new Set(neededItems.map((item) => item.id)), [neededItems]);
  const addableProductCount = useMemo(() => {
    return products.filter((product) => !listProductIds.has(product.id)).length;
  }, [listProductIds, products]);

  const progress = shoppingItems.filter((item) => item.status !== "needed").length;
  const inferredRoute = useMemo(() => inferSectionRoute(pickEvents, selectedStoreRoute), [pickEvents, selectedStoreRoute]);
  const isCompactLayout = width < 700 || height < 760;

  function createPersistedAppState(): PersistedAppState {
    return {
      version: CURRENT_STORAGE_VERSION,
      products: mergeProductsWithShoppingItems(products, shoppingItems),
      shoppingItems,
      itinerary,
      storeItineraries,
      storeStopOrders,
      storeProductOrders,
      selectedStoreId,
      pickEvents,
      departmentFilter,
      listSearch,
      addSearch,
      isCheckoutLocked,
      lockedPickingIds: lockedPickingIds ? Array.from(lockedPickingIds) : [],
      activeTripItemIds: activeTripItemIds ? Array.from(activeTripItemIds) : [],
      shoppingDoneNotice,
      emptyListDefaultApplied: true,
      savedAt: new Date().toISOString()
    };
  }

  async function pushRemoteAppState(nextState: PersistedAppState) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("app_state_snapshots")
      .upsert({
        id: activeSyncSpaceId,
        state: nextState,
        updated_by: syncClientId.current,
        updated_at: nextState.savedAt
      });

    if (error) {
      setSyncStatus("offline");
      setSyncMessage("Sem ligação sync");
      console.warn("Could not save remote shopping state.", error);
      return;
    }

    setSyncStatus("synced");
    setSyncMessage("Sincronizado");
  }

  function applyPersistedAppState(nextState: PersistedAppState) {
    latestLocalSavedAt.current = nextState.savedAt;
    skipNextPersistence.current = true;
    writePersistedAppState(nextState);
    setProducts(nextState.products.map(normalizeExistingProduct));
    setShoppingItems(nextState.shoppingItems.map(normalizeExistingShoppingItem));
    setItinerary(nextState.itinerary.length > 0 ? nextState.itinerary : defaultItinerary);
    setStoreItineraries(hydrateStoreItineraries(nextState.storeItineraries, nextState.itinerary));
    setStoreStopOrders(hydrateStoreStopOrders(nextState.storeStopOrders));
    setStoreProductOrders(hydrateStoreProductOrders(nextState.storeProductOrders));
    setSelectedStoreId(isSupermarketId(nextState.selectedStoreId) ? nextState.selectedStoreId : defaultStoreId);
    setPickEvents(nextState.pickEvents.filter(isPickEventLike).map(hydratePickEvent));
    setDepartmentFilter(isDepartmentFilter(nextState.departmentFilter) ? nextState.departmentFilter : "all");
    setListSearch(nextState.listSearch ?? "");
    setAddSearch(nextState.addSearch ?? "");
    setIsCheckoutLocked(Boolean(nextState.isCheckoutLocked));
    setLockedPickingIds(nextState.lockedPickingIds.length ? new Set(nextState.lockedPickingIds) : null);
    setActiveTripItemIds(nextState.activeTripItemIds.length ? new Set(nextState.activeTripItemIds) : null);
    setShoppingDoneNotice(Boolean(nextState.shoppingDoneNotice));
  }

  function buildNextShoppingList(items: ShoppingItem[], tripItemIds: Set<string> | null): ShoppingItem[] {
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

  function addProductToActiveTrip(productId: string) {
    if (!activeTripItemIds || isCheckoutLocked) {
      return;
    }

    setActiveTripItemIds((currentTripIds) => {
      const nextTripIds = new Set(currentTripIds ?? []);
      nextTripIds.add(productId);
      return nextTripIds;
    });
  }

  function addProduct(product: Product) {
    setShoppingItems((current) => {
      const existingItem = current.find((item) => item.id === product.id);

      if (existingItem?.status === "needed") {
        return current;
      }

      if (existingItem) {
        addProductToActiveTrip(product.id);
        return current.map((item) => {
          return item.id === product.id ? { ...withStatus(product), lastPickedAt: item.lastPickedAt } : item;
        });
      }

      const nextItem = withStatus(product);
      addProductToActiveTrip(product.id);

      return [...current, nextItem];
    });
  }

  function createAndAddProduct(input: NewProductInput) {
    const classifiedProduct = classifyNewProduct(input, products);

    if (!classifiedProduct) {
      return;
    }

    setProducts((current) => mergeProductsWithShoppingItems(current, [withStatus(classifiedProduct)]));
    setShoppingItems((current) => [...current, withStatus(classifiedProduct)]);
    addProductToActiveTrip(classifiedProduct.id);
    setAddSearch("");
    setDepartmentFilter(classifiedProduct.sectionId);
    setListSearch(classifiedProduct.name);
    setScreen("list");
  }

  function updateCatalogProduct(updatedProduct: Product) {
    setProducts((current) => {
      return current.map((product) => product.id === updatedProduct.id ? updatedProduct : product);
    });
    setShoppingItems((current) => {
      return current.map((item) => {
        return item.id === updatedProduct.id
          ? {
              ...item,
              ...updatedProduct,
              quantity: item.quantity,
              note: item.note ?? updatedProduct.note,
              acceptsAlternatives: item.acceptsAlternatives
            }
          : item;
      });
    });
  }

  function deleteCatalogProduct(productId: string) {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setShoppingItems((current) => current.filter((item) => item.id !== productId));
    setPickEvents((current) => current.filter((event) => event.productId !== productId));
  }

  function updateItemStatus(productId: string, status: ListStatus) {
    const item = shoppingItems.find((currentItem) => currentItem.id === productId);
    const pickedAt = status === "picked" ? new Date().toISOString() : undefined;
    const pickedQuantity = normalizeQuantityText(item?.quantity || item?.defaultQuantity || "1 un");

    if (!item) {
      return;
    }

    setLastChange(item);
    setShoppingItems((current) => {
      return current.map((currentItem) => {
        return currentItem.id === productId
          ? { ...currentItem, status, lastPickedAt: pickedAt ?? currentItem.lastPickedAt }
          : currentItem;
      });
    });

    if (pickedAt) {
      setProducts((current) => {
        const nextProducts = current.map((product) => {
          return product.id === productId
            ? { ...product, defaultQuantity: pickedQuantity, lastPickedAt: pickedAt }
            : product;
        });

        if (nextProducts.some((product) => product.id === productId)) {
          return nextProducts;
        }

        return [
          ...nextProducts,
          {
            ...productFromShoppingItem(item),
            defaultQuantity: pickedQuantity,
            lastPickedAt: pickedAt
          }
        ];
      });
    }

    if (status !== "needed") {
      setPickEvents((current) => [
        ...current,
        {
          productId: item.id,
          sectionId: item.sectionId,
          pickedAt: Date.now(),
          action: status === "picked" ? "picked" : status
        }
      ]);
    }
  }

  function toggleAcceptsAlternatives(productId: string) {
    setShoppingItems((current) => {
      return current.map((item) => {
        return item.id === productId
          ? { ...item, acceptsAlternatives: !item.acceptsAlternatives }
          : item;
      });
    });
  }

  function updateItemNote(productId: string, note: string) {
    setShoppingItems((current) => {
      return current.map((item) => {
        return item.id === productId ? { ...item, note: note || undefined } : item;
      });
    });
  }

  function updateItemQuantity(productId: string, quantity: string) {
    setShoppingItems((current) => {
      return current.map((item) => {
        return item.id === productId ? { ...item, quantity } : item;
      });
    });
  }

  function movePickingItem(productId: string, direction: "up" | "down", visibleItemIds: string[]) {
    const sourceIndex = visibleItemIds.indexOf(productId);
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= visibleItemIds.length) {
      return;
    }

    const nextOrder = [...visibleItemIds];
    const [movedProductId] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedProductId);

    setStoreProductOrders((current) => {
      return {
        ...current,
        [selectedStoreId]: nextOrder
      };
    });
    updateSelectedStoreRouteFromProductOrder(nextOrder);
  }

  function reorderPickingItem(productId: string, targetVisibleIndex: number, visibleItemIds: string[]) {
    const sourceIndex = visibleItemIds.indexOf(productId);
    const targetIndex = clampIndex(targetVisibleIndex, 0, visibleItemIds.length - 1);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const nextOrder = [...visibleItemIds];
    const [movedProductId] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedProductId);

    setStoreProductOrders((current) => {
      return {
        ...current,
        [selectedStoreId]: nextOrder
      };
    });
    updateSelectedStoreRouteFromProductOrder(nextOrder);
  }

  function updateSelectedStoreRouteFromProductOrder(productOrder: string[]) {
    const itemById = new Map(pickingItems.map((item) => [item.id, item]));
    if (selectedStoreId === "supercor") {
      const cartStopOrder = productOrder
        .map((productId) => {
          const item = itemById.get(productId);
          return item ? getSupercorRouteStopId(item) : undefined;
        })
        .filter((stopId): stopId is string => Boolean(stopId))
        .filter((stopId, index, route) => route.indexOf(stopId) === index);
      const remainingStops = completeStoreStopOrder(selectedStoreStopOrder)
        .filter((stopId) => !cartStopOrder.includes(stopId));

      if (cartStopOrder.length === 0) {
        return;
      }

      setStoreStopOrders((current) => ({
        ...current,
        [selectedStoreId]: [...cartStopOrder, ...remainingStops]
      }));
      return;
    }

    const cartSectionOrder = productOrder
      .map((productId) => itemById.get(productId)?.sectionId)
      .filter((sectionId): sectionId is SectionId => Boolean(sectionId))
      .filter((sectionId, index, route) => route.indexOf(sectionId) === index);
    const remainingSections = completeSectionRoute(selectedStoreRoute)
      .filter((sectionId) => !cartSectionOrder.includes(sectionId));

    if (cartSectionOrder.length === 0) {
      return;
    }

    setStoreItineraries((current) => ({
      ...current,
      [selectedStoreId]: [...cartSectionOrder, ...remainingSections]
    }));
  }

  function moveStoreSection(routeItemId: string, direction: "up" | "down") {
    if (selectedStoreId === "supercor") {
      setStoreStopOrders((current) => {
        const currentRoute = completeStoreStopOrder(current[selectedStoreId] ?? defaultSupercorStopOrder);
        const sourceIndex = currentRoute.indexOf(routeItemId);
        const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

        if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= currentRoute.length) {
          return current;
        }

        const nextRoute = [...currentRoute];
        nextRoute[sourceIndex] = currentRoute[targetIndex];
        nextRoute[targetIndex] = routeItemId;

        return {
          ...current,
          [selectedStoreId]: nextRoute
        };
      });
      setStoreProductOrders((current) => ({
        ...current,
        [selectedStoreId]: []
      }));
      return;
    }

    if (!isSectionId(routeItemId)) {
      return;
    }

    setStoreItineraries((current) => {
      const currentRoute = completeSectionRoute(current[selectedStoreId] ?? defaultItinerary);
      const sourceIndex = currentRoute.indexOf(routeItemId);
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;

      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= currentRoute.length) {
        return current;
      }

      const nextRoute = [...currentRoute];
      nextRoute[sourceIndex] = currentRoute[targetIndex];
      nextRoute[targetIndex] = routeItemId;

      return {
        ...current,
        [selectedStoreId]: nextRoute
      };
    });
    setStoreProductOrders((current) => ({
      ...current,
      [selectedStoreId]: []
    }));
  }

  function undoLastChange() {
    if (!lastChange) {
      return;
    }

    setShoppingItems((current) => {
      return current.map((item) => {
        return item.id === lastChange.id ? { ...item, status: lastChange.status } : item;
      });
    });
    setProducts((current) => {
      return current.map((product) => {
        return product.id === lastChange.id
          ? {
              ...product,
              defaultQuantity: lastChange.defaultQuantity,
              lastPickedAt: lastChange.lastPickedAt
            }
          : product;
      });
    });
    setPickEvents((current) => current.filter((event) => event.productId !== lastChange.id));
    setLastChange(null);
  }

  function saveInferredRoute() {
    setStoreItineraries((current) => ({
      ...current,
      [selectedStoreId]: inferredRoute.sectionIds
    }));
    setItinerary(inferredRoute.sectionIds);
    setPickEvents([]);
    setLastChange(null);
    setScreen("list");
  }

  function startShoppingTrip() {
    if (!activeTripItemIds) {
      setActiveTripItemIds(new Set(neededItems.map((item) => item.id)));
    }
    setScreen("shop");
  }

  function navigateToMainScreen(nextScreen: MainScreen) {
    if (nextScreen === "shop") {
      startShoppingTrip();
      return;
    }

    setScreen(nextScreen);
  }

  function lockCheckoutList() {
    finishShoppingTrip();
  }

  function finishShoppingTrip() {
    const tripItemIds = activeTripItemIds ?? lockedPickingIds;
    setProducts((current) => mergeProductsWithShoppingItems(current, shoppingItems));
    setShoppingItems((current) => buildNextShoppingList(current, tripItemIds));
    setPickEvents([]);
    setLastChange(null);
    setIsCheckoutLocked(false);
    setLockedPickingIds(null);
    setActiveTripItemIds(null);
    setDepartmentFilter("all");
    setListSearch("");
    setAddSearch("");
    setShoppingDoneNotice(true);
    setScreen("list");
  }

  function saveSyncSpace() {
    const nextSyncSpaceId = normalizeSyncSpaceId(syncSpaceDraft);
    const storage = getLocalStorage();

    storage?.setItem(SYNC_SPACE_ID_KEY, nextSyncSpaceId);
    setSyncSpaceDraft(nextSyncSpaceId);
    setActiveSyncSpaceId(nextSyncSpaceId);

    if (!isSupabaseConfigured) {
      setSyncStatus("local");
      setSyncMessage("Modo local");
      return;
    }

    setSyncStatus("loading");
    setSyncMessage(`A carregar ${nextSyncSpaceId}`);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7F9" translucent={false} />
      <View style={[styles.appShell, isCompactLayout && styles.appShellCompact]}>
        <Header
          compact={isCompactLayout}
          progress={progress}
          total={shoppingItems.length}
          syncStatus={syncStatus}
          syncMessage={syncMessage}
          onOpenSettings={() => setScreen("settings")}
        />
        {screen !== "summary" && !isCompactLayout && (
          <NavigationTabs
            activeScreen={screen}
            listCount={neededItems.length}
            addCount={addableProductCount}
            cartCount={pickingItems.length}
            isCheckoutLocked={isCheckoutLocked}
            showWelcome={!localUserSettings.smartStartEnabled}
            compact={false}
            onNavigate={navigateToMainScreen}
          />
        )}

        <View style={styles.contentArea}>
        {screen === "welcome" && (
          <WelcomeScreen />
        )}

        {screen === "list" && (
          <ListScreen
            items={neededItems}
            departmentFilter={departmentFilter}
            onChangeDepartmentFilter={setDepartmentFilter}
            searchText={listSearch}
            onChangeSearchText={setListSearch}
            shoppingDoneNotice={shoppingDoneNotice}
            onClearShoppingDoneNotice={() => setShoppingDoneNotice(false)}
            onRemove={(productId) => updateItemStatus(productId, "skipped")}
            onToggleAlternatives={toggleAcceptsAlternatives}
            onChangeNote={updateItemNote}
            onChangeQuantity={updateItemQuantity}
            voiceSearchEnabled={localUserSettings.voiceSearchEnabled}
          />
        )}

        {screen === "add" && (
          <AddScreen
            products={products}
            listProductIds={listProductIds}
            departmentFilter={departmentFilter}
            onChangeDepartmentFilter={setDepartmentFilter}
            searchText={addSearch}
            onChangeSearchText={setAddSearch}
            onAdd={addProduct}
            onCreateProduct={createAndAddProduct}
            onUpdateProduct={updateCatalogProduct}
            onDeleteProduct={deleteCatalogProduct}
            voiceSearchEnabled={localUserSettings.voiceSearchEnabled}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen
            activeSyncSpaceId={activeSyncSpaceId}
            isSupabaseConfigured={isSupabaseConfigured}
            localUserSettings={localUserSettings}
            onChangeLocalUserSettings={setLocalUserSettings}
            onSaveSyncSpace={saveSyncSpace}
            onSyncSpaceDraftChange={setSyncSpaceDraft}
            onSelectDefaultStore={(storeId) => {
              setLocalUserSettings((current) => ({ ...current, defaultStoreId: storeId }));
              setSelectedStoreId(storeId);
            }}
            stores={supermarketProfiles}
            selectedDefaultStoreId={localUserSettings.defaultStoreId}
            selectedStoreName={selectedStore.name}
            syncSpaceDraft={syncSpaceDraft}
            syncStatus={syncStatus}
          />
        )}

        {screen === "shop" && (
          <ShopScreen
            items={pickingItems}
            stores={supermarketProfiles}
            selectedStoreId={selectedStoreId}
            storeRoute={selectedStoreRoute}
            storeStopOrder={selectedStoreStopOrder}
            onChangeStore={setSelectedStoreId}
            onMoveStoreSection={moveStoreSection}
            onPicked={(productId) => updateItemStatus(productId, "picked")}
            onMoveItem={movePickingItem}
            onReorderItem={reorderPickingItem}
            onUndo={undoLastChange}
            onLockCheckout={lockCheckoutList}
            canUndo={Boolean(lastChange)}
            isCheckoutLocked={isCheckoutLocked}
            compact={isCompactLayout}
          />
        )}

        {screen === "summary" && (
          <SummaryScreen
            route={inferredRoute.sectionIds}
            confidence={inferredRoute.confidence}
            storeName={selectedStore.name}
            onSave={saveInferredRoute}
            onBack={() => setScreen("shop")}
          />
        )}
        </View>

        {screen !== "summary" && isCompactLayout && (
          <NavigationTabs
            activeScreen={screen}
            listCount={neededItems.length}
            addCount={addableProductCount}
            cartCount={pickingItems.length}
            isCheckoutLocked={isCheckoutLocked}
            showWelcome={!localUserSettings.smartStartEnabled}
            compact
            onNavigate={navigateToMainScreen}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Header({
  compact,
  progress,
  total,
  syncStatus,
  syncMessage,
  onOpenSettings
}: {
  compact: boolean;
  progress: number;
  total: number;
  syncStatus: SyncStatus;
  syncMessage: string;
  onOpenSettings: () => void;
}) {
  if (compact) {
    return (
      <View style={[styles.header, styles.headerCompact]}>
        <View style={styles.headerCompactRow}>
          <View style={styles.titleActionRowCompact}>
            <Text style={[styles.title, styles.titleCompact]}>Smart Shoppingcart</Text>
            <TouchableOpacity style={styles.titleSettingsLinkCompact} onPress={onOpenSettings}>
              <Text style={styles.titleSettingsLinkText}>Definições</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.headerCompactMeta}>
            <Text style={[styles.syncPill, styles.syncPillCompact, getSyncPillStyle(syncStatus)]}>{syncMessage}</Text>
            <Text style={styles.progressCompact}>{progress}/{total}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <Text style={styles.kicker}>Weekend shop</Text>
      <View style={styles.titleActionRow}>
        <Text style={styles.title}>Smart Shoppingcart</Text>
        <TouchableOpacity style={styles.titleSettingsLink} onPress={onOpenSettings}>
          <Text style={styles.titleSettingsLinkText}>Definições</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.headerMetaRow}>
        <Text style={styles.progress}>{progress} de {total} tratados</Text>
        <Text style={[styles.syncPill, getSyncPillStyle(syncStatus)]}>{syncMessage}</Text>
      </View>
    </View>
  );
}

function getSyncPillStyle(syncStatus: SyncStatus): TextStyle {
  if (syncStatus === "synced") {
    return styles.syncPill_synced;
  }

  if (syncStatus === "saving" || syncStatus === "loading") {
    return styles.syncPill_saving;
  }

  if (syncStatus === "offline" || syncStatus === "error") {
    return styles.syncPill_error;
  }

  return styles.syncPill_local;
}

function useVoiceSearch({
  contextualStrings,
  enabled,
  onTranscript
}: {
  contextualStrings: string[];
  enabled: boolean;
  onTranscript: (transcript: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    if (!enabled) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // Voice search can be unavailable on web or older builds.
      }
      setIsListening(false);
      return;
    }

    try {
      setIsAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setIsAvailable(false);
    }
  }, [enabled]);

  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript.trim();

    if (transcript) {
      onTranscript(transcript);
    }

    if (event.isFinal && Platform.OS === "web") {
      ExpoSpeechRecognitionModule.stop();
    }
  });
  useSpeechRecognitionEvent("error", () => {
    setIsListening(false);
  });

  async function toggle() {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setIsAvailable(false);
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        setIsListening(false);
        setIsAvailable(false);
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: VOICE_SEARCH_LOCALE,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        contextualStrings: contextualStrings.slice(0, 80),
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "web_search"
        },
        iosTaskHint: "search"
      });
    } catch {
      setIsListening(false);
      setIsAvailable(false);
    }
  }

  return {
    isAvailable,
    isListening,
    toggle
  };
}

function VoiceSearchButton({
  isListening,
  onPress
}: {
  isListening: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.voiceSearchButton,
        isListening && styles.voiceSearchButtonActive
      ]}
      onPress={onPress}
    >
      <View style={styles.microphoneIcon}>
        <View style={[styles.microphoneHead, isListening && styles.microphoneIconActive]} />
        <View style={[styles.microphoneStem, isListening && styles.microphoneIconActive]} />
        <View style={[styles.microphoneBase, isListening && styles.microphoneIconActive]} />
      </View>
    </TouchableOpacity>
  );
}

function NavigationTabs({
  activeScreen,
  listCount,
  addCount,
  cartCount,
  isCheckoutLocked,
  showWelcome,
  compact,
  onNavigate
}: {
  activeScreen: MainScreen;
  listCount: number;
  addCount: number;
  cartCount: number;
  isCheckoutLocked: boolean;
  showWelcome: boolean;
  compact: boolean;
  onNavigate: (screen: MainScreen) => void;
}) {
  const allTabs: Array<{ screen: MainScreen; label: string; count: number; detail?: string }> = [
    { screen: "welcome", label: "Início", count: 0 },
    { screen: "list", label: "Lista", count: listCount },
    { screen: "add", label: "Adicionar", count: addCount },
    { screen: "shop", label: "Carrinho", count: cartCount, detail: isCheckoutLocked ? "A pagar" : undefined },
    { screen: "settings", label: "Definições", count: 0 }
  ];
  const visibleTabs = allTabs.filter((tab) => tab.screen !== "settings");
  const tabs = showWelcome ? visibleTabs : visibleTabs.filter((tab) => tab.screen !== "welcome");

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.navTabs, compact && styles.navTabsCompact]}
      style={[styles.navTabsRail, compact && styles.navTabsRailCompact]}
    >
      {tabs.map((tab) => {
        const isActive = activeScreen === tab.screen;

        return (
          <TouchableOpacity
            key={tab.screen}
            style={[styles.navTab, compact && styles.navTabCompact, isActive && styles.navTabActive]}
            onPress={() => onNavigate(tab.screen)}
          >
            <Text style={[styles.navTabLabel, compact && styles.navTabLabelCompact, isActive && styles.navTabLabelActive]}>
              {tab.label}
            </Text>
            <Text style={[styles.navTabMeta, compact && styles.navTabMetaCompact, isActive && styles.navTabMetaActive]}>
              {tab.screen === "welcome" ? "Ajuda" : tab.screen === "settings" ? "Conta" : tab.detail ? `${tab.count} - ${tab.detail}` : String(tab.count)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function WelcomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.welcomeContent}>
      <View style={styles.welcomePanel}>
        <Text style={styles.welcomeTitle}>Compras sem voltas desnecessarias</Text>
        <Text style={styles.welcomeText}>
          A Smart Shoppingcart ajuda a família a manter uma lista partilhada, escolher produtos do catálogo e fazer a compra pela ordem certa da loja.
        </Text>
      </View>

      <View style={styles.welcomeSteps}>
        <View style={styles.welcomeStep}>
          <Text style={styles.welcomeStepNumber}>1</Text>
          <View style={styles.welcomeStepText}>
            <Text style={styles.welcomeStepTitle}>Prepare a Lista</Text>
            <Text style={styles.welcomeText}>A lista começa vazia. Adicione só o que quer comprar e ajuste quantidades, notas, marcas e alternativas.</Text>
          </View>
        </View>
        <View style={styles.welcomeStep}>
          <Text style={styles.welcomeStepNumber}>2</Text>
          <View style={styles.welcomeStepText}>
            <Text style={styles.welcomeStepTitle}>Use Adicionar</Text>
            <Text style={styles.welcomeText}>Produtos que ja estao na Lista desaparecem de Adicionar. Pode procurar, filtrar por departamento ou criar um produto novo.</Text>
          </View>
        </View>
        <View style={styles.welcomeStep}>
          <Text style={styles.welcomeStepNumber}>3</Text>
          <View style={styles.welcomeStepText}>
            <Text style={styles.welcomeStepTitle}>Compre no Carrinho</Text>
            <Text style={styles.welcomeText}>No supermercado, siga a ordem do Carrinho, marque Apanhado em cada produto e use A pagar! para terminar a compra.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SettingsScreen({
  activeSyncSpaceId,
  isSupabaseConfigured,
  localUserSettings,
  onChangeLocalUserSettings,
  onSaveSyncSpace,
  onSyncSpaceDraftChange,
  onSelectDefaultStore,
  stores,
  selectedDefaultStoreId,
  selectedStoreName,
  syncSpaceDraft,
  syncStatus
}: {
  activeSyncSpaceId: string;
  isSupabaseConfigured: boolean;
  localUserSettings: LocalUserSettings;
  onChangeLocalUserSettings: (settings: LocalUserSettings) => void;
  onSaveSyncSpace: () => void;
  onSyncSpaceDraftChange: (value: string) => void;
  onSelectDefaultStore: (storeId: string) => void;
  stores: SupermarketProfile[];
  selectedDefaultStoreId: string;
  selectedStoreName: string;
  syncSpaceDraft: string;
  syncStatus: SyncStatus;
}) {
  function updateLocalSettings(patch: Partial<LocalUserSettings>) {
    onChangeLocalUserSettings({ ...localUserSettings, ...patch });
  }

  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Arranque</Text>
        <View style={styles.settingsRow}>
          <View style={styles.settingsRowText}>
            <Text style={styles.settingsLabel}>Saltar Início</Text>
            <Text style={styles.settingsText}>Quando ligado, abre em Lista se houver produtos; se a Lista estiver vazia, abre em Adicionar.</Text>
          </View>
          <Switch
            value={localUserSettings.smartStartEnabled}
            onValueChange={(smartStartEnabled) => updateLocalSettings({ smartStartEnabled })}
            trackColor={{ false: "#C8D0DB", true: "#9AD4D9" }}
            thumbColor={localUserSettings.smartStartEnabled ? "#12616F" : "#F7F9FC"}
          />
        </View>
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Utilizador</Text>
        <Text style={styles.settingsText}>Estas preferências ficam neste telemóvel.</Text>
        <TextInput
          style={styles.settingsInput}
          value={localUserSettings.userName}
          onChangeText={(userName) => updateLocalSettings({ userName })}
          placeholder="Nome"
        />
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Conta e palavra-passe</Text>
        <Text style={styles.settingsText}>
          A app ainda não tem login de utilizador. Para gerir palavras-passe com segurança, o próximo passo é ligar autenticação, por exemplo Supabase Auth, e depois mostrar aqui alterar palavra-passe, terminar sessão e recuperação de conta.
        </Text>
        <View style={styles.settingsDisabledAction}>
          <Text style={styles.settingsDisabledActionText}>Gestão de password indisponível</Text>
        </View>
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Partilha familiar</Text>
        <View style={styles.syncPanelHeader}>
          <View style={styles.syncPanelText}>
            <Text style={styles.settingsText}>
              {isSupabaseConfigured
                ? `A usar o código ${activeSyncSpaceId}. Todos os telemóveis com este código partilham a mesma lista.`
                : "Configure o Supabase para ativar a partilha entre telemóveis. O código fica preparado para quando ligar o sync."}
            </Text>
          </View>
          <Text style={[styles.syncPill, getSyncPillStyle(syncStatus)]}>
            {isSupabaseConfigured ? "Sync" : "Local"}
          </Text>
        </View>
        <View style={styles.syncSpaceRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.syncSpaceInput}
            value={syncSpaceDraft}
            onChangeText={onSyncSpaceDraftChange}
            placeholder="codigo-familia"
          />
          <TouchableOpacity style={styles.syncSpaceButton} onPress={onSaveSyncSpace}>
            <Text style={styles.syncSpaceButtonText}>Usar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Pesquisa</Text>
        <View style={styles.settingsRow}>
          <View style={styles.settingsRowText}>
            <Text style={styles.settingsLabel}>Pesquisa por voz</Text>
            <Text style={styles.settingsText}>Mostra o microfone em Lista e Adicionar e usa PT-pt.</Text>
          </View>
          <Switch
            value={localUserSettings.voiceSearchEnabled}
            onValueChange={(voiceSearchEnabled) => updateLocalSettings({ voiceSearchEnabled })}
            trackColor={{ false: "#C8D0DB", true: "#9AD4D9" }}
            thumbColor={localUserSettings.voiceSearchEnabled ? "#12616F" : "#F7F9FC"}
          />
        </View>
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Loja</Text>
        <Text style={styles.settingsText}>Loja ativa: {selectedStoreName}. Escolha a loja predefinida deste telemóvel.</Text>
        <View style={styles.defaultStoreGrid}>
          {stores.map((store) => {
            const isSelected = store.id === selectedDefaultStoreId;

            return (
              <TouchableOpacity
                key={store.id}
                style={[styles.defaultStoreButton, isSelected && styles.defaultStoreButtonActive]}
                onPress={() => onSelectDefaultStore(store.id)}
              >
                <Text style={[styles.defaultStoreButtonText, isSelected && styles.defaultStoreButtonTextActive]}>{store.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.settingsPanel}>
        <Text style={styles.settingsTitle}>Sobre esta app</Text>
        <Text style={styles.settingsText}>
          Smart Shoppingcart ajuda a preparar a lista familiar, adicionar produtos, organizar o carrinho pela ordem da loja e aprender percursos de supermercado.
        </Text>
        <Text style={styles.settingsMeta}>Versão {APP_VERSION} · Canal {UPDATE_CHANNEL}</Text>
      </View>
    </ScrollView>
  );
}

function ListScreen({
  items,
  departmentFilter,
  onChangeDepartmentFilter,
  searchText,
  onChangeSearchText,
  shoppingDoneNotice,
  onClearShoppingDoneNotice,
  onRemove,
  onToggleAlternatives,
  onChangeNote,
  onChangeQuantity,
  voiceSearchEnabled
}: {
  items: ShoppingItem[];
  departmentFilter: DepartmentFilter;
  onChangeDepartmentFilter: (filter: DepartmentFilter) => void;
  searchText: string;
  onChangeSearchText: (value: string) => void;
  shoppingDoneNotice: boolean;
  onClearShoppingDoneNotice: () => void;
  onRemove: (productId: string) => void;
  onToggleAlternatives: (productId: string) => void;
  onChangeNote: (productId: string, note: string) => void;
  onChangeQuantity: (productId: string, quantity: string) => void;
  voiceSearchEnabled: boolean;
}) {
  const availableDepartments = sections.filter((section) => {
    return items.some((item) => item.sectionId === section.id);
  });
  const effectiveDepartmentFilter = departmentFilter === "all" || availableDepartments.some((section) => section.id === departmentFilter)
    ? departmentFilter
    : "all";
  const departmentItems = effectiveDepartmentFilter === "all"
    ? items
    : items.filter((item) => item.sectionId === effectiveDepartmentFilter);
  const visibleItems = filterBySearch(departmentItems, searchText);
  const isListEmpty = items.length === 0;
  const listVoiceSearch = useVoiceSearch({
    contextualStrings: items.map((item) => item.name),
    enabled: voiceSearchEnabled,
    onTranscript: onChangeSearchText
  });

  return (
    <View style={styles.screen}>
      {shoppingDoneNotice && (
        <View style={styles.shoppingDoneNotice}>
          <View style={styles.shoppingDoneTextColumn}>
            <Text style={styles.shoppingDoneTitle}>Compra terminada</Text>
            <Text style={styles.shoppingDoneText}>A Lista já foi atualizada com os produtos que ficaram por apanhar.</Text>
          </View>
          <TouchableOpacity style={styles.noticeClearButton} onPress={onClearShoppingDoneNotice}>
            <Text style={styles.noticeClearButtonText}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal
        directionalLockEnabled
        contentContainerStyle={styles.filterBar}
        style={styles.filterRail}
      >
        <TouchableOpacity
          style={[styles.filterButton, effectiveDepartmentFilter === "all" && styles.filterButtonActive]}
          onPress={() => onChangeDepartmentFilter("all")}
        >
          <Text style={[styles.filterText, effectiveDepartmentFilter === "all" && styles.filterTextActive]}>
            Tudo
          </Text>
        </TouchableOpacity>
        {availableDepartments.map((section) => (
          <TouchableOpacity
            key={section.id}
            style={[styles.filterButton, effectiveDepartmentFilter === section.id && styles.filterButtonActive]}
            onPress={() => onChangeDepartmentFilter(section.id)}
          >
            <Text style={[styles.filterText, effectiveDepartmentFilter === section.id && styles.filterTextActive]}>
              {section.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchBox}>
        <TextInput
          style={[styles.searchInput, webSearchInputChromeReset]}
          value={searchText}
          onChangeText={onChangeSearchText}
          placeholder="Procurar na lista"
        />
        {voiceSearchEnabled && listVoiceSearch.isAvailable && (
          <VoiceSearchButton
            isListening={listVoiceSearch.isListening}
            onPress={listVoiceSearch.toggle}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {isListEmpty && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>A Lista está vazia. Use Adicionar para escolher só o que quer comprar.</Text>
          </View>
        )}
        {!isListEmpty && visibleItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Não há produtos nesta vista. Limpe a pesquisa ou escolha outro departamento.</Text>
            <TouchableOpacity
              style={styles.secondaryButtonFull}
              onPress={() => {
                onChangeDepartmentFilter("all");
                onChangeSearchText("");
              }}
            >
              <Text style={styles.secondaryButtonText}>Limpar filtros</Text>
            </TouchableOpacity>
          </View>
        )}
        {visibleItems.map((item) => (
          <View key={item.id} style={[styles.itemCard, getSectionCardStyle(item.sectionId)]}>
            <TouchableOpacity style={styles.itemColumn} onPress={() => onToggleAlternatives(item.id)}>
              <View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>{formatListItemDetails(item)}</Text>
                <Text style={styles.lastPickedText}>{formatLastPicked(item.lastPickedAt)}</Text>
                <Text style={[styles.preferencePill, item.acceptsAlternatives ? styles.preferenceOpen : styles.preferenceExact]}>
                  {item.acceptsAlternatives ? "Alternativas OK" : "Marca exata"}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.quantityColumn}>
              <View style={styles.quantityHeader}>
                <Text style={styles.fieldLabel}>Qtd</Text>
              </View>
              <TextInput
                style={styles.quantityInput}
                value={item.quantity}
                onChangeText={(quantity) => onChangeQuantity(item.id, quantity)}
                onBlur={() => onChangeQuantity(item.id, normalizeQuantityText(item.quantity))}
                onEndEditing={(event) => onChangeQuantity(item.id, normalizeQuantityText(event.nativeEvent.text))}
                onSubmitEditing={(event) => onChangeQuantity(item.id, normalizeQuantityText(event.nativeEvent.text))}
                placeholder="1 un"
              />
            </View>
            <View style={styles.noteColumn}>
              <View style={styles.noteHeader}>
                <Text style={styles.fieldLabel}>Nota</Text>
                <TouchableOpacity style={styles.listPostponeAction} onPress={() => onRemove(item.id)}>
                  <Text style={styles.rowAction}>Adiar</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.noteInput}
                value={item.note ?? ""}
                onChangeText={(note) => onChangeNote(item.id, note)}
                placeholder="Nota"
                placeholderTextColor="#596579"
                multiline
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function AddScreen({
  products,
  listProductIds,
  departmentFilter,
  onChangeDepartmentFilter,
  searchText,
  onChangeSearchText,
  onAdd,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  voiceSearchEnabled
}: {
  products: Product[];
  listProductIds: Set<string>;
  departmentFilter: DepartmentFilter;
  onChangeDepartmentFilter: (filter: DepartmentFilter) => void;
  searchText: string;
  onChangeSearchText: (value: string) => void;
  onAdd: (product: Product) => void;
  onCreateProduct: (input: NewProductInput) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  voiceSearchEnabled: boolean;
}) {
  const [newProductName, setNewProductName] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("1 un");
  const [newProductNote, setNewProductNote] = useState("");
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Product | null>(null);
  const targetSectionId = departmentFilter === "all" ? "pantry" : departmentFilter;
  const availableDepartments = sections.filter((section) => {
    return products.some((product) => product.sectionId === section.id && !listProductIds.has(product.id));
  });
  const addableProducts = products.filter((product) => !listProductIds.has(product.id));
  const sortedAddableProducts = sortByRoute(addableProducts, defaultItinerary, getProductSortLabel);
  const departmentProducts = departmentFilter === "all"
    ? sortedAddableProducts
    : sortedAddableProducts.filter((product) => product.sectionId === departmentFilter);
  const visibleProducts = filterBySearch(departmentProducts, searchText);
  const addVoiceSearch = useVoiceSearch({
    contextualStrings: products.map((product) => product.name),
    enabled: voiceSearchEnabled,
    onTranscript: onChangeSearchText
  });

  function handleCreateProduct() {
    onCreateProduct({
      rawName: newProductName,
      quantity: newProductQuantity,
      note: newProductNote,
      fallbackSectionId: targetSectionId
    });
    setNewProductName("");
    setNewProductQuantity("1 un");
    setNewProductNote("");
    setIsNewProductOpen(false);
  }

  function beginEditProduct(product: Product) {
    setEditingProductId(product.id);
    setEditDraft({ ...product });
  }

  function updateEditDraft(patch: Partial<Product>) {
    setEditDraft((current) => current ? { ...current, ...patch } : current);
  }

  function saveEditProduct() {
    if (!editDraft) {
      return;
    }

    const trimmedName = editDraft.name.trim();

    if (!trimmedName) {
      return;
    }

    onUpdateProduct({
      ...editDraft,
      name: trimmedName,
      brand: editDraft.brand?.trim() || undefined,
      note: editDraft.note?.trim() || undefined,
      defaultQuantity: editDraft.defaultQuantity.trim() || "1 un"
    });
    setEditingProductId(null);
    setEditDraft(null);
  }

  function cancelEditProduct() {
    setEditingProductId(null);
    setEditDraft(null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal
        directionalLockEnabled
        contentContainerStyle={styles.filterBar}
        style={styles.filterRail}
      >
        <TouchableOpacity
          style={[styles.filterButton, departmentFilter === "all" && styles.filterButtonActive]}
          onPress={() => onChangeDepartmentFilter("all")}
        >
          <Text style={[styles.filterText, departmentFilter === "all" && styles.filterTextActive]}>
            Tudo
          </Text>
        </TouchableOpacity>
        {availableDepartments.map((section) => (
          <TouchableOpacity
            key={section.id}
            style={[styles.filterButton, departmentFilter === section.id && styles.filterButtonActive]}
            onPress={() => onChangeDepartmentFilter(section.id)}
          >
            <Text style={[styles.filterText, departmentFilter === section.id && styles.filterTextActive]}>
              {section.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchBox}>
        <TextInput
          style={[styles.searchInput, webSearchInputChromeReset]}
          value={searchText}
          onChangeText={onChangeSearchText}
          placeholder="Procurar para adicionar"
        />
        {voiceSearchEnabled && addVoiceSearch.isAvailable && (
          <VoiceSearchButton
            isListening={addVoiceSearch.isListening}
            onPress={addVoiceSearch.toggle}
          />
        )}
      </View>

      {!isNewProductOpen && (
        <TouchableOpacity style={styles.newProductClosedButton} onPress={() => setIsNewProductOpen(true)}>
          <Text style={styles.newProductClosedText}>Produto novo</Text>
        </TouchableOpacity>
      )}

      {isNewProductOpen && (
        <View style={styles.newProductBox}>
          <View style={styles.newProductHeader}>
            <Text style={styles.sectionLabel}>Produto novo</Text>
            <TouchableOpacity onPress={() => setIsNewProductOpen(false)}>
              <Text style={styles.rowAction}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.newProductFields}>
            <TextInput
              style={styles.newProductNameInput}
              value={newProductName}
              onChangeText={setNewProductName}
              placeholder="Nome, marca ou nota"
            />
            <TextInput
              style={styles.newProductQuantityInput}
              value={newProductQuantity}
              onChangeText={setNewProductQuantity}
              placeholder="1 un"
            />
          </View>
          <TextInput
            style={styles.newProductNoteInput}
            value={newProductNote}
            onChangeText={setNewProductNote}
            placeholder="Nota opcional"
            multiline
          />
          <TouchableOpacity style={styles.createProductButtonFull} onPress={handleCreateProduct}>
            <Text style={styles.createProductText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {visibleProducts.map((product) => {
          const isEditing = editingProductId === product.id && editDraft;

          if (isEditing) {
            return (
              <View key={product.id} style={[styles.productEditCard, getSectionCardStyle(editDraft.sectionId)]}>
                <View style={styles.newProductFields}>
                  <TextInput
                    style={styles.newProductNameInput}
                    value={editDraft.name}
                    onChangeText={(name) => updateEditDraft({ name })}
                    placeholder="Nome"
                  />
                  <TextInput
                    style={styles.newProductQuantityInput}
                    value={editDraft.defaultQuantity}
                    onChangeText={(defaultQuantity) => updateEditDraft({ defaultQuantity })}
                    placeholder="1 un"
                  />
                </View>
                <View style={styles.newProductFields}>
                  <TextInput
                    style={styles.newProductNameInput}
                    value={editDraft.brand ?? ""}
                    onChangeText={(brand) => updateEditDraft({ brand })}
                    placeholder="Marca"
                  />
                  <TouchableOpacity
                    style={[styles.newProductPreference, editDraft.defaultAcceptsAlternatives ? styles.preferenceOpenBox : styles.preferenceExactBox]}
                    onPress={() => updateEditDraft({ defaultAcceptsAlternatives: !editDraft.defaultAcceptsAlternatives })}
                  >
                    <Text style={editDraft.defaultAcceptsAlternatives ? styles.preferenceOpenText : styles.preferenceExactText}>
                      {editDraft.defaultAcceptsAlternatives ? "Alternativas OK" : "Marca exata"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editSectionBar}>
                  {sections.map((section) => (
                    <TouchableOpacity
                      key={section.id}
                      style={[styles.editSectionButton, editDraft.sectionId === section.id && styles.filterButtonActive]}
                      onPress={() => updateEditDraft({ sectionId: section.id })}
                    >
                      <Text style={[styles.filterText, editDraft.sectionId === section.id && styles.filterTextActive]}>
                        {section.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={styles.newProductNoteInput}
                  value={editDraft.note ?? ""}
                  onChangeText={(note) => updateEditDraft({ note })}
                  placeholder="Nota"
                  multiline
                />
                <View style={styles.newProductActions}>
                  <TouchableOpacity style={styles.createProductButton} onPress={saveEditProduct}>
                    <Text style={styles.createProductText}>Guardar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelEditButton} onPress={cancelEditProduct}>
                    <Text style={styles.cancelEditText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return (
            <View key={product.id} style={[styles.catalogCard, getSectionCardStyle(product.sectionId)]}>
              <View style={styles.catalogTopRow}>
                <TouchableOpacity style={styles.catalogInfo} onPress={() => onAdd(product)}>
                  <Text style={styles.itemName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>{formatProductDetails(product)}</Text>
                  <Text style={styles.lastPickedText} numberOfLines={1}>{formatLastPicked(product.lastPickedAt)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.catalogAddButton} onPress={() => onAdd(product)}>
                  <Text style={styles.catalogAddText}>Adicionar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.catalogNoteRow}>
                <Text style={styles.fieldLabel}>Nota</Text>
                <Text style={styles.catalogNoteText} numberOfLines={2}>{product.note || "Sem nota"}</Text>
              </View>

              <View style={styles.catalogFooterRow}>
                <Text style={[styles.preferencePill, product.defaultAcceptsAlternatives ? styles.preferenceOpen : styles.preferenceExact]}>
                  {product.defaultAcceptsAlternatives ? "Alternativas OK" : "Marca exata"}
                </Text>
                <View style={styles.catalogManageActions}>
                  <TouchableOpacity style={styles.catalogSmallAction} onPress={() => beginEditProduct(product)}>
                    <Text style={styles.manageButtonText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.catalogSmallAction} onPress={() => onDeleteProduct(product.id)}>
                    <Text style={styles.deleteButtonText}>Apagar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
        {visibleProducts.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Não há produtos para adicionar neste departamento.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ShopScreen({
  items,
  stores,
  selectedStoreId,
  storeRoute,
  storeStopOrder,
  onChangeStore,
  onMoveStoreSection,
  onPicked,
  onMoveItem,
  onReorderItem,
  onUndo,
  onLockCheckout,
  canUndo,
  isCheckoutLocked,
  compact
}: {
  items: ShoppingItem[];
  stores: SupermarketProfile[];
  selectedStoreId: string;
  storeRoute: SectionId[];
  storeStopOrder: string[];
  onChangeStore: (storeId: string) => void;
  onMoveStoreSection: (routeItemId: string, direction: "up" | "down") => void;
  onPicked: (productId: string) => void;
  onMoveItem: (productId: string, direction: "up" | "down", visibleItemIds: string[]) => void;
  onReorderItem: (productId: string, targetVisibleIndex: number, visibleItemIds: string[]) => void;
  onUndo: () => void;
  onLockCheckout: () => void;
  canUndo: boolean;
  isCheckoutLocked: boolean;
  compact: boolean;
}) {
  const visibleItemIds = items.map((item) => item.id);
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null);
  const [hoveredDragProductId, setHoveredDragProductId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isRouteEditorOpen, setIsRouteEditorOpen] = useState(false);
  const dragStartPageY = useRef(0);
  const dragVisibleItemIdsRef = useRef(visibleItemIds);
  const routeEditorItems = getRouteEditorItems(selectedStoreId, storeRoute, storeStopOrder);
  const dragSourceIndex = draggingProductId ? visibleItemIds.indexOf(draggingProductId) : -1;
  const dragTargetIndex = dragSourceIndex >= 0
    ? clampIndex(dragSourceIndex + Math.round(dragOffsetY / CART_DRAG_STEP), 0, items.length - 1)
    : -1;

  useEffect(() => {
    if (draggingProductId === null) {
      dragVisibleItemIdsRef.current = visibleItemIds;
    }
  }, [draggingProductId, visibleItemIds]);

  function finishDragging(productId: string, offsetY: number) {
    const dragVisibleItemIds = dragVisibleItemIdsRef.current;
    const sourceIndex = dragVisibleItemIds.indexOf(productId);
    const targetIndex = sourceIndex >= 0
      ? clampIndex(sourceIndex + Math.round(offsetY / CART_DRAG_STEP), 0, dragVisibleItemIds.length - 1)
      : -1;

    setDraggingProductId(null);
    setDragOffsetY(0);
    dragStartPageY.current = 0;

    if (targetIndex >= 0 && targetIndex !== sourceIndex) {
      onReorderItem(productId, targetIndex, dragVisibleItemIds);
    }
  }

  function updateDragPosition(productId: string, pageY: number) {
    setDragOffsetY(pageY - dragStartPageY.current);
  }

  const storeSelector = (
    <View style={[styles.storeSelectorPanel, compact && styles.storeSelectorPanelCompact]}>
      <View style={styles.storeSelectorHeader}>
        <Text style={styles.sectionLabel}>Supermercado</Text>
        <TouchableOpacity
          style={[styles.routeEditorChip, compact && styles.routeEditorChipCompact]}
          onPress={() => setIsRouteEditorOpen((current) => !current)}
        >
          <Text style={styles.routeEditorChipText}>
            {isRouteEditorOpen ? "Fechar" : "Editar"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.storeSelector, compact && styles.storeSelectorCompact]}
      >
        {stores.map((store) => {
          const isActive = store.id === selectedStoreId;

          return (
            <TouchableOpacity
              key={store.id}
              style={[styles.storeButton, compact && styles.storeButtonCompact, isActive && styles.storeButtonActive]}
              onPress={() => onChangeStore(store.id)}
            >
              <Text style={[styles.storeButtonTitle, isActive && styles.storeButtonTitleActive]}>{store.name}</Text>
              <Text style={[styles.storeButtonDetail, isActive && styles.storeButtonDetailActive]}>{store.detail}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {isRouteEditorOpen && (
        <View style={styles.routeEditorPanel}>
          <Text style={styles.routeEditorTitle}>Secções da loja</Text>
          <ScrollView style={styles.routeEditorScroller} contentContainerStyle={styles.routeEditorList}>
            {routeEditorItems.map((routeItem, index) => (
              <View key={routeItem.id} style={styles.routeSectionRow}>
                <Text style={styles.routeSectionNumber}>{index + 1}</Text>
                <Text style={styles.routeSectionName}>{routeItem.name}</Text>
                <View style={styles.routeSectionActions}>
                  <TouchableOpacity
                    disabled={index === 0}
                    style={[styles.sortButton, index === 0 && styles.sortButtonDisabled]}
                    onPress={() => onMoveStoreSection(routeItem.id, "up")}
                  >
                    <Text style={[styles.sortButtonText, index === 0 && styles.sortButtonTextDisabled]}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={index === routeEditorItems.length - 1}
                    style={[styles.sortButton, index === routeEditorItems.length - 1 && styles.sortButtonDisabled]}
                    onPress={() => onMoveStoreSection(routeItem.id, "down")}
                  >
                    <Text style={[styles.sortButtonText, index === routeEditorItems.length - 1 && styles.sortButtonTextDisabled]}>↓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  if (items.length === 0) {
    return (
      <View style={styles.screen}>
        {storeSelector}
        <View style={styles.cartTopActions}>
          <TouchableOpacity
            disabled={!canUndo}
            style={[styles.undoButtonCompact, !canUndo && styles.smallActionDisabled]}
            onPress={onUndo}
          >
            <Text style={[styles.undoButtonText, !canUndo && styles.smallActionTextDisabled]}>Desfazer última ação</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkoutButtonCompact} onPress={onLockCheckout}>
            <Text style={styles.checkoutButtonText}>A pagar!</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Compras terminadas</Text>
        <Text style={styles.emptyText}>
          {isCheckoutLocked
            ? "A compra terminou. A próxima lista fica com o que faltou apanhar."
            : "A lista vai ficar só com o que faltou apanhar."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {storeSelector}

      <View style={styles.cartTopActions}>
        <TouchableOpacity
          disabled={!canUndo}
          style={[styles.undoButtonCompact, !canUndo && styles.smallActionDisabled]}
          onPress={onUndo}
        >
          <Text style={[styles.undoButtonText, !canUndo && styles.smallActionTextDisabled]}>Desfazer última ação</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.checkoutButtonCompact} onPress={onLockCheckout}>
          <Text style={styles.checkoutButtonText}>A pagar!</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.cartListTitle}>Produtos por ordem da loja</Text>

      <ScrollView
        style={styles.cartListScroller}
        contentContainerStyle={styles.pickingList}
        scrollEnabled={draggingProductId === null}
      >
        {items.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.pickRow,
              getSectionCardStyle(item.sectionId),
              draggingProductId === item.id && styles.pickRowDragging,
              draggingProductId !== null && draggingProductId !== item.id && dragTargetIndex === index && styles.pickRowDropTarget,
              draggingProductId === item.id && { transform: [{ translateY: dragOffsetY }] }
            ]}
          >
            <View
              style={[
                styles.dragHandle,
                hoveredDragProductId === item.id && styles.dragHandleHover,
                draggingProductId === item.id && styles.dragHandleActive
              ]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(event) => {
                setHoveredDragProductId(item.id);
                setDraggingProductId(item.id);
                setDragOffsetY(0);
                dragStartPageY.current = event.nativeEvent.pageY;
              }}
              onResponderMove={(event) => {
                updateDragPosition(item.id, event.nativeEvent.pageY);
              }}
              onResponderRelease={(event) => {
                finishDragging(item.id, event.nativeEvent.pageY - dragStartPageY.current);
                setHoveredDragProductId(null);
              }}
              onResponderTerminate={(event) => {
                finishDragging(item.id, event.nativeEvent.pageY - dragStartPageY.current);
                setHoveredDragProductId(null);
              }}
            >
              <Text style={[styles.dragHandleText, draggingProductId === item.id && styles.dragHandleTextActive]}>|||</Text>
            </View>
            <View style={styles.pickRowInfo}>
              <Text style={styles.compactName}>{item.name}</Text>
              <Text style={styles.compactMeta}>{formatItemDetails(item)}</Text>
              <Text style={styles.lastPickedText}>{getStoreStopName(selectedStoreId, item)}</Text>
              {item.note && <Text style={styles.itemNote}>{item.note}</Text>}
            </View>
            <View style={styles.pickRowActions}>
              <View style={styles.pickArrowRow}>
                <TouchableOpacity
                  disabled={index === 0}
                  style={[styles.sortButton, styles.cartSortButton, index === 0 && styles.sortButtonDisabled]}
                  onPress={() => onMoveItem(item.id, "up", visibleItemIds)}
                >
                  <Text style={[styles.sortButtonText, index === 0 && styles.sortButtonTextDisabled]}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={index === items.length - 1}
                  style={[styles.sortButton, styles.cartSortButton, index === items.length - 1 && styles.sortButtonDisabled]}
                  onPress={() => onMoveItem(item.id, "down", visibleItemIds)}
                >
                  <Text style={[styles.sortButtonText, index === items.length - 1 && styles.sortButtonTextDisabled]}>↓</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.pickedSmallButton} onPress={() => onPicked(item.id)}>
                <Text style={styles.pickedSmallButtonText}>Apanhado</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SummaryScreen({
  route,
  confidence,
  storeName,
  onSave,
  onBack
}: {
  route: SectionId[];
  confidence: number;
  storeName: string;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Percurso aprendido</Text>
      <Text style={styles.emptyText}>Supermercado: {storeName}</Text>
      <Text style={styles.emptyText}>Confiança {Math.round(confidence * 100)}%</Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        {route.map((sectionId, index) => (
          <View key={sectionId} style={styles.routeRow}>
            <Text style={styles.routeNumber}>{index + 1}</Text>
            <Text style={styles.itemName}>{sectionNameById.get(sectionId) ?? sectionId}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.primaryButtonFull} onPress={onSave}>
        <Text style={styles.primaryButtonText}>Guardar percurso</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButtonFull} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

function withStatus(product: Product): ShoppingItem {
  return {
    ...product,
    acceptsAlternatives: product.defaultAcceptsAlternatives,
    note: product.note,
    quantity: product.defaultQuantity,
    lastPickedAt: product.lastPickedAt,
    status: "needed"
  };
}

function sortShoppingItems(items: ShoppingItem[], route: SectionId[]): ShoppingItem[] {
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

    return getProductSortLabel(a).localeCompare(getProductSortLabel(b), "pt-PT", { sensitivity: "base" });
  });
}

function sortPickingItems(items: ShoppingItem[], storeId: string, fallbackRoute: SectionId[], stopOrder: string[], manualOrder?: string[]): ShoppingItem[] {
  const routeSortedItems = storeId === "supercor" ? sortSupercorPickingItems(items, stopOrder) : sortShoppingItems(items, fallbackRoute);
  return applyManualProductOrder(routeSortedItems, manualOrder);
}

function sortSupercorPickingItems(items: ShoppingItem[], stopOrder: string[]): ShoppingItem[] {
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

function applyManualProductOrder(items: ShoppingItem[], manualOrder?: string[]): ShoppingItem[] {
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

function clampIndex(value: number, min: number, max: number): number {
  if (max < min) {
    return -1;
  }

  return Math.min(Math.max(value, min), max);
}

function completeSectionRoute(route: SectionId[]): SectionId[] {
  const uniqueRoute = route.filter((sectionId, index) => route.indexOf(sectionId) === index);
  const missingSections = sections
    .map((section) => section.id)
    .filter((sectionId) => !uniqueRoute.includes(sectionId));

  return [...uniqueRoute, ...missingSections];
}

function completeStoreStopOrder(route: string[]): string[] {
  const uniqueRoute = route
    .filter(isSupercorStopId)
    .filter((stopId, index, stopRoute) => stopRoute.indexOf(stopId) === index);
  const missingStops = defaultSupercorStopOrder.filter((stopId) => !uniqueRoute.includes(stopId));

  return [...uniqueRoute, ...missingStops];
}

function getRouteEditorItems(storeId: string, sectionRoute: SectionId[], stopOrder: string[]): StoreRouteStop[] {
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

function areSectionRoutesEqual(firstRoute: SectionId[], secondRoute: SectionId[]): boolean {
  const firstCompleteRoute = completeSectionRoute(firstRoute);
  const secondCompleteRoute = completeSectionRoute(secondRoute);

  return firstCompleteRoute.length === secondCompleteRoute.length
    && firstCompleteRoute.every((sectionId, index) => sectionId === secondCompleteRoute[index]);
}

function isSupercorStopId(value: unknown): value is string {
  return typeof value === "string" && supercorRouteStops.some((stop) => stop.id === value);
}

function getStoreRouteHint(storeId: string, fallbackRoute: SectionId[], stopOrder: string[], orderedItems: ShoppingItem[]): string {
  const routeNames = orderedItems.length > 0
    ? orderedItems.map((item) => getStoreStopName(storeId, item))
    : getFallbackStoreRouteNames(storeId, fallbackRoute, stopOrder);
  const uniqueRouteNames = routeNames.filter((routeName, index) => routeNames.indexOf(routeName) === index);

  return uniqueRouteNames.join(" > ");
}

function getFallbackStoreRouteNames(storeId: string, fallbackRoute: SectionId[], stopOrder: string[]): string[] {
  if (storeId === "supercor") {
    return completeStoreStopOrder(stopOrder).map(getSupercorStopName);
  }

  return fallbackRoute.map((sectionId) => sectionNameById.get(sectionId) ?? sectionId);
}

function getStoreStopName(storeId: string, product: Product): string {
  if (storeId !== "supercor") {
    return sectionNameById.get(product.sectionId) ?? product.sectionId;
  }

  const stopId = getSupercorRouteStopId(product);
  return getSupercorStopName(stopId);
}

function getSupercorStopName(stopId: string): string {
  return supercorRouteStops.find((stop) => stop.id === stopId)?.name ?? stopId;
}

function getSupercorRouteStopId(product: Product): string {
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

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function getProductSortLabel(product: Product): string {
  if (product.sectionId !== "fruit-veg") {
    return product.name;
  }

  return `${getFruitVegSortPrefix(product.name)} ${product.name}`;
}

function getFruitVegSortPrefix(productName: string): string {
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

function readPersistedAppState(): PersistedAppState | null {
  const storage = getLocalStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawState = storage.getItem(STORAGE_KEY);

    if (!rawState) {
      return null;
    }

    const parsedState = JSON.parse(rawState) as Partial<Omit<PersistedAppState, "version">> & { version?: number };

    if (parsedState.version !== 1 && parsedState.version !== CURRENT_STORAGE_VERSION) {
      return null;
    }

    const isLegacyListState = parsedState.version === 1;

    const parsedProducts = Array.isArray(parsedState.products)
      ? parsedState.products.filter(isProductLike).map(hydrateProduct)
      : starterProducts;
    const shoppingItems = Array.isArray(parsedState.shoppingItems)
      ? parsedState.shoppingItems.filter(isShoppingItemLike).map(hydrateShoppingItem)
      : createInitialShoppingList(parsedProducts);
    const products = mergeProductsWithShoppingItems(parsedProducts, shoppingItems);
    const itinerary = normalizeSectionRoute(parsedState.itinerary);
    const selectedStoreId = isSupermarketId(parsedState.selectedStoreId)
      ? parsedState.selectedStoreId
      : defaultStoreId;
    const storeItineraries = hydrateStoreItineraries(parsedState.storeItineraries, itinerary);
    const storeStopOrders = hydrateStoreStopOrders(parsedState.storeStopOrders);
    const storeProductOrders = hydrateStoreProductOrders(parsedState.storeProductOrders);
    const pickEvents = Array.isArray(parsedState.pickEvents)
      ? parsedState.pickEvents.filter(isPickEventLike).map(hydratePickEvent)
      : [];
    const departmentFilter = isDepartmentFilter(parsedState.departmentFilter)
      ? parsedState.departmentFilter
      : "all";
    const lockedPickingIds = Array.isArray(parsedState.lockedPickingIds)
      ? parsedState.lockedPickingIds.filter((id): id is string => typeof id === "string")
      : [];
    const activeTripItemIds = Array.isArray(parsedState.activeTripItemIds)
      ? parsedState.activeTripItemIds.filter((id): id is string => typeof id === "string")
      : [];
    const shouldApplyEmptyListDefault = parsedState.emptyListDefaultApplied !== true;
    const shouldClearAutoGeneratedList = shouldApplyEmptyListDefault
      || isLegacyListState
      || (isAutoGeneratedStarterList(shoppingItems, products)
        && pickEvents.length === 0
        && lockedPickingIds.length === 0
        && (activeTripItemIds.length === 0 || hasSameProductIds(activeTripItemIds, products))
        && !parsedState.isCheckoutLocked);
    const shouldResetTripState = shouldClearAutoGeneratedList || isLegacyListState;

    return {
      version: CURRENT_STORAGE_VERSION,
      products,
      shoppingItems: shouldClearAutoGeneratedList ? [] : shoppingItems,
      itinerary: itinerary.length > 0 ? itinerary : defaultItinerary,
      storeItineraries,
      storeStopOrders,
      storeProductOrders,
      selectedStoreId,
      pickEvents: shouldResetTripState ? [] : pickEvents,
      departmentFilter,
      listSearch: typeof parsedState.listSearch === "string" ? parsedState.listSearch : "",
      addSearch: "",
      isCheckoutLocked: false,
      lockedPickingIds: [],
      activeTripItemIds: shouldResetTripState ? [] : activeTripItemIds.length > 0 ? activeTripItemIds : lockedPickingIds,
      shoppingDoneNotice: Boolean(parsedState.shoppingDoneNotice),
      emptyListDefaultApplied: true,
      savedAt: typeof parsedState.savedAt === "string" ? parsedState.savedAt : new Date().toISOString()
    };
  } catch (error) {
    console.warn("Could not read saved shopping state.", error);
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writePersistedAppState(state: PersistedAppState): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not save shopping state.", error);
  }
}

function isSavedStateNewer(candidateSavedAt?: string, baselineSavedAt?: string): boolean {
  const candidateTime = parseSavedAt(candidateSavedAt);
  const baselineTime = parseSavedAt(baselineSavedAt);

  if (candidateTime === null) {
    return false;
  }

  if (baselineTime === null) {
    return true;
  }

  return candidateTime > baselineTime;
}

function parseSavedAt(savedAt?: string): number | null {
  if (!savedAt) {
    return null;
  }

  const time = new Date(savedAt).getTime();
  return Number.isNaN(time) ? null : time;
}

function readLocalUserSettings(): LocalUserSettings {
  const storage = getLocalStorage();

  if (!storage) {
    return defaultLocalUserSettings;
  }

  try {
    const rawSettings = storage.getItem(LOCAL_USER_SETTINGS_KEY);

    if (!rawSettings) {
      return defaultLocalUserSettings;
    }

    const parsedSettings = JSON.parse(rawSettings) as Partial<LocalUserSettings>;

    return {
      userName: typeof parsedSettings.userName === "string" ? parsedSettings.userName : "",
      voiceSearchEnabled: typeof parsedSettings.voiceSearchEnabled === "boolean"
        ? parsedSettings.voiceSearchEnabled
        : defaultLocalUserSettings.voiceSearchEnabled,
      defaultStoreId: isSupermarketId(parsedSettings.defaultStoreId)
        ? parsedSettings.defaultStoreId
        : defaultLocalUserSettings.defaultStoreId,
      smartStartEnabled: typeof parsedSettings.smartStartEnabled === "boolean"
        ? parsedSettings.smartStartEnabled
        : defaultLocalUserSettings.smartStartEnabled
    };
  } catch {
    return defaultLocalUserSettings;
  }
}

function writeLocalUserSettings(settings: LocalUserSettings): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(LOCAL_USER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Could not save user settings.", error);
  }
}

function getLocalStorage(): LocalStorageLike | null {
  const browserStorage = typeof globalThis !== "undefined" && "localStorage" in globalThis
    ? globalThis.localStorage
    : null;

  if (
    browserStorage &&
    typeof browserStorage.getItem === "function" &&
    typeof browserStorage.setItem === "function" &&
    typeof browserStorage.removeItem === "function"
  ) {
    return browserStorage as LocalStorageLike;
  }

  return getDeviceLocalStorage();
}

function getOrCreateSyncClientId(): string {
  const storage = getLocalStorage();

  if (!storage) {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const existingClientId = storage.getItem(SYNC_CLIENT_ID_KEY);

  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(SYNC_CLIENT_ID_KEY, nextClientId);
  return nextClientId;
}

function getInitialSyncSpaceId(): string {
  const storage = getLocalStorage();
  const storedSyncSpaceId = storage?.getItem(SYNC_SPACE_ID_KEY);

  return normalizeSyncSpaceId(storedSyncSpaceId || defaultSyncSpaceId);
}

function normalizeSyncSpaceId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || defaultSyncSpaceId;
}

function hydrateProduct(product: Product): Product {
  return {
    ...product,
    sectionId: normalizeProductSectionId(product),
    defaultQuantity: product.defaultQuantity || "1 un",
    defaultAcceptsAlternatives: product.defaultAcceptsAlternatives ?? true
  };
}

function hydrateShoppingItem(item: ShoppingItem): ShoppingItem {
  return {
    ...hydrateProduct(item),
    status: isListStatus(item.status) ? item.status : "needed",
    acceptsAlternatives: item.acceptsAlternatives ?? item.defaultAcceptsAlternatives ?? true,
    quantity: item.quantity || item.defaultQuantity || "1 un"
  };
}

function mergeProductsWithShoppingItems(products: Product[], items: ShoppingItem[]): Product[] {
  const productById = new Map(products.map((product) => [product.id, product]));

  items.forEach((item) => {
    if (!productById.has(item.id)) {
      productById.set(item.id, productFromShoppingItem(item));
    }
  });

  return Array.from(productById.values());
}

function productFromShoppingItem(item: ShoppingItem): Product {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    note: item.note,
    lastPickedAt: item.lastPickedAt,
    sectionId: item.sectionId,
    defaultQuantity: normalizeQuantityText(item.quantity || item.defaultQuantity || "1 un"),
    defaultAcceptsAlternatives: item.acceptsAlternatives
  };
}

function hydratePickEvent(pickEvent: PickEvent<SectionId>): PickEvent<SectionId> {
  return {
    ...pickEvent,
    sectionId: normalizeSectionId(pickEvent.sectionId) ?? "meat"
  };
}

function normalizeProductSectionId(product: Product): SectionId {
  const normalizedSectionId = normalizeSectionId(product.sectionId);

  if (normalizedSectionId) {
    return normalizedSectionId;
  }

  const searchable = normalizeForMatching(`${product.name} ${product.brand ?? ""} ${product.note ?? ""}`);

  if (includesAny(searchable, ["bacalhau", "peixe"])) {
    return "fish";
  }

  return "meat";
}

function normalizeSectionId(value: unknown): SectionId | null {
  if (isSectionId(value)) {
    return value;
  }

  if (value === "meat-fish") {
    return "meat";
  }

  return null;
}

function normalizeSectionRoute(route: unknown): SectionId[] {
  if (!Array.isArray(route)) {
    return [];
  }

  const normalizedRoute: SectionId[] = [];

  route.forEach((sectionId) => {
    if (sectionId === "meat-fish") {
      normalizedRoute.push("fish", "meat");
      return;
    }

    const normalizedSectionId = normalizeSectionId(sectionId);

    if (normalizedSectionId) {
      normalizedRoute.push(normalizedSectionId);
    }
  });

  return normalizedRoute.filter((sectionId, index) => normalizedRoute.indexOf(sectionId) === index);
}

function isProductLike(value: unknown): value is Product {
  if (!value || typeof value !== "object") {
    return false;
  }

  const product = value as Product;

  return typeof product.id === "string"
    && typeof product.name === "string"
    && (isSectionId(product.sectionId) || product.sectionId === "meat-fish");
}

function isShoppingItemLike(value: unknown): value is ShoppingItem {
  if (!isProductLike(value)) {
    return false;
  }

  const item = value as ShoppingItem;

  return isListStatus(item.status);
}

function isPickEventLike(value: unknown): value is PickEvent<SectionId> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pickEvent = value as PickEvent<SectionId>;

  return typeof pickEvent.productId === "string"
    && (isSectionId(pickEvent.sectionId) || pickEvent.sectionId === "meat-fish")
    && typeof pickEvent.pickedAt === "number"
    && ["picked", "missing", "skipped"].includes(pickEvent.action);
}

function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && sections.some((section) => section.id === value);
}

function isSupermarketId(value: unknown): value is string {
  return typeof value === "string" && supermarketProfiles.some((store) => store.id === value);
}

function hydrateStoreItineraries(value: unknown, legacyItinerary: SectionId[]): StoreItineraries {
  const nextItineraries: StoreItineraries = { ...defaultStoreItineraries };
  const fallbackRoute = legacyItinerary.length > 0 ? legacyItinerary : defaultItinerary;

  if (!value || typeof value !== "object") {
    nextItineraries[defaultStoreId] = completeSectionRoute(fallbackRoute);
    return nextItineraries;
  }

  for (const store of supermarketProfiles) {
    const route = (value as Record<string, unknown>)[store.id];

    if (Array.isArray(route)) {
      const sectionRoute = normalizeSectionRoute(route);
      nextItineraries[store.id] = sectionRoute.length > 0 ? completeSectionRoute(sectionRoute) : defaultItinerary;
    }
  }

  return nextItineraries;
}

function hydrateStoreProductOrders(value: unknown): StoreProductOrders {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<StoreProductOrders>((orders, [storeId, order]) => {
    if (!isSupermarketId(storeId) || !Array.isArray(order)) {
      return orders;
    }

    orders[storeId] = order.filter((productId): productId is string => typeof productId === "string");
    return orders;
  }, {});
}

function hydrateStoreStopOrders(value: unknown): StoreStopOrders {
  const defaultStopOrders: StoreStopOrders = { supercor: defaultSupercorStopOrder };

  if (!value || typeof value !== "object") {
    return defaultStopOrders;
  }

  return Object.entries(value as Record<string, unknown>).reduce<StoreStopOrders>((orders, [storeId, route]) => {
    if (!isSupermarketId(storeId) || !Array.isArray(route)) {
      return orders;
    }

    const stopOrder = route.filter(isSupercorStopId);
    orders[storeId] = stopOrder.length > 0 ? completeStoreStopOrder(stopOrder) : defaultSupercorStopOrder;
    return orders;
  }, defaultStopOrders);
}

function isDepartmentFilter(value: unknown): value is DepartmentFilter {
  return value === "all" || isSectionId(value);
}

function isListStatus(value: unknown): value is ListStatus {
  return typeof value === "string" && ["needed", "picked", "missing", "skipped"].includes(value);
}

function createInitialShoppingList(_products: Product[]): ShoppingItem[] {
  return [];
}

function isAutoGeneratedStarterList(items: ShoppingItem[], products: Product[]): boolean {
  const productById = new Map(products.map((product) => [product.id, product]));

  if (items.length === 0 || items.length !== productById.size) {
    return false;
  }

  return items.every((item) => {
    const product = productById.get(item.id);

    return Boolean(product)
      && item.status === "needed"
      && item.quantity === product?.defaultQuantity
      && item.acceptsAlternatives === product?.defaultAcceptsAlternatives
      && (item.note ?? "") === (product?.note ?? "")
      && item.customOrder === undefined;
  });
}

function hasSameProductIds(productIds: string[], products: Product[]): boolean {
  if (productIds.length !== products.length) {
    return false;
  }

  const productIdSet = new Set(products.map((product) => product.id));
  return productIds.every((productId) => productIdSet.has(productId));
}

function normalizeExistingProduct(product: Product): Product {
  const starterProduct = starterProductById.get(product.id);

  if (starterProduct) {
    return {
      ...product,
      name: starterProduct.name,
      brand: starterProduct.brand,
      note: starterProduct.note,
      sectionId: starterProduct.sectionId,
      defaultQuantity: product.defaultQuantity || starterProduct.defaultQuantity,
      defaultAcceptsAlternatives: starterProduct.defaultAcceptsAlternatives,
      favorite: starterProduct.favorite ?? product.favorite
    };
  }

  const correctedName = correctPortugueseGroceryText(product.name);
  const correctedNote = product.note ? correctPortugueseGroceryText(product.note) : undefined;

  if (correctedName === product.name && correctedNote === product.note) {
    return product;
  }

  const classifiedProduct = classifyNewProduct({
    rawName: correctedName,
    quantity: product.defaultQuantity,
    note: correctedNote,
    fallbackSectionId: product.sectionId
  }, [product]);

  if (!classifiedProduct) {
    return product;
  }

  return {
    ...product,
    name: classifiedProduct.name,
    brand: classifiedProduct.brand ?? product.brand,
    note: classifiedProduct.note,
    sectionId: classifiedProduct.sectionId,
    defaultQuantity: classifiedProduct.defaultQuantity,
    defaultAcceptsAlternatives: classifiedProduct.defaultAcceptsAlternatives
  };
}

function normalizeExistingShoppingItem(item: ShoppingItem): ShoppingItem {
  const normalizedProduct = normalizeExistingProduct(item);

  return {
    ...item,
    name: normalizedProduct.name,
    brand: normalizedProduct.brand,
    note: normalizedProduct.note,
    sectionId: normalizedProduct.sectionId,
    acceptsAlternatives: normalizedProduct.defaultAcceptsAlternatives
  };
}

function formatProductDetails(product: Product): string {
  const brand = product.brand ? `${product.brand} - ` : "";
  return `${brand}${sectionNameById.get(product.sectionId)} - ${product.defaultQuantity}`;
}

function formatItemDetails(item: ShoppingItem): string {
  const brand = item.brand ? `${item.brand} - ` : "";
  return `${brand}${sectionNameById.get(item.sectionId)} - ${item.quantity || "1 un"}`;
}

function formatListItemDetails(item: ShoppingItem): string {
  const brand = item.brand ? `${item.brand} - ` : "";
  return `${brand}${sectionNameById.get(item.sectionId)}`;
}

function normalizeQuantityText(value: string): string {
  const trimmedValue = value.trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return "1 un";
  }

  if (/^\d+([,.]\d+)?$/.test(trimmedValue)) {
    return `${trimmedValue} un`;
  }

  return trimmedValue;
}

function formatLastPicked(lastPickedAt?: string): string {
  if (!lastPickedAt) {
    return "Última compra: nunca";
  }

  const date = new Date(lastPickedAt);

  if (Number.isNaN(date.getTime())) {
    return "Última compra: desconhecida";
  }

  return `Última compra: ${date.toLocaleDateString("pt-PT")}`;
}

function formatLastPickedShort(lastPickedAt?: string): string {
  if (!lastPickedAt) {
    return "Nunca";
  }

  const date = new Date(lastPickedAt);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return date.toLocaleDateString("pt-PT");
}

function filterBySearch<T extends Product | ShoppingItem>(items: T[], searchText: string): T[] {
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

function matchesSearchGroups(product: Product | ShoppingItem, searchGroups: string[][]): boolean {
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

function parseSearchQuery(searchText: string): { groups: string[][]; hasExplicitOperator: boolean; implicitTerms: string[] } {
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

function isSearchAndOperator(token: string): boolean {
  return token === "and" || token === "e";
}

function isSearchOrOperator(token: string): boolean {
  return token === "or" || token === "ou";
}

function classifyNewProduct(input: NewProductInput, products: Product[]): Product | null {
  const rawName = input.rawName.trim();

  if (!rawName) {
    return null;
  }

  const extractedNote = extractParentheticalNote(rawName);
  const nameWithoutNote = correctPortugueseGroceryText(extractedNote.cleanName);
  const brand = detectBrand(nameWithoutNote);
  const sectionId = detectSectionId(nameWithoutNote, input.note, input.fallbackSectionId);
  const noteParts = [
    extractedNote.note ? correctPortugueseGroceryText(extractedNote.note) : undefined,
    input.note?.trim() ? correctPortugueseGroceryText(input.note.trim()) : undefined
  ].filter(Boolean);
  const productNameWithoutBrand = removeDetectedBrand(nameWithoutNote, brand);
  const name = tidyProductName(isUsefulProductName(productNameWithoutBrand) ? productNameWithoutBrand : nameWithoutNote);
  const isExact = Boolean(brand) || isSpecificProduct(nameWithoutNote) || noteParts.length > 0;

  return {
    id: createProductId(`${brand ? `${brand} ` : ""}${name}`, products),
    name,
    brand,
    note: noteParts.join(" - ") || undefined,
    sectionId,
    defaultQuantity: input.quantity?.trim() || "1 un",
    defaultAcceptsAlternatives: !isExact
  };
}

function extractParentheticalNote(value: string): { cleanName: string; note?: string } {
  const match = value.match(/\(([^)]+)\)/);

  if (!match) {
    return {
      cleanName: value
    };
  }

  return {
    cleanName: value.replace(/\s*\([^)]+\)\s*/g, " ").trim(),
    note: tidyProductName(match[1])
  };
}

function detectBrand(value: string): string | undefined {
  const normalized = normalizeForMatching(value);
  const brands = [
    "agua das pedras",
    "coca-cola",
    "confort",
    "dentagard",
    "dove",
    "elvive",
    "evax",
    "gillette venus",
    "gillette",
    "lactacyd",
    "mimosa",
    "neoblanc",
    "nivea",
    "penacova",
    "wc pato",
    "uhu"
  ];
  const foundBrand = brands.find((candidate) => normalized.includes(candidate));

  return foundBrand ? tidyBrandName(foundBrand) : undefined;
}

function removeDetectedBrand(value: string, brand?: string): string {
  if (!brand) {
    return value;
  }

  return value.replace(new RegExp(escapeRegExp(brand), "i"), " ").replace(/\s+/g, " ").trim();
}

function detectSectionId(value: string, note: string | undefined, fallbackSectionId: SectionId): SectionId {
  const normalized = normalizeForMatching(`${value} ${note ?? ""}`);

  if (normalized.includes("ananas") || normalized.includes("ananaz")) {
    return "fruit-veg";
  }

  const sectionRules: Array<{ sectionId: SectionId; keywords: string[] }> = [
    {
      sectionId: "personal-care",
      keywords: ["amaciador marta", "barba", "cabelo", "creme corpo", "desodorizante", "discos desmaquilhantes", "escova", "gel banho", "lactacid", "laminas", "pasta de dentes", "pensos", "shampoo", "shampo"]
    },
    {
      sectionId: "cleaning",
      keywords: ["agua com cheiro", "detergente", "esfregao", "guardanapos", "lava tudo", "lixivia", "maquina loica", "multiusos", "papel higienico", "rolo cozinha", "sacos lixo", "spray", "wc pato"]
    },
    {
      sectionId: "fruit-veg",
      keywords: ["agrioes", "alface", "alho", "ananas", "ananaz", "banana", "batata", "brocolo", "cebola", "cenoura", "chuchu", "coentros", "courgete", "feijao verde", "hortela", "kiwi", "laranja", "lima", "limao", "maca", "pera", "salsa", "tomate"]
    },
    {
      sectionId: "frozen",
      keywords: ["congelado", "gelo", "grelos", "jardineira", "noisettes", "pizza", "pure"]
    },
    {
      sectionId: "fish",
      keywords: ["bacalhau", "peixe"]
    },
    {
      sectionId: "meat",
      keywords: ["carne", "entrecosto"]
    },
    {
      sectionId: "dairy",
      keywords: ["clara de ovo", "iogurte", "leite", "manteiga", "margarina", "natas", "ovos", "presunto", "queijo"]
    },
    {
      sectionId: "household",
      keywords: ["acendalha", "carvao", "filtro agua", "fosforo"]
    },
    {
      sectionId: "pantry",
      keywords: ["arroz", "atum", "azeite", "bolacha", "bolo", "cafe", "cha", "chocolate", "feijao frade", "flocos", "grao", "maionese", "mostarda", "oleo", "sal", "vinagre", "vinho branco temperar"]
    },
    {
      sectionId: "drinks",
      keywords: ["agua", "cerveja", "coca", "tonica", "vinho branco", "vinho tinto"]
    },
    {
      sectionId: "bakery",
      keywords: ["pao"]
    }
  ];
  const matchingRule = sectionRules.find((rule) => {
    return rule.keywords.some((keyword) => normalized.includes(keyword));
  });

  return matchingRule?.sectionId ?? fallbackSectionId;
}

function isSpecificProduct(value: string): boolean {
  const normalized = normalizeForMatching(value);
  const specificWords = ["acores", "marta", "pedro", "vanda", "roxo", "roxa", "laranja", "magro", "promocao", "sem ser", "nao muito", "macho 3"];

  return specificWords.some((word) => normalized.includes(word));
}

function isUsefulProductName(value: string): boolean {
  const normalized = normalizeForMatching(value);

  return /[a-z]/.test(normalized) && !/^\d+\s*(un|l|litro|litros|kg|g)?$/.test(normalized);
}

function tidyProductName(value: string): string {
  const corrections = new Map([
    ["acores", "Açores"],
    ["agrioes", "Agriões"],
    ["ananas", "Ananás"],
    ["ananaz", "Ananás"],
    ["brocolos", "Brócolos"],
    ["cafe", "Café"],
    ["cha", "Chá"],
    ["de", "de"],
    ["do", "do"],
    ["dos", "dos"],
    ["limao", "Limão"],
    ["limoes", "Limões"],
    ["lixivia", "Lixívia"],
    ["loica", "loiça"],
    ["maca", "Maçã"],
    ["macas", "Maçãs"],
    ["pao", "Pão"],
    ["pera", "Pêra"],
    ["peras", "Peras"],
    ["shampo", "Shampoo"],
    ["shampoo", "Shampoo"]
  ]);

  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const normalized = normalizeForMatching(word);
      const corrected = corrections.get(normalized);

      if (corrected) {
        return corrected;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function correctPortugueseGroceryText(value: string): string {
  return value
    .replace(/\bananaz\b/gi, "ananás")
    .replace(/\bananas dos acores\b/gi, "ananás dos Açores")
    .replace(/\bananas do acores\b/gi, "ananás dos Açores")
    .replace(/\bananas de acores\b/gi, "ananás dos Açores")
    .replace(/\bananas doe acores\b/gi, "ananás dos Açores")
    .replace(/\bananas dos açores\b/gi, "ananás dos Açores")
    .replace(/\bananás dos acores\b/gi, "ananás dos Açores")
    .replace(/\bananás do acores\b/gi, "ananás dos Açores")
    .replace(/\bananás de acores\b/gi, "ananás dos Açores")
    .replace(/\bananás doe acores\b/gi, "ananás dos Açores")
    .replace(/\bananás dos açores\b/gi, "ananás dos Açores")
    .replace(/\bdoe\b/gi, "dos")
    .replace(/\bacores\b/gi, "Açores");
}

function tidyBrandName(value: string): string {
  const brandNames = new Map([
    ["agua das pedras", "Água das Pedras"],
    ["coca-cola", "Coca-Cola"],
    ["confort", "Confort"],
    ["dentagard", "Dentagard"],
    ["dove", "Dove"],
    ["elvive", "Elvive"],
    ["evax", "Evax"],
    ["gillette venus", "Gillette Venus"],
    ["gillette", "Gillette"],
    ["lactacyd", "Lactacyd"],
    ["mimosa", "Mimosa"],
    ["neoblanc", "Neoblanc"],
    ["nivea", "Nivea"],
    ["penacova", "Penacova"],
    ["wc pato", "WC Pato"],
    ["uhu", "UHU"]
  ]);

  return brandNames.get(value) ?? tidyProductName(value);
}

function createProductId(name: string, products: Product[]): string {
  const baseId = normalizeProductId(name) || "produto";
  const existingIds = new Set(products.map((product) => product.id));
  let candidateId = baseId;
  let suffix = 2;

  while (existingIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidateId;
}

function normalizeProductId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSectionCardStyle(sectionId: SectionId): ViewStyle {
  return sectionCardStyles[sectionId] ?? sectionCardStyles.pantry;
}

const sectionCardStyles = StyleSheet.create<Record<SectionId, ViewStyle>>({
  bakery: {
    backgroundColor: "#FFF7E6",
    borderColor: "#DDA13B",
    borderLeftWidth: 6
  },
  "personal-care": {
    backgroundColor: "#F3F0FF",
    borderColor: "#7C6BC4",
    borderLeftWidth: 6
  },
  cleaning: {
    backgroundColor: "#EEF8F7",
    borderColor: "#249184",
    borderLeftWidth: 6
  },
  "fruit-veg": {
    backgroundColor: "#F0F8E8",
    borderColor: "#5D9436",
    borderLeftWidth: 6
  },
  frozen: {
    backgroundColor: "#ECF7FF",
    borderColor: "#368ABF",
    borderLeftWidth: 6
  },
  meat: {
    backgroundColor: "#FFF0F0",
    borderColor: "#C35C58",
    borderLeftWidth: 6
  },
  fish: {
    backgroundColor: "#EFF8FF",
    borderColor: "#2E7FA3",
    borderLeftWidth: 6
  },
  dairy: {
    backgroundColor: "#F5F7FF",
    borderColor: "#6680C4",
    borderLeftWidth: 6
  },
  pantry: {
    backgroundColor: "#FFF5ED",
    borderColor: "#C77A3A",
    borderLeftWidth: 6
  },
  drinks: {
    backgroundColor: "#EEF6FF",
    borderColor: "#3178B8",
    borderLeftWidth: 6
  },
  household: {
    backgroundColor: "#F3F6F1",
    borderColor: "#6E8064",
    borderLeftWidth: 6
  }
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F7F9",
    paddingBottom: androidNavigationBarInset,
    paddingTop: androidStatusBarInset
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  appShellCompact: {
    paddingHorizontal: 8,
    paddingTop: 4
  },
  header: {
    paddingVertical: 12
  },
  headerCompact: {
    paddingBottom: 6,
    paddingTop: 2
  },
  headerCompactRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  headerCompactMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  titleActionRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  titleActionRowCompact: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 6
  },
  kicker: {
    color: "#596579",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#18212F",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 4
  },
  titleCompact: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 24,
    marginTop: 0
  },
  titleSettingsLink: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  titleSettingsLinkCompact: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  titleSettingsLinkText: {
    color: "#12616F",
    fontSize: 13,
    fontWeight: "900",
    textDecorationLine: "underline"
  },
  progress: {
    color: "#4B5565",
    fontSize: 16,
    marginTop: 6
  },
  progressCompact: {
    color: "#4B5565",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "900"
  },
  headerMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6
  },
  headerMetaRowCompact: {
    marginTop: 4
  },
  syncPill: {
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  syncPillCompact: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  syncPill_local: {
    backgroundColor: "#EEF2F6",
    color: "#4B5565"
  },
  syncPill_saving: {
    backgroundColor: "#FFF4D6",
    color: "#7A4F00"
  },
  syncPill_synced: {
    backgroundColor: "#E6F4EA",
    color: "#245A38"
  },
  syncPill_error: {
    backgroundColor: "#F8E8E2",
    color: "#A33E22"
  },
  screen: {
    flex: 1
  },
  contentArea: {
    flex: 1
  },
  centerScreen: {
    flex: 1,
    justifyContent: "center",
    gap: 18
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  navTabs: {
    gap: 8,
    paddingBottom: 12,
    paddingRight: 20
  },
  navTabsCompact: {
    gap: 6,
    paddingBottom: 4,
    paddingRight: 0,
    paddingTop: 6
  },
  navTabsRail: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 72
  },
  navTabsRailCompact: {
    borderTopColor: "#D8DEE8",
    borderTopWidth: 1,
    maxHeight: 64
  },
  navTab: {
    minHeight: 58,
    minWidth: 108,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  navTabCompact: {
    minHeight: 50,
    minWidth: 84,
    paddingHorizontal: 4
  },
  navTabActive: {
    borderColor: "#12616F",
    backgroundColor: "#12616F"
  },
  navTabLabel: {
    color: "#18212F",
    fontSize: 15,
    fontWeight: "900"
  },
  navTabLabelCompact: {
    fontSize: 13
  },
  navTabLabelActive: {
    color: "#FFFFFF"
  },
  navTabMeta: {
    color: "#596579",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  navTabMetaCompact: {
    fontSize: 11,
    marginTop: 1
  },
  navTabMetaActive: {
    color: "#DFF4F7"
  },
  welcomeContent: {
    gap: 14,
    paddingBottom: 24
  },
  welcomePanel: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    padding: 18,
    gap: 10
  },
  welcomeTitle: {
    color: "#18212F",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900"
  },
  welcomeText: {
    color: "#4B5565",
    fontSize: 16,
    lineHeight: 23
  },
  welcomeSteps: {
    gap: 10
  },
  welcomeStep: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    padding: 14,
    flexDirection: "row",
    gap: 12
  },
  welcomeStepNumber: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#12616F",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 36
  },
  welcomeStepText: {
    flex: 1
  },
  welcomeStepTitle: {
    color: "#18212F",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 4
  },
  syncPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  settingsContent: {
    gap: 12,
    paddingBottom: 24
  },
  settingsPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  settingsTitle: {
    color: "#18212F",
    fontSize: 18,
    fontWeight: "900"
  },
  settingsText: {
    color: "#4B5565",
    fontSize: 15,
    lineHeight: 21
  },
  settingsInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 12
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  settingsRowText: {
    flex: 1
  },
  settingsLabel: {
    color: "#18212F",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 2
  },
  settingsMeta: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "800"
  },
  settingsDisabledAction: {
    alignItems: "center",
    backgroundColor: "#EEF2F6",
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  settingsDisabledActionText: {
    color: "#596579",
    fontSize: 14,
    fontWeight: "900"
  },
  defaultStoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  defaultStoreButton: {
    alignItems: "center",
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  defaultStoreButtonActive: {
    backgroundColor: "#12616F",
    borderColor: "#12616F"
  },
  defaultStoreButtonText: {
    color: "#18212F",
    fontSize: 14,
    fontWeight: "900"
  },
  defaultStoreButtonTextActive: {
    color: "#FFFFFF"
  },
  syncPanelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  syncPanelText: {
    flex: 1
  },
  syncSpaceRow: {
    flexDirection: "row",
    gap: 8
  },
  syncSpaceInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 12
  },
  syncSpaceButton: {
    alignItems: "center",
    backgroundColor: "#12616F",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 76,
    paddingHorizontal: 12
  },
  syncSpaceButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  welcomeActions: {
    gap: 10
  },
  shoppingDoneNotice: {
    alignItems: "center",
    backgroundColor: "#FFF4D6",
    borderColor: "#B98200",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    padding: 12
  },
  shoppingDoneTextColumn: {
    flex: 1,
    gap: 2
  },
  shoppingDoneTitle: {
    color: "#4C3200",
    fontSize: 16,
    fontWeight: "900"
  },
  shoppingDoneText: {
    color: "#5C4510",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  noticeClearButton: {
    alignItems: "center",
    backgroundColor: "#7A4F00",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 10
  },
  noticeClearButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  filterBar: {
    alignItems: "center",
    gap: 8,
    flexDirection: "row",
    paddingBottom: 10,
    paddingRight: 20,
    paddingTop: 2
  },
  filterRail: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 2,
    maxHeight: 62,
    width: "100%"
  },
  filterButton: {
    minHeight: 48,
    minWidth: 118,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14
  },
  filterButtonActive: {
    borderColor: "#12616F",
    backgroundColor: "#12616F"
  },
  filterText: {
    color: "#18212F",
    fontSize: 15,
    fontWeight: "800"
  },
  filterTextActive: {
    color: "#FFFFFF"
  },
  storeSelectorPanel: {
    gap: 8
  },
  storeSelectorPanelCompact: {
    gap: 6
  },
  storeSelectorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  storeSelector: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 16
  },
  storeSelectorCompact: {
    gap: 6,
    paddingRight: 8
  },
  storeButton: {
    minHeight: 66,
    minWidth: 136,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    backgroundColor: "#F7F9FC",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  storeButtonCompact: {
    minHeight: 54,
    minWidth: 116,
    paddingHorizontal: 10
  },
  storeButtonActive: {
    borderColor: "#12616F",
    backgroundColor: "#12616F"
  },
  storeButtonDisabled: {
    opacity: 0.72
  },
  storeButtonTitle: {
    color: "#18212F",
    fontSize: 16,
    fontWeight: "900"
  },
  storeButtonTitleActive: {
    color: "#FFFFFF"
  },
  storeButtonDetail: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2
  },
  storeButtonDetailActive: {
    color: "#DFF4F7"
  },
  storeRouteLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  storeRouteLineCompact: {
    gap: 6
  },
  storeRouteHint: {
    color: "#596579",
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  storeRouteHintCompact: {
    fontSize: 12,
    lineHeight: 16
  },
  routeEditorChip: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    minWidth: 52
  },
  routeEditorChipCompact: {
    minHeight: 28,
    minWidth: 48
  },
  routeEditorChipText: {
    color: "#12616F",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  routeEditorPanel: {
    borderRadius: 8,
    backgroundColor: "#F5F7F9",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    gap: 8,
    padding: 10
  },
  routeEditorScroller: {
    maxHeight: 284
  },
  routeEditorList: {
    gap: 8,
    paddingBottom: 2
  },
  routeEditorTitle: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  routeSectionRow: {
    minHeight: 48,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10
  },
  routeSectionNumber: {
    color: "#12616F",
    fontSize: 14,
    fontWeight: "900",
    width: 24
  },
  routeSectionName: {
    color: "#18212F",
    flex: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  routeSectionActions: {
    flexDirection: "row",
    gap: 6
  },
  searchBox: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12
  },
  searchInput: {
    flex: 1,
    minHeight: 54,
    color: "#18212F",
    fontSize: 17,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  clearSearchButton: {
    minHeight: 44,
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center"
  },
  clearSearchText: {
    color: "#12616F",
    fontSize: 15,
    fontWeight: "900"
  },
  voiceSearchButton: {
    minHeight: 44,
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  voiceSearchButtonActive: {
    opacity: 0.75
  },
  microphoneIcon: {
    alignItems: "center",
    height: 26,
    justifyContent: "center",
    width: 20
  },
  microphoneHead: {
    width: 12,
    height: 16,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#12616F"
  },
  microphoneStem: {
    width: 2,
    height: 6,
    backgroundColor: "#12616F"
  },
  microphoneBase: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#12616F"
  },
  microphoneIconActive: {
    borderColor: "#A33E22",
    backgroundColor: "#A33E22"
  },
  primaryButton: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#12616F"
  },
  primaryButtonFull: {
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#12616F",
    marginTop: 12
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800"
  },
  secondaryButton: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#12616F"
  },
  secondaryButtonDisabled: {
    borderColor: "#C8D0DB",
    backgroundColor: "#EEF2F6"
  },
  secondaryButtonFull: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#12616F",
    marginTop: 10
  },
  secondaryButtonText: {
    color: "#12616F",
    fontSize: 17,
    fontWeight: "800"
  },
  secondaryButtonTextDisabled: {
    color: "#8A95A6"
  },
  listContent: {
    gap: 10,
    paddingBottom: 24
  },
  itemCard: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    flexDirection: "row",
    gap: 10,
    minHeight: 112,
    padding: 12
  },
  itemColumn: {
    flex: 1.15,
    justifyContent: "center"
  },
  itemName: {
    color: "#18212F",
    fontSize: 19,
    fontWeight: "800"
  },
  itemMeta: {
    color: "#596579",
    fontSize: 15,
    marginTop: 4
  },
  lastPickedText: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 0
  },
  itemNote: {
    color: "#3E4A5A",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6
  },
  rowAction: {
    color: "#A33E22",
    fontSize: 16,
    fontWeight: "800"
  },
  rowButton: {
    minHeight: 52,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center"
  },
  inlineSkipButton: {
    minHeight: 36,
    minWidth: 56,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  listPostponeAction: {
    alignItems: "flex-end",
    justifyContent: "center",
    minHeight: 36,
    paddingLeft: 12
  },
  quantityColumn: {
    width: 82,
    gap: 6,
    justifyContent: "flex-start"
  },
  quantityHeader: {
    minHeight: 36,
    justifyContent: "center"
  },
  noteColumn: {
    flex: 1,
    gap: 6
  },
  noteHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sortButton: {
    width: 32,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#B8C2D1"
  },
  sortButtonDisabled: {
    borderColor: "#E3E8EF"
  },
  sortButtonText: {
    color: "#12616F",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20
  },
  sortButtonTextDisabled: {
    color: "#B8C2D1"
  },
  fieldLabel: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  quantityInput: {
    height: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 12
  },
  noteInput: {
    height: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 17,
    padding: 12,
    textAlignVertical: "top"
  },
  catalogCard: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    padding: 12,
    gap: 8
  },
  catalogTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  catalogInfo: {
    flex: 1
  },
  catalogAddButton: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#12616F",
    paddingHorizontal: 12
  },
  catalogAddText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  catalogNoteRow: {
    borderRadius: 8,
    backgroundColor: "#F5F7F9",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4
  },
  catalogNoteText: {
    color: "#3E4A5A",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20
  },
  catalogFooterRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  catalogManageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  catalogSmallAction: {
    minHeight: 32,
    justifyContent: "center"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 24
  },
  productEditCard: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderWidth: 1,
    borderColor: "#12616F",
    gap: 10
  },
  productAction: {
    color: "#12616F",
    fontSize: 12,
    fontWeight: "900"
  },
  manageButtonText: {
    color: "#12616F",
    fontSize: 12,
    fontWeight: "900"
  },
  deleteButtonText: {
    color: "#A33E22",
    fontSize: 12,
    fontWeight: "900"
  },
  cancelEditButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#596579"
  },
  cancelEditText: {
    color: "#596579",
    fontSize: 15,
    fontWeight: "900"
  },
  editSectionBar: {
    gap: 8,
    paddingRight: 20
  },
  editSectionButton: {
    minHeight: 44,
    minWidth: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12
  },
  newProductClosedButton: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#12616F",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 12
  },
  newProductClosedText: {
    color: "#12616F",
    fontSize: 17,
    fontWeight: "900"
  },
  newProductBox: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    marginBottom: 12,
    padding: 12,
    gap: 10
  },
  newProductHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  newProductDepartment: {
    color: "#12616F",
    fontSize: 14,
    fontWeight: "900"
  },
  newProductFields: {
    flexDirection: "row",
    gap: 10
  },
  newProductNameInput: {
    flex: 1,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 17,
    paddingHorizontal: 12
  },
  newProductQuantityInput: {
    width: 92,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 10
  },
  newProductNoteInput: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8C2D1",
    color: "#18212F",
    fontSize: 16,
    padding: 10,
    textAlignVertical: "top"
  },
  newProductActions: {
    flexDirection: "row",
    gap: 10
  },
  newProductPreference: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10
  },
  preferenceOpenBox: {
    backgroundColor: "#E6F4EA",
    borderColor: "#245A38"
  },
  preferenceExactBox: {
    backgroundColor: "#F8E8E2",
    borderColor: "#A33E22"
  },
  preferenceOpenText: {
    color: "#245A38",
    fontSize: 15,
    fontWeight: "900"
  },
  preferenceExactText: {
    color: "#A33E22",
    fontSize: 15,
    fontWeight: "900"
  },
  createProductButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#12616F",
    paddingHorizontal: 10
  },
  createProductButtonFull: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#12616F",
    paddingHorizontal: 10
  },
  createProductText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  preferencePill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  preferenceOpen: {
    backgroundColor: "#E6F4EA",
    color: "#245A38"
  },
  preferenceExact: {
    backgroundColor: "#F8E8E2",
    color: "#A33E22"
  },
  nextCard: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderWidth: 1,
    borderColor: "#D8DEE8"
  },
  nextItem: {
    color: "#18212F",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    marginTop: 8
  },
  shopActions: {
    marginTop: 14
  },
  pickButton: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: "#12616F",
    alignItems: "center",
    justifyContent: "center"
  },
  pickButtonText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900"
  },
  checkoutButton: {
    minHeight: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A33E22",
    marginTop: 10
  },
  cartTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 12,
    zIndex: 2
  },
  checkoutButtonCompact: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A33E22",
    paddingHorizontal: 10
  },
  checkoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  },
  checkoutLockedBox: {
    minHeight: 54,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8E8E2",
    borderWidth: 1,
    borderColor: "#A33E22",
    marginTop: 10,
    paddingHorizontal: 12
  },
  checkoutLockedBoxCompact: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8E8E2",
    borderWidth: 1,
    borderColor: "#A33E22",
    paddingHorizontal: 10
  },
  checkoutLockedText: {
    color: "#A33E22",
    fontSize: 15,
    fontWeight: "900"
  },
  undoButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8
  },
  undoButtonText: {
    color: "#A33E22",
    fontSize: 15,
    fontWeight: "800"
  },
  undoButtonCompact: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A33E22",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10
  },
  smallActionDisabled: {
    borderColor: "#D8DEE8",
    backgroundColor: "#EEF2F6"
  },
  smallActionTextDisabled: {
    color: "#8A95A6"
  },
  cartListScroller: {
    flex: 1
  },
  cartListTitle: {
    color: "#596579",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    textTransform: "uppercase"
  },
  pickingList: {
    gap: 10,
    paddingBottom: 32
  },
  pickRow: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12
  },
  pickRowDragging: {
    borderColor: "#12616F",
    elevation: 6,
    opacity: 0.92,
    shadowColor: "#0B2230",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    zIndex: 5
  },
  pickRowDropTarget: {
    borderColor: "#B98200",
    borderWidth: 2
  },
  pickRowSelected: {
    borderColor: "#12616F",
    backgroundColor: "#DFF4F7"
  },
  dragHandle: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#EEF2F6",
    borderColor: "#B8C2D1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    width: 32
  },
  dragHandleHover: {
    backgroundColor: "#DFF4F7",
    borderColor: "#12616F"
  },
  dragHandleActive: {
    backgroundColor: "#12616F",
    borderColor: "#12616F"
  },
  dragHandleText: {
    color: "#4B5565",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24
  },
  dragHandleTextActive: {
    color: "#FFFFFF"
  },
  pickRowInfo: {
    flex: 1,
    gap: 2
  },
  pickRowActions: {
    alignItems: "flex-end",
    alignSelf: "flex-start",
    gap: 6,
    justifyContent: "flex-end",
    width: 86
  },
  pickArrowRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
    width: 86
  },
  cartSortButton: {
    width: 40
  },
  pickedSmallButton: {
    minHeight: 46,
    width: 86,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#12616F",
    paddingHorizontal: 6
  },
  pickedSmallButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  sectionLabel: {
    color: "#596579",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  compactRow: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: "#E9EDF2",
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  compactName: {
    color: "#18212F",
    fontSize: 17,
    fontWeight: "800"
  },
  compactMeta: {
    color: "#596579",
    fontSize: 14
  },
  emptyText: {
    color: "#596579",
    fontSize: 17,
    lineHeight: 24
  },
  emptyState: {
    minHeight: 120,
    justifyContent: "center",
    padding: 16
  },
  routeRow: {
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#D8DEE8"
  },
  routeNumber: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#12616F",
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 34
  }
});
