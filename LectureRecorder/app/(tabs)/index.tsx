import React, { useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, Alert, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useRecordingStore } from '@/store/useRecordingStore';
import { useFolderStore } from '@/store/useFolderStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LinearGradient } from 'expo-linear-gradient';
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

  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null);
  const [isMoveModalVisible, setIsMoveModalVisible] = React.useState(false);
  const [isNewFolderModalVisible, setIsNewFolderModalVisible] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [recordingToMove, setRecordingToMove] = React.useState<{id: string, folderId: string | null} | null>(null);
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState('');

  useEffect(() => {
    loadRecordings();
  }, []);

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

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const handleLongPressRecording = (id: string, folderId: string | null) => {
    setRecordingToMove({ id, folderId });
    setIsMoveModalVisible(true);
  };

  const handleMoveRecording = (recordingId: string, folderId: string | null) => {
    moveToFolder(recordingId, folderId);
    
    // Resolve folder name for snackbar
    const folderName = folderId 
      ? folders.find(f => f.id === folderId)?.name || '폴더'
      : '전체 (폴더 없음)';
    
    setSnackbarMessage(`파일이 [${folderName}]으로 이동되었습니다.`);
    setSnackbarVisible(true);
  };

  // Hydration check
  if (!foldersHydrated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const filteredRecordings = selectedFolderId 
    ? recordings.filter(r => r.folderId === selectedFolderId)
    : recordings;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>내 강의 기록</Text>
      </View>

      <View style={[styles.folderSelectionContainer, { borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.folderStrip}
        >
          {/* Add Folder Button */}
          <TouchableOpacity
            style={[styles.addFolderChip, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={handleNewFolder}
            accessibilityLabel="새 폴더 추가"
          >
            <MaterialIcons name="add" size={20} color={theme.primary} />
          </TouchableOpacity>

          {/* 'All' Chip */}
          <TouchableOpacity
            onPress={() => setSelectedFolderId(null)}
            activeOpacity={0.8}
          >
            {!selectedFolderId ? (
              <LinearGradient
                colors={[(theme as any).oliveLight, (theme as any).oliveDeep]}
                style={[styles.folderChip, styles.selectedChip]}
              >
                <Text style={[styles.selectedChipText, { color: (theme as any).textOnPrimary ?? '#121212' }]}>전체</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.folderChip, { backgroundColor: (theme as any).unselectedChip, borderColor: theme.border }]}>
                <Text style={[styles.folderChipText, { color: (theme as any).textSecondary }]}>전체</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Folder Chips */}
          {folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <TouchableOpacity
                key={folder.id}
                onPress={() => setSelectedFolderId(folder.id)}
                onLongPress={() => handleDeleteFolder(folder.id, folder.name)}
                activeOpacity={0.8}
                accessibilityLabel={`${folder.name} 폴더`}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={[(theme as any).oliveLight, (theme as any).oliveDeep]}
                    style={[styles.folderChip, styles.selectedChip]}
                  >
                    <Text style={[styles.selectedChipText, { color: (theme as any).textOnPrimary ?? '#121212' }]}>{folder.name}</Text>
                  </LinearGradient>
                ) : (
              <View style={[styles.folderChip, { backgroundColor: (theme as any).unselectedChip, borderColor: theme.border }]}>
                <Text style={[styles.folderChipText, { color: (theme as any).textSecondary }]}>
                  {folder.name}
                </Text>
              </View>
            )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRecordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <MaterialIcons name="mic-none" size={52} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>첫 강의 녹음을 시작해 보세요</Text>
            <Text style={[styles.emptySubText, { color: (theme as any).textSecondary }]}>
              녹음한 강의는 자동으로 텍스트로 변환되고{'\n'}요약 및 번역까지 한 번에 확인할 수 있어요.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/record')}
              accessibilityLabel="녹음 시작"
              accessibilityRole="button"
            >
              <MaterialIcons name="mic" size={20} color={theme.background} style={{ marginRight: 6 }} />
              <Text style={[styles.emptyButtonText, { color: theme.background }]}>녹음 시작하기</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push({
              pathname: "/detail/[id]",
              params: { 
                id: item.id,
                name: item.name, 
                duration: item.duration, 
                createdAt: item.createdAt 
              }
            })}
            onLongPress={() => handleLongPressRecording(item.id, item.folderId)}
            accessibilityLabel={`${item.name} 강의 기록 보기. 길게 눌러 폴더 이동`}
            accessibilityRole="button"
          >
            <View style={styles.cardHeader}>
              <MaterialIcons name="mic" size={28} color={theme.primary} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.cardDate, { color: (theme as any).textSecondary }]}>
                  {formatDate(item.createdAt)} • {formatDuration(item.duration)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    '녹음 삭제',
                    `"${item.name}"을(를) 삭제할까요? 이 작업은 실행취소할 수 없습니다.`,
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '삭제',
                        style: 'destructive',
                        onPress: () => removeRecording(item.id),
                      },
                    ]
                  )
                }
                accessibilityLabel="녹음 삭제"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MaterialIcons name="delete-outline" size={28} color={theme.error} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/record')}
          accessibilityLabel="새 강의 녹음 시작 버튼"
          accessibilityRole="button"
        >
          <MaterialIcons name="mic" size={48} color={theme.background} />
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

      {/* New Folder Modal */}
      <Modal
        visible={isNewFolderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNewFolderModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsNewFolderModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>새 폴더 생성</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="폴더 이름을 입력하세요"
              placeholderTextColor={(theme as any).textSecondary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { borderColor: theme.border }]} 
                onPress={() => setIsNewFolderModalVisible(false)}
              >
                <Text style={{ color: (theme as any).textSecondary }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: theme.primary, borderWeight: 0 }]} 
                onPress={submitNewFolder}
              >
                <Text style={{ color: theme.background, fontWeight: '600' }}>생성</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Snackbar 
        visible={snackbarVisible}
        message={snackbarMessage}
        onDismiss={() => setSnackbarVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
  },
  folderSelectionContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  folderStrip: {
    paddingHorizontal: 20,
    gap: 12,
    alignItems: 'center',
  },
  addFolderChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedChip: {
    borderWidth: 0,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  folderChipText: {
    fontSize: 16,
    fontWeight: '700',
  },
  selectedChipText: {
    fontWeight: '800',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 120, // space for FAB
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 14,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  fab: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});
