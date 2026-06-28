export type PayeeLocation = {
  id: string;
  payee_id: string;
  latitude: number;
  longitude: number;
  created_at: number;
  tombstone: boolean;
};

export type NearbyPayee = {
  payee_id: string;
  payee_name: string;
  distance: number; // meters
  location_id: string;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};
