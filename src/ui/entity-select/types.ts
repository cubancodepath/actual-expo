/** A category chosen in a picker — the minimal reference callers pass around. */
export type CategoryRef = { id: string; name: string };

/** A single split line. `amount` is positive cents; direction is the caller's. */
export type SplitLineForm = {
  id?: string;
  categoryId: string | null;
  categoryName: string;
  amount: number;
};
