import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

const config = ({ config }: ConfigContext): ExpoConfig => ({
  name: IS_DEV ? "Actual (Dev)" : "Actual",
  slug: "actual-expo",
  scheme: IS_DEV ? "actualbudget-dev" : "actualbudget",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#8719E0",
  },
  platforms: ["ios"],
  ios: {
    supportsTablet: false,
    appleTeamId: "8668UQNRKV",
    bundleIdentifier: IS_DEV
      ? "com.cubancodepath.actual.dev"
      : "com.cubancodepath.actual",
    entitlements: {
      "com.apple.security.application-groups": [
        IS_DEV
          ? "group.com.cubancodepath.actual.dev"
          : "group.com.cubancodepath.actual",
      ],
    },
    infoPlist: {
      NSLocalNetworkUsageDescription:
        "Actual Budget needs access to your local network to connect to your self-hosted budget server.",
    },
  },
  plugins: [
    "expo-sqlite",
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    "expo-quick-actions",
    "expo-notifications",
    "expo-localization",
    "@bacons/apple-targets",
    [
      "@sentry/react-native/expo",
      {
        organization: "cubancodepath",
        project: "actual",
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: "a8e63a50-f2fa-488a-86e7-b7f5332032ae",
    },
  },
});

export default config;
