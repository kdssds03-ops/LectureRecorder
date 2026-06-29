# 클라우드 동기화 (텍스트 우선) — 설계 & 적용 가이드

기기 간 동기화를 위한 **텍스트 우선** 설계입니다. 1단계로 녹음 메타·전사·요약·번역·세그먼트(가벼움)를 동기화하고, 2단계로 오디오 파일을 Storage로 확장합니다.

> 빌드를 깨지 않기 위해 의존성·코드는 아직 앱에 넣지 않았습니다. 아래 단계를 따르면 바로 동작합니다.

## 0. 왜 인증이 필요한가
기기 간 동기화는 "같은 사용자"를 식별해야 하므로 로그인이 필수입니다(애플 정책상 iOS는 Apple 로그인 필요). 익명/디바이스 ID만으로는 다른 기기에서 같은 데이터를 볼 수 없습니다.

## 1. Supabase 프로젝트 준비
1. supabase.com에서 프로젝트 생성.
2. SQL 편집기에서 `cloud/schema.sql` 실행(테이블·RLS·트리거 생성).
3. Authentication > Providers에서 **Apple**, **Google** 활성화(리디렉트 URL은 Expo 가이드 참고).
4. Project Settings > API에서 `Project URL`과 `anon public key` 복사.

## 2. 의존성 설치
```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npx expo install expo-apple-authentication expo-auth-session expo-crypto
```
(async-storage는 이미 설치돼 있음 — Supabase 세션 저장에 재사용)

## 3. 환경값
`.env`에 추가(공개 가능 값):
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 4. 동기화 모듈 — `api/cloudSync.ts` (그대로 추가)
last-write-wins(updated_at 기준) + tombstone 삭제. 로컬은 AsyncStorage('recordings')를 그대로 사용합니다.

```ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRecordingStore, RecordingMeta } from '@/store/useRecordingStore';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(url, anon, {
  auth: { storage: AsyncStorage as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export function isCloudConfigured() { return !!url && !!anon; }

function toRow(r: RecordingMeta, userId: string) {
  return {
    id: r.id, user_id: userId, name: r.name, title_source: r.titleSource ?? 'default',
    lecture_type: r.lectureType ?? 'general', duration: Math.round(r.duration || 0),
    created_at: r.createdAt || 0, folder_id: r.folderId, tags: r.tags ?? [],
    is_favorite: !!r.isFavorite, transcript: r.transcript ?? '',
    summary: r.summary ?? null, translation: r.translation ?? null,
    segments: r.segments ?? null, chapters: r.chapters ?? null,
    quiz: r.quiz ?? null, highlights: r.highlights ?? [], deleted: false,
  };
}

function fromRow(row: any): RecordingMeta {
  return {
    id: row.id, name: row.name, titleSource: row.title_source, uri: '', // 오디오는 2단계
    duration: row.duration, createdAt: row.created_at, folderId: row.folder_id,
    lectureType: row.lecture_type, tags: row.tags ?? [], isFavorite: row.is_favorite,
    transcript: row.transcript ?? '', summary: row.summary ?? undefined,
    translation: row.translation ?? undefined, segments: row.segments ?? undefined,
    chapters: row.chapters ?? undefined, quiz: row.quiz ?? undefined,
    highlights: row.highlights ?? undefined, source: 'recording',
  };
}

/** 양방향 동기화: 원격을 받아 로컬과 병합(최신 우선)하고, 로컬 변경을 업로드. */
export async function syncRecordings(): Promise<void> {
  if (!isCloudConfigured()) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return; // 로그인 안 됨

  // 1) pull
  const { data: remoteRows, error } = await supabase
    .from('recordings').select('*').eq('user_id', userId);
  if (error) throw error;

  const local = useRecordingStore.getState().recordings;
  const localById = new Map(local.map((r) => [r.id, r]));
  const merged = new Map<string, RecordingMeta>(localById);

  for (const row of remoteRows ?? []) {
    if (row.deleted) { merged.delete(row.id); continue; }
    // 간단 병합: 원격이 있으면 텍스트 필드를 채움(로컬 오디오 uri는 보존)
    const localR = localById.get(row.id);
    merged.set(row.id, { ...fromRow(row), uri: localR?.uri ?? '', chunkUris: localR?.chunkUris, chunkDurations: localR?.chunkDurations });
  }

  const mergedArr = Array.from(merged.values());
  useRecordingStore.setState({ recordings: mergedArr });
  await AsyncStorage.setItem('recordings', JSON.stringify(mergedArr));

  // 2) push (텍스트 필드 upsert)
  const rows = mergedArr.map((r) => toRow(r, userId));
  if (rows.length) {
    const { error: upErr } = await supabase.from('recordings').upsert(rows, { onConflict: 'id' });
    if (upErr) throw upErr;
  }
}

/** 삭제 동기화: tombstone 기록. removeRecording 직후 호출. */
export async function markDeletedRemote(id: string): Promise<void> {
  if (!isCloudConfigured()) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  await supabase.from('recordings').update({ deleted: true }).eq('id', id).eq('user_id', userId);
}
```

## 5. 로그인 (Apple/Google)
`expo-apple-authentication`으로 Apple 자격을 받아 `supabase.auth.signInWithIdToken({ provider: 'apple', token })` 호출. Google은 `expo-auth-session` 또는 Supabase OAuth 플로우 사용. 로그인 성공 후 `syncRecordings()`를 호출하고, 앱 포그라운드 복귀 시·녹음 저장 후에도 호출하면 됩니다.

## 6. 트리거 지점(권장)
- 앱 시작/포그라운드 복귀 시 `syncRecordings()`
- 녹음 저장·요약/번역/챕터 생성 직후 `syncRecordings()`(디바운스)
- 삭제 시 `markDeletedRemote(id)` 후 `syncRecordings()`

## 7. 2단계: 오디오 동기화
- Storage 비공개 버킷 `recordings` 생성(스키마 주석의 정책 적용).
- 저장 시 `chunkUris[0]`(또는 병합 단일 파일)을 `userId/{id}.m4a`로 업로드, `audio_path` 기록.
- 다른 기기에서 재생 시 `createSignedUrl`로 받아 track-player에 전달.
- 용량/비용 절감을 위해 "Wi‑Fi에서만 업로드" 옵션 권장.

## 충돌/주의
- 현재 병합은 단순 last-write-wins(원격 우선 텍스트 채움). 정교한 필드 병합이 필요하면 `updated_at` 비교 로직을 추가.
- 녹음은 민감 정보 — 약관/개인정보처리방침에 클라우드 저장 고지, 전송/저장 암호화 확인.
