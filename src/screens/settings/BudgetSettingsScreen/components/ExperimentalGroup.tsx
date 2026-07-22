import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, Typography } from "heroui-native";
import { useFeatureFlag, useSetFeatureFlag } from "@/hooks/useFeatureFlag";
import { SUPPORTED_FEATURE_FLAGS, type FeatureFlag } from "@/core/domain/preferences/featureFlags";

/** One switch row for a feature flag (own hooks — kept out of a map loop). */
function FeatureFlagRow({ flag }: { flag: FeatureFlag }) {
  const { t } = useTranslation("settings");
  const enabled = useFeatureFlag(flag);
  const setEnabled = useSetFeatureFlag(flag);

  async function handleToggle(value: boolean) {
    if (flag === "payeeLocations" && value) {
      // Nearby payees needs location permission — don't enable if denied.
      const { requestLocationPermission } = await import("@/services/locationService");
      const granted = await requestLocationPermission();
      if (!granted) return;
    }
    void setEnabled(value);
  }

  // Dynamic per-flag key: i18next can't infer these literal keys.
  const title = t(`featureFlags.${flag}.title` as never, { defaultValue: flag }) as string;
  const subtitle = t(`featureFlags.${flag}.subtitle` as never, { defaultValue: "" }) as string;

  return (
    <ListGroup.Item>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
        {subtitle ? <ListGroup.ItemDescription>{subtitle}</ListGroup.ItemDescription> : null}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Switch isSelected={enabled} onSelectedChange={handleToggle} />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** Experimental Features group — synced feature-flag toggles (upstream parity). */
export function ExperimentalGroup() {
  const { t } = useTranslation("settings");

  return (
    <>
      <ListGroup>
        {SUPPORTED_FEATURE_FLAGS.map((flag, index) => (
          <Fragment key={flag}>
            {index > 0 && <Separator className="mx-4" />}
            <FeatureFlagRow flag={flag} />
          </Fragment>
        ))}
      </ListGroup>

      <Typography className="mt-3 ml-2 text-sm text-muted">
        {t("experimentalFeaturesWarning")}
      </Typography>
    </>
  );
}
