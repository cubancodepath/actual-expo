import { useState, useEffect, useCallback } from "react";
import {
  requestLocationPermission,
  getLocationPermissionStatus,
} from "@/services/locationService";

export function useLocationPermission() {
  const [status, setStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  useEffect(() => {
    getLocationPermissionStatus().then(setStatus);
  }, []);

  const request = useCallback(async () => {
    const granted = await requestLocationPermission();
    setStatus(granted ? "granted" : "denied");
    return granted;
  }, []);

  return { status, request };
}
