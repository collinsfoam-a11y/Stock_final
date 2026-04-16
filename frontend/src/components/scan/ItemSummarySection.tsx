import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";

import ModernCard from "@/components/ui/ModernCard";
import { useSettingsStore } from "@/store/settingsStore";
import { Item } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  shadows,
  spacing,
} from "@/theme/unified";

interface BundleComponent {
  item_code?: string;
  item_name?: string;
  qty_per_bundle?: number;
}

type ItemSummaryItem = Item & {
  components?: BundleComponent[];
  is_bundle?: boolean;
};

interface ItemSummarySectionProps {
  barcode?: string;
  isRefreshing: boolean;
  item: ItemSummaryItem;
  onRefreshStock: () => void;
  showDetails?: boolean;
  showItemImages: boolean;
  showItemPrices: boolean;
  showItemStock: boolean;
}

const getSourceBadgeStyle = (source?: string) => {
  switch (source) {
    case "sql":
      return {
        container: {
          backgroundColor: colors.primary[50],
          borderColor: colors.primary[200],
        },
        text: { color: colors.primary[700] },
        label: "SQL",
      };
    case "cache":
      return {
        container: {
          backgroundColor: colors.warning[50],
          borderColor: colors.warning[200],
        },
        text: { color: colors.warning[700] },
        label: "Cache",
      };
    default:
      return {
        container: {
          backgroundColor: colors.success[50],
          borderColor: colors.success[200],
        },
        text: { color: colors.success[700] },
        label: "MongoDB",
      };
  }
};

