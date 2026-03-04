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
  }
}
