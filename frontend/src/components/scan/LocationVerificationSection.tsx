import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppInput } from "@/components/ui/AppInput";
import { DEFAULT_FLOOR_OPTIONS } from "@/config/location";
import { useUiTokens } from "@/hooks/useUiTokens";

import { semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
export type LocationVerificationSectionProps = {
  floorNo?: string | null;
  rackNo?: string | null;
  onSelectFloor: (floor: string) => void;
  onChangeRack: (rack: string) => void;
  onClearRecentRacks?: () => void;
  username: string;
  dateTimeText?: string;
  floorOptions?: string[];
  recentRacks?: string[];
};

export const LocationVerificationSection: React.FC<LocationVerificationSectionProps> = ({
  floorNo,
  rackNo,
  onSelectFloor,
  onChangeRack,
  onClearRecentRacks,
  username,
  dateTimeText,
  floorOptions,
  recentRacks,
}) => {
  const tokens = useUiTokens();
  const nowText = dateTimeText || new Date().toLocaleString();
  const OPTIONS = floorOptions && floorOptions.length ? floorOptions : DEFAULT_FLOOR_OPTIONS;
  const typedRack = (rackNo || "").trim();
  const rackSuggestions = (recentRacks || [])
    .filter(
      (r) =>
        typedRack &&
        r.toLowerCase().includes(typedRack.toLowerCase()) &&
        r.toLowerCase() !== typedRack.toLowerCase()
    )
    .slice(0, 5);

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tokens.colors.accent,
          }}
        >
          <Ionicons name="location" size={14} color={uiSemanticColors.text.inverse} />
        </View>
        <Text
          style={{
            fontWeight: "600",
            fontSize: 16,
            color: tokens.colors.textPrimary,
          }}
        >
          Location & Verification
        </Text>
        <Text
          style={{
            marginLeft: 8,
            color: tokens.colors.textMuted,
            fontSize: 12,
          }}
        >
          Optional
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Floor chips */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: tokens.colors.textSecondary, marginBottom: 6 }}>Floor</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {OPTIONS.map((opt) => {
              const active = floorNo === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    minHeight: 44,
                    backgroundColor: active
                      ? tokens.colors.accent
                      : tokens.colors.surfaceElevated,
                  }}
                  onPress={() => onSelectFloor(opt)}
                  accessibilityLabel={`Select floor ${opt}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`chip-floor-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <Text
                    style={{
                      color: active ? uiSemanticColors.text.inverse : tokens.colors.textPrimary,
                      fontWeight: "600",
                    }}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Rack input */}
        <View style={{ flex: 1 }}>
          <AppInput
            label="Rack"
            value={rackNo || ""}
            onChangeText={(text) => onChangeRack(text)}
            placeholder="Enter rack"
            leftIcon="layers-outline"
            testID="input-rack"
          />

          {rackSuggestions.length > 0 && (
            <View
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                borderRadius: 10,
                backgroundColor: tokens.colors.surfaceElevated,
              }}
            >
              {rackSuggestions.map((sugg) => (
                <TouchableOpacity
                  key={`sugg-${sugg}`}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, minHeight: 44 }}
                  onPress={() => onChangeRack(sugg)}
                  accessibilityLabel={`Use suggestion ${sugg}`}
                  testID={`suggest-rack-${sugg.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <Text style={{ color: tokens.colors.textPrimary }}>{sugg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!!recentRacks && recentRacks.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: tokens.colors.textSecondary }}>Recent Racks</Text>
                {onClearRecentRacks && (
                  <TouchableOpacity
                    onPress={onClearRecentRacks}
                    accessibilityLabel="Clear recent racks"
                    testID="btn-clear-recent-racks"
                    style={{ minHeight: 44, paddingHorizontal: 8 }}
                  >
                    <Text
                      style={{
                        color: tokens.colors.accent,
                        fontWeight: "600",
                      }}
                    >
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {recentRacks.map((r) => (
                  <TouchableOpacity
                    key={`rack-${r}`}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      minHeight: 44,
                      backgroundColor: tokens.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: tokens.colors.border,
                    }}
                    onPress={() => onChangeRack(r)}
                    accessibilityLabel={`Use recent rack ${r}`}
                    testID={`chip-rack-${r.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <Text
                      style={{
                        color: tokens.colors.textPrimary,
                        fontWeight: "600",
                      }}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Verified by & Date/Time */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: tokens.colors.textSecondary, marginBottom: 6 }}>Verified By</Text>
          <View
            style={{
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              backgroundColor: tokens.colors.surfaceElevated,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="person" size={16} color={tokens.colors.textMuted} />
            <Text numberOfLines={1} style={{ color: tokens.colors.textPrimary }}>
              {username}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: tokens.colors.textSecondary, marginBottom: 6 }}>Date & Time</Text>
          <View
            style={{
              height: 44,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              backgroundColor: tokens.colors.surfaceElevated,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="time" size={16} color={tokens.colors.textMuted} />
            <Text numberOfLines={1} style={{ color: tokens.colors.textPrimary }}>
              {nowText}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};
