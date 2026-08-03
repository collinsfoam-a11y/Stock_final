/**
 * FadeIn Animation Component
 * Inspired by native-springs WaveFade pattern
 * Provides smooth entrance animations for components
 */

import React, { useEffect, useRef } from "react";
import { Animated, ViewStyle, StyleProp, Platform } from "react-native";

// react-native-web has no native animated module; passing true logs a
// warning on every animation and falls back to JS anyway.
const USE_NATIVE_DRIVER = Platform.OS !== "web";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  delay = 0,
  duration = 400,
  style,
  direction = "up",
  distance = 20,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(
    new Animated.Value(direction === "up" ? distance : direction === "down" ? -distance : 0)
  ).current;
  const translateX = useRef(
    new Animated.Value(direction === "left" ? distance : direction === "right" ? -distance : 0)
  ).current;

  useEffect(() => {
    const animations = [
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ];

    if (direction === "up" || direction === "down") {
      animations.push(
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          delay,
          useNativeDriver: USE_NATIVE_DRIVER,
        })
      );
    }

    if (direction === "left" || direction === "right") {
      animations.push(
        Animated.timing(translateX, {
          toValue: 0,
          duration,
          delay,
          useNativeDriver: USE_NATIVE_DRIVER,
        })
      );
    }

    Animated.parallel(animations).start();
  }, [opacity, translateY, translateX, delay, duration, direction]);

  const getTransform = () => {
    const transforms: {
      translateY?: Animated.Value;
      translateX?: Animated.Value;
    }[] = [];

    if (direction === "up" || direction === "down") {
      transforms.push({ translateY });
    }
    if (direction === "left" || direction === "right") {
      transforms.push({ translateX });
    }

    return transforms.length > 0 ? transforms : undefined;
  };

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: getTransform() as any,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Staggered FadeIn for lists
 * Each child fades in with a delay based on index
 */
interface StaggeredFadeInProps {
  children: React.ReactNode[];
  staggerDelay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

export const StaggeredFadeIn: React.FC<StaggeredFadeInProps> = ({
  children,
  staggerDelay = 50,
  duration = 300,
  direction = "up",
}) => {
  return (
    <>
      {React.Children.map(children, (child, index) => (
        <FadeIn key={index} delay={index * staggerDelay} duration={duration} direction={direction}>
          {child}
        </FadeIn>
      ))}
    </>
  );
};


