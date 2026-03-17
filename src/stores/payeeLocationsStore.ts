import { create } from "zustand";
import { registerStore } from "./storeRegistry";
import {
  getNearbyPayees,
  createPayeeLocation,
  deletePayeeLocation,
  getLocationsForPayee,
} from "../payee-locations";
import type { NearbyPayee, PayeeLocation, Coordinates } from "../payee-locations/types";

type PayeeLocationsState = {
  nearbyPayees: NearbyPayee[];
  loading: boolean;
  loadNearby(coords: Coordinates): Promise<void>;
  saveLocation(payeeId: string, coords: Coordinates): Promise<string>;
  deleteLocation(id: string): Promise<void>;
  getLocationsForPayee(payeeId: string): Promise<PayeeLocation[]>;
  clear(): void;
};

export const usePayeeLocationsStore = create<PayeeLocationsState>((set) => ({
  nearbyPayees: [],
  loading: false,

  async loadNearby(coords) {
    set({ loading: true });
    try {
      const nearbyPayees = await getNearbyPayees(coords);
      set({ nearbyPayees });
    } finally {
      set({ loading: false });
    }
  },

  async saveLocation(payeeId, coords) {
    return createPayeeLocation(payeeId, coords);
  },

  async deleteLocation(id) {
    return deletePayeeLocation(id);
  },

  async getLocationsForPayee(payeeId) {
    return getLocationsForPayee(payeeId);
  },

  clear() {
    set({ nearbyPayees: [], loading: false });
  },
}));

// Register for sync — no auto-reload since nearby depends on current coordinates
registerStore("payeeLocations", ["payee_locations"], async () => {
  // Intentionally empty: nearby payees require coordinates to reload.
  // The picker will call loadNearby() explicitly.
});
