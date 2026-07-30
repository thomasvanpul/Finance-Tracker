import { Share } from "@capacitor/share";

const isCapacitor = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch { return false; }
};

export async function nativeShare(opts: { title: string; text?: string; url?: string }): Promise<boolean> {
  if (isCapacitor()) {
    try {
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return true;
    } catch { return false; }
  }
  // Web fallback — Web Share API
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return true;
    } catch { return false; }
  }
  return false;
}

export async function shareOrDownload(opts: { filename: string; content: string; mimeType: string; title: string }): Promise<void> {
  // Try native share first (iOS 14+)
  if (isCapacitor() || navigator.share) {
    const blob = new Blob([opts.content], { type: opts.mimeType });
    const file = new File([blob], opts.filename, { type: opts.mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: opts.title });
        return;
      } catch { /* fall through to download */ }
    }
  }
  // Fallback: trigger download
  const url = URL.createObjectURL(new Blob([opts.content], { type: opts.mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}
