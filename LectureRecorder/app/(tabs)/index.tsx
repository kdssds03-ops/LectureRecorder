import React, { useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, Alert, Platform, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
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

  const [selectedFolderId, setSelectedFolderId] = React.useState<string>('all');
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
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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
    
    const folderName = folderId 
      ? folders.find(f => f.id === folderId)?.name || '폴더'
      : '전체 (폴더 없음)';
    
    setSnackbarMessage(`파일이 [${folderName}]으로 이동되었습니다.`);
    setSnackbarVisible(true);
  };

  if (!foldersHydrated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  const filteredRecordings = selectedFolderId !== 'all'
    ? recordings.filter(r => r.folderId === selectedFolderId)
    : recordings;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>나의 강의 노트</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>오늘도 함께 열공해요! 📚</Text>
        </View>
        <TouchableOpacity 
          style={[styles.profileButton, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => router.push('/settings')}
        >
          <MaterialIcons name="settings" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.folderSelectionContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.folderStrip}
        >
          <TouchableOpacity
            onPress={() => setSelectedFolderId('all')}
            activeOpacity={0.8}
            style={[
              styles.folderChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              selectedFolderId === 'all' && [styles.selectedChip, { backgroundColor: theme.primary, borderColor: theme.primary }]
            ]}
          >
            <Text style={[
              styles.folderChipText,
              { color: theme.textSecondary },
              selectedFolderId === 'all' && { color: '#FFFFFF', fontWeight: 'bold' }
            ]}>
              전체
            </Text>
          </TouchableOpacity>

          {folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <TouchableOpacity
                key={folder.id}
                onPress={() => setSelectedFolderId(folder.id)}
                onLongPress={() => handleDeleteFolder(folder.id, folder.name)}
                activeOpacity={0.8}
                style={[
                  styles.folderChip,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  isSelected && [styles.selectedChip, { backgroundColor: theme.primary, borderColor: theme.primary }]
                ]}
              >
                <Text style={[
                  styles.folderChipText,
                  { color: theme.textSecondary },
                  isSelected && { color: '#FFFFFF', fontWeight: 'bold' }
                ]}>
                  {folder.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.addFolderChip, { borderColor: theme.primary, borderStyle: 'dashed' }]}
            onPress={handleNewFolder}
          >
            <MaterialIcons name="add" size={18} color={theme.primary} />
            <Text style={[styles.addFolderText, { color: theme.primary }]}>폴더 추가</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        data={filteredRecordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrap, { backgroundColor: (theme as any).oliveLight }]}>
              <MaterialIcons name="auto-stories" size={64} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>아직 기록된 강의가 없어요</Text>
            <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>
              오늘의 강의를 녹음하고{'\n'}AI가 정리해주는 노트를 확인해 보세요.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, shadowColor: (theme as any).shadow }]}
            onPress={() => router.push({
              pathname: "/detail/[id]",
              params: { id: item.id, name: item.name, duration: item.duration, createdAt: item.createdAt }
            })}
            onLongPress={() => handleLongPressRecording(item.id, item.folderId)}
          >
            <View style={styles.cardAccent} />
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, { backgroundColor: (theme as any).oliveLight }]}>
                  <MaterialIcons name="description" size={24} color={theme.primary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
                    {formatDate(item.createdAt)} • {formatDuration(item.duration)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('기록 삭제', `"${item.name}" 노트를 삭제할까요?`, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => removeRecording(item.id) },
                    ])
                  }
                  style={styles.deleteButton}
                >
                  <MaterialIcons name="more-vert" size={24} color={theme.border} />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
          onPress={() => router.push('/record')}
        >
          <LinearGradient
            colors={[(theme as any).secondary, theme.primary]}
            style={styles.fabGradient}
          >
            <MaterialIcons name="mic" size={36} color="#FFFFFF" />
          </LinearGradient>
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>새 폴더 만들기</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="폴더 이름을 입력하세요"
              placeholderTextColor={theme.textSecondary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { borderColor: theme.border }]} 
                onPress={() => setIsNewFolderModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: theme.primary, borderWidth: 0 }]} 
                onPress={submitNewFolder}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>생성</Text>
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderSelectionContainer: {
    paddingVertical: 8,
  },
  folderStrip: {
    paddingHorizontal: 24,
    gap: 10,
    alignItems: 'center',
  },
  folderChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  selectedChip: {
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  folderChipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  addFolderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 4,
  },
  addFolderText: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  listContainer: {
    padding: 24,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 24,
    marginBottom: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  cardAccent: {
    width: 6,
    backgroundColor: '#6B8E23', // primary color constant
  },
  cardContent: {
    flex: 1,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptySubText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 40,
    right: 24,
  },
  fab: {
    width: 72,
    height: 72,
    borderRadius: 36,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  fabGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 32,
    padding: 32,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    marginBottom: 32,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});
