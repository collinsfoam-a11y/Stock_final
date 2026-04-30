import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";

import ModernCard from "@/components/ui/ModernCard";
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

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecf7f4";
const TEXT_STRONG = "#0f172a";
const TEXT_MUTED = "#475569";

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
          backgroundColor: ACCENT_SOFT,
          borderColor: "#cae8df",
        },
        text: { color: ACCENT },
        label: "ERP",
      };
  }
};

const formatStockDisplay = (showItemStock: boolean, stockQty: number, stockUom: string) => {
  if (!showItemStock) return "---";
  return stockUom ? `${stockQty} ${stockUom}` : String(stockQty);
};

const formatPriceDisplay = (enabled: boolean, value: number) => (enabled ? `₹${value}` : "---");

const MisplacedBanner = ({ expectedLocation }: { expectedLocation?: string }) => (
  <View style={styles.misplacedBadge}>
    <Ionicons name="alert-circle" size={24} color={colors.white} />
    <View style={styles.misplacedContent}>
      <Text style={styles.misplacedTitle}>MISPLACED ITEM</Text>
      <Text style={styles.misplacedText}>
        This item belongs in{" "}
        <Text style={styles.misplacedHighlight}>{expectedLocation || "another location"}</Text>
      </Text>
    </View>
  </View>
);

const ItemHeader = ({
  item,
  sourceBadge,
  showItemImages,
}: {
  item: ItemSummaryItem;
  sourceBadge: ReturnType<typeof getSourceBadgeStyle> | null;
  showItemImages: boolean;
}) => (
  <View style={styles.itemHeader}>
    <View style={styles.iconContainer}>
      {showItemImages && item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={styles.itemImage}
          resizeMode="cover"
        />
      ) : (
        <Ionicons name="cube-outline" size={24} color={colors.primary[600]} />
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
            <Text style={[styles.sourceBadgeText, sourceBadge.text]}>{sourceBadge.label}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.itemCode, { color: semanticColors.text.secondary }]}>
        {item.category || "-"} • {item.subcategory || "-"}
      </Text>
    </View>
  </View>
);

const DetailBlock = ({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: ReactNode;
}) => (
  <View style={styles.detailItem}>
    <View style={styles.detailHeader}>
      <Text style={[styles.detailLabel, { color: semanticColors.text.secondary }]}>{label}</Text>
      {action}
    </View>
    <Text
      style={[styles.detailValue, { color: semanticColors.text.primary }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {value}
    </Text>
  </View>
);

const BundleSection = ({ bundleComponents }: { bundleComponents: BundleComponent[] }) => (
  <View style={styles.bundleSection}>
    <Text style={[styles.bundleTitle, { color: semanticColors.text.primary }]}>
      Bundle Components
    </Text>
    {bundleComponents.map((component, index) => (
      <View
        key={`${component.item_code || component.item_name || "bundle"}-${index}`}
        style={styles.bundleItem}
      >
        <Ionicons name="cube-outline" size={18} color={colors.primary[600]} />
        <Text style={[styles.bundleItemName, { color: semanticColors.text.primary }]}>
          {component.item_name || component.item_code}
        </Text>
        <Text style={[styles.bundleItemQty, { color: colors.primary[700] }]}>
          x{component.qty_per_bundle ?? 0}
        </Text>
      </View>
    ))}
  </View>
);

const CacheStaleWarning = () => (
  <View style={styles.staleWarning}>
    <Ionicons name="warning" size={18} color={colors.warning[700]} />
    <View style={styles.staleWarningContent}>
      <Text style={styles.staleWarningTitle}>ERP Offline</Text>
      <Text style={styles.staleWarningText}>Variance is based on a cached stock snapshot.</Text>
    </View>
  </View>
);

const resolveSummaryDisplayData = (item: ItemSummaryItem, barcode?: string) => ({
  sourceBadge: item._source ? getSourceBadgeStyle(item._source) : null,
  bundleComponents: Array.isArray(item.components) ? item.components : [],
  stockQty: item.current_stock ?? item.stock_qty ?? 0,
  stockUom: item.uom_name || item.uom_code || "",
  displayBarcode: item.barcode || barcode || "N/A",
  salePrice: item.sale_price || item.sales_price || 0,
});

const ItemSummaryDetails = ({
  showDetails,
  displayBarcode,
  item,
  bundleComponents,
}: {
  showDetails: boolean;
  displayBarcode: string;
  item: ItemSummaryItem;
  bundleComponents: BundleComponent[];
}) => {
  if (!showDetails) return null;

  return (
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

      {item.is_bundle && bundleComponents.length > 0 ? (
        <BundleSection bundleComponents={bundleComponents} />
      ) : null}

      {item._source === "cache" ? <CacheStaleWarning /> : null}
    </>
  );
};

/**
 * Displays the scanned item summary card with stock, pricing, and bundle details.
 */
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
  const { sourceBadge, bundleComponents, stockQty, stockUom, displayBarcode, salePrice } =
    resolveSummaryDisplayData(item, barcode);

  return (
    <View>
      {item.is_misplaced ? <MisplacedBanner expectedLocation={item.expected_location} /> : null}

      <ModernCard style={styles.itemCard}>
        <Text style={styles.cardKicker}>Selected item</Text>
        <ItemHeader
          item={item}
          sourceBadge={sourceBadge}
          showItemImages={showItemImages}
        />

        <View style={styles.detailsGrid}>
          <DetailBlock
            label="Stock"
            value={formatStockDisplay(showItemStock, stockQty, stockUom)}
            action={
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
            }
          />

          <DetailBlock
            label="MRP"
            value={formatPriceDisplay(showItemPrices, item.mrp || 0)}
          />

          <DetailBlock
            label="Price"
            value={formatPriceDisplay(showItemPrices, salePrice)}
          />
        </View>
      </ModernCard>

      <ItemSummaryDetails
        showDetails={showDetails}
        displayBarcode={displayBarcode}
        item={item}
        bundleComponents={bundleComponents}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  misplacedBadge: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
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
    color: colors.error[800],
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  misplacedText: {
    color: colors.error[700],
    fontSize: fontSize.xs,
  },
  misplacedHighlight: {
    fontWeight: fontWeight.bold,
    textDecorationLine: "underline",
  },
  itemCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_CARD,
  },
  cardKicker: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: ACCENT_SOFT,
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
    fontSize: fontSize.lg,
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
    color: TEXT_MUTED,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "#eef2f4",
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  detailItem: {
    flex: 1,
    minWidth: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "flex-start",
    marginBottom: spacing.xs,
    borderRadius: 16,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: TEXT_MUTED,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: TEXT_STRONG,
  },
  barcodeSection: {
    alignItems: "flex-start",
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: SURFACE_CARD,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  barcodeLabel: {
    fontSize: fontSize.sm,
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  barcodeValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: TEXT_STRONG,
    letterSpacing: 1,
  },
  bundleSection: {
    backgroundColor: SURFACE_CARD,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    marginBottom: spacing.lg,
  },
  bundleTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    color: ACCENT,
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
    color: ACCENT,
  },
  staleWarning: {
    flexDirection: "row",
    backgroundColor: SURFACE_CARD,
    padding: spacing.md,
    borderRadius: 18,
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
