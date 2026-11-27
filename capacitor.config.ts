import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vercel.nouralqran.twa',
  appName: 'نور',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_nour',
      iconColor: '#0f6b4f',
      sound: 'azan_makkah.mp3',
    },
  },
};

export default config;
