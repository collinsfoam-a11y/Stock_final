/**
 * Help Screen - App documentation and help
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ModernCard } from "@/components/ui/ModernCard";
import { ModernHeader } from "@/components/ui/ModernHeader";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { safeBackNavigation } from "@/utils/navigation";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface HelpSection {
  title: string;
  icon: string;
  items: HelpItem[];
}

interface HelpItem {
  question: string;
  answer: string;
  icon?: string;
}

const helpSections: HelpSection[] = [
  {
    title: "Getting Started",
    icon: "rocket",
    items: [
      {
        question: "How do I login?",
        answer:
          'Enter your username and password. If you enabled "Remember Me", your username will be saved for next time.',
        icon: "log-in",
      },
      {
        question: "What are the user roles?",
        answer:
          "Staff: Can scan items and create count sessions. Supervisor: Can approve counts, view reports, and configure settings.",
        icon: "people",
      },
      {
        question: "How do I scan a barcode?",
        answer:
          "Navigate to the Scan screen, tap the barcode scanner icon, and point your camera at the barcode. You can also manually enter the barcode.",
        icon: "barcode",
      },
    ],
  },
  {
    title: "Stock Counting",
    icon: "cube",
    items: [
      {
        question: "How do I create a counting session?",
        answer:
          'Go to Home screen, tap "New Session", select a warehouse, and start scanning items.',
        icon: "add-circle",
      },
      {
        question: "How do I enter quantity?",
        answer:
          'After scanning an item, tap the quantity field and enter the counted quantity. Tap "Save" to record.',
        icon: "calculator",
      },
      {
        question: "What if an item is not found?",
        answer:
          'Tap "Item Not Found" button and enter the item details manually. It will be reported for review.',
        icon: "alert-circle",
      },
      {
        question: "How do I refresh stock from ERP?",
        answer:
          'Tap the refresh icon next to "ERP Stock" on the scan screen to fetch the latest stock quantity.',
        icon: "refresh",
      },
    ],
  },
  {
    title: "Supervisor Features",
    icon: "shield-checkmark",
    items: [
      {
        question: "How do I approve count lines?",
        answer:
          'Go to Dashboard, select a session, review count lines, and tap "Approve" for each line.',
        icon: "checkmark-circle",
      },
      {
        question: "How do I configure database mapping?",
        answer:
          "Go to Settings > Database Mapping, enter connection details, select tables and columns, and save the mapping.",
        icon: "settings",
      },
      {
        question: "How do I view activity logs?",
        answer: "Go to Dashboard > Activity Logs to view all user activities and system events.",
        icon: "list",
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: "bug",
    items: [
      {
        question: "Cannot connect to server",
        answer:
          "Check your internet connection and ensure the backend server is running. Verify the backend URL in settings.",
        icon: "wifi",
      },
      {
        question: "Barcode not found",
        answer:
          "Check if the item exists in ERP. Verify database mapping configuration if you're a supervisor.",
        icon: "search",
      },
      {
        question: "Sync not working",
        answer:
          "Check ERP connection settings. Ensure SQL Server is accessible and credentials are correct.",
        icon: "sync",
      },
      {
        question: "App crashes or freezes",
        answer: "Close and restart the app. If problem persists, clear app cache or reinstall.",
        icon: "warning",
      },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set());

  const handleBack = React.useCallback(() => {
    safeBackNavigation(router, { fallbackHref: "/welcome" });
  }, [router]);

  const toggleItem = (sectionIndex: number, itemIndex: number) => {
    const key = `${sectionIndex}-${itemIndex}`;
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      <ModernHeader
        title="Help"
        subtitle="Quick answers and support"
        showBackButton
        onBackPress={handleBack}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {helpSections.map((section, sectionIndex) => (
          <ModernCard
            key={section.title}
            padding={0}
            style={[styles.section, { backgroundColor: uiTokens.colors.surfaceElevated }]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIcon,
                  {
                    backgroundColor: colorWithAlpha(
                      uiTokens.colors.accent,
                      uiTokens.mode === "dark" ? 0.18 : 0.1
                    ),
                  },
                ]}
              >
                <Ionicons name={section.icon as any} size={22} color={uiTokens.colors.accent} />
              </View>
              <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
                {section.title}
              </Text>
            </View>

            {section.items.map((item, itemIndex) => {
              const key = `${sectionIndex}-${itemIndex}`;
              const isExpanded = expandedItems.has(key);

              return (
                <View key={itemIndex} style={styles.itemContainer}>
                  <AppTouchable
                    style={[
                      styles.questionContainer,
                      isExpanded && {
                        backgroundColor: colorWithAlpha(
                          uiTokens.colors.accent,
                          uiTokens.mode === "dark" ? 0.12 : 0.06
                        ),
                      },
                    ]}
                    onPress={() => toggleItem(sectionIndex, itemIndex)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}>
                    <View style={styles.questionContent}>
                      {item.icon && (
                        <Ionicons
                          name={item.icon as any}
                          size={20}
                          color={uiTokens.colors.textSecondary}
                          style={styles.itemIcon}
                        />
                      )}
                      <Text style={[styles.question, { color: uiTokens.colors.textPrimary }]}>
                        {item.question}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={uiTokens.colors.textSecondary}
                    />
                  </AppTouchable>
                  {isExpanded && (
                    <View
                      style={[
                        styles.answerContainer,
                        {
                          backgroundColor: colorWithAlpha(
                            uiTokens.colors.accent,
                            uiTokens.mode === "dark" ? 0.08 : 0.04
                          ),
                        },
                      ]}
                    >
                      <Text style={[styles.answer, { color: uiTokens.colors.textSecondary }]}>
                        {item.answer}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ModernCard>
        ))}

        {/* Contact Support */}
        <ModernCard
          padding={24}
          style={[styles.contactSection, { backgroundColor: uiTokens.colors.surfaceElevated }]}
        >
          <View
            style={[
              styles.contactIcon,
              {
                backgroundColor: colorWithAlpha(
                  uiTokens.colors.info,
                  uiTokens.mode === "dark" ? 0.18 : 0.1
                ),
              },
            ]}
          >
            <Ionicons name="mail" size={24} color={uiTokens.colors.info} />
          </View>
          <Text style={[styles.contactTitle, { color: uiTokens.colors.textPrimary }]}>
            Need More Help?
          </Text>
          <Text style={[styles.contactText, { color: uiTokens.colors.textSecondary }]}>
            Contact your system administrator or IT support team for additional assistance.
          </Text>
        </ModernCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  section: {
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 12,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  itemContainer: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  questionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  questionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemIcon: {
    marginRight: 4,
  },
  question: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  answerContainer: {
    padding: 14,
    borderRadius: 8,
    marginTop: 6,
  },
  answer: {
    fontSize: 14,
    lineHeight: 21,
  },
  contactSection: {
    alignItems: "center",
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contactTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
