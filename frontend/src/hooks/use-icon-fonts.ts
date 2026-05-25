// Icon font loader — bundles icon TTFs locally so the app works
// without internet (CDN). Required because Metro's vector-icons asset
// resolver returns 0-byte files on Android Expo Go — we work around by
// require()ing the .ttf from our own /assets/fonts folder.
//
// Usage: const [loaded, error] = useIconFonts();

import { useFonts } from "expo-font";

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    Ionicons: require("../../assets/fonts/Ionicons.ttf"),
    MaterialIcons: require("../../assets/fonts/MaterialIcons.ttf"),
    MaterialCommunityIcons: require("../../assets/fonts/MaterialCommunityIcons.ttf"),
    FontAwesome: require("../../assets/fonts/FontAwesome.ttf"),
  });
