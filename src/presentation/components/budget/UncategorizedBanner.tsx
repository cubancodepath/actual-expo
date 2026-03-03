import { Banner } from '../molecules/Banner';

interface UncategorizedBannerProps {
  count: number;
  total: number;
  onPress: () => void;
}

export function UncategorizedBanner({ count, total, onPress }: UncategorizedBannerProps) {
  const abs = (Math.abs(total) / 100).toFixed(2);
  const fmtTotal = total < 0 ? `-$${abs}` : `$${abs}`;
  const label = count === 1 ? 'transaction' : 'transactions';
  return (
    <Banner
      variant="warning"
      message={`${count} uncategorized ${label} — ${fmtTotal} needs a category`}
      onPress={onPress}
    />
  );
}
