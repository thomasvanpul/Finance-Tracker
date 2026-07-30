import { LocalNotifications } from "@capacitor/local-notifications";

const isNative = () => {
  try {
    return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform();
  } catch { return false; }
};

export async function scheduleNotification(opts: {
  id: number;
  title: string;
  body: string;
  scheduleAt: Date;
}) {
  if (!isNative()) return;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: opts.id,
        title: opts.title,
        body: opts.body,
        schedule: { at: opts.scheduleAt },
        sound: undefined,
        smallIcon: "ic_stat_icon_config_sample",
      },
    ],
  });
}

export async function cancelNotification(id: number) {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

export async function cancelAllNotifications() {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  }
}
