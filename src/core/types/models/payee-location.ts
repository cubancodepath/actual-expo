export type PayeeLocation = {
  id: string;
  payee_id: string;
  latitude: number;
  longitude: number;
  created_at: number;
  tombstone: boolean;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};
