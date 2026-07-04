import { useTranslation } from "react-i18next";
import { Alert as HeroAlert } from "heroui-native";
import { normalizeError } from "@/core/errors";

type InlineErrorProps = {
  /** Typically a TanStack `mutation.error` / `query.error` — or null/undefined. */
  error: unknown;
};

/**
 * Renders a screen-local error banner. Pair with `useMutation({ meta: { inline: true } })`
 * so the mutation's `error` is passed straight through — reportError() still
 * logs it (via the MutationCache's onError), this just adds the visible part.
 */
export function InlineError({ error }: InlineErrorProps) {
  const { t: translate } = useTranslation();
  // Dynamic namespaced key — same escape hatch as core/errors/toAppError.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = translate as any;
  if (!error) return null;

  const normalized = normalizeError(error);

  return (
    <HeroAlert status="danger">
      <HeroAlert.Indicator />
      <HeroAlert.Content>
        <HeroAlert.Description>
          {t(normalized.messageKey, normalized.messageParams) as string}
        </HeroAlert.Description>
      </HeroAlert.Content>
    </HeroAlert>
  );
}
