import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/src/auth";
import { appTheme, colors } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

export default function AppLayout() {
  const { user, loading, isAdmin } = useAuth();
  const { theme, isClassic } = useThemeMode();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.morning} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  const bgColors: readonly [string, string, ...string[]] = isClassic 
    ? ["#050510", "#1E125B", "#09052D"] 
    : ["#F8F7FF", "#E8E3FF", "#DDEBFF", "#D4F8E6"];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={bgColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Tabs
        screenOptions={{
          sceneStyle: { backgroundColor: "transparent" },
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: isClassic ? "rgba(0, 0, 0, 0.65)" : "rgba(255, 255, 255, 0.65)",
            borderTopColor: theme.border,
            borderTopWidth: 1,
            height: 72,
            paddingBottom: 10,
            paddingTop: 8,
            elevation: 0,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "HOME",
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: "SCHEDULE",
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            title: "ATTEND",
            tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="leaves"
          options={{
            title: "LEAVES",
            tabBarIcon: ({ color, size }) => <Ionicons name="airplane" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: "ADMIN",
            tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" size={size} color={color} />,
            href: isAdmin ? "/(app)/admin" : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "ME",
            tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          }}
        />
        <Tabs.Screen name="schedule-edit" options={{ href: null }} />
        <Tabs.Screen name="reports" options={{ href: null }} />
        <Tabs.Screen name="command-center" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.bg },
});
