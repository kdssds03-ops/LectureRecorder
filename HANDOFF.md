# 노깡(Nokkang / LectureRecorder) — 핸드오프 문서

_최종 업데이트: 2026-06-28_

강의를 녹음 → AI로 음성인식·요약·번역·퀴즈·채팅까지 제공하는 **모바일 앱(iOS/Android)** + **백엔드 API**.

---

## 1. 현재 상태 요약

- ✅ 앱이 **실기기(iOS)에서 풀스택으로 정상 작동** 확인됨: 녹음 → 전사 → 요약 → 번역 → 퀴즈 → 채팅 → 내보내기.
- ✅ 백엔드 **Render에 배포되어 라이브**: `https://lecture-api-744h.onrender.com` (`/health` 200).
- ✅ 앱 타입체크(tsc) / 백엔드 빌드 모두 통과.
- 🚧 **아직 미출시**. 출시 절차(프로덕션 빌드·스토어 메타데이터·IAP)가 남음. (§7)

---

## 2. 저장소 / 위치

- **GitHub(비공개):** `https://github.com/kdssds03-ops/LectureRecorder` (브랜치 `main`)
- **로컬 폴더:** `C:\Users\kdssd\OneDrive\문서\New project\LectureRecorder`
  - ⚠️ **OneDrive + 한글/공백 경로**가 git·prebuild·EAS 업로드에서 반복적으로 문제를 일으킴. **`C:\dev\LectureRecorder` 등 OneDrive 밖으로 옮겨 작업 권장.**
- **EAS 계정:** `walter-a` (app.json `owner`).
- **Apple:** Team `GCHRH5GHTY` (Hyunmin Kim), Apple ID `kdssds03@gmail.com`, ascAppId `6761066232`.

---

## 3. 기술 스택 / 구조

**프론트엔드** — Expo SDK 54, React Native 0.81, expo-router, TypeScript, zustand.
- 화면: `app/` (expo-router). 홈 `app/(tabs)/index.tsx`, 녹음 `app/record.tsx`, 상세 `app/detail/[id].tsx`, 설정 `app/settings.tsx`, 페이월 `app/paywall.tsx`.
- 상태: `store/useRecordingStore.ts`, `store/useSettingsStore.ts`, `store/useSubscriptionStore.ts`.
- API 클라이언트: `api/aiService.ts`, `api/purchases.ts`(RevenueCat), `api/sttProvider.ts`+`api/onDeviceStt.ts`(STT 추상화/온디바이스 스캐폴드).
- 디자인 토큰: `constants/theme.ts`, `constants/Colors.ts` (웜 세이지/포레스트 톤).

**백엔드** — `lecture-api/` (Express + TypeScript).
- `src/index.ts`: 서버, 인증 미들웨어(`x-app-key`), CORS, rate limit, `/api/translate`·`/api/title`·`/api/chat`(인라인), `/health`.
- `src/routes/`: `transcribe.ts`(AssemblyAI 업로드/폴링/화자분리/사용량 집계), `summarize.ts`(구조화 JSON 요약, 과목·언어 인식, 청크 map-reduce).
- `src/usage.ts`: 디바이스별 월 사용량(초) 집계·무료한도 강제. **Redis(ioredis) 우선, `REDIS_URL` 없으면 인메모리 폴백.** RevenueCat로 프리미엄 검증.
- 외부 AI: **AssemblyAI**(STT), **OpenAI gpt-4o-mini**(요약/번역/퀴즈/채팅).

**인증/식별:** 앱이 모든 요청에 `x-app-key: <APP_SECRET>` + `x-device-id`를 보냄.

---

## 4. 그동안 한 작업 (주요)

- 요약 응답 구조 불일치 수정(구조화 JSON 계약 정합), dotenv 로딩 추가.
- 백엔드 `/api/quiz`, `/api/chat` 추가. rate limit 추가.
- 앱: **퀴즈 탭(인터랙티브)**, **AI 채팅 모달(강의 기반+보충)**, **내보내기/공유(PDF·텍스트)**, **화자 구분 토글+렌더**, **번역 결과 카드 UI**, ‘메모’→‘번역’ 라벨 정정.
- 수익화: **분 단위 무료 한도(월 120분)** + RevenueCat 구독 스캐폴드 + 페이월 + 전사 게이팅 + 설정 구독 섹션.
- 보안: 백엔드 rate limit + **서버측 사용량 집계/강제(usage.ts, Redis 폴백)** + RevenueCat 영수증 검증.
- 온디바이스 STT: **추상화 seam + whisper.rn 스캐폴드(기본 OFF)** + 계획서.
- 법률/출시: `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`, `APP_STORE_CHECKLIST.md`, `ON_DEVICE_STT_PLAN.md`. 인앱 약관 링크 + 녹음 동의 고지.
- 디자인: 타이포/그림자/여백 토큰 정제, **새 앱 아이콘 + 스플래시**(포레스트 그린 + 크림 마이크).

---

## 5. 배포 / 환경설정 (중요)

