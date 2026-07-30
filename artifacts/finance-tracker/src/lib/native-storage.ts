import { Preferences } from "@capacitor/preferences";

const isNative = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch { return false; }
};

export const nativeStorage = {
  get: async (key: string): Promise<string | null> => {
    if (isNative()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },
  set: async (key: string, value: string): Promise<void> => {
    if (isNative()) {
      await Preferences.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },
  remove: async (key: string): Promise<void> => {
    if (isNative()) {
      await Preferences.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  },
  clear: async (): Promise<void> => {
    if (isNative()) {
      await Preferences.clear();
    } else {
      localStorage.clear();
    }
  },
};
