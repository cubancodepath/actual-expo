import type { AppError } from "@/errors";
import { Banner } from "./Banner";

type ErrorBannerProps = {
  error: AppError | null;
  onDismiss: () => void;
  onRetry?: () => void;
};

export function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <Banner
      message={error.message}
      variant="error"
      onDismiss={onDismiss}
      onPress={error.recovery === "retry" && onRetry ? onRetry : undefined}
    />
  );
}