### 백엔드 (Render, 무료)
- URL: `https://lecture-api-744h.onrender.com`
- **Root Directory 인식 버그 우회 중**: Render 서비스 Settings —
  - Root Directory: **(비움)**
  - Build Command: `cd lecture-api && npm install && npm run build`
  - Start Command: `cd lecture-api && npm start`
- **환경변수(설정됨):** `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `APP_SECRET`(=`nokkang-secret-key`)
- **미설정(선택):** `REDIS_URL`(없으면 인메모리라 재배포 시 사용량 초기화), `REVENUECAT_SECRET_KEY`(없으면 서버측 한도 강제 비활성)
- ⚠️ 무료 플랜은 유휴 15분 후 잠들어 첫 요청 ~50초 콜드스타트.

### 앱 ↔ 백엔드 연결
- `EXPO_PUBLIC_BACKEND_URL` = Render URL. **`.env`(로컬/dev)와 `eas.json`(빌드용) 둘 다**에 설정됨.

### 비밀키 백업 위치
- `lecture-api/.env` (로컬, git 제외). / Render 대시보드 → Environment.

---

## 6. 개발/빌드 방법

로컬 개발(폰 테스트):
```
npx expo start --dev-client            # 같은 Wi-Fi. 막히면 --tunnel
```
EAS 빌드:
```
eas build --profile development-device -p all   # 실기기 dev (iOS+Android)
eas build -p ios --profile production           # 정식 출시
eas submit -p ios                               # 제출
```
- iOS 실기기: `eas device:create`로 기기 등록 → 프로파일 설치 → iOS 16+ 개발자 모드 ON(설정→개인정보 보호 및 보안).
- 백엔드 로컬: `cd lecture-api && npm install && npm run build && npm start` (.env 필요).
- **EAS는 git 기준** — 변경 후 항상 commit & push. `.easignore`가 잡폴더 업로드 제외(빠지면 prebuild EACCES).

---

## 7. 출시까지 남은 일 (체크리스트)

- [ ] (권장) whisper.rn 의존성 제거 — 지금 OFF인데 빌드만 무겁게 함.
- [ ] 프로덕션 빌드 + 제출.
- [ ] App Store Connect 메타데이터(스크린샷·설명·키워드·카테고리(교육)·연령등급).
- [ ] 개인정보처리방침/이용약관 공개 URL 호스팅 + ASC 등록.
- [ ] 페이월에 EULA/개인정보 링크 추가(구독 심사 요건).
- [ ] (수익화 시) IAP 셋업: RevenueCat 엔타이틀먼트 `premium`+오퍼링, ASC 자동갱신 구독, Paid Apps 계약. 앱 `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, 백엔드 `REVENUECAT_SECRET_KEY`.
- [ ] Render에 Redis 붙이고 `REDIS_URL` 설정(서버측 한도 견고화).
- [ ] expo-av → expo-audio 마이그레이션(SDK 55 전).
- 상세는 `APP_STORE_CHECKLIST.md` 참고.

---

## 8. 비용 / 지속가능성 메모

- 비용 대부분 = STT(AssemblyAI, ~$0.15~0.21/시간). GPT 기능은 사실상 무시 가능.
- 무료 한도는 ‘분’ 기준(월 120분). 헤비/무료 남용 적자 위험 → 서버측 강제 + 구독 필요.
- 고정비: Apple $99/년 + 백엔드 월 ~$5(상시). 장기 비용 0 = 온디바이스 STT(`ON_DEVICE_STT_PLAN.md`), 단 OpenAI용 백엔드는 계속 필요.

---

## 9. 알려진 이슈 / 주의

- OneDrive 경로: git/prebuild/EAS 권한·동기화 문제 → 밖으로 이전 권장.
- Render 무료 콜드스타트 ~50초.
- 클라이언트 한도는 변조 가능 → `REVENUECAT_SECRET_KEY`로 서버측 강제 켜기.
- 온디바이스 STT 미완성(스캐폴드만).
- 아이콘/스플래시는 네이티브 → 핫리로드 X, 다음 빌드부터 반영.

---

## 10. 핵심 파일 빠른 참조

| 목적 | 파일 |
|---|---|
| API 클라이언트 | `api/aiService.ts` |
| 구독/결제 | `api/purchases.ts`, `store/useSubscriptionStore.ts`, `app/paywall.tsx` |
| 상세 화면 | `app/detail/[id].tsx` |
| 녹음 | `app/record.tsx` |
| 설정 | `app/settings.tsx` |
| 백엔드 서버 | `lecture-api/src/index.ts` |
| 전사+사용량 | `lecture-api/src/routes/transcribe.ts`, `lecture-api/src/usage.ts` |
| 요약 | `lecture-api/src/routes/summarize.ts` |
| 디자인 토큰 | `constants/theme.ts`, `constants/Colors.ts` |
| 빌드 설정 | `eas.json`, `app.json`, `render.yaml` |
| 법률/출시 | `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`, `APP_STORE_CHECKLIST.md`, `ON_DEVICE_STT_PLAN.md` |
