import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { useRecordingStore } from '@/store/useRecordingStore';
import { useFolderStore } from '@/store/useFolderStore';
import { Colors } from '@/constants/Colors';
import { Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const { recordings, loadRecordings, deleteRecording } = useRecordingStore();
  const { folders, addFolder, deleteFolder, expandedFolders, toggleFolder } = useFolderStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isNewFolderModalVisible, setIsNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    loadRecordings();
  }, []);

  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return recordings;
    return recordings.filter((r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.transcript && r.transcript.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [recordings, searchQuery]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}.${day}`;
  };

  const handleNewFolder = () => {
    if (newFolderName.trim()) {
      addFolder(newFolderName.trim());
      setNewFolderName('');
      setIsNewFolderModalVisible(false);
    }
  };

  const renderRecordingItem = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={styles.recordingItem}
      onPress={() => router.push({ pathname: '/detail/[id]', params: { id: item.id } })}
      onLongPress={() => {
        Alert.alert('기록 삭제', `"${item.name}" 기록을 삭제할까요?`, [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: () => deleteRecording(item.id) },
        ]);
      }}
      activeOpacity={0.6}
    >
      <View style={styles.recordingIconContainer}>
        <MaterialIcons 
          name={item.transcript ? "description" : "mic-none"} 
          size={24} 
          color={theme.textSecondary} 
        />
      </View>
      <View style={styles.recordingInfo}>
        <Text style={[styles.recordingName, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <Text style={[styles.recordingDate, { color: theme.textTertiary }]}>
        {formatDate(item.createdAt)}
      </Text>
    </TouchableOpacity>
  );

  const renderFolderSection = (folderId: string, folderName: string) => {
    const isExpanded = expandedFolders.includes(folderId);
    const folderRecordings = filteredRecordings.filter((r) => 
      folderId === 'uncategorized' ? !r.folderId : r.folderId === folderId
    );

    if (folderRecordings.length === 0 && searchQuery) return null;

    return (
      <View key={folderId} style={styles.folderContainer}>
        <TouchableOpacity
          style={styles.folderHeader}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            toggleFolder(folderId);
          }}
          onLongPress={() => {
            if (folderId !== 'uncategorized') {
              Alert.alert('폴더 삭제', `"${folderName}" 폴더를 삭제할까요?`, [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: () => deleteFolder(folderId) },
              ]);
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.folderTitleRow}>
            <View style={[styles.folderIcon, { backgroundColor: theme.text }]}>
              <MaterialIcons name="folder" size={16} color={theme.background} />
            </View>
            <Text style={[styles.folderName, { color: theme.text }]}>{folderName}</Text>
          </View>
          <View style={styles.folderRightRow}>
            <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
              <Text style={styles.countText}>{folderRecordings.length}</Text>
            </View>
            <Feather
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textTertiary}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.folderContent}>
            {folderRecordings.length > 0 ? (
              folderRecordings.map(renderRecordingItem)
            ) : (
              <Text style={[styles.emptyFolderText, { color: theme.textTertiary }]}>
                이 폴더에 기록이 없습니다.
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header with Floating Action Group from Image */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.accent }]}>노깡</Text>
        
        <View style={[styles.actionGroup, { backgroundColor: theme.floatingButton, ...Shadows.medium }]}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/record')}>
            <Feather name="plus" size={22} color={theme.background} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => setIsNewFolderModalVisible(true)}>
            <MaterialIcons name="create-new-folder" size={22} color={theme.background} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsSearching(!isSearching);
            }}
          >
            <Feather name="search" size={20} color={theme.background} />
          </TouchableOpacity>
        </View>
      </View>

      {isSearching && (
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Feather name="search" size={18} color={theme.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="강의 제목이나 내용 검색..."
              placeholderTextColor={theme.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listContent}>
          {/* Uncategorized recordings first (Default Notes) */}
          {renderFolderSection('uncategorized', '기본 노트')}
          
          {/* User Folders */}
          {folders.map((folder) => renderFolderSection(folder.id, folder.name))}
        </View>
      </ScrollView>

      {/* Bottom Recording Button from Image */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={[styles.mainRecordButton, { backgroundColor: theme.primary, ...Shadows.medium }]}
          onPress={() => router.push('/record')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="mic" size={32} color={theme.background} />
        </TouchableOpacity>
      </View>

      {/* New Folder Modal */}
      <Modal visible={isNewFolderModalVisible} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsNewFolderModalVisible(false)}
        >
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
              <TouchableOpacity 
                style={[styles.modalButton, { borderColor: theme.border }]} 
                onPress={() => setIsNewFolderModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary, ...Typography.bodyMedium }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: theme.text }]} 
                onPress={handleNewFolder}
              >
                <Text style={{ color: theme.background, ...Typography.bodyMedium, fontWeight: '700' }}>생성</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.titleLarge,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  actionGroup: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  actionButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    ...Typography.bodyMedium,
  },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.md,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  folderContainer: {
    marginBottom: Spacing.lg,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  folderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  folderIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderName: {
    ...Typography.bodyLarge,
    fontWeight: '700',
  },
  folderRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  folderContent: {
    marginTop: Spacing.xs,
    paddingLeft: 4,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: Spacing.md,
  },
  recordingIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    ...Typography.bodyMedium,
    fontWeight: '500',
  },
  recordingDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  emptyFolderText: {
    ...Typography.caption,
    paddingVertical: Spacing.md,
    paddingLeft: 40,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  mainRecordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
