import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCategoriesStore } from '../../src/stores/categoriesStore';
import type { Category, CategoryGroup } from '../../src/categories/types';

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

export default function CategoriesScreen() {
  const { groups, categories, load, createGroup, createCategory, updateCategory, deleteCategory, deleteCategoryGroup } =
    useCategoriesStore();

  useEffect(() => { load(); }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAddGroup() {
    Alert.prompt(
      'New Group',
      'Enter group name',
      async name => {
        if (!name?.trim()) return;
        await createGroup(name.trim());
        load();
      },
      'plain-text',
    );
  }

  function handleAddCategory(groupId: string) {
    Alert.prompt(
      'New Category',
      'Enter category name',
      async name => {
        if (!name?.trim()) return;
        await createCategory(name.trim(), groupId);
        load();
      },
      'plain-text',
    );
  }

  async function handleRenameGroup(id: string, name: string) {
    // updateCategoryGroup not in store yet — send directly via categories module
    const { updateCategoryGroup } = await import('../../src/categories');
    await updateCategoryGroup(id, { name });
    load();
  }

  async function handleRenameCategory(id: string, name: string) {
    await updateCategory(id, { name });
    load();
  }

  async function handleToggleHide(id: string, hidden: boolean) {
    await updateCategory(id, { hidden });
    load();
  }

  function handleDeleteCategory(id: string, name: string) {
    Alert.alert(
      'Delete Category',
      `Delete "${name}"? Transactions assigned to it will become uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await deleteCategory(id); load(); },
        },
      ],
    );
  }

  function handleDeleteGroup(id: string, name: string) {
    Alert.alert(
      'Delete Group',
      `Delete "${name}" and all its categories?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Soft-delete all categories in the group first
            const groupCats = categories.filter(c => c.cat_group === id);
            await Promise.all(groupCats.map(c => deleteCategory(c.id)));
            await deleteCategoryGroup(id);
            load();
          },
        },
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const sections = groups.map(g => ({
    group: g,
    cats: categories.filter(c => c.cat_group === g.id),
  }));

  return (
    <View style={styles.container}>
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
    borderRadius: 12,
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
    borderRadius: 6,
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
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addGroupText: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },
});
