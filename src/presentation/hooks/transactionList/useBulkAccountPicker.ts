import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { usePickerStore } from '../../../stores/pickerStore';

export function useBulkAccountPicker(
  handleBulkMove: (accountId: string, accountName?: string) => void,
) {
  const router = useRouter();
  const bulkMovePending = useRef(false);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const clearPicker = usePickerStore((s) => s.clear);

  const handleRef = useRef(handleBulkMove);
  handleRef.current = handleBulkMove;

  useEffect(() => {
    if (selectedAccount && bulkMovePending.current) {
      bulkMovePending.current = false;
      handleRef.current(selectedAccount.id, selectedAccount.name);
      clearPicker();
    }
  }, [selectedAccount, clearPicker]);

  const triggerAccountPicker = useCallback(() => {
    bulkMovePending.current = true;
    router.push({ pathname: '/(auth)/transaction/account-picker', params: { selectedId: '' } });
  }, [router]);

  return { triggerAccountPicker };
}
