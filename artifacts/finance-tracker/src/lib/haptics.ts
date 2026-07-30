import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const isCapacitor = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const vibrateWeb = (ms: number) => {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
};

export const haptic = {
  light: async () => {
    if (isCapacitor()) await Haptics.impact({ style: ImpactStyle.Light });
    else vibrateWeb(10);
  },
  medium: async () => {
    if (isCapacitor()) await Haptics.impact({ style: ImpactStyle.Medium });
    else vibrateWeb(20);
  },
  heavy: async () => {
    if (isCapacitor()) await Haptics.impact({ style: ImpactStyle.Heavy });
    else vibrateWeb(40);
  },
  success: async () => {
    if (isCapacitor()) await Haptics.notification({ type: NotificationType.Success });
    else vibrateWeb(15);
  },
  error: async () => {
    if (isCapacitor()) await Haptics.notification({ type: NotificationType.Error });
    else { vibrateWeb(50); setTimeout(() => vibrateWeb(50), 100); }
  },
  warning: async () => {
    if (isCapacitor()) await Haptics.notification({ type: NotificationType.Warning });
    else vibrateWeb(30);
  },
  selection: async () => {
    if (isCapacitor()) await Haptics.selectionStart();
    else vibrateWeb(8);
  },
};
