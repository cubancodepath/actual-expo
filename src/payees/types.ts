export type Payee = {
  id: string;
  name: string;
  transfer_acct: string | null;
  favorite: boolean;
  tombstone: boolean;
};
