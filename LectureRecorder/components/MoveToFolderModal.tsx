import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useFolderStore } from '@/store/useFolderStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface MoveToFolderModalProps {
  visible: boolean;
  recordingId: string | null;
  currentFolderId: string | null;
  onMove: (recordingId: string, folderId: string | null) => void;
  onClose: () => void;
}

export default function MoveToFolderModal({
  visible,
  recordingId,
  currentFolderId,
  onMove,
  onClose,
}: MoveToFolderModalProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { folders } = useFolderStore();
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(currentFolderId);

  React.useLayoutEffect(() => {
    if (visible) {
      setSelectedFolderId(currentFolderId);
    }
  }, [currentFolderId, visible]);

  const handleSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    if (recordingId) {
      onMove(recordingId, folderId);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.content, { backgroundColor: theme.surface, ...Shadows.medium }]}>
          <View style={[styles.indicator, { backgroundColor: theme.border }]} />
          
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>폴더 이동</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.unselectedChip }]}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
            <TouchableOpacity
              style={[
                styles.folderItem,
                selectedFolderId === null 
                  ? { backgroundColor: theme.accent, borderColor: theme.primary }
                  : { backgroundColor: theme.surface, borderColor: theme.border }
              ]}
              onPress={() => handleSelect(null)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBox, { backgroundColor: selectedFolderId === null ? theme.primary : theme.unselectedChip }]}>
                <Feather name="folder" size={20} color={selectedFolderId === null ? "#FFFFFF" : theme.textSecondary} />
              </View>
              <Text style={[styles.folderName, { color: theme.text }, selectedFolderId === null && { fontWeight: '700' }]}>
                기본 노트 (폴더 없음)
              </Text>
              {selectedFolderId === null && <Feather name="check-circle" size={20} color={theme.primary} />}
            </TouchableOpacity>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[
                    styles.folderItem,
                    isSelected 
                      ? { backgroundColor: theme.accent, borderColor: theme.primary }
                      : { backgroundColor: theme.surface, borderColor: theme.border }
                  ]}
                  onPress={() => handleSelect(folder.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: isSelected ? theme.primary : theme.unselectedChip }]}>
                    <Feather name="folder" size={20} color={isSelected ? "#FFFFFF" : theme.textSecondary} />
                  </View>
                  <Text style={[styles.folderName, { color: theme.text }, isSelected && { fontWeight: '700' }]}>
                    {folder.name}
                  </Text>
                  {isSelected && <Feather name="check-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    minHeight: '45%',
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.xl,
    paddingHorizontal: Spacing.screenPadding,
  },
  indicator: {
    width: 48,
    height: 5,
    borderRadius: Radius.pill,
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  title: {
    ...Typography.titleMedium,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.lg,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  folderName: {
    flex: 1,
    ...Typography.bodyMedium,
  },
});