export function ItemSummarySection({
  barcode,
  isRefreshing,
  item,
  onRefreshStock,
  showDetails = false,
  showItemImages,
  showItemPrices,
  showItemStock,
}: ItemSummarySectionProps) {
  const imageCacheEnabled = useSettingsStore((state) => state.settings.imageCache);
  const sourceBadge = item._source ? getSourceBadgeStyle(item._source) : null;
  const bundleComponents = Array.isArray(item.components) ? item.components : [];
  const stockQty = item.current_stock ?? item.stock_qty ?? 0;
  const stockUom = item.uom_name || item.uom_code || "";
  const displayBarcode = item.barcode || barcode || "N/A";

  return (
    <View>
      {item.is_misplaced && (
        <View style={styles.misplacedBadge}>
          <Ionicons name="alert-circle" size={24} color={colors.white} />
          <View style={styles.misplacedContent}>
            <Text style={styles.misplacedTitle}>MISPLACED ITEM</Text>
            <Text style={styles.misplacedText}>
              This item belongs in{" "}
              <Text style={styles.misplacedHighlight}>
                {item.expected_location || "another location"}
              </Text>
            </Text>
          </View>
        </View>
      )}

      <ModernCard style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.iconContainer}>
            {showItemImages && item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={styles.itemImage}
                contentFit="cover"
                cachePolicy={imageCacheEnabled ? "disk" : "none"}
                transition={300}
              />
            ) : (
              <Ionicons
                name="cube-outline"
                size={24}
                color={colors.primary[600]}
              />
            )}
          </View>

          <View style={styles.itemInfo}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.itemName, { color: semanticColors.text.primary }]}
                numberOfLines={2}
              >
                {item.item_name || item.name}
              </Text>

              {sourceBadge && (
                <View style={[styles.sourceBadge, sourceBadge.container]}>
                  <Text style={[styles.sourceBadgeText, sourceBadge.text]}>
                    {sourceBadge.label}
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[styles.itemCode, { color: semanticColors.text.secondary }]}
            >
              {item.category || "-"} • {item.subcategory || "-"}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <View style={styles.detailHeader}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: semanticColors.text.secondary },
                ]}
              >
                Stock
              </Text>
              <TouchableOpacity
                onPress={onRefreshStock}
                disabled={isRefreshing}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={isRefreshing ? "hourglass-outline" : "refresh"}
                  size={14}
                  color={colors.primary[600]}
                  style={{ opacity: isRefreshing ? 0.5 : 1 }}
                />
              </TouchableOpacity>
            </View>
            <Text
              style={[styles.detailValue, { color: semanticColors.text.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {showItemStock
                ? stockUom
                  ? `${stockQty} ${stockUom}`
                  : String(stockQty)
                : "---"}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text
              style={[
                styles.detailLabel,
                { color: semanticColors.text.secondary },
              ]}
            >
              MRP
            </Text>
            <Text
              style={[styles.detailValue, { color: semanticColors.text.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {showItemPrices ? `₹${item.mrp || 0}` : "---"}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text
              style={[
                styles.detailLabel,
                { color: semanticColors.text.secondary },
              ]}
            >
              Price
            </Text>
            <Text
              style={[styles.detailValue, { color: semanticColors.text.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {showItemPrices
                ? `₹${item.sale_price || item.sales_price || 0}`
                : "---"}
            </Text>
          </View>
        </View>
      </ModernCard>

      {showDetails && (
        <>
          <View style={styles.barcodeSection}>
            <Text style={styles.barcodeLabel}>Barcode</Text>
            <Text
              style={styles.barcodeValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {displayBarcode}
            </Text>
          </View>

          {item.is_bundle && bundleComponents.length > 0 && (
            <View style={styles.bundleSection}>
              <Text
                style={[
                  styles.bundleTitle,
                  { color: semanticColors.text.primary },
                ]}
              >
                Bundle Components
              </Text>
              {bundleComponents.map((component, index) => (
                <View
                  key={`${component.item_code || component.item_name || "bundle"}-${index}`}
                  style={styles.bundleItem}
                >
                  <Ionicons
                    name="cube-outline"
                    size={18}
                    color={colors.primary[600]}
                  />
                  <Text
                    style={[
                      styles.bundleItemName,
                      { color: semanticColors.text.primary },
                    ]}
                  >
                    {component.item_name || component.item_code}
                  </Text>
                  <Text
                    style={[styles.bundleItemQty, { color: colors.primary[700] }]}
                  >
                    x{component.qty_per_bundle ?? 0}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {item._source === "cache" && (
            <View style={styles.staleWarning}>
              <Ionicons
                name="warning"
                size={18}
                color={colors.warning[700]}
              />
              <View style={styles.staleWarningContent}>
                <Text style={styles.staleWarningTitle}>ERP Offline</Text>
                <Text style={styles.staleWarningText}>
                  Variance is based on a cached stock snapshot.
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  misplacedBadge: {
    backgroundColor: colors.error[500],
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  misplacedContent: {
    flex: 1,
  },
  misplacedTitle: {
    color: colors.white,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  misplacedText: {
    color: colors.white,
    fontSize: fontSize.xs,
  },
  misplacedHighlight: {
    fontWeight: fontWeight.bold,
    textDecorationLine: "underline",
  },
  itemCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  itemHeader: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    overflow: "hidden",
  },
  itemImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  sourceBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  itemCode: {
    fontSize: fontSize.sm,
    color: colors.neutral[500],
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    paddingTop: spacing.md,
    justifyContent: "space-between",
  },
  detailItem: {
    minWidth: "30%",
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: colors.neutral[500],
    marginBottom: 2,
  },
  detailValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: colors.neutral[900],
  },
  barcodeSection: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  barcodeLabel: {
    fontSize: fontSize.sm,
    color: semanticColors.text.secondary,
    marginBottom: 4,
  },
  barcodeValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: semanticColors.text.primary,
    letterSpacing: 1,
  },
  bundleSection: {
    backgroundColor: colors.primary[50],
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[100],
    marginBottom: spacing.lg,
  },
  bundleTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  bundleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  bundleItemName: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  bundleItemQty: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  staleWarning: {
    flexDirection: "row",
    backgroundColor: colors.warning[50],
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning[200],
    marginBottom: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
  },
  staleWarningContent: {
    flex: 1,
  },
  staleWarningTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.warning[800],
    marginBottom: 2,
  },
  staleWarningText: {
    fontSize: fontSize.xs,
    color: colors.warning[700],
    lineHeight: 16,
  },
});
