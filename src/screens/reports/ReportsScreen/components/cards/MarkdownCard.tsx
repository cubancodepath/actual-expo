import { ScrollView } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { useThemeColor } from "heroui-native";
import type { MarkdownWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";

type MarkdownCardProps = {
  height: number;
  meta: MarkdownWidget["meta"];
};

/**
 * Markdown widget — port of desktop-client `MarkdownCard`. Read-only: renders
 * the stored markdown `content` with the configured text alignment via
 * `react-native-enriched-markdown` (native rendering, no WebView). GitHub flavor
 * so tables/strikethrough match the desktop `remarkGfm` output. No inline
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
          <EnrichedMarkdownText
            markdown={meta?.content ?? ""}
            flavor="github"
            selectable={false}
            markdownStyle={{
              paragraph: { color: textColor, fontSize: 14, textAlign },
              h1: { color: textColor, fontSize: 20, fontWeight: "600", textAlign },
              h2: { color: textColor, fontSize: 17, fontWeight: "600", textAlign },
              h3: { color: textColor, fontSize: 15, fontWeight: "600", textAlign },
              h4: { color: textColor, fontSize: 14, fontWeight: "600", textAlign },
              h5: { color: textColor, fontSize: 14, fontWeight: "600", textAlign },
              h6: { color: textColor, fontSize: 14, fontWeight: "600", textAlign },
              link: { color: linkColor },
              code: { color: textColor },
              codeBlock: { color: textColor, borderColor },
              blockquote: { color: mutedColor, borderColor },
              list: { color: textColor },
              table: { borderColor },
            }}
          />
        </ScrollView>
      </ReportWidget.Body>
    </ReportWidget>
  );
}
