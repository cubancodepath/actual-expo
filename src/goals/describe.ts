/**
 * Human-readable description of a goal template.
 */

import { formatBalance } from '../lib/format';
import { amountToInteger } from './engine';
import type { Template } from './types';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDisplayAmount(displayUnits: number): string {
  return formatBalance(amountToInteger(displayUnits));
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

const PERIOD_LABELS: Record<string, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

export function describeTemplate(t: Template): string {
  switch (t.type) {
    case 'simple': {
      let desc = t.monthly != null
        ? `Budget ${formatDisplayAmount(t.monthly)} monthly`
        : 'Budget monthly';
      if (t.limit?.amount) {
        desc += ` (up to ${formatDisplayAmount(t.limit.amount)})`;
      }
      return desc;
    }
    case 'goal':
      return `Reach ${formatDisplayAmount(t.amount)} balance`;
    case 'by': {
      let desc = `Save ${formatDisplayAmount(t.amount)} by ${formatMonth(t.month)}`;
      if (t.repeat) {
        desc += t.annual ? ' (repeats annually)' : ` (every ${t.repeat} months)`;
      }
      return desc;
    }
    case 'average': {
      let desc = `Average of last ${t.numMonths} months`;
      if (t.adjustment) {
        const sign = t.adjustment > 0 ? '+' : '';
        const suffix = t.adjustmentType === 'percent' ? '%' : '';
        desc += ` (${sign}${t.adjustment}${suffix})`;
      }
      return desc;
    }
    case 'copy':
      return `Copy budget from ${t.lookBack} month${t.lookBack > 1 ? 's' : ''} ago`;
    case 'periodic': {
      const p = PERIOD_LABELS[t.period.period] ?? t.period.period;
      const plural = t.period.amount > 1 ? `${t.period.amount} ${p}s` : p;
      return `Budget ${formatDisplayAmount(t.amount)} every ${plural}`;
    }
    case 'spend':
      return `Spend ${formatDisplayAmount(t.amount)} by ${formatMonth(t.month)}`;
    case 'percentage': {
      const prev = t.previous ? "last month's " : '';
      return `Budget ${t.percent}% of ${prev}income`;
    }
    case 'remainder': {
      const w = t.weight !== 1 ? ` (weight: ${t.weight})` : '';
      return `Fill with remaining budget${w}`;
    }
    case 'refill':
      return 'Refill to limit';
    case 'limit': {
      const hold = t.hold ? ', hold' : '';
      return `Limit: ${formatDisplayAmount(t.amount)} ${t.period}${hold}`;
    }
  }
}
