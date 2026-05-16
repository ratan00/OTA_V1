import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trading.terminal',
  appName: 'Trading Terminal',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
