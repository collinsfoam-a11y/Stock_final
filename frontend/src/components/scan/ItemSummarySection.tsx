import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";

import ModernCard from "@/components/ui/ModernCard";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { Item } from "@/types/scan";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";

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
  showBarcodeDetails?: boolean;
  showItemImages: boolean;
  showItemPrices: boolean;
  showItemStock: boolean;
}

type SourceBadge = {
  label: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

const formatStockDisplay = (showItemStock: boolean, stockQty: number, stockUom: string): string => {
  if (!showItemStock) return "---";
  return stockUom ? `${stockQty} ${stockUom}` : String(stockQty);
};

const formatPriceDisplay = (enabled: boolean, value: number): string =>
  enabled ? `₹${value}` : "---";

const resolveSummaryDisplayData = (item: ItemSummaryItem, barcode?: string) => ({
  bundleComponents: Array.isArray(item.components) ? item.components : [],
  stockQty: item.current_stock ?? item.stock_qty ?? 0,
  stockUom: item.uom_name || item.uom_code || "",
  displayBarcode: item.barcode || barcode || "N/A",
  salePrice: item.sale_price || item.sales_price || 0,
});

/**
 * Displays the scanned item summary card with stock, pricing, and bundle details.
 */
export function ItemSummarySection({
  barcode,
  isRefreshing,
  item,
  onRefreshStock,
  showDetails = false,
  showBarcodeDetails = true,
  showItemImages,
  showItemPrices,
  showItemStock,
}: ItemSummarySectionProps) {
  const uiTokens = useUiTokens();
  const decorativeIconProps = getDecorativeIconProps();
  const { bundleComponents, stockQty, stockUom, displayBarcode, salePrice } =
    resolveSummaryDisplayData(item, barcode);

  const sourceBadge = useMemo<SourceBadge | null>(() => {
    if (!item._source) return null;

    if (item._source === "sql") {
      return {
        label: "SQL",
        backgroundColor: colorWithAlpha(
          uiTokens.colors.accent,
          uiTokens.mode === "dark" ? 0.24 : 0.12
        ),
        borderColor: colorWithAlpha(uiTokens.colors.accent, 0.38),
        textColor: uiTokens.colors.accentStrong,
      };
    }

    if (item._source === "cache") {
      return {
        label: "Cache",
        backgroundColor: colorWithAlpha(
          uiTokens.colors.warning,
          uiTokens.mode === "dark" ? 0.24 : 0.12
        ),
        borderColor: colorWithAlpha(uiTokens.colors.warning, 0.45),
        textColor: uiTokens.colors.warning,
      };
    }

    return {
      label: "MongoDB",
      backgroundColor: colorWithAlpha(
        uiTokens.colors.success,
        uiTokens.mode === "dark" ? 0.24 : 0.12
      ),
      borderColor: colorWithAlpha(uiTokens.colors.success, 0.4),
      textColor: uiTokens.colors.success,
    };
  }, [item._source, uiTokens]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        barcodeLabel: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          marginBottom: 4,
        },
        barcodeSection: {
          alignItems: "center",
          marginBottom: uiTokens.spacing.md,
        },
        barcodeValue: {
          fontSize: 30,
          fontWeight: "800",
          color: uiTokens.colors.textPrimary,
          letterSpacing: 0.8,
        },
        bundleItem: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: uiTokens.spacing.xs,
          gap: uiTokens.spacing.sm,
        },
        bundleItemName: {
          flex: 1,
          fontSize: 13,
          color: uiTokens.colors.textPrimary,
        },
        bundleItemQty: {
          fontSize: 13,
          fontWeight: "700",
          color: uiTokens.colors.accentStrong,
        },
        bundleSection: {
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.2 : 0.08
          ),
          padding: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          borderColor: colorWithAlpha(uiTokens.colors.accent, 0.3),
          marginBottom: uiTokens.spacing.lg,
        },
        bundleTitle: {
          fontSize: 12,
          fontWeight: "700",
          marginBottom: uiTokens.spacing.sm,
          textTransform: "uppercase",
          color: uiTokens.colors.textPrimary,
        },
        detailHeader: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          justifyContent: "space-between",
        },
        detailItem: {
          minWidth: "30%",
          paddingHorizontal: uiTokens.spacing.xs,
          alignItems: "center",
          marginBottom: uiTokens.spacing.sm,
        },
        detailLabel: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          marginBottom: 2,
        },
        detailValue: {
          fontSize: 24,
          fontWeight: "800",
          color: uiTokens.colors.textPrimary,
        },
        detailsGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          borderTopWidth: 1,
          borderTopColor: uiTokens.colors.border,
          paddingTop: uiTokens.spacing.md,
          justifyContent: "space-between",
        },
        iconContainer: {
          width: 64,
          height: 64,
          borderRadius: uiTokens.radius.md,
          backgroundColor: colorWithAlpha(
            uiTokens.colors.accent,
            uiTokens.mode === "dark" ? 0.2 : 0.08
          ),
          alignItems: "center",
          justifyContent: "center",
          marginRight: uiTokens.spacing.md,
          overflow: "hidden",
        },
        itemBarcode: {
          fontSize: 13,
          color: uiTokens.colors.textSecondary,
          marginBottom: 10,
          fontFamily: "monospace",
        },
        itemCard: {
          marginBottom: uiTokens.spacing.lg,
          padding: uiTokens.spacing.md,
          borderWidth: 1,
          borderColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surfaceElevated,
        },
        itemCode: {
          fontSize: 13,
          color: uiTokens.colors.textSecondary,
          marginBottom: 2,
        },
        itemHeader: {
          flexDirection: "row",
          marginBottom: uiTokens.spacing.md,
        },
        itemImage: {
          width: "100%",
          height: "100%",
        },
        itemInfo: {
          flex: 1,
          justifyContent: "center",
        },
        itemName: {
          flex: 1,
          fontSize: 24,
          fontWeight: "800",
          color: uiTokens.colors.textPrimary,
          marginBottom: 2,
        },
        misplacedBadge: {
          backgroundColor: uiTokens.colors.error,
          flexDirection: "row",
          alignItems: "center",
          padding: uiTokens.spacing.md,
          marginBottom: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          gap: uiTokens.spacing.md,
        },
        misplacedContent: {
          flex: 1,
        },
        misplacedHighlight: {
          fontWeight: "700",
          textDecorationLine: "underline",
          color: uiTokens.colors.surfaceElevated,
        },
        misplacedText: {
          color: uiTokens.colors.surfaceElevated,
          fontSize: 12,
        },
        misplacedTitle: {
          color: uiTokens.colors.surfaceElevated,
          fontWeight: "800",
          fontSize: 13,
          marginBottom: 2,
        },
        sourceBadge: {
          paddingHorizontal: uiTokens.spacing.xs,
          paddingVertical: 2,
          borderRadius: uiTokens.radius.sm,
          borderWidth: 1,
        },
        sourceBadgeText: {
          fontSize: 11,
          fontWeight: "700",
        },
        staleWarning: {
          flexDirection: "row",
          backgroundColor: colorWithAlpha(
            uiTokens.colors.warning,
            uiTokens.mode === "dark" ? 0.2 : 0.1
          ),
          padding: uiTokens.spacing.md,
          borderRadius: uiTokens.radius.md,
          borderWidth: 1,
          borderColor: colorWithAlpha(uiTokens.colors.warning, 0.4),
          marginBottom: uiTokens.spacing.lg,
          alignItems: "center",
          gap: uiTokens.spacing.md,
        },
        staleWarningContent: {
          flex: 1,
        },
        staleWarningText: {
          fontSize: 12,
          color: uiTokens.colors.warning,
          lineHeight: 16,
        },
        staleWarningTitle: {
          fontSize: 13,
          fontWeight: "700",
          color: uiTokens.colors.warning,
          marginBottom: 2,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: uiTokens.spacing.sm,
        },
      }),
    [uiTokens]
  );

  return (
    <View>
      {item.is_misplaced ? (
        <View style={styles.misplacedBadge}>
          <Ionicons
            {...decorativeIconProps}
            name="alert-circle"
            size={24}
            color={uiTokens.colors.surfaceElevated}
          />
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
      ) : null}

      <ModernCard style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.iconContainer}>
            {showItemImages && item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
            ) : (
              <Ionicons
                {...decorativeIconProps}
                name="cube-outline"
                size={24}
                color={uiTokens.colors.accentStrong}
              />
            )}
          </View>

          <View style={styles.itemInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.item_name || item.name}
              </Text>

              {sourceBadge ? (
                <View
                  style={[
                    styles.sourceBadge,
                    {
                      backgroundColor: sourceBadge.backgroundColor,
                      borderColor: sourceBadge.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.sourceBadgeText, { color: sourceBadge.textColor }]}>
                    {sourceBadge.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.itemCode}>
              {item.category || "-"} • {item.subcategory || "-"}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailLabel}>Stock</Text>
              <TouchableOpacity
                {...getAccessibleButtonProps({
                  label: "Refresh stock from ERP",
                  disabled: isRefreshing,
                })}
                onPress={onRefreshStock}
                disabled={isRefreshing}
              >
                <Ionicons
                  {...decorativeIconProps}
                  name={isRefreshing ? "hourglass-outline" : "refresh"}
                  size={14}
                  color={uiTokens.colors.accent}
                  style={{ opacity: isRefreshing ? 0.5 : 1 }}
                />
              </TouchableOpacity>
            </View>
            <Text
              style={styles.detailValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatStockDisplay(showItemStock, stockQty, stockUom)}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>MRP</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {formatPriceDisplay(showItemPrices, item.mrp || 0)}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Price</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {formatPriceDisplay(showItemPrices, salePrice)}
            </Text>
          </View>
        </View>
      </ModernCard>

      {showDetails ? (
        <>
          {showBarcodeDetails ? (
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
          ) : null}

          {item.is_bundle && bundleComponents.length > 0 ? (
            <View style={styles.bundleSection}>
              <Text style={styles.bundleTitle}>Bundle Components</Text>
              {bundleComponents.map((component, index) => (
                <View
                  key={`${component.item_code || component.item_name || "bundle"}-${index}`}
                  style={styles.bundleItem}
                >
                  <Ionicons
                    {...decorativeIconProps}
                    name="cube-outline"
                    size={18}
                    color={uiTokens.colors.accentStrong}
                  />
                  <Text style={styles.bundleItemName}>
                    {component.item_name || component.item_code}
                  </Text>
                  <Text style={styles.bundleItemQty}>x{component.qty_per_bundle ?? 0}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {item._source === "cache" ? (
            <View style={styles.staleWarning}>
              <Ionicons
                {...decorativeIconProps}
                name="warning"
                size={18}
                color={uiTokens.colors.warning}
              />
              <View style={styles.staleWarningContent}>
                <Text style={styles.staleWarningTitle}>ERP Offline</Text>
                <Text style={styles.staleWarningText}>
                  Variance is based on a cached stock snapshot.
                </Text>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
