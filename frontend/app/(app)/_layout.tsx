import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";
import { useThemeMode } from "@/src/theme-context";

export default function AppLayout() {
  const { user, loading, isAdmin } = useAuth();
  const { theme } = useThemeMode();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.morning} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Tabs
        screenOptions={{
          sceneStyle: { backgroundColor: "transparent" },
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.primary,
            borderTopWidth: 2,
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
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
