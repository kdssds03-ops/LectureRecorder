import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const colorScheme = useColorScheme() ?? 'dark';
  const theme = Colors[colorScheme];
  const { folders } = useFolderStore();

  const handleSelect = (folderId: string | null) => {
    if (recordingId) {
      onMove(recordingId, folderId);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.content, { backgroundColor: theme.card }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>폴더로 이동</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list}>
            {/* 'None' option to move out of folder */}
            <TouchableOpacity
              style={[
                styles.folderItem,
                { borderBottomColor: theme.border },
                currentFolderId === null && { backgroundColor: (theme as any).unselectedChip }
              ]}
              onPress={() => handleSelect(null)}
            >
              <View style={styles.folderInfo}>
                <MaterialIcons 
                  name="folder-open" 
                  size={24} 
                  color={currentFolderId === null ? theme.primary : (theme as any).textSecondary} 
                />
                <Text style={[
                  styles.folderName, 
                  { color: theme.text },
                  currentFolderId === null && { fontWeight: 'bold' }
                ]}>
                  폴더 없음 (전체)
                </Text>
              </View>
              {currentFolderId === null && (
                <MaterialIcons name="check" size={20} color={theme.primary} />
              )}
            </TouchableOpacity>

            {folders.map((folder) => {
              const isSelected = currentFolderId === folder.id;
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[
                    styles.folderItem,
                    { borderBottomColor: theme.border },
                    isSelected && { backgroundColor: (theme as any).unselectedChip }
                  ]}
                  onPress={() => handleSelect(folder.id)}
                >
                  <View style={styles.folderInfo}>
                    <MaterialIcons 
                      name={(folder.icon as any) || 'folder'} 
                      size={24} 
                      color={isSelected ? theme.primary : folder.color || (theme as any).textSecondary} 
                    />
                    <Text style={[
                      styles.folderName, 
                      { color: theme.text },
                      isSelected && { fontWeight: 'bold' }
                    ]}>
                      {folder.name}
                    </Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
              <Text style={[styles.cancelText, { color: (theme as any).textSecondary }]}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '40%',
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  list: {
    paddingHorizontal: 16,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderRadius: 12,
  },
  folderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  folderName: {
    fontSize: 17,
    marginLeft: 16,
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
