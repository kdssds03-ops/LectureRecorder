import React, { useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, Alert, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useRecordingStore } from '@/store/useRecordingStore';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { recordings, loadRecordings, removeRecording, folders, addFolder, deleteFolder } = useRecordingStore();

  useEffect(() => {
    loadRecordings();
  }, []);

  const handleNewFolder = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        '새 폴더',
        '폴더 이름을 입력하세요',
        (name) => { if (name?.trim()) addFolder(name); },
        'plain-text',
        '',
        'default'
      );
    } else {
      // Android: Alert.prompt is not available — a TextInput modal can be added in Part 2
      Alert.alert('새 폴더', 'Android 폴더 생성은 다음 업데이트에서 지원됩니다.');
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>내 강의 기록</Text>
        <TouchableOpacity
          onPress={handleNewFolder}
          accessibilityLabel="새 폴더 만들기"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="create-new-folder" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Folder strip */}
      {folders.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.folderStrip}
        >
          {folders.map((folder) => (
            <TouchableOpacity
              key={folder.id}
              style={[styles.folderChip, { backgroundColor: theme.card, borderColor: theme.border }]}
              onLongPress={() => handleDeleteFolder(folder.id, folder.name)}
              accessibilityLabel={`${folder.name} 폴더`}
              accessibilityHint="길게 누르면 삭제"
            >
              <MaterialIcons name="folder" size={16} color={theme.primary} style={{ marginRight: 5 }} />
              <Text style={[styles.folderChipText, { color: theme.text }]}>{folder.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <MaterialIcons name="mic-none" size={52} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>첫 강의 녹음을 시작해 보세요</Text>
            <Text style={[styles.emptySubText, { color: theme.border }]}>
              녹음한 강의는 자동으로 텍스트로 변환되고{'\n'}요약 및 번역까지 한 번에 확인할 수 있어요.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/record')}
              accessibilityLabel="녹음 시작"
              accessibilityRole="button"
            >
              <MaterialIcons name="mic" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyButtonText}>녹음 시작하기</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push(`/detail/${item.id}`)}
            accessibilityLabel={`${item.name} 강의 기록 보기`}
            accessibilityRole="button"
          >
            <View style={styles.cardHeader}>
              <MaterialIcons name="mic" size={28} color={theme.primary} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.cardDate, { color: theme.border }]}>
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
          style={[styles.fab, { backgroundColor: theme.error }]}
          onPress={() => router.push('/record')}
          accessibilityLabel="새 강의 녹음 시작 버튼"
          accessibilityRole="button"
        >
          <MaterialIcons name="mic" size={48} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
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
  folderStrip: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  folderChipText: {
    fontSize: 14,
    fontWeight: '500',
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
});
