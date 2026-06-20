import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { appTheme } from "@/src/theme";

type Props = {
  title: string;
  onSeeAll?: () => void;
  data: any[];
  renderItem: (item: any, index: number) => React.ReactElement;
  keyExtractor?: (item: any, index: number) => string;
  emptyText?: string;
};

export function SectionRow({ title, onSeeAll, data, renderItem, keyExtractor, emptyText }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={styles.seeAll}>See All ›</Text>
          </TouchableOpacity>
        )}
      </View>
      {data.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{emptyText || "Nothing here"}</Text>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={data}
          keyExtractor={keyExtractor || ((_, i) => String(i))}
          renderItem={({ item, index }) => renderItem(item, index)}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 28 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    color: appTheme.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  seeAll: {
    color: appTheme.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  list: {
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyWrap: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyText: {
    color: appTheme.muted,
    fontSize: 13,
    fontStyle: "italic",
  },
});
