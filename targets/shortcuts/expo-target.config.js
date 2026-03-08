/** @type {import('@bacons/apple-targets/build/config').ConfigFunction} */
module.exports = (config) => ({
  type: "app-intent",
  deploymentTarget: "16.0",
  frameworks: ["AppIntents"],
  icon: "../../assets/icon.png",
  entitlements: {
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
