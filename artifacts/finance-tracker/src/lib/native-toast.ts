import { Toast } from "@capacitor/toast";
import { toast as sonnerToast } from "sonner";

const isNative = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch { return false; }
};

export const nativeToast = {
  success: async (message: string) => {
    if (isNative()) {
      await Toast.show({ text: message, duration: "short", position: "bottom" });
    } else {
      sonnerToast.success(message);
    }
  },
  error: async (message: string) => {
    if (isNative()) {
      await Toast.show({ text: message, duration: "long", position: "bottom" });
    } else {
      sonnerToast.error(message);
    }
  },
  info: async (message: string) => {
    if (isNative()) {
      await Toast.show({ text: message, duration: "short", position: "bottom" });
    } else {
      sonnerToast(message);
    }
  },
};
