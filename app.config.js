export default ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const BLE_ENABLED = profile === 'development' || profile === 'production';

  return {
    ...config,
    expo: {
      ...config.expo,
      name: "Veiss",
      slug: "veiss-app",
      owner: "veiss-expo",  
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png", // updated icon
      userInterfaceStyle: "light",
      newArchEnabled: true,
      splash: {
        image: "./assets/icon.png", // use V icon for splash
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        supportsTablet: true,
        infoPlist: {
          NSBluetoothAlwaysUsageDescription: "This app uses Bluetooth to connect to your fitness device.",
          NSBluetoothPeripheralUsageDescription: "This app requires Bluetooth to connect to gym equipment.",
          ITSAppUsesNonExemptEncryption: false
        },
        bundleIdentifier: "com.veissexpo.veiss"
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/icon.png", // updated adaptive icon
          backgroundColor: "#ffffff"
        },
        edgeToEdgeEnabled: true,
        package: "com.veissexpo.veiss",
        permissions: BLE_ENABLED ? [
          "BLUETOOTH",
          "BLUETOOTH_ADMIN",
          "BLUETOOTH_CONNECT",
          "BLUETOOTH_SCAN",
          "ACCESS_FINE_LOCATION",
          "android.permission.BLUETOOTH",
          "android.permission.BLUETOOTH_ADMIN",
          "android.permission.BLUETOOTH_CONNECT"
        ] : []
      },
      web: {
        favicon: "./assets/icon.png" // optional: also use new icon as favicon
      },
      plugins: BLE_ENABLED ? [
        ["react-native-ble-plx", { isBackgroundEnabled: true }]
      ] : [],
      extra: {
        eas: {
          projectId: "a8aee588-edbc-4ec3-8d31-619cf57247f9"
        },
        BLE_ENABLED
      }
    }
  };
};
