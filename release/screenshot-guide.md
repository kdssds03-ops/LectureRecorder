# 스크린샷 계획 — 노깡 (Nokkang)

> App Store Connect는 **6.7" 디스플레이 스크린샷이 필수**이며, 이를 등록하면 6.5"/5.5"/iPad 등 나머지 사이즈에 자동 사용(스케일링)되도록 설정할 수 있습니다. 다만 자동 스케일 결과가 UI 잘림 등 어색하게 나올 수 있어, 가능하면 사이즈별로 실제 캡처하는 것을 권장합니다.

---

## 1. 필수/권장 사이즈 정리

| 기기 그룹 | 해상도 (px) | 필수 여부 | 비고 |
|---|---|---|---|
| 6.7" (iPhone 15/16 Pro Max 등) | **1290 × 2796** | **필수** | 이것만 있으면 ASC가 다른 iPhone 사이즈에 자동 적용 가능(단, 화질/레이아웃 검수 권장) |
| 6.5" (iPhone 11 Pro Max / XS Max 등) | 1242 × 2688 또는 1284 × 2778 | 구형 기기 지원 시 권장 | 최신 Xcode/시뮬레이터 기준으로는 6.7"만 제출해도 통과되는 경우가 많으나, 구형 기기 사용자 노출을 고려하면 별도 캡처 권장 |
| 5.5" (iPhone 8 Plus 등, 구형) | 1242 × 2208 | 선택 (레거시) | `supportsTablet` 등과 무관, iPhone 화면 크기 대응용. 최신 앱은 생략하는 경우도 많음 |
| iPad 13" (iPad Pro 12.9") | 2048 × 2732 | `supportsTablet: true`(app.json)이므로 iPad 스크린샷도 요구될 가능성 높음 | 노깡은 `ios.supportsTablet: true`로 설정되어 있어 ASC가 iPad 스크린샷을 요구할 수 있음 — 최소 1세트 준비 권장 |
| iPad 12.9" (구형, 3세대) | 2048 × 2732 (동일 해상도 재사용 가능) | 선택 | 13" 세트와 동일 이미지 재사용 가능한 경우 많음 |

> **주의:** app.json에 `ios.supportsTablet: true`가 설정되어 있으므로, 이 앱은 iPad에서도 실행 가능한 유니버설 앱으로 간주됩니다. ASC 업로드 시 iPad 스크린샷 요구가 뜨면 위 iPad 세트를 준비해서 넣으세요. (레이아웃이 iPhone과 동일하게 늘어나 보여도 무방하나, 확인 후 어색하면 iPad 시뮬레이터에서 실제로 확인)

---

## 2. 6.7" 스크린샷 구성안 (5~6장)

캡처 전 준비: 상태바를 깨끗하게(신호 4칸, Wi-Fi, 배터리 100%, 시간 9:41 권장 — Apple 마케팅 관례) 만들고, 실제 그럴듯한 강의명/과목/요약 내용으로 더미 데이터를 채워서 캡처하세요. 빈 화면이나 "샘플 텍스트" 같은 placeholder가 그대로 보이면 심사에서 지적될 수 있습니다.

### 1장 — 홈 화면 (강의 목록)
- **캡처 화면:** `app/(tabs)/index.tsx` (홈 탭)
- **상태:** 강의 3~5개가 목록에 쌓여 있는 상태(과목별로 다양하게: 예) "미시경제학 3주차", "유기화학 실험", "헌법 판례 특강"). 각기 다른 강의 유형 아이콘이 보이도록.
- **캡션 (한국어):** `강의를 녹음하면, 정리는 노깡이`
- **캡션 (영어):** `Record your lecture — Nokkang takes it from there`

### 2장 — 녹음 화면
- **캡처 화면:** `app/record.tsx`
- **상태:** 녹음 진행 중 화면 (타이머가 예: 12:34 정도 진행된 상태, 파형/레벨 애니메이션이 있다면 활성 상태로).
- **캡션 (한국어):** `버튼 하나로 강의 녹음 시작`
- **캡션 (영어):** `Start recording with a single tap`

### 3장 — 상세 화면: AI 요약 탭
- **캡처 화면:** `app/detail/[id].tsx` (요약 탭 선택 상태)
- **상태:** 구조화된 요약 노트(제목, 소제목, 불릿 포인트)가 꽉 차게 보이는 실제 강의 요약 예시. 스크롤 없이 화면에 내용이 알차 보이도록 긴 요약을 넣어서 캡처.
- **캡션 (한국어):** `핵심만 골라주는 AI 요약 노트`
- **캡션 (영어):** `AI summaries that get straight to the point`

### 4장 — 상세 화면: 퀴즈 탭
- **캡처 화면:** `app/detail/[id].tsx` (퀴즈 탭)
- **상태:** 퀴즈 문제 1개가 보기 4개와 함께 표시된 상태(정답 선택 전, 또는 정답 표시 직후의 피드백 상태 중 더 보기 좋은 쪽).
- **캡션 (한국어):** `강의 내용으로 만든 복습 퀴즈`
- **캡션 (영어):** `Quizzes generated from your own lecture`

### 5장 — 상세 화면: 번역 / 화자 구분 or AI 채팅
- **캡처 화면:** `app/detail/[id].tsx` (번역 결과 카드 UI, 또는 화자 구분 렌더링 화면 중 더 시각적으로 좋은 것 선택)
- **상태:** 번역 결과가 원문과 나란히 또는 카드 형태로 보이는 상태. 화자 구분을 강조하고 싶다면 "화자 1", "화자 2"로 색이 구분된 대화 렌더링 캡처.
- **캡션 (한국어):** `번역도, 화자 구분도 한 번에`
- **캡션 (영어):** `Translation and speaker labels, built in`

