import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/unified";
import { AppTouchable } from "@/components/ui/AppTouchable";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps } from "@/utils/accessibility";

type Props = {
  children: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  onLeftAction?: () => void;
  onRightAction?: () => void;
};

const Action = ({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress?: (e?: any) => void;
}) => {
  const handlePress = (e?: any) => {
    void haptics.light();
    onPress?.(e);
  };

  return (
    <AppTouchable
      style={[styles.action, { backgroundColor: color }]}
      onPress={handlePress}
      {...getAccessibleButtonProps({ label })}
    >
      <Text style={styles.actionText}>{label}</Text>
    </AppTouchable>
  );
};

export const SwipeableRow: React.FC<Props> = ({
  children,
  leftLabel,
  rightLabel,
  onLeftAction,
  onRightAction,
}) => {
  const renderLeft = () => (
    <View style={[styles.actionsContainer, { justifyContent: "flex-start" }]}>
      {leftLabel ? (
        <Action label={leftLabel} color={uiColors.success[500]} onPress={onLeftAction} />
      ) : null}
    </View>
  );

  const renderRight = () => (
    <View style={[styles.actionsContainer, { justifyContent: "flex-end" }]}>
      {rightLabel ? (
        <Action label={rightLabel} color={uiColors.error[500]} onPress={onRightAction} />
      ) : null}
    </View>
  );

  return (
    <Swipeable
      renderLeftActions={onLeftAction && leftLabel ? renderLeft : undefined}
      renderRightActions={onRightAction && rightLabel ? renderRight : undefined}
      overshootLeft={false}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  actionsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  action: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  actionText: {
    color: uiSemanticColors.text.inverse,
    fontWeight: "700",
  },
});

