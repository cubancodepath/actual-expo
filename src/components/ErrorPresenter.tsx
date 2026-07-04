import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useToast } from "heroui-native";
import { useErrorStore } from "@/stores/errorStore";

/**
 * The only component that renders global (non-inline) errors. Mount once in
 * app/_layout.tsx. Reads <ErrorStore/>'s queue — populated by reportError()
 * via the sink installed in src/lib/errors/install.ts — and shows a toast or
 * a native dialog depending on each entry's display mode.
 */
export function ErrorPresenter() {
  const { t: translate } = useTranslation();
  // i18next's typed resources don't accept a dynamic namespaced key (messageKey
  // is a runtime string, not a literal) — same escape hatch as core/errors/toAppError.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = translate as any;
  const { toast } = useToast();
  const queue = useErrorStore((s) => s.queue);
  const dismiss = useErrorStore((s) => s.dismiss);
  const shownIds = useRef(new Set<string>());

  useEffect(() => {
    for (const entry of queue) {
      if (shownIds.current.has(entry.id)) continue;
      shownIds.current.add(entry.id);

      const message: string = t(entry.error.messageKey, entry.error.messageParams);

      if (entry.display === "toast") {
        toast.show({ variant: "danger", label: t("common:error"), description: message });
        dismiss(entry.id);
      } else {
        // dialog + fatal: a blocking native dialog is the deliberate choice
        // for both — "fatal" here means "don't let the user miss this",
        // not a literal crash (that's ErrorBoundary's job for render errors).
        Alert.alert(t("common:error"), message, [{ text: t("common:ok") }]);
        dismiss(entry.id);
      }
    }
  }, [queue, t, toast, dismiss]);

  return null;
}
