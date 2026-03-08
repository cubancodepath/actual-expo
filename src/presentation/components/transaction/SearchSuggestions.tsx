import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import type { SearchToken, StatusFilter } from '../../../transactions/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STATUSES: StatusFilter[] = ['cleared', 'uncleared', 'reconciled', 'unreconciled'];

const STATUS_LABELS: Record<StatusFilter, string> = {
  cleared: 'Cleared',
  uncleared: 'Uncleared',
  reconciled: 'Reconciled',
  unreconciled: 'Unreconciled',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Suggestion =
  | { kind: 'status'; value: StatusFilter; label: string }
  | { kind: 'account'; id: string; name: string; label: string }
  | { kind: 'category'; id: string; name: string; label: string }
  | { kind: 'payee'; id: string; name: string; label: string }
  | { kind: 'tag'; name: string; label: string }
  | { kind: 'uncategorized'; label: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchSuggestionsProps {
  text: string;
  tokens: SearchToken[];
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  payees?: Array<{ id: string; name: string }>;
  tags?: Array<{ tag: string }>;
  onSelect: (token: SearchToken) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchSuggestions({
  text,
  tokens,
  accounts,
  categories,
  payees = [],
  tags = [],
  onSelect,
}: SearchSuggestionsProps) {
  const { colors, spacing } = useTheme();

  const query = text.toLowerCase().trim();

  // Mutually exclusive status pairs
  const STATUS_EXCLUSIONS: Record<string, string> = {
    cleared: 'uncleared',
    uncleared: 'cleared',
    reconciled: 'unreconciled',
    unreconciled: 'reconciled',
  };

  // Build active token keys for dedup (include exclusive counterparts)
  const activeKeys = new Set<string>();
  for (const t of tokens) {
    if (t.type === 'status') {
      activeKeys.add(`status:${t.value}`);
      activeKeys.add(`status:${STATUS_EXCLUSIONS[t.value]}`);
    } else if (t.type === 'account') {
      activeKeys.add(`account:${t.accountId}`);
    } else if (t.type === 'category') {
      activeKeys.add(`category:${t.categoryId}`);
    } else if (t.type === 'payee') {
      activeKeys.add(`payee:${t.payeeId}`);
    } else if (t.type === 'tag') {
      activeKeys.add(`tag:${t.tagName}`);
    } else if (t.type === 'uncategorized') {
      activeKeys.add('uncategorized');
    }
  }

  // Build suggestion list
  const suggestions: Suggestion[] = [];

  // Status suggestions
  for (const s of ALL_STATUSES) {
    if (activeKeys.has(`status:${s}`)) continue;
    const label = STATUS_LABELS[s];
    if (query && !label.toLowerCase().includes(query)) continue;
    suggestions.push({ kind: 'status', value: s, label });
  }

  // Uncategorized suggestion
  if (!activeKeys.has('uncategorized')) {
    if (!query || 'uncategorized'.includes(query)) {
      suggestions.push({ kind: 'uncategorized', label: 'Uncategorized' });
    }
  }

  // Account suggestions
  if (query) {
    for (const a of accounts) {
      if (activeKeys.has(`account:${a.id}`)) continue;
      if (!a.name.toLowerCase().includes(query)) continue;
      suggestions.push({ kind: 'account', id: a.id, name: a.name, label: `Account Is: ${a.name}` });
    }
  } else {
    // Show generic "Account Is..." only when no text
    const hasAccountToken = tokens.some((t) => t.type === 'account');
    if (!hasAccountToken) {
      // Show all accounts as suggestions
      for (const a of accounts) {
        suggestions.push({ kind: 'account', id: a.id, name: a.name, label: `Account Is: ${a.name}` });
      }
    }
  }

  // Category suggestions
  if (query) {
    for (const c of categories) {
      if (activeKeys.has(`category:${c.id}`)) continue;
      if (!c.name.toLowerCase().includes(query)) continue;
      suggestions.push({ kind: 'category', id: c.id, name: c.name, label: `Category Is: ${c.name}` });
    }
  } else {
    const hasCategoryToken = tokens.some((t) => t.type === 'category');
    if (!hasCategoryToken) {
      for (const c of categories) {
        suggestions.push({ kind: 'category', id: c.id, name: c.name, label: `Category Is: ${c.name}` });
      }
    }
  }

  // Payee suggestions — only when typing (too many to show all)
  if (query) {
    for (const p of payees) {
      if (activeKeys.has(`payee:${p.id}`)) continue;
      if (!p.name.toLowerCase().includes(query)) continue;
      suggestions.push({ kind: 'payee', id: p.id, name: p.name, label: `Payee Is: ${p.name}` });
    }
  } else {
    const hasPayeeToken = tokens.some((t) => t.type === 'payee');
    if (!hasPayeeToken) {
      for (const p of payees) {
        suggestions.push({ kind: 'payee', id: p.id, name: p.name, label: `Payee Is: ${p.name}` });
      }
    }
  }

  // Tag suggestions — allow multiple (don't hide all when one is selected)
  if (query) {
    for (const t of tags) {
      if (activeKeys.has(`tag:${t.tag}`)) continue;
      if (!t.tag.toLowerCase().includes(query)) continue;
      suggestions.push({ kind: 'tag', name: t.tag, label: `Tag: #${t.tag}` });
    }
  } else {
    for (const t of tags) {
      if (activeKeys.has(`tag:${t.tag}`)) continue;
      suggestions.push({ kind: 'tag', name: t.tag, label: `Tag: #${t.tag}` });
    }
  }

  if (suggestions.length === 0) return null;

  function handleSelect(s: Suggestion) {
    switch (s.kind) {
      case 'status':
        onSelect({ type: 'status', value: s.value });
        break;
      case 'account':
        onSelect({ type: 'account', accountId: s.id, accountName: s.name });
        break;
      case 'category':
        onSelect({ type: 'category', categoryId: s.id, categoryName: s.name });
        break;
      case 'payee':
        onSelect({ type: 'payee', payeeId: s.id, payeeName: s.name });
        break;
      case 'tag':
        onSelect({ type: 'tag', tagName: s.name });
        break;
      case 'uncategorized':
        onSelect({ type: 'uncategorized' });
        break;
    }
  }

  function iconForSuggestion(s: Suggestion): keyof typeof Ionicons.glyphMap {
    switch (s.kind) {
      case 'status':
        switch (s.value) {
          case 'cleared': return 'checkmark-circle';
          case 'uncleared': return 'checkmark-circle-outline';
          case 'reconciled': return 'lock-closed';
          case 'unreconciled': return 'lock-open';
        }
        break;
      case 'account': return 'wallet-outline';
      case 'category': return 'folder-outline';
      case 'payee': return 'person-outline';
      case 'tag': return 'pricetags-outline';
      case 'uncategorized': return 'help-circle-outline';
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ maxHeight: 260 }}
      contentContainerStyle={{ paddingBottom: spacing.sm }}
    >
      {suggestions.map((s, i) => (
        <Pressable
          key={`${s.kind}-${s.label}-${i}`}
          onPress={() => handleSelect(s)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            gap: spacing.md,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name={iconForSuggestion(s)} size={18} color={colors.textMuted} />
          <Text variant="body" color={colors.textPrimary}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
