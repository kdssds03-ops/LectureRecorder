import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, Platform, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useRecordingStore } from '@/store/useRecordingStore';
import { useFolderStore } from '@/store/useFolderStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MoveToFolderModal from '@/components/MoveToFolderModal';
import Snackbar from '@/components/Snackbar';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  
  const { 
    recordings, 
    loadRecordings, 
    removeRecording,
    moveToFolder
  } = useRecordingStore();
  const { 
    folders, 
    addFolder, 
    deleteFolder, 
    _hasHydrated: foldersHydrated 
  } = useFolderStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['all']));
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [isNewFolderModalVisible, setIsNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [recordingToMove, setRecordingToMove] = useState<{id: string, folderId: string | null} | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    loadRecordings();
  }, []);

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const handleNewFolder = () => {
    setIsNewFolderModalVisible(true);
  };

  const submitNewFolder = () => {
    if (newFolderName.trim()) {
      addFolder(newFolderName.trim());
      setNewFolderName('');
      setIsNewFolderModalVisible(false);
    }
  };

  const handleDeleteFolder = (id: string, name: string) => {
    Alert.alert('폴더 삭제', `"${name}" 폴더를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteFolder(id) },
    ]);
  };

  const formatDateLabel = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleLongPressRecording = (id: string, folderId: string | null) => {
    setRecordingToMove({ id, folderId });
    setIsMoveModalVisible(true);
  };

  const handleMoveRecording = (recordingId: string, folderId: string | null) => {
    moveToFolder(recordingId, folderId);
    setSnackbarMessage(`이동되었습니다.`);
    setSnackbarVisible(true);
  };

  if (!foldersHydrated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const unassignedRecordings = recordings.filter(r => !r.folderId);
  const foldersWithRecordings = folders.map(folder => ({
    ...folder,
    recordings: recordings.filter(r => r.folderId === folder.id)
  }));

  const renderNoteRow = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={styles.noteRow}
      activeOpacity={0.6}
      onPress={() => router.push({
        pathname: "/detail/[id]",
        params: { id: item.id, name: item.name, duration: item.duration, createdAt: item.createdAt }
      })}
      onLongPress={() => handleLongPressRecording(item.id, item.folderId)}
    >
      <View style={styles.noteRowLeft}>
        <Feather name="file-text" size={20} color={theme.text} style={styles.noteIcon} />
        <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <Text style={[styles.noteDate, { color: theme.textSecondary }]}>
        {formatDateLabel(item.createdAt)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header Actions */}
      <View style={styles.headerTopArea}>
        <View style={[styles.actionPill, { backgroundColor: theme.surface, ...Shadows.soft }]}>
          <TouchableOpacity onPress={() => router.push('/record')} style={styles.actionPillButton}>
            <Feather name="file-plus" size={20} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNewFolder} style={styles.actionPillButton}>
            <Feather name="folder-plus" size={20} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.actionPillButton}>
            <Feather name="settings" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Title */}
      <View style={styles.titleContainer}>
        <Text style={[styles.mainTitle, { color: theme.text }]}>노트</Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {/* Unassigned Notes (if any) */}
        {unassignedRecordings.length > 0 && (
          <View style={styles.folderSection}>
            <TouchableOpacity 
              style={styles.folderRow}
              activeOpacity={0.7}
              onPress={() => toggleFolder('all')}
            >
              <View style={styles.folderRowLeft}>
                <Feather name="folder" size={20} color={theme.text} style={styles.folderIcon} />
                <Text style={[styles.folderTitle, { color: theme.text }]}>기본 노트</Text>
              </View>
              <View style={styles.folderRowRight}>
                <View style={[styles.countBadge, { backgroundColor: theme.unselectedChip }]}>
                  <Text style={[styles.countText, { color: theme.textSecondary }]}>{unassignedRecordings.length}</Text>
                </View>
                <Feather name={expandedFolders.has('all') ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
            
            {expandedFolders.has('all') && (
              <View style={styles.folderContent}>
                {unassignedRecordings.map(renderNoteRow)}
              </View>
            )}
          </View>
        )}

        {/* Folders */}
        {foldersWithRecordings.map(folder => (
          <View key={folder.id} style={styles.folderSection}>
            <TouchableOpacity 
              style={styles.folderRow}
              activeOpacity={0.7}
              onPress={() => toggleFolder(folder.id)}
              onLongPress={() => handleDeleteFolder(folder.id, folder.name)}
            >
              <View style={styles.folderRowLeft}>
                <Feather name="folder" size={20} color={theme.text} style={styles.folderIcon} />
                <Text style={[styles.folderTitle, { color: theme.text }]}>{folder.name}</Text>
              </View>
              <View style={styles.folderRowRight}>
                <View style={[styles.countBadge, { backgroundColor: theme.unselectedChip }]}>
                  <Text style={[styles.countText, { color: theme.textSecondary }]}>{folder.recordings.length}</Text>
                </View>
                <Feather name={expandedFolders.has(folder.id) ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
            
            {expandedFolders.has(folder.id) && (
              <View style={styles.folderContent}>
                {folder.recordings.length === 0 ? (
                  <View style={styles.emptyFolderContent}>
                    <Text style={{ color: theme.textTertiary, ...Typography.bodySmall }}>비어 있음</Text>
                  </View>
                ) : (
                  folder.recordings.map(renderNoteRow)
                )}
              </View>
            )}
          </View>
        ))}

        {recordings.length === 0 && folders.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color={theme.border} style={{ marginBottom: Spacing.md }} />
            <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>아직 작성된 노트가 없습니다.</Text>
            <Text style={{ color: theme.textTertiary, ...Typography.bodySmall, marginTop: Spacing.xs }}>하단 버튼을 눌러 녹음을 시작해보세요.</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <View style={styles.fabWrapper}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary, ...Shadows.floating }]}
          activeOpacity={0.9}
          onPress={() => router.push('/record')}
        >
          <MaterialIcons name="graphic-eq" size={30} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <MoveToFolderModal
        visible={isMoveModalVisible}
        recordingId={recordingToMove?.id || null}
        currentFolderId={recordingToMove?.folderId || null}
        onMove={handleMoveRecording}
        onClose={() => {
          setIsMoveModalVisible(false);
          setRecordingToMove(null);
        }}
      />

      <Modal visible={isNewFolderModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsNewFolderModalVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, ...Shadows.medium }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>새 폴더 만들기</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="폴더 이름을 입력하세요"
              placeholderTextColor={theme.textTertiary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, { borderColor: theme.border }]} onPress={() => setIsNewFolderModalVisible(false)}>
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.text }]} onPress={submitNewFolder}>
                <Text style={{ color: theme.background, ...Typography.bodyMedium, fontWeight: '700' }}>생성</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Snackbar visible={snackbarVisible} message={snackbarMessage} onDismiss={() => setSnackbarVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTopArea: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    height: 44,
  },
  actionPillButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.xl,
  },
  mainTitle: {
    ...Typography.titleLarge,
    fontSize: 34, 
  },
  listContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 160, // Extra space for FAB
  },
  folderSection: {
    marginBottom: Spacing.lg,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  folderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderIcon: {
    marginRight: Spacing.sm,
  },
  folderTitle: {
    ...Typography.bodyLarge,
  },
  folderRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginRight: Spacing.sm,
  },
  countText: {
    ...Typography.caption,
  },
  folderContent: {
    paddingTop: Spacing.xs,
  },
  emptyFolderContent: {
    paddingLeft: Spacing.xl + Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.lg, 
  },
  noteRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: Spacing.md,
  },
  noteIcon: {
    marginRight: Spacing.md,
  },
  noteTitle: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  noteDate: {
    ...Typography.bodySmall,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  fabWrapper: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
  },
  fab: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.screenPadding,
  },
  modalContent: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  modalTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyMedium,
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    height: 52,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});

