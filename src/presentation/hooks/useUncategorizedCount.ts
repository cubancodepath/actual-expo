import { useEffect, useRef, useState } from "react";
import { listen } from "@core/sync/syncEvents";
import { getUncategorizedStats } from "@core/transactions";

/**
 * Reactive hook for the uncategorized transaction count.
 * Listens to syncEvents on the "transactions" table and re-fetches
 * the count whenever transactions change.
 */
export function useUncategorizedCount(): number {
  const [count, setCount] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // Initial fetch
    getUncategorizedStats().then(({ count: c }) => {
      if (isMounted.current) setCount(c);
    });

    // Re-fetch when transactions table changes
    const unlisten = listen((event) => {
      if (event.tables.includes("transactions")) {
        getUncategorizedStats().then(({ count: c }) => {
          if (isMounted.current) setCount(c);
        });
      }
    });

    return () => {
      isMounted.current = false;
      unlisten();
    };
  }, []);

  return count;
}
