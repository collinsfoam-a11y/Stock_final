import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Animated } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useThemeContext } from "../../context/ThemeContext";
import { useHapticFeedback } from "../../hooks/useHapticFeedback";
import { RecentItemsService } from "../../services/enhancedFeatures";

import { useCallback } from "react";
import { AnimatedPressable } from "@/components/ui";
import { shadows as uiShadows } from "@/theme/legacyCompat";
interface RecentScansProps {
  sessionId: string;
  onRefresh?: () => void;
}


interface RecentItemCardProps {
  item: any;
  index: number;
  colors: any;
  onPress: (item: any) => void;
  onLongPress: (item: any) => void;
}

const RecentItemCard = React.memo(function RecentItemCard({
  item,
  index,
  colors,
  onPress,
  onLongPress,
}: RecentItemCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Animation for item appearance
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300 + index * 50,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacityAnim, scaleAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      tension: 100,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
      <AnimatedPressable
        style={[
          styles.itemContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            ...uiShadows.md,
            elevation: 3,
            minHeight: 44,
            minWidth: 44,
          },
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={`Item ${item.item_name || item.item_code}`}
        accessibilityRole="button"
        accessibilityHint="Tap to view item details"
        accessibilityState={{ disabled: false }}
        disabled={false}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${colors.accent}20` }]}>
          <Ionicons name="cube-outline" size={24} color={colors.accent} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
            {item.item_name || "Unknown Item"}
          </Text>
          <Text style={[styles.itemCode, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.item_code}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: "0deg" }] }}>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Animated.View>
      </AnimatedPressable>
    </Animated.View>
  );
});

export const RecentScans: React.FC<RecentScansProps> = ({ sessionId, onRefresh }) => {
  const { themeLegacy: theme } = useThemeContext();
  const { colors } = theme;
  const router = useRouter();
  const { triggerHaptic } = useHapticFeedback();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const recent = await RecentItemsService.getRecent();
      setItems(recent);
    } catch (error) {
      console.error("Failed to load recent items", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [onRefresh]);

  const handlePress = useCallback((item: any) => {
    void triggerHaptic("impactLight");
    // Use barcode for navigation (what was originally scanned), fallback to item_code
    const navigationBarcode = item.barcode || item.item_code;
    router.push({
      pathname: "/staff/item-detail",
      params: { barcode: navigationBarcode, sessionId },
    } as any);
  }, [triggerHaptic, router, sessionId]);

  const handleLongPress = useCallback((_item: any) => {
    void triggerHaptic("impactMedium");
    // Could show item details or quick actions
  }, [triggerHaptic]);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <RecentItemCard item={item} index={index} colors={colors} onPress={handlePress} onLongPress={handleLongPress} />
  ), [colors, handlePress, handleLongPress]);

  if (items.length === 0 && !isLoading) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={[styles.title, { color: colors.text }]}>Recent Scans</Text>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
          </View>
        )}
      </View>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.item_code}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={220}
        decelerationRate="fast"
        pagingEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 12,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
    width: 220,
    backgroundColor: "transparent",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  itemCode: {
    fontSize: 12,
    fontWeight: "500",
  },
});
