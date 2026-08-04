import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Product, sections } from "../../../../src/data/sampleData";
import { useProductLifecycle } from "../../../../src/hooks/useProductLifecycle";
import { useProductsStore } from "../../../../src/state/productsStore";
import { productFormStyles as styles } from "../../../../src/ui/productFormStyles";

export default function EditProductRoute() {
  const { t } = useTranslation("add");
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const product = useProductsStore((state) => state.products.find((candidate) => candidate.id === productId));
  const { updateCatalogProduct } = useProductLifecycle();
  const [draft, setDraft] = useState<Product | null>(() => product ? { ...product } : null);

  function updateDraft(patch: Partial<Product>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function saveProduct() {
    if (!draft) {
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      return;
    }

    updateCatalogProduct({
      ...draft,
      name: trimmedName,
      brand: draft.brand?.trim() || undefined,
      note: draft.note?.trim() || undefined,
      defaultQuantity: draft.defaultQuantity.trim() || "1 un"
    });
    router.back();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("editProduct.title")}</Text>
          <TouchableOpacity accessibilityLabel={t("editProduct.close")} style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>{t("common.closeSymbol")}</Text>
          </TouchableOpacity>
        </View>
        {!draft ? (
          <Text style={styles.emptyText}>{t("editProduct.notFound")}</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.fields}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("editProduct.nameLabel")}</Text>
              <TextInput style={styles.input} value={draft.name} onChangeText={(name) => updateDraft({ name })} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("editProduct.quantityLabel")}</Text>
              <TextInput style={styles.input} value={draft.defaultQuantity} onChangeText={(defaultQuantity) => updateDraft({ defaultQuantity })} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("editProduct.brandLabel")}</Text>
              <TextInput style={styles.input} value={draft.brand ?? ""} onChangeText={(brand) => updateDraft({ brand })} />
            </View>
            <TouchableOpacity
              style={[styles.preferenceButton, draft.defaultAcceptsAlternatives ? styles.preferenceOpen : styles.preferenceExact]}
              onPress={() => updateDraft({ defaultAcceptsAlternatives: !draft.defaultAcceptsAlternatives })}
            >
              <Text style={draft.defaultAcceptsAlternatives ? styles.preferenceOpenText : styles.preferenceExactText}>
                {draft.defaultAcceptsAlternatives ? t("catalog.alternatives") : t("catalog.exact")}
              </Text>
            </TouchableOpacity>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("editProduct.sectionLabel")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionRail}>
                {sections.map((section) => (
                  <TouchableOpacity
                    key={section.id}
                    style={[styles.sectionButton, draft.sectionId === section.id && styles.sectionButtonActive]}
                    onPress={() => updateDraft({ sectionId: section.id })}
                  >
                    <Text style={[styles.sectionText, draft.sectionId === section.id && styles.sectionTextActive]}>{section.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("editProduct.noteLabel")}</Text>
              <TextInput style={[styles.input, styles.noteInput]} value={draft.note ?? ""} onChangeText={(note) => updateDraft({ note })} multiline />
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} onPress={saveProduct}>
                <Text style={styles.primaryText}>{t("editProduct.save")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
                <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
