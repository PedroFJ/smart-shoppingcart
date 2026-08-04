import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { classifyNewProduct } from "../../../src/domain/productClassification";
import { useProductLifecycle } from "../../../src/hooks/useProductLifecycle";
import { useProductsStore } from "../../../src/state/productsStore";
import { useSettingsStore } from "../../../src/state/settingsStore";
import { productFormStyles as styles } from "../../../src/ui/productFormStyles";

export default function NewProductRoute() {
  const { t } = useTranslation("add");
  const router = useRouter();
  const products = useProductsStore((state) => state.products);
  const departmentFilter = useSettingsStore((state) => state.departmentFilter);
  const setDepartmentFilter = useSettingsStore((state) => state.setDepartmentFilter);
  const setAddSearch = useSettingsStore((state) => state.setAddSearch);
  const setListSearch = useSettingsStore((state) => state.setListSearch);
  const { createAndAddProduct } = useProductLifecycle();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1 un");
  const [note, setNote] = useState("");

  function createProduct() {
    const product = classifyNewProduct({
      rawName: name,
      quantity,
      note,
      fallbackSectionId: departmentFilter === "all" ? "pantry" : departmentFilter
    }, products);

    if (!product) {
      return;
    }

    createAndAddProduct(product);
    setAddSearch("");
    setDepartmentFilter(product.sectionId);
    setListSearch(product.name);
    router.replace("/list");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("newProduct.title")}</Text>
          <TouchableOpacity accessibilityLabel={t("newProduct.close")} style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>{t("common.closeSymbol")}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.fields}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("newProduct.nameLabel")}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t("newProduct.namePlaceholder")} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("newProduct.quantityLabel")}</Text>
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder={t("newProduct.quantityPlaceholder")} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("newProduct.noteLabel")}</Text>
            <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote} placeholder={t("newProduct.notePlaceholder")} multiline />
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={createProduct}>
            <Text style={styles.primaryText}>{t("newProduct.create")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
