import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container} testID="splash-loading">
        <ActivityIndicator color={colors.morning} size="large" />
      </View>
    );
  }

  return user ? <Redirect href="/(app)/dashboard" /> : <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
