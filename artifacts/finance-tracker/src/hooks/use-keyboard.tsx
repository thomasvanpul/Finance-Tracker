import { useEffect, useState } from "react";
import { Keyboard } from "@capacitor/keyboard";

const isNative = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch { return false; }
};

export function useKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isNative()) {
      const updateHeight = () => {
        const vv = window.visualViewport;
        if (vv) {
          const diff = window.innerHeight - vv.height - (window.innerHeight - document.documentElement.clientHeight);
          const kh = Math.max(0, diff);
          setKeyboardHeight(kh > 50 ? kh : 0);
          setIsVisible(kh > 50);
        }
      };
      window.visualViewport?.addEventListener("resize", updateHeight);
      return () => window.visualViewport?.removeEventListener("resize", updateHeight);
    }

    let showHandle: { remove: () => Promise<void> } | null = null;
    let hideHandle: { remove: () => Promise<void> } | null = null;

    Keyboard.addListener("keyboardWillShow", (info) => {
      setKeyboardHeight(info.keyboardHeight);
      setIsVisible(true);
    }).then(h => { showHandle = h; });

    Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardHeight(0);
      setIsVisible(false);
    }).then(h => { hideHandle = h; });

    return () => {
      showHandle?.remove();
      hideHandle?.remove();
    };
  }, []);

  const dismiss = () => {
    if (isNative()) {
      Keyboard.hide();
    } else {
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  return { keyboardHeight, isVisible, dismiss };
}
