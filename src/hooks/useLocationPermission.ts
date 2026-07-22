import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import { requestLocationPermission, getLocationPermissionStatus } from "@/core/platform/location";

export function useLocationPermission() {
  const [status, setStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  useEffect(() => {
    getLocationPermissionStatus().then(setStatus);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") getLocationPermissionStatus().then(setStatus);
    });
    return () => sub.remove();
  }, []);

  const request = useCallback(async () => {
    const granted = await requestLocationPermission();
    setStatus(granted ? "granted" : "denied");
    return granted;
  }, []);

  return { status, request };
}
