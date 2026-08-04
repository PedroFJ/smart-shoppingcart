import { createElement, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextStyle,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { Redirect } from "expo-router";
import { defaultItinerary, Product, SectionId, sections, starterProducts } from "./src/data/sampleData";
import { PickEvent, sortByRoute } from "./src/domain/routeInference";
import {
  formatLastPicked,
  formatLastPickedShort,
  formatProductDetails,
  getProductSortLabel,
  includesAny,
  normalizeQuantityText
} from "./src/domain/productFormat";
import {
  completeSectionRoute,
  completeStoreStopOrder,
  defaultSupercorStopOrder,
  isSupercorStopId,
  sortShoppingItems
} from "./src/domain/routeOrdering";
import { isSavedAtNewer } from "./src/domain/savedAt";
import { filterBySearch, normalizeForMatching } from "./src/domain/search";
import { useVoiceSearch } from "./src/hooks/useVoiceSearch";
import { getDeviceLocalStorage, LocalStorageLike } from "./src/lib/deviceStorage";
import { defaultSyncSpaceId, isSupabaseConfigured, supabase } from "./src/lib/supabase";
import { useSettingsStore } from "./src/state/settingsStore";
import { VoiceSearchButton } from "./src/ui/components/VoiceSearchButton";
import { getSectionCardStyle } from "./src/ui/sectionStyles";

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
  departmentFilter: DepartmentFilter;
  listSearch: string;
  addSearch: string;
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
const androidStatusBarInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;
const androidNavigationBarInset = Platform.OS === "android" ? 24 : 0;
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
const defaultStoreItineraries: StoreItineraries = supermarketProfiles.reduce<StoreItineraries>((itineraries, store) => {
  itineraries[store.id] = defaultItinerary;
  return itineraries;
}, {});
const defaultStoreId = supermarketProfiles[0].id;
const defaultLocalUserSettings: LocalUserSettings = {
  userName: "",
  voiceSearchEnabled: true,
  defaultStoreId,
  smartStartEnabled: false,
  departmentFilter: "all",
  listSearch: "",
  addSearch: ""
};
const checkoutConfirmWebButtonStyle: CSSProperties = {
  flex: 1,
  minHeight: 48,
  borderRadius: 8,
  borderWidth: 0,
  borderStyle: "solid",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#A33E22",
  color: "#FFFFFF",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  padding: "0 10px"
};
const checkoutConfirmWebCancelStyle: CSSProperties = {
  width: 48,
  minHeight: 48,
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#A33E22",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#FFFFFF",
  color: "#A33E22",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  padding: 0
};
const checkoutConfirmWebTextStyle: CSSProperties = {
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: "16px",
  pointerEvents: "none",
  textAlign: "center"
};
const checkoutConfirmWebCancelTextStyle: CSSProperties = {
  color: "#A33E22",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: "20px",
  pointerEvents: "none"
};
const catalogActionWebButtonStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "transparent",
  borderWidth: 0,
  color: "#A33E22",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  padding: 0
};
const catalogActionWebTextStyle: CSSProperties = {
  color: "#A33E22",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "16px",
  pointerEvents: "none"
};
const catalogConfirmActionsWebStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexDirection: "row",
  gap: 8
};
const catalogDeleteConfirmWebButtonStyle: CSSProperties = {
  minHeight: 44,
  borderRadius: 8,
  borderWidth: 0,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#A33E22",
  color: "#FFFFFF",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  padding: "0 10px"
};
const catalogDeleteConfirmWebTextStyle: CSSProperties = {
  color: "#FFFFFF",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "16px",
  pointerEvents: "none"
};
const catalogConfirmCancelWebButtonStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#A33E22",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#FFFFFF",
  color: "#A33E22",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  padding: 0
};
const catalogConfirmCancelWebTextStyle: CSSProperties = {
  color: "#A33E22",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: "18px",
  pointerEvents: "none"
};

