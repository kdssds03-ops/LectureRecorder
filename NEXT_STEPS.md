# 작업 핸드오프 (NEXT_STEPS)

이 세션에서 추가/변경한 내용과, 빌드·배포·테스트를 위해 직접 해주셔야 할 일을 정리했습니다.
원칙: **기존 녹음 기능은 그대로 두고 전부 추가(additive) 방식**으로 구현했습니다.

---

## ✅ 이번 세션에 구현 완료(코드 반영됨)

기능 1차:
- 녹음 일시정지/재개, 녹음 중 북마크
- 전사 타임스탬프 탭 → 재생 점프, 재생 중 현재 구간 하이라이트
- 오디오 파일 가져오기, 긴 강의 전체 재생(청크 플레이리스트)
- 아이콘/스플래시 리디자인 + 에셋 정리

기능 2차:
- 즐겨찾기 + 태그(홈 즐겨찾기 섹션, 태그 검색, 노트 설정 모달)
- 화자 색상 구분 표시, AI 자동 챕터 분할
- 요약 템플릿(강의 종류별 맞춤 지시문)
- 정지 후 화자분리 패스(청크 병합 → 일관 화자 라벨 + 타임스탬프)
- 자동 화자분리 토글(설정 "화자 구분" ON 시 정지 후 백그라운드 실행)
- 음성 인식 언어 토글 전체 순환(자동/한/영/중)

플랫폼:
- 재생 잠금화면/제어센터 컨트롤(react-native-track-player)
- (실험적) 실시간 받아쓰기 + 화자 구분 화면 — 설정 › 실험실 › "실시간 받아쓰기"

---

## 📦 설치해야 할 의존성

루트 앱:
```bash
npm install
# 새로 추가됨: react-native-track-player, expo-document-picker, react-native-live-audio-stream
```
백엔드:
```bash
cd lecture-api && npm install   # ffmpeg-static 추가됨
```

> 이 세션의 샌드박스는 OneDrive 동기화 이슈로 설치를 직접 못 했습니다. 로컬에서 위 명령을 실행해 주세요.

---

## 🔨 빌드 & 배포 (필수)

1. **개발 빌드 재생성** — track-player, document-picker, live-audio-stream은 네이티브 모듈이라 Expo Go 불가:
   ```bash
   eas build --profile development --platform ios   # (그리고 android)
   # 또는 로컬: npx expo run:ios / npx expo run:android
   ```
   엔트리가 `index.js`로 바뀌었습니다(track-player 재생 서비스 등록). 정상 동작 확인.
2. **백엔드 재배포(Railway)** — 새 라우트/기능이 백엔드 변경 포함:
   - `/api/chapters`(AI 챕터), `/api/transcribe/diarize`(화자분리 병합), `/api/stream-token`(실시간 토큰), summarize `customInstruction`.
   - ffmpeg-static 포함해 재배포.
3. **타입 체크(권장)**: `npx tsc --noEmit`

---

## 🧪 테스트 체크리스트

- [ ] 기존 녹음 → 정지 → 저장/전사/요약 정상(회귀 확인)
- [ ] 녹음 중 일시정지/재개, 북마크 → 상세에서 북마크 점프
- [ ] 상세 재생: 전체 재생, 슬라이더/타임스탬프/챕터/북마크 탭 이동
- [ ] 잠금화면/제어센터에 재생 컨트롤 표시 및 동작(백그라운드 재생)
- [ ] 오디오 파일 가져오기 → 전사/요약
- [ ] 즐겨찾기/태그/검색, 요약 템플릿 반영
- [ ] 화자분리 분석(노트 설정) → 색상 화자 + 시간 점프
- [ ] (실험) 실시간 받아쓰기: 말하는 즉시 화자별 표시, 정지 후 저장·재생
- [ ] iOS에서 녹음(expo-av)과 재생(track-player) 전환 충돌 없는지

---

## ⚠️ 알려진 한계 / 리스크 (테스트 시 확인)

- **track-player 잠금화면 스크러버**: 긴 라이브 녹음은 30초 청크 구조라 스크러버가 청크 단위로 보일 수 있음. 가져온 단일 파일은 정상. → 아래 "단일 파일 녹음" 리팩터로 해소.
- **실시간 받아쓰기(실험적)**:
  - `react-native-live-audio-stream`은 오래된 모듈 → New Architecture(RN 0.81)에서 빌드/동작 확인 필요. 문제 시 대안: `@dr.pogodin/react-native-audio`.
  - WAV 저장을 위해 PCM을 메모리에 버퍼링 → **긴 세션은 메모리 부담**. 짧은 세션부터 테스트. (개선: 파일 스트리밍 기록)
  - AssemblyAI Turn 메시지의 화자 필드(`words[].speaker`)는 응답 형태에 따라 보정 필요할 수 있음.
- **자동 화자분리 토글**: 켜면 매 녹음 정지 후 전체 재전사(시간/비용↑). 기본은 OFF.

---

## ⏳ 남은 작업 (다음 단계)

### ① 클라우드 동기화 — 스캐폴드 제공됨, 적용 필요
- `cloud/schema.sql`, `cloud/CLOUD_SYNC.md` 참고. Supabase 프로젝트 생성 → 스키마 실행 → 로그인(Apple/Google) → `api/cloudSync.ts` 추가 → 동기화 트리거 연결. (텍스트 우선 → 2단계 오디오)

### ② 잠금화면 "녹음" 컨트롤 + 홈스크린 위젯 — 미착수
- iOS Live Activity(ActivityKit) + Android 포그라운드 서비스, 홈 위젯 WidgetKit/Glance.
- 도구: `expo-widgets`(신규) 또는 `expo-apple-targets`/`@bittingz/expo-widgets`. App Group 데이터 공유, 위젯→앱 deep link(scheme `nokkang`).
- 네이티브 타깃이라 빌드 특화. 별도 세션 권장.

### ③ 단일 파일 녹음 "프로덕션화" — 권장
- 실험적 실시간 화면이 검증되면, 이를 기본 녹음 경로로 승격(또는 expo-av 단일 연속 파일 + 정지 후 화자분리 조합).
- 효과: 잠금화면 스크러버 전체화 + 라이브 화자분리 기본 제공.

---

## 🗂️ 이번 세션에 추가된 파일
- `index.js`, `service.js` — track-player 엔트리/재생 서비스
- `api/playerSetup.ts` — 플레이어 초기화
- `api/liveTranscription.ts` — 실시간 전사 WS 클라이언트 + WAV 유틸
- `app/record-live.tsx` — 실험적 실시간 화면
- `live-audio-stream.d.ts` — 모듈 타입 선언
- `cloud/schema.sql`, `cloud/CLOUD_SYNC.md` — 클라우드 동기화 스캐폴드
- 백엔드: `lecture-api/src/routes/transcribe.ts`(diarize/utterances/ffmpeg), `summarize.ts`(customInstruction), `index.ts`(chapters/stream-token)
