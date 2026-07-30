import { useEffect, useState } from "react";
import { Device } from "@capacitor/device";

type DeviceInfo = {
  model: string;
  platform: "ios" | "android" | "web";
  osVersion: string;
  isVirtual: boolean;
};

export function useDeviceInfo() {
  const [info, setInfo] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    Device.getInfo().then(d => {
      setInfo({
        model: d.model,
        platform: d.platform as DeviceInfo["platform"],
        osVersion: d.osVersion,
        isVirtual: d.isVirtual,
      });
    }).catch(() => {
      setInfo({ model: "browser", platform: "web", osVersion: navigator.userAgent, isVirtual: false });
    });
  }, []);

  return info;
}
