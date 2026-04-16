import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

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
  onPress?: () => void;
}) => (
  <TouchableOpacity
    style={[styles.action, { backgroundColor: color }]}
    onPress={onPress}
  >
    <Text style={styles.actionText}>{label}</Text>
  </TouchableOpacity>
);

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
        <Action label={leftLabel} color="#4CAF50" onPress={onLeftAction} />
      ) : null}
    </View>
  );

  const renderRight = () => (
    <View style={[styles.actionsContainer, { justifyContent: "flex-end" }]}>
      {rightLabel ? (
        <Action label={rightLabel} color="#FF5252" onPress={onRightAction} />
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
    color: "#fff",
    fontWeight: "700",
  },
});

export default SwipeableRow;
