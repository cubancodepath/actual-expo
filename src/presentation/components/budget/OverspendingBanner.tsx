import { formatBalance } from '../../../lib/format';
import { Banner } from '../molecules/Banner';

interface OverspendingBannerProps {
  count: number;
  total: number; // negative cents
}

export function OverspendingBanner({ count, total }: OverspendingBannerProps) {
  const label = count === 1 ? 'category' : 'categories';
  return (
    <Banner
      variant="error"
      message={`${count} overspent ${label} — ${formatBalance(total)} over budget`}
    />
  );
}