export default function App() {
  const { height, width } = useWindowDimensions();
  const locale = useSettingsStore((state) => state.locale);
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
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>(() => localUserSettings.departmentFilter);
  const [listSearch, setListSearch] = useState(() => localUserSettings.listSearch);
  const [addSearch, setAddSearch] = useState(() => localUserSettings.addSearch);
  const [shoppingDoneNotice, setShoppingDoneNotice] = useState(() => initialAppState?.shoppingDoneNotice ?? false);
  const [isCheckoutLocked, setIsCheckoutLocked] = useState(() => initialAppState?.isCheckoutLocked ?? false);
  const [lockedPickingIds, setLockedPickingIds] = useState<Set<string> | null>(() => {
    return initialAppState?.lockedPickingIds?.length ? new Set(initialAppState.lockedPickingIds) : null;
  });
  const [activeTripItemIds, setActiveTripItemIds] = useState<Set<string> | null>(() => {
    return initialAppState?.activeTripItemIds?.length ? new Set(initialAppState.activeTripItemIds) : null;
  });

  useEffect(() => {
    setProducts((current) => normalizeCollection(current, normalizeExistingProduct));
    setShoppingItems((current) => normalizeCollection(current, normalizeExistingShoppingItem));
  }, []);

  useEffect(() => {
    if (screen === "welcome") {
      return;
    }

    writeLocalUserSettings(localUserSettings);
  }, [localUserSettings, screen]);

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
        if (initialAppState && isSavedAtNewer(initialAppState.savedAt, data.state.savedAt)) {
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

          if (!isSavedAtNewer(nextRow.state.savedAt, latestLocalSavedAt.current)) {
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
    isCheckoutLocked,
    activeTripItemIds,
    itinerary,
    selectedStoreId,
    storeItineraries,
    storeStopOrders,
    storeProductOrders,
    lockedPickingIds,
    pickEvents,
    products,
    shoppingDoneNotice,
    shoppingItems
  ]);

  const neededItems = useMemo(() => {
    return sortShoppingItems(
      shoppingItems.filter((item) => item.status === "needed"),
      defaultItinerary,
      locale
    );
  }, [locale, shoppingItems]);
  const listProductIds = useMemo(() => new Set(neededItems.map((item) => item.id)), [neededItems]);
  const addableProductCount = useMemo(() => {
    return products.filter((product) => !listProductIds.has(product.id)).length;
  }, [listProductIds, products]);

  const progress = shoppingItems.filter((item) => item.status !== "needed").length;
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
    setIsCheckoutLocked(Boolean(nextState.isCheckoutLocked));
    setLockedPickingIds(nextState.lockedPickingIds.length ? new Set(nextState.lockedPickingIds) : null);
    setActiveTripItemIds(nextState.activeTripItemIds.length ? new Set(nextState.activeTripItemIds) : null);
    setShoppingDoneNotice(Boolean(nextState.shoppingDoneNotice));
  }

  function updateDepartmentFilter(departmentFilter: DepartmentFilter) {
    setDepartmentFilter(departmentFilter);
    setLocalUserSettings((current) => ({ ...current, departmentFilter }));
  }

  function updateListSearch(listSearch: string) {
    setListSearch(listSearch);
    setLocalUserSettings((current) => ({ ...current, listSearch }));
  }

  function updateAddSearch(addSearch: string) {
    setAddSearch(addSearch);
    setLocalUserSettings((current) => ({ ...current, addSearch }));
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
    updateAddSearch("");
    updateDepartmentFilter(classifiedProduct.sectionId);
    updateListSearch(classifiedProduct.name);
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

  function navigateToMainScreen(nextScreen: MainScreen) {
    setScreen(nextScreen);
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
            cartCount={neededItems.length}
            isCheckoutLocked={isCheckoutLocked}
            showWelcome={!localUserSettings.smartStartEnabled}
            compact={false}
            onNavigate={navigateToMainScreen}
          />
        )}

        <View style={styles.contentArea}>
        {screen === "welcome" && <Redirect href="/welcome" />}

        {screen === "list" && <Redirect href="/list" />}

        {screen === "add" && (
          <AddScreen
            products={products}
            listProductIds={listProductIds}
            departmentFilter={departmentFilter}
            onChangeDepartmentFilter={updateDepartmentFilter}
            searchText={addSearch}
            onChangeSearchText={updateAddSearch}
            onAdd={addProduct}
            onCreateProduct={createAndAddProduct}
            onUpdateProduct={updateCatalogProduct}
            onDeleteProduct={deleteCatalogProduct}
            voiceSearchEnabled={localUserSettings.voiceSearchEnabled}
          />
        )}

        {screen === "settings" && <Redirect href="/settings" />}

        {screen === "shop" && <Redirect href="/shop" />}

        {screen === "summary" && <Redirect href="/shop/summary" />}
        </View>

        {screen !== "summary" && isCompactLayout && (
          <NavigationTabs
            activeScreen={screen}
            listCount={neededItems.length}
            addCount={addableProductCount}
            cartCount={neededItems.length}
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
  const [pendingDeleteProductId, setPendingDeleteProductId] = useState<string | null>(null);
  const deleteConfirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    return () => {
      clearDeleteConfirmTimer();
    };
  }, []);

  function clearDeleteConfirmTimer() {
    if (deleteConfirmTimeout.current) {
      clearTimeout(deleteConfirmTimeout.current);
      deleteConfirmTimeout.current = null;
    }
  }

  function cancelDeleteConfirm() {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(null);
  }

  function requestDeleteConfirm(productId: string) {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(productId);
    deleteConfirmTimeout.current = setTimeout(() => {
      setPendingDeleteProductId(null);
      deleteConfirmTimeout.current = null;
    }, 4000);
  }

  function confirmDeleteProduct(productId: string) {
    clearDeleteConfirmTimer();
    setPendingDeleteProductId(null);
    onDeleteProduct(productId);
  }

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
    cancelDeleteConfirm();
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

  function renderCatalogDeleteAction(product: Product) {
    if (pendingDeleteProductId === product.id) {
      if (Platform.OS === "web") {
        return createElement(
          "div",
          { style: catalogConfirmActionsWebStyle },
          createElement(
            "button",
            {
              type: "button",
              onClick: () => confirmDeleteProduct(product.id),
              style: catalogDeleteConfirmWebButtonStyle
            },
            createElement("span", { style: catalogDeleteConfirmWebTextStyle }, "Apagar mesmo")
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: cancelDeleteConfirm,
              style: catalogConfirmCancelWebButtonStyle
            },
            createElement("span", { style: catalogConfirmCancelWebTextStyle }, "X")
          )
        );
      }

      return (
        <View style={styles.catalogConfirmActions}>
          <TouchableOpacity style={styles.catalogDeleteConfirmButton} onPress={() => confirmDeleteProduct(product.id)}>
            <Text style={styles.catalogDeleteConfirmText}>Apagar mesmo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.catalogConfirmCancelButton} onPress={cancelDeleteConfirm}>
            <Text style={styles.catalogConfirmCancelText}>X</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (Platform.OS === "web") {
      return createElement(
        "button",
        {
          type: "button",
          onClick: () => requestDeleteConfirm(product.id),
          style: catalogActionWebButtonStyle
        },
        createElement("span", { style: catalogActionWebTextStyle }, "Apagar")
      );
    }

    return (
      <TouchableOpacity style={styles.catalogSmallAction} onPress={() => requestDeleteConfirm(product.id)}>
        <Text style={styles.deleteButtonText}>Apagar</Text>
      </TouchableOpacity>
    );
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
                  {renderCatalogDeleteAction(product)}
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
        : defaultLocalUserSettings.smartStartEnabled,
      departmentFilter: isDepartmentFilter(parsedSettings.departmentFilter)
        ? parsedSettings.departmentFilter
        : defaultLocalUserSettings.departmentFilter,
      listSearch: typeof parsedSettings.listSearch === "string"
        ? parsedSettings.listSearch
        : defaultLocalUserSettings.listSearch,
      addSearch: typeof parsedSettings.addSearch === "string"
        ? parsedSettings.addSearch
        : defaultLocalUserSettings.addSearch
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

function normalizeCollection<T extends Record<string, unknown>>(items: T[], normalize: (item: T) => T): T[] {
  let changed = false;
  const normalizedItems = items.map((item) => {
    const normalizedItem = normalize(item);

    if (!shallowEqualRecord(item, normalizedItem)) {
      changed = true;
    }

    return normalizedItem;
  });

  return changed ? normalizedItems : items;
}

function shallowEqualRecord(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  syncPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  welcomeActions: {
    gap: 10
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
  tertiaryButtonFull: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginTop: 10
  },
  tertiaryButtonText: {
    color: "#596579",
    fontSize: 16,
    fontWeight: "800"
  },
  listContent: {
    gap: 10,
    paddingBottom: 24
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
    minHeight: 44,
    minWidth: 56,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  sortButton: {
    width: 48,
    minHeight: 48,
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
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center"
  },
  catalogConfirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  catalogDeleteConfirmButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A33E22",
    paddingHorizontal: 10
  },
  catalogDeleteConfirmText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  catalogConfirmCancelButton: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A33E22",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  catalogConfirmCancelText: {
    color: "#A33E22",
    fontSize: 14,
    fontWeight: "900"
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
  summaryConfidencePill: {
    marginTop: 10
  },
  summaryActions: {
    gap: 0
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
    position: "relative",
    zIndex: 20
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
  confirmCancelButton: {
    width: 48,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A33E22",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  confirmCancelText: {
    color: "#A33E22",
    fontSize: 16,
    fontWeight: "900"
  },
  checkoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  },
  checkoutConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
    textAlign: "center"
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
    width: 102
  },
  pickArrowRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
    width: 102
  },
  pickedSmallButton: {
    minHeight: 48,
    width: 102,
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
  missingSmallButton: {
    minHeight: 48,
    width: 102,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A33E22",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6
  },
  missingSmallButtonText: {
    color: "#A33E22",
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
