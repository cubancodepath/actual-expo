import { useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import { errorChannel } from "@/lib/errors/ErrorChannel";

/**
 * The single consumer of the error bus. For now it only logs: console in
 * dev plus Sentry so crash reporting survives. UI consumers (toasts,
 * dialogs) will subscribe to the same bus when they exist.
 */
export function ErrorChannelConsumer() {
  useEffect(() => {
    return errorChannel.subscribe((event) => {
      // eslint-disable-next-line no-console
      console.log("[ErrorChannel]", event.code, event.message);

      Sentry.addBreadcrumb({
        category: "error",
        message: event.message,
        level: "error",
        data: { code: event.code, ...event.context },
      });
      Sentry.captureException(
        event.error instanceof Error ? event.error : new Error(event.message),
        {
          tags: { errorCode: event.code },
          extra: event.context,
        },
      );
    });
  }, []);

  return null;
}
