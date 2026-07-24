/**
 * FormulaCard — read-only Formula widget. Evaluates the widget's `=…` formula
 * (via formula-spreadsheet's 3-pass engine run) and shows the single result:
 * numbers render as currency (mirroring upstream's FormulaResult), strings
 * render as text, and a formula error renders as small muted text.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { Card, Skeleton } from "heroui-native";

import { amountToInteger } from "@/core/shared/util";
import type { FormulaWidget } from "@/core/types/models/dashboard";
import { Money } from "@/ui/Money";
import { ReportWidget } from "../ReportWidget";
import { useReport } from "../../hooks/useReport";
import { formulaSpreadsheet } from "../../data/spreadsheets/formula-spreadsheet";

type FormulaCardProps = {
  title: string;
  height: number;
  meta: FormulaWidget["meta"];
};

export function FormulaCard({ title, height, meta }: FormulaCardProps) {
  const formula = meta?.formula || "=SUM(1, 2, 3)";
  const showTitle = meta?.showTitle ?? true;
  const queries = useMemo(() => meta?.queries ?? {}, [meta?.queries]);

  // `queries` identity changes whenever the widget's meta changes (it comes from
  // a live dashboard query), so it also covers queriesVersion bumps.
  const getData = useMemo(() => formulaSpreadsheet(formula, queries), [formula, queries]);
  const data = useReport(getData);

  return (
    <ReportWidget height={height}>
      {showTitle ? (
        <ReportWidget.Header>
          <ReportWidget.Heading>
            <ReportWidget.Title>{title}</ReportWidget.Title>
          </ReportWidget.Heading>
        </ReportWidget.Header>
      ) : null}
      <ReportWidget.Body>
        <View className="flex-1 items-center justify-center px-2">
          {data == null ? (
            <Skeleton className="h-8 w-24 rounded-md" />
          ) : data.error ? (
            <ReportWidget.Description>{data.error}</ReportWidget.Description>
          ) : typeof data.result === "number" ? (
            <Money
              cents={amountToInteger(data.result)}
              tone="auto"
              className="text-2xl font-semibold"
            />
          ) : (
            <Card.Title className="text-center text-2xl font-semibold">
              {String(data.result ?? "")}
            </Card.Title>
          )}
        </View>
      </ReportWidget.Body>
    </ReportWidget>
  );
}
