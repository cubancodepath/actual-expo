import { useEffect, useState } from "react";
import { errorChannel, type ErrorEvent } from "@/core/errors/ErrorChannel";

export function ErrorChannelConsumer() {
  const [, setError] = useState<ErrorEvent | null>(null);

  useEffect(() => {
    const unsubscribe = errorChannel.subscribe((incomingError) => {
      setError(incomingError);
      // Temporary consumer while the real UI for error events is defined.
      // eslint-disable-next-line no-console
      console.log("[ErrorChannel]", incomingError);
    });

    return unsubscribe;
  }, []);

  return null;
}
