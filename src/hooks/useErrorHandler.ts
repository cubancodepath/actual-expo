import { useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";
import i18n from "@/i18n/config";
import { toAppError } from "@/errors";
import type { AppError } from "@/errors";

type HandleErrorOptions = { silenceNetwork?: boolean };

type UseErrorHandlerReturn = {
  error: AppError | null;
  handleError: <T>(
    action: () => Promise<T>,
    options?: HandleErrorOptions,
  ) => Promise<T | undefined>;
  setError: (error: AppError | null) => void;
  setValidationError: (message: string) => void;
  dismissError: () => void;
};

export function useErrorHandler(): UseErrorHandlerReturn {
  const [error, setError] = useState<AppError | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const dismissError = useCallback(() => setError(null), []);

  const setValidationError = useCallback((message: string) => {
    setError({ category: "validation", message, recovery: "dismiss" });
  }, []);

  const handleError = useCallback(
    async <T>(action: () => Promise<T>, options?: HandleErrorOptions): Promise<T | undefined> => {
      try {
        setError(null);
        return await action();
      } catch (e: unknown) {
        const appError = toAppError(e);

        if (appError.category !== "validation") {
          Sentry.captureException(appError.cause ?? e, {
            tags: { errorCategory: appError.category },
          });
        }

        // Auth expiry → redirect to login
        if (appError.recovery === "login") {
          routerRef.current.replace("/(public)/");
          return undefined;
        }

        // Critical errors → native Alert modal (Apple HIG: alerts for critical issues)
        if (appError.category === "encryption" || appError.category === "database") {
          Alert.alert(i18n.t("common:error"), appError.message);
          return undefined;
        }

        // Network errors → silent by default (local-first: user keeps working)
        // Pass { silenceNetwork: false } to show network errors (e.g. login screen)
        if (appError.category === "network" && options?.silenceNetwork !== false) {
          return undefined;
        }

        // Validation, sync, unknown → set state for Banner/inline display
        setError(appError);
        return undefined;
      }
    },
    [],
  );

  return { error, handleError, setError, setValidationError, dismissError };
}
