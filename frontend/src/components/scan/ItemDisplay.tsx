/**
 * ItemDisplay Component
 * Displays item information, stock quantity, MRP, and verification status
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Item } from "@/types/scan";
import Animated, { FadeInUp, Layout } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { flags } from "@/constants/flags";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, getTokenShadowStyle } from "@/theme/themeTokens";

interface ItemDisplayProps {
  item: Item;
  refreshingStock?: boolean;
  onRefreshStock?: () => void;
}

export const ItemDisplay: React.FC<ItemDisplayProps> = React.memo(
  ({ item, refreshingStock = false, onRefreshStock }) => {
    const uiTokens = useUiTokens();

    const Container = flags.enableAnimations ? Animated.View : View;
    const animatedProps = flags.enableAnimations
      ? {
          entering: FadeInUp.delay(100).springify().damping(12),
          layout: Layout.springify().damping(12),
        }
      : {};

    const styles = useMemo(
      () =>
        StyleSheet.create({
          contentContainer: {
            padding: uiTokens.spacing.lg,
          },
          itemBarcode: {
            fontSize: 13,
            color: uiTokens.colors.textSecondary,
            marginBottom: uiTokens.spacing.sm,
            fontFamily: "monospace",
          },
          itemCard: {
            borderRadius: uiTokens.radius.lg,
            marginBottom: uiTokens.spacing.md,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colorWithAlpha(uiTokens.colors.border, 0.8),
            backgroundColor: uiTokens.colors.surface,
          },
          itemCode: {
            fontSize: 13,
            color: uiTokens.colors.textSecondary,
            marginBottom: 4,
          },
          itemInfoGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: uiTokens.spacing.sm,
            marginBottom: uiTokens.spacing.md,
          },
          itemInfoItem: {
            backgroundColor: colorWithAlpha(
              uiTokens.colors.surfaceElevated,
              uiTokens.mode === "dark" ? 0.85 : 1
            ),
            borderRadius: uiTokens.radius.sm,
            padding: uiTokens.spacing.sm,
            flex: 1,
            minWidth: "45%",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: uiTokens.colors.border,
          },
          itemInfoText: {
            color: uiTokens.colors.textPrimary,
            fontSize: 13,
            flex: 1,
          },
          itemName: {
            fontSize: 22,
            fontWeight: "800",
            color: uiTokens.colors.textPrimary,
            marginBottom: 8,
          },
          locationRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: uiTokens.spacing.sm,
          },
          locationText: {
            color: uiTokens.colors.textSecondary,
            fontSize: 13,
          },
          qtyBox: {
            flex: 1,
            backgroundColor: colorWithAlpha(
              uiTokens.colors.surfaceElevated,
              uiTokens.mode === "dark" ? 0.9 : 1
            ),
            borderRadius: uiTokens.radius.md,
            padding: uiTokens.spacing.md,
            borderWidth: 1,
            borderColor: uiTokens.colors.border,
          },
          qtyHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          },
          qtyLabel: {
            fontSize: 12,
            color: uiTokens.colors.textSecondary,
            fontWeight: "600",
          },
          qtyValue: {
            fontSize: 24,
            fontWeight: "800",
            color: uiTokens.colors.textPrimary,
          },
          qtyValueSmall: {
            fontSize: 18,
            fontWeight: "800",
            color: uiTokens.colors.textPrimary,
          },
          refreshButton: {
            padding: 4,
          },
          refreshButtonDisabled: {
            opacity: 0.5,
          },
          shadow: getTokenShadowStyle(uiTokens, "md"),
          uomText: {
            fontSize: 12,
            color: uiTokens.colors.textSecondary,
            marginTop: 4,
          },
          verificationBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: colorWithAlpha(
              uiTokens.colors.success,
              uiTokens.mode === "dark" ? 0.24 : 0.1
            ),
            borderRadius: uiTokens.radius.sm,
            padding: uiTokens.spacing.sm,
            marginBottom: uiTokens.spacing.md,
            borderWidth: 1,
            borderColor: colorWithAlpha(uiTokens.colors.success, 0.38),
          },
          verificationText: {
            color: uiTokens.colors.textPrimary,
            fontSize: 13,
            flex: 1,
          },
          verificationTime: {
            color: uiTokens.colors.textSecondary,
            fontSize: 12,
          },
        }),
      [uiTokens]
    );

    return (
      <Container style={[styles.itemCard, styles.shadow]} {...animatedProps}>
        <LinearGradient
          colors={[
            colorWithAlpha(uiTokens.colors.surfaceElevated, uiTokens.mode === "dark" ? 0.8 : 1),
            colorWithAlpha(uiTokens.colors.surface, uiTokens.mode === "dark" ? 0.95 : 1),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.contentContainer}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.item_code && <Text style={styles.itemCode}>Code: {item.item_code}</Text>}
          {item.barcode && <Text style={styles.itemBarcode}>Barcode: {item.barcode}</Text>}

          <View style={styles.itemInfoGrid}>
            {item.category && (
              <View style={styles.itemInfoItem}>
                <Ionicons name="pricetag" size={14} color={uiTokens.colors.textSecondary} />
                <Text style={styles.itemInfoText}>
                  {item.category}
                  {item.subcategory && ` • ${item.subcategory}`}
                </Text>
              </View>
            )}
            {item.item_type && (
              <View style={styles.itemInfoItem}>
                <Ionicons name="layers" size={14} color={uiTokens.colors.textSecondary} />
                <Text style={styles.itemInfoText}>Type: {item.item_type}</Text>
              </View>
            )}
            {item.item_group && (
              <View style={styles.itemInfoItem}>
                <Ionicons name="albums" size={14} color={uiTokens.colors.textSecondary} />
                <Text style={styles.itemInfoText}>Group: {item.item_group}</Text>
              </View>
            )}
          </View>

          {(item.location || (item as any).floor || (item as any).rack) && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={uiTokens.colors.accent} />
              <Text style={styles.locationText}>
                {[(item as any).floor, (item as any).rack, item.location]
                  .filter(Boolean)
                  .join(" / ")}
              </Text>
            </View>
          )}

          {(item as any).verified && (
            <View style={styles.verificationBadge}>
              <Ionicons name="checkmark-circle" size={16} color={uiTokens.colors.success} />
              <Text style={styles.verificationText}>
                Verified by {(item as any).verified_by || "Unknown"}
                {(item as any).verified_at && (
                  <Text style={styles.verificationTime}>
                    {" "}
                    • {new Date((item as any).verified_at).toLocaleString()}
                  </Text>
                )}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={[styles.qtyBox, { height: "100%", justifyContent: "center" }]}>
                <View style={styles.qtyHeader}>
                  <Text style={styles.qtyLabel}>ERP Stock</Text>
                  {onRefreshStock && (
                    <TouchableOpacity
                      style={[
                        styles.refreshButton,
                        refreshingStock && styles.refreshButtonDisabled,
                      ]}
                      onPress={onRefreshStock}
                      disabled={refreshingStock}
                    >
                      {refreshingStock ? (
                        <ActivityIndicator size="small" color={uiTokens.colors.accent} />
                      ) : (
                        <Ionicons name="refresh" size={18} color={uiTokens.colors.accent} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ alignItems: "center", gap: 0 }}>
                  <Text style={[styles.qtyValue, { fontSize: 32 }]}>
                    {item.stock_qty ?? item.quantity ?? 0}
                  </Text>
                  {item.uom_name && (
                    <Text style={[styles.uomText, { marginTop: 0 }]}>{item.uom_name}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={{ flex: 1, gap: 12 }}>
              <View style={styles.qtyBox}>
                <Text style={styles.qtyLabel}>Sales Price</Text>
                <Text style={styles.qtyValueSmall}>
                  ₹{item.sale_price ?? item.sales_price ?? "0.00"}
                </Text>
              </View>

              <View style={styles.qtyBox}>
                <Text style={styles.qtyLabel}>MRP</Text>
                <Text style={styles.qtyValueSmall}>₹{item.mrp ?? "0.00"}</Text>
              </View>
            </View>
          </View>
        </View>
      </Container>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.stock_qty === nextProps.item.stock_qty &&
      prevProps.item.mrp === nextProps.item.mrp &&
      prevProps.item.sale_price === nextProps.item.sale_price &&
      prevProps.item.sales_price === nextProps.item.sales_price &&
      prevProps.refreshingStock === nextProps.refreshingStock
    );
  }
);

ItemDisplay.displayName = "ItemDisplay";
