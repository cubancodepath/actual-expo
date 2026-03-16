import { useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { toAppError } from "@/errors";
import type { AppError } from "@/errors";

type UseErrorHandlerReturn = {
  error: AppError | null;
  handleError: <T>(action: () => Promise<T>) => Promise<T | undefined>;
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

  const handleError = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
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

      if (appError.recovery === "login") {
        routerRef.current.replace("/(public)/");
        return undefined;
      }

      setError(appError);
      return undefined;
    }
  }, []);

  return { error, handleError, setError, setValidationError, dismissError };
}
