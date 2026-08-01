/**
 * ScanAcknowledgeOverlay — instant scan-result flash (P2 / OXS §6.1, §5.1).
 *
 * Renders a full-bleed, non-blocking color flash + icon the instant a scan is
 * recognised (success / duplicate / error). This is the VISUAL layer that must
 * appear within 100ms of scan recognition; haptics/audio are handled separately
 * and must never block it.
 *
 * Motion discipline (§8.1): only opacity/transform are animated. When the user
 * has reduced-motion enabled the badge appears instantly with no animation.
 *
 * The component is controlled: the caller owns the `state` (via
 * {@link useScanAcknowledge}) and this overlay only renders it.
 */

import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withDelay,
    Easing,
} from "react-native-reanimated";

import { useUiTokens } from "../../hooks/useUiTokens";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { colorWithAlpha, type ThemeTokens } from "../../theme/themeTokens";
import type { ScanAcknowledgeState } from "./useScanAcknowledge";

export interface ScanAcknowledgeOverlayProps {
    state: ScanAcknowledgeState;
    message?: string;
}

interface AckVisual {
    colorKey: "success" | "warning" | "error";
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
}

const ACK_VISUALS: Record<Exclude<ScanAcknowledgeState, "idle">, AckVisual> = {
    success: { colorKey: "success", icon: "checkmark-circle", label: "Saved" },
    duplicate: { colorKey: "warning", icon: "duplicate", label: "Already counted" },
    error: { colorKey: "error", icon: "close-circle", label: "Not found" },
};

export const ScanAcknowledgeOverlay: React.FC<ScanAcknowledgeOverlayProps> = ({
    state,
    message,
}) => {
    const t = useUiTokens();
    const reducedMotion = useReducedMotion();
    const styles = makeStyles(t);

    const opacity = useSharedValue(0);
    const scale = useSharedValue(reducedMotion ? 1 : 0.85);

    // Drive the entrance animation whenever the state leaves idle.
    useEffect(() => {
        if (state === "idle") {
            opacity.value = 0;
            return;
        }
        if (reducedMotion || t.motion.enabled === false) {
            opacity.value = 1;
            scale.value = 1;
            return;
        }
        // Fast entrance (<100ms feel), brief hold, then quick fade — the hook
        // clears `state` back to idle which resets opacity to 0.
        scale.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) });
        opacity.value = withSequence(
            withTiming(1, { duration: 80 }),
            withDelay(420, withTiming(0, { duration: 220 })),
        );
    }, [state, reducedMotion, opacity, scale, t.motion.enabled]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    if (state === "idle") {
        return null;
    }

    const visual = ACK_VISUALS[state];
    const color = t.colors[visual.colorKey];

    return (
        <View style={styles.host} pointerEvents="none">
            <Animated.View
                style={[
                    styles.badge,
                    {
                        backgroundColor: colorWithAlpha(color, 0.16),
                        borderColor: colorWithAlpha(color, 0.4),
                    },
                    animatedStyle,
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                accessibilityLabel={message?.trim() || visual.label}
            >
                <Ionicons name={visual.icon} size={40} color={color} />
            </Animated.View>
        </View>
    );
};

const makeStyles = (t: ThemeTokens) =>
    StyleSheet.create({
        host: {
            ...StyleSheet.absoluteFillObject,
            alignItems: "center",
            justifyContent: "center",
        },
        badge: {
            width: 96,
            height: 96,
            borderRadius: t.radius.xl,
            borderWidth: 1.5,
            alignItems: "center",
            justifyContent: "center",
        },
    });