### 6장 (선택) — AI 채팅 모달
- **캡처 화면:** 상세 화면 내 AI 채팅 모달
- **상태:** 이용자가 강의 내용에 대해 질문하고 AI가 답변한 대화 1~2턴이 보이는 상태.
- **캡션 (한국어):** `강의 내용, AI에게 바로 물어보세요`
- **캡션 (영어):** `Ask your lecture anything`

> 5장으로 줄이려면 6번(AI 채팅)을 생략하거나 3번(요약)과 통합해도 됩니다. ASC는 최소 1장, 최대 10장까지 허용하므로 5~6장이면 핵심 기능을 충분히 보여주면서도 과하지 않습니다.

---

## 3. 캡션 디자인 가이드 (선택 사항, 스크린샷에 텍스트 오버레이 시)

- 폰트/톤: 앱 톤에 맞춰 포레스트 그린(#3A5A40) 배경 + 크림(#F9F7F2) 텍스트, 또는 반대 조합.
- 스크린샷 상단 또는 하단 10~15% 영역에 캡션 바를 넣고, 실제 UI 스크린샷은 나머지 영역에 자연스럽게 배치(기기 프레임 없이 풀블리드도 무방).
- 오버레이 문구는 위 5~6개 캡션 그대로 사용 가능. 과장 표현("최고의", "1위") 금지 — 심사 리스크.
- 캡션 텍스트에 구독/가격 언급 금지 (1.0은 IAP 없음).

---

## 4. iOS 시뮬레이터로 캡처하는 방법

### 4-1. 6.7" 캡처 (iPhone 16 Pro Max 시뮬레이터 기준 예시)

```bash
# 사용 가능한 시뮬레이터 목록 확인
xcrun simctl list devicetypes | grep iPhone

# 6.7" 해당 기기 부팅 (기기명은 Xcode 버전에 따라 다를 수 있음)
xcrun simctl boot "iPhone 16 Pro Max"

# Expo 개발 빌드를 시뮬레이터에서 실행 (프로젝트 루트에서)
npx expo run:ios --device "iPhone 16 Pro Max"

# 원하는 화면으로 이동한 뒤 스크린샷 캡처
xcrun simctl io booted screenshot ~/Desktop/nokkang-01-home.png
```

- `xcrun simctl io booted screenshot <경로>.png` 로 현재 포그라운드 화면을 그대로 PNG로 저장합니다 (해상도는 시뮬레이터 기기 스펙 그대로 나오므로 6.7" 기기 선택 시 1290×2796이 그대로 나옵니다).
- 상태바를 깔끔하게 만들고 싶다면 캡처 전:
  ```bash
  xcrun simctl status_bar booted override --time "9:41" --cellularBars 4 --wifiBars 3 --batteryState charged --batteryLevel 100
  ```
- 여러 장 연속 캡처 시 파일명을 `nokkang-01-home.png`, `nokkang-02-record.png` 처럼 순번을 매겨 저장하면 ASC 업로드 순서 관리가 편합니다.

### 4-2. iPad 캡처

```bash
xcrun simctl boot "iPad Pro 13-inch (M4)"
npx expo run:ios --device "iPad Pro 13-inch (M4)"
xcrun simctl io booted screenshot ~/Desktop/nokkang-ipad-01-home.png
```

### 4-3. 6.5" / 5.5" (레거시, 필요 시)

```bash
xcrun simctl boot "iPhone 11 Pro Max"      # 6.5" 대응
xcrun simctl io booted screenshot ~/Desktop/nokkang-65-01-home.png

xcrun simctl boot "iPhone 8 Plus"          # 5.5" 대응
xcrun simctl io booted screenshot ~/Desktop/nokkang-55-01-home.png
```

> 참고: `HANDOFF.md` 기준 이 프로젝트는 OneDrive 밖(`C:\dev\LectureRecorder`)에서 작업 권장 상태이며, 개발 빌드는 Windows 환경에서 `eas build --profile development-device -p ios` 등 EAS 클라우드 빌드를 사용하는 것으로 보입니다. macOS가 없는 환경이라면 `xcrun simctl`은 macOS 전용이므로, EAS 빌드 후 실기기(iPhone) 또는 Mac이 있는 환경(예: Xcode Cloud, 지인 Mac, MacinCloud 등)에서 시뮬레이터/실기기 캡처를 진행해야 합니다. 실기기에서는 표준 iOS 스크린샷(음량 상단 버튼 + 사이드 버튼 동시 누름)으로 캡처하면 됩니다.

---

## 5. 업로드 전 최종 점검

- [ ] 상태바가 깨끗한지(불필요한 알림, 낮은 배터리 등 노출 안 됨)
- [ ] 실제 사용자 데이터처럼 보이는 자연스러운 더미 콘텐츠로 캡처했는지 (Lorem ipsum, "테스트" 같은 텍스트 노출 금지)
- [ ] 다른 앱 UI, 타사 로고, 개인 식별정보(실명, 실제 전화번호 등)가 화면에 노출되지 않았는지
- [ ] 구독/가격/IAP 관련 UI나 문구가 스크린샷에 포함되지 않았는지 (1.0은 무료+한도만 존재)
- [ ] 각 사이즈별 해상도가 Apple 요구 스펙과 정확히 일치하는지 (리사이즈로 인한 비율 왜곡 없는지)
- [ ] 6.7" 세트를 우선 등록 후, ASC에서 iPad 스크린샷 요구 여부 확인 (`supportsTablet: true`이므로 요구될 가능성 있음)
