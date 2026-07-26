/**
 * UI Components Index
 * Export all UI components from a single location
 */

export { AppIcon, IONICON_TO_SF_SYMBOL } from "./AppIcon";
export type { AppIconProps, IoniconName } from "./AppIcon";
export { Modal } from "./Modal";
export * from "./Skeleton";
export { SyncIndicator } from "./SyncIndicator";
export type { SyncIndicatorProps } from "./SyncIndicator";
export { EmptyState } from "./EmptyState";
export { LoadingSpinner } from "./LoadingSpinner";
// Canonical operational primitives. Use these directly for all new UI.
export { ModernCard } from "./ModernCard";
export { ModernButton } from "./ModernButton";
export { ModernInput } from "./ModernInput";
export { ModernHeader } from "./ModernHeader";

// Premium UI Components
export { PremiumHeader } from "./PremiumHeader";
export { ScreenHeader } from "./ScreenHeader";
export type { ScreenHeaderProps } from "./ScreenHeader";
export { StatusBadge } from "./StatusBadge";
export { SessionCard } from "./SessionCard";
export { QuickStatCard } from "./QuickStatCard";
export { FloatingActionButton } from "./FloatingActionButton";
export { default as OnlineStatus } from "./OnlineStatus";

// Animation Components
export { AnimatedPressable, AnimatedCard } from "./AnimatedPressable";
export { FadeIn, StaggeredFadeIn } from "./FadeIn";
export { AnimatedInput } from "./AnimatedInput";
export { SuccessFeedback, ToastFeedback } from "./SuccessFeedback";
export { SkeletonList, SkeletonGrid, SkeletonScreen } from "./SkeletonList";

// Aurora Design System Components (v2.0)
export { FloatingScanButton } from "./FloatingScanButton";

// Enhanced UI/UX Components (v2.1)
export { AnimatedCounter } from "./AnimatedCounter";
export { Shimmer, ShimmerPlaceholder } from "./Shimmer";
export * from "./SyncStatusPill";

// Phase 4: Supervisor Dashboard Components
export { StatsCard } from "./StatsCard";
export { LiveIndicator } from "./LiveIndicator";

// ==========================================
// Unified Design System Components (v3.0)
// ==========================================
export {
  AnimatedCard as UnifiedAnimatedCard,
  StatsCardPreset,
  type AnimatedCardProps,
  type CardVariant,
} from "./AnimatedCard";
export { ActivityFeedItem } from "./ActivityFeedItem";
export type { ActivityType } from "./ActivityFeedItem";
export { ProgressRing } from "./ProgressRing";

// Phase 2: New Design System Components
export { Badge } from "./Badge";
export { Chip } from "./Chip";
export { Avatar } from "./Avatar";
export { ProgressBar } from "./ProgressBar";
export { Switch } from "./Switch";
export { Tabs } from "./Tabs";
export { Accordion } from "./Accordion";
export { Radio } from "./Radio";
export { Checkbox } from "./Checkbox";

// Theme & Appearance Components
export { ThemePicker } from "./ThemePicker";
export { AppearanceSettings } from "./AppearanceSettings";
export { ThemedScreen, ThemedCard, ThemedText } from "./ThemedScreen";

// Unified Screen Layout
export { ScreenContainer } from "./ScreenContainer";
export type { ScreenContainerProps } from "./ScreenContainer";

// Missing UI Components (Complete implementations found)
export { AdminResponsiveGrid } from "./AdminResponsiveGrid";
export { InlineAlert } from "./InlineAlert";
export type { InlineAlertType } from "./InlineAlert";
export { MultiSelectList } from "./MultiSelectList";
export type { SelectableItem, MultiSelectListProps } from "./MultiSelectList";
export { SwipeCard } from "./SwipeCard";
export type { SwipeAction, SwipeCardProps } from "./SwipeCard";
export { SpeedDialMenu } from "./SpeedDialMenu";
export type { SpeedDialAction, SpeedDialMenuProps } from "./SpeedDialMenu";
export { ConfirmModal } from "./ConfirmModal";
export type { ConfirmModalVariant, ConfirmModalProps } from "./ConfirmModal";
export { QuantityStepper } from "./QuantityStepper";
export { StickyFooter } from "./StickyFooter";
export { Separator, SeparatorPresets } from "./Separator";
export type { SeparatorProps, SeparatorOrientation } from "./Separator";
export { AnimatedListItem, ListAnimationPresets } from "./AnimatedListItem";
export type { AnimatedListItemProps } from "./AnimatedListItem";

// Unified Design System Components (v3.0 - Token-based)
export { UnifiedText } from "./UnifiedText";
export type {
  UnifiedTextProps,
  TextVariant as UnifiedTextVariant,
  TextColor as UnifiedTextColor,
} from "./UnifiedText";
export { UnifiedView } from "./UnifiedView";
export type { UnifiedViewProps, BackgroundColor as UnifiedBackgroundColor } from "./UnifiedView";
