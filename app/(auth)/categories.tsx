import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCategoriesStore } from '../../src/stores/categoriesStore';
import { useUndoStore } from '../../src/stores/undoStore';
import type { Category, CategoryGroup } from '../../src/categories/types';

// ---------------------------------------------------------------------------
// Transfer picker modal — shown when deleting a category that has transactions
// ---------------------------------------------------------------------------

function TransferPicker({
  visible,
  kind,
  deletingName,
  candidates,
  groups,
  onTransfer,
  onSkip,
  onCancel,
}: {
  visible: boolean;
  kind: 'category' | 'group';
  deletingName: string;
  candidates: Category[];
  groups: CategoryGroup[];
  onTransfer: (transferId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  // Build grouped list: only include expense groups that have at least one candidate
  const grouped = groups
    .filter(g => !g.is_income)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(g => ({
      group: g,
      cats: candidates
        .filter(c => c.cat_group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))
    .filter(s => s.cats.length > 0);

  const subtitle =
    kind === 'group'
      ? 'This group has categories with transactions. Transfer all of them to:'
      : 'This category has transactions. Transfer them to:';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <Text style={styles.modalTitle}>Delete "{deletingName}"</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>
          <ScrollView style={styles.modalList} bounces={false}>
            {grouped.map(({ group, cats }) => (
              <View key={group.id}>
                <Text style={styles.modalGroupHeader}>{group.name}</Text>
                {cats.map(cat => (
                  <Pressable
                    key={cat.id}
                    style={styles.modalItem}
                    onPress={() => onTransfer(cat.id)}
                  >
                    <Text style={styles.modalItemText}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {grouped.length === 0 && (
              <Text style={styles.modalEmpty}>No other categories available</Text>
            )}
          </ScrollView>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalActionBtn} onPress={onSkip}>
              <Text style={styles.modalActionSkip}>Delete (leave uncategorized)</Text>
            </Pressable>
            <Pressable style={styles.modalActionBtn} onPress={onCancel}>
              <Text style={styles.modalActionCancel}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Inline name editor — shown in place of the name label when editing
// ---------------------------------------------------------------------------

function NameInput({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <TextInput
      style={styles.nameInput}
      value={text}
      onChangeText={setText}
      onBlur={() => (text.trim() ? onSave(text.trim()) : onCancel())}
      onSubmitEditing={() => (text.trim() ? onSave(text.trim()) : onCancel())}
      autoFocus
      selectTextOnFocus
      returnKeyType="done"
    />
  );
}

// ---------------------------------------------------------------------------
// Category row
// ---------------------------------------------------------------------------

function CategoryRow({
  cat,
  onRename,
  onToggleHide,
  onDelete,
}: {
  cat: Category;
  onRename: (id: string, name: string) => void;
  onToggleHide: (id: string, hidden: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <View style={styles.catRow}>
      {editing ? (
        <NameInput
          value={cat.name}
          onSave={name => { setEditing(false); onRename(cat.id, name); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Pressable style={styles.nameArea} onPress={() => setEditing(true)}>
          <Text style={[styles.catName, cat.hidden && styles.dimmed]}>{cat.name}</Text>
          <Text style={styles.editHint}>tap to rename</Text>
        </Pressable>
      )}

      <View style={styles.rowActions}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => onToggleHide(cat.id, !cat.hidden)}
          hitSlop={8}
        >
          <Text style={[styles.iconBtnText, cat.hidden ? styles.colorMuted : styles.colorBlue]}>
            {cat.hidden ? 'show' : 'hide'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => onDelete(cat.id, cat.name)}
          hitSlop={8}
        >
          <Text style={[styles.iconBtnText, styles.colorRed]}>del</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Group section
// ---------------------------------------------------------------------------

function GroupSection({
  group,
  categories,
  onRenameGroup,
  onDeleteGroup,
  onAddCategory,
  onRenameCategory,
  onToggleHide,
  onDeleteCategory,
}: {
  group: CategoryGroup;
  categories: Category[];
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string, name: string) => void;
  onAddCategory: (groupId: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onToggleHide: (id: string, hidden: boolean) => void;
  onDeleteCategory: (id: string, name: string) => void;
}) {
  const [editingGroup, setEditingGroup] = useState(false);

  return (
    <View style={styles.groupSection}>
      {/* Group header */}
      <View style={styles.groupHeader}>
        {editingGroup ? (
          <NameInput
            value={group.name}
            onSave={name => { setEditingGroup(false); onRenameGroup(group.id, name); }}
            onCancel={() => setEditingGroup(false)}
          />
        ) : (
          <Pressable style={styles.nameArea} onPress={() => setEditingGroup(true)}>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.is_income && <Text style={styles.incomeBadge}>INCOME</Text>}
          </Pressable>
        )}

        <View style={styles.rowActions}>
          {!group.is_income && (
            <Pressable style={styles.iconBtn} onPress={() => onAddCategory(group.id)} hitSlop={8}>
              <Text style={[styles.iconBtnText, styles.colorBlue]}>+ cat</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.iconBtn}
            onPress={() => onDeleteGroup(group.id, group.name)}
            hitSlop={8}
          >
            <Text style={[styles.iconBtnText, styles.colorRed]}>del</Text>
          </Pressable>
        </View>
      </View>

      {/* Categories */}
      {categories.map(cat => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          onRename={onRenameCategory}
          onToggleHide={onToggleHide}
          onDelete={onDeleteCategory}
        />
      ))}

      {categories.length === 0 && (
        <Text style={styles.emptyGroup}>No categories — tap "+ cat" to add one</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type PendingDelete =
  | { kind: 'category'; id: string; name: string }
  | { kind: 'group'; id: string; name: string };

export default function CategoriesScreen() {
  const router = useRouter();
  const { groups, categories, load, createGroup, createCategory, updateCategory, deleteCategory, deleteCategoryGroup } =
    useCategoriesStore();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => { load(); }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAddGroup() {
    router.push('/(auth)/budget/new-group');
  }

  function handleAddCategory(groupId: string) {
    router.push({ pathname: '/(auth)/budget/new-category', params: { groupId } });
  }

  function handleRenameGroup(id: string, name: string) {
    router.push({ pathname: '/(auth)/budget/edit-group', params: { id, name } });
  }

  function handleRenameCategory(id: string, _name: string) {
    router.push({ pathname: '/(auth)/budget/edit-category', params: { categoryId: id } });
  }

  async function handleToggleHide(id: string, hidden: boolean) {
    await updateCategory(id, { hidden });
    load();
  }

  async function handleDeleteCategory(id: string, name: string) {
    const { runQuery } = await import('../../src/db');
    const row = await runQuery<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE category = ? AND tombstone = 0',
      [id],
    );
    const hasTxns = (row[0]?.n ?? 0) > 0;

    if (hasTxns) {
      // Show transfer picker — candidates are non-deleted categories except the one being deleted
      setPendingDelete({ kind: 'category', id, name });
    } else {
      Alert.alert('Delete Category', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await deleteCategory(id); load(); useUndoStore.getState().showUndo('Category deleted'); },
        },
      ]);
    }
  }

  async function handleDeleteGroup(id: string, name: string) {
    const groupCatIds = categories.filter(c => c.cat_group === id).map(c => c.id);
    let hasTxns = false;

    if (groupCatIds.length > 0) {
      const { runQuery } = await import('../../src/db');
      const placeholders = groupCatIds.map(() => '?').join(',');
      const row = await runQuery<{ n: number }>(
        `SELECT COUNT(*) AS n FROM transactions WHERE category IN (${placeholders}) AND tombstone = 0`,
        groupCatIds,
      );
      hasTxns = (row[0]?.n ?? 0) > 0;
    }

    if (hasTxns) {
      setPendingDelete({ kind: 'group', id, name });
    } else {
      Alert.alert('Delete Group', `Delete "${name}" and all its categories?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await deleteCategoryGroup(id); load(); useUndoStore.getState().showUndo('Category group deleted'); },
        },
      ]);
    }
  }

  async function confirmDelete(transferId?: string) {
    if (!pendingDelete) return;
    const kind = pendingDelete.kind;
    if (kind === 'category') {
      await deleteCategory(pendingDelete.id, transferId);
    } else {
      await deleteCategoryGroup(pendingDelete.id, transferId);
    }
    setPendingDelete(null);
    load();
    useUndoStore.getState().showUndo(kind === 'category' ? 'Category deleted' : 'Category group deleted');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const sections = [...groups]
    .sort((a, b) => {
      if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })
    .map(g => ({
      group: g,
      cats: categories
        .filter(c => c.cat_group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

  // Candidates for transfer: all live expense categories except the ones being deleted
  const excludeIds = new Set(
    pendingDelete
      ? pendingDelete.kind === 'category'
        ? [pendingDelete.id]
        : categories.filter(c => c.cat_group === pendingDelete.id).map(c => c.id)
      : [],
  );
  // All live expense categories except the ones being deleted (any group, including hidden)
  const transferCandidates = categories.filter(
    c => !excludeIds.has(c.id) && !c.tombstone &&
      groups.find(g => g.id === c.cat_group && !g.is_income),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color="#999" />
            </Pressable>
          ),
        }}
      />
      <TransferPicker
        visible={pendingDelete !== null}
        kind={pendingDelete?.kind ?? 'category'}
        deletingName={pendingDelete?.name ?? ''}
        candidates={transferCandidates}
        groups={groups}
        onTransfer={id => confirmDelete(id)}
        onSkip={() => confirmDelete(undefined)}
        onCancel={() => setPendingDelete(null)}
      />
      <FlatList
        data={sections}
        keyExtractor={s => s.group.id}
        renderItem={({ item }) => (
          <GroupSection
            group={item.group}
            categories={item.cats}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddCategory={handleAddCategory}
            onRenameCategory={handleRenameCategory}
            onToggleHide={handleToggleHide}
            onDeleteCategory={handleDeleteCategory}
          />
        )}
        ListFooterComponent={
          <Pressable style={styles.addGroupBtn} onPress={handleAddGroup}>
            <Text style={styles.addGroupText}>+ Add Group</Text>
          </Pressable>
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  groupSection: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#1e3a5f',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },

  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },

  nameArea: { flex: 1 },

  groupName: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  catName: { color: '#e2e8f0', fontSize: 14 },
  dimmed: { color: '#475569' },

  editHint: { color: '#334155', fontSize: 10, marginTop: 1 },

  incomeBadge: {
    color: '#4ade80',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  nameInput: {
    flex: 1,
    color: '#60a5fa',
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3b82f6',
    paddingVertical: 2,
    paddingHorizontal: 0,
  },

  rowActions: { flexDirection: 'row', gap: 8, marginLeft: 8 },

  iconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  iconBtnText: { fontSize: 11, fontWeight: '700' },
  colorBlue: { color: '#60a5fa' },
  colorRed: { color: '#f87171' },
  colorMuted: { color: '#64748b' },

  emptyGroup: {
    color: '#475569',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontStyle: 'italic',
  },

  addGroupBtn: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addGroupText: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },

  // Transfer picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  modalList: { maxHeight: 260 },
  modalGroupHeader: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  modalItem: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalItemText: { color: '#e2e8f0', fontSize: 15 },
  modalEmpty: { color: '#475569', fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  modalActions: { marginTop: 12, gap: 4 },
  modalActionBtn: { paddingVertical: 12, alignItems: 'center' },
  modalActionSkip: { color: '#f87171', fontSize: 14, fontWeight: '600' },
  modalActionCancel: { color: '#64748b', fontSize: 14 },
});
