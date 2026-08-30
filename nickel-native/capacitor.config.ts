import type { CapacitorConfig } from '@capacitor/cli'

// Nickel native shell. The app loads the live, server-rendered site at
// nickelcare.com, so every web deploy updates the app instantly — the native
// binary only needs re-submission when native config (below) changes.
const config: CapacitorConfig = {
  appId: 'com.sapphireclinicseast.nickel',
  appName: 'Nickel',
  webDir: 'www', // local fallback bundle (used only if the remote URL is unreachable)
  server: {
    url: 'https://nickelcare.com',
    hostname: 'nickelcare.com',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
    // Keep in-app navigation inside the shell for our own domain; external
    // links (PayMongo checkout, etc.) open in the system browser (see www/).
    allowNavigation: ['nickelcare.com', '*.nickelcare.com'],
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#34618c',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#34618c',
    },
  },
}

export default config
