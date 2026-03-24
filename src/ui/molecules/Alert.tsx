import { Alert as HeroAlert, CloseButton } from "heroui-native";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import Icon from "@/ui/atoms/Icon";
import type { IconName } from "@/ui/atoms/Icon";

type AlertVariant = "info" | "success" | "warning" | "error";

const variantConfig: Record<AlertVariant, { status: string; icon: IconName }> = {
  info: { status: "accent", icon: "Info" },
  success: { status: "success", icon: "CircleCheck" },
  warning: { status: "warning", icon: "TriangleAlert" },
  error: { status: "danger", icon: "CircleAlert" },
};

type AlertProps = {
  title: string;
  description?: string;
  variant?: AlertVariant;
  onDismiss?: () => void;
  icon?: IconName;
  className?: string;
};

export function Alert({
  title,
  description,
  variant = "info",
  onDismiss,
  icon,
  className,
}: AlertProps) {
  const config = variantConfig[variant];

  return (
    <HeroAlert
      status={config.status as ComponentProps<typeof HeroAlert>["status"]}
      className={cn("rounded-md", className)}
    >
      <HeroAlert.Indicator>
        <Icon name={icon ?? config.icon} size={18} themeColor={config.status} />
      </HeroAlert.Indicator>
      <HeroAlert.Content>
        <HeroAlert.Title>{title}</HeroAlert.Title>
        {description && <HeroAlert.Description>{description}</HeroAlert.Description>}
      </HeroAlert.Content>
      {onDismiss && <CloseButton onPress={onDismiss} />}
    </HeroAlert>
  );
}
