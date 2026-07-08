import { useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import { errorChannel } from "@/core/errors/ErrorChannel";

/**
 * The single consumer of the error bus. For now it only logs: console in
 * dev plus Sentry so crash reporting survives. UI consumers (toasts,
 * dialogs) will subscribe to the same bus when they exist.
 */
export function ErrorChannelConsumer() {
  useEffect(() => {
    return errorChannel.subscribe((event) => {
      // eslint-disable-next-line no-console
      console.log("[ErrorChannel]", event.severity, event.code, event.message);

      Sentry.addBreadcrumb({
        category: "error",
        message: event.message,
        level: "error",
        data: { code: event.code, source: event.source, ...event.context },
      });
      if (event.severity === "ERROR" || event.severity === "CRITICAL") {
        Sentry.captureException(event.cause ?? new Error(event.message), {
          tags: { errorCode: event.code, source: event.source },
          extra: event.context,
        });
      }
    });
  }, []);

  return null;
}
