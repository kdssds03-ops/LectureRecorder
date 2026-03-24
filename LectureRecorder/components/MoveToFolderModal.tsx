import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFolderStore } from '@/store/useFolderStore';
import { Colors } from '@/constants/Colors';
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
        <View style={[styles.content, { backgroundColor: theme.card }]}>
          <View style={styles.indicator} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>폴더 이동</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: (theme as any).oliveLight }]}>
              <MaterialIcons name="close" size={20} color={theme.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.folderItem,
                selectedFolderId === null && { backgroundColor: (theme as any).oliveLight, borderColor: theme.primary }
              ]}
              onPress={() => handleSelect(null)}
            >
              <View style={[styles.iconBox, { backgroundColor: selectedFolderId === null ? theme.primary : (theme as any).oliveLight }]}>
                <MaterialIcons name="folder-open" size={22} color={selectedFolderId === null ? "#FFFFFF" : theme.primary} />
              </View>
              <Text style={[styles.folderName, { color: theme.text }, selectedFolderId === null && { fontWeight: '800' }]}>
                전체 (폴더 없음)
              </Text>
              {selectedFolderId === null && <MaterialIcons name="check-circle" size={24} color={theme.primary} />}
            </TouchableOpacity>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[
                    styles.folderItem,
                    isSelected && { backgroundColor: (theme as any).oliveLight, borderColor: theme.primary }
                  ]}
                  onPress={() => handleSelect(folder.id)}
                >
                  <View style={[styles.iconBox, { backgroundColor: isSelected ? theme.primary : (theme as any).oliveLight }]}>
                    <MaterialIcons name="folder" size={22} color={isSelected ? "#FFFFFF" : theme.primary} />
                  </View>
                  <Text style={[styles.folderName, { color: theme.text }, isSelected && { fontWeight: '800' }]}>
                    {folder.name}
                  </Text>
                  {isSelected && <MaterialIcons name="check-circle" size={24} color={theme.primary} />}
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    minHeight: '45%',
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 24,
  },
  indicator: {
    width: 40,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  folderName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
});
