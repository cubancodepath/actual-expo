import { useTranslation } from 'react-i18next';
import { Banner } from '../molecules/Banner';

interface UncategorizedBannerProps {
  count: number;
  total: number;
  onPress: () => void;
}

export function UncategorizedBanner({ count, total, onPress }: UncategorizedBannerProps) {
  const { t } = useTranslation('budget');
  const abs = (Math.abs(total) / 100).toFixed(2);
  const fmtTotal = total < 0 ? `-$${abs}` : `$${abs}`;
  return (
    <Banner
      variant="warning"
      message={t('uncategorizedBanner', { count, total: fmtTotal })}
      onPress={onPress}
    />
  );
}
