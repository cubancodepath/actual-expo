import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, Typography } from "heroui-native";
import { useFeatureFlag, useSetFeatureFlag } from "@/hooks/useFeatureFlag";
import {
  FEATURE_FLAG_REQUIRES,
  SUPPORTED_FEATURE_FLAGS,
  type FeatureFlag,
} from "@/core/domain/preferences/featureFlags";

/**
 * One switch row for a feature flag (own hooks — kept out of a map loop).
 *
 * Sub-feature deps (upstream parity, mobile-adapted): `requires` names a parent
 * flag that must be on for this row to be interactive — while it's off the row
 * shows disabled (muted). `cascadeOff` names a child to turn off when this flag
 * is turned off. Both hooks read a stable fallback so the rules of hooks hold.
 */
function FeatureFlagRow({
  flag,
  requires,
  cascadeOff,
}: {
  flag: FeatureFlag;
  requires?: FeatureFlag;
  cascadeOff?: FeatureFlag;
}) {
  const { t } = useTranslation("settings");
  const enabled = useFeatureFlag(flag);
  const setEnabled = useSetFeatureFlag(flag);
  const parentEnabled = useFeatureFlag(requires ?? flag);
  const setChild = useSetFeatureFlag(cascadeOff ?? flag);

  const disabled = requires ? !parentEnabled : false;

  async function handleToggle(value: boolean) {
    if (flag === "payeeLocations" && value) {
      // Nearby payees needs location permission — don't enable if denied.
      const { requestLocationPermission } = await import("@/services/locationService");
      const granted = await requestLocationPermission();
      if (!granted) return;
    }
    void setEnabled(value);
    // Turning a parent off turns its dependent sub-feature off too.
    if (cascadeOff && !value) void setChild(false);
  }

  // Dynamic per-flag key: i18next can't infer these literal keys.
  const title = t(`featureFlags.${flag}.title` as never, { defaultValue: flag }) as string;
  const subtitle = t(`featureFlags.${flag}.subtitle` as never, { defaultValue: "" }) as string;

  return (
    <ListGroup.Item>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle className={disabled ? "text-muted" : undefined}>
          {title}
        </ListGroup.ItemTitle>
        {subtitle ? <ListGroup.ItemDescription>{subtitle}</ListGroup.ItemDescription> : null}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Switch isSelected={enabled} isDisabled={disabled} onSelectedChange={handleToggle} />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** Reverse lookup: the sub-feature (if any) gated behind `flag`. */
function childOf(flag: FeatureFlag): FeatureFlag | undefined {
  return (Object.keys(FEATURE_FLAG_REQUIRES) as FeatureFlag[]).find(
    (child) => FEATURE_FLAG_REQUIRES[child] === flag,
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
            <FeatureFlagRow
              flag={flag}
              requires={FEATURE_FLAG_REQUIRES[flag]}
              cascadeOff={childOf(flag)}
            />
          </Fragment>
        ))}
      </ListGroup>

      <Typography className="mt-3 ml-2 text-sm text-muted">
        {t("experimentalFeaturesWarning")}
      </Typography>
    </>
  );
}
