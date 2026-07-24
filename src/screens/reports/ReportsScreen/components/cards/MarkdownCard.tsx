import { ScrollView } from "react-native";
import Markdown from "react-native-markdown-display";
import { useThemeColor } from "heroui-native";
import type { MarkdownWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";

type MarkdownCardProps = {
  height: number;
  meta: MarkdownWidget["meta"];
};

/**
 * Markdown widget — port of desktop-client `MarkdownCard`. Read-only: renders
 * the stored markdown `content` with the configured text alignment. No inline
 * editing or context menu (those are desktop authoring affordances).
 */
export function MarkdownCard({ height, meta }: MarkdownCardProps) {
  const textColor = useThemeColor("foreground");
  const mutedColor = useThemeColor("muted");
  const linkColor = useThemeColor("accent");
  const borderColor = useThemeColor("border");
  const textAlign = meta?.text_align ?? "left";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Body>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Markdown
            style={{
              body: { color: textColor, textAlign, fontSize: 14 },
              heading1: { color: textColor, fontSize: 20, fontWeight: "600" },
              heading2: { color: textColor, fontSize: 17, fontWeight: "600" },
              heading3: { color: textColor, fontSize: 15, fontWeight: "600" },
              link: { color: linkColor },
              blockquote: {
                color: mutedColor,
                backgroundColor: "transparent",
                borderColor,
              },
              code_inline: { color: textColor, backgroundColor: "transparent" },
              fence: { color: textColor, backgroundColor: "transparent", borderColor },
              hr: { backgroundColor: borderColor },
              table: { borderColor },
              tr: { borderColor },
            }}
          >
            {meta?.content ?? ""}
          </Markdown>
        </ScrollView>
      </ReportWidget.Body>
    </ReportWidget>
  );
}
