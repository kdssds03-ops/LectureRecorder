# 앱스토어 출시 체크리스트 (노깡 / Nokkang)

> 코드·문서 측면은 대부분 준비되어 있습니다. 아래는 출시 전 **본인이 직접 처리해야 하는 항목**과 점검 사항입니다. (저는 제출 자체나 외부 URL 호스팅, Apple 계정 작업은 대신 할 수 없어요.)

## A. 계정/빌드 (본인 작업)
- [ ] Apple Developer Program 가입 (연 $99) — eas.json에 ascAppId(6761066232)·teamId가 있어 앱 레코드는 이미 생성된 것으로 보임
- [ ] `eas build -p ios --profile production` 로 프로덕션 빌드
- [ ] `eas submit -p ios --profile production` 또는 Transporter로 업로드
- [ ] 버전/빌드 번호 확인 (app.json version 1.0.0, ios.buildNumber 1)

## B. 필수 메타데이터 (App Store Connect)
- [ ] 앱 이름 / 부제(subtitle)
- [ ] 프로모션 텍스트 / 설명(Description) / 키워드
- [ ] 스크린샷: 6.7"(필수), 6.5", 5.5" 및 iPad(지원 시) 사이즈
- [ ] 앱 아이콘 1024×1024 (assets/images/icon.png 확인)
- [ ] **개인정보처리방침 URL (필수)** — 아래 C 참고
- [ ] 지원(Support) URL, 마케팅 URL(선택)
- [ ] 카테고리: 교육(Education) 권장
- [ ] 연령 등급(Age Rating) 설문

## C. 법률 문서 호스팅 (필수)
- [ ] 개인정보처리방침을 공개 URL로 호스팅
  - 현재 앱은 gist를 가리킴: 개정된 `PRIVACY_POLICY.md` 내용으로 **gist를 갱신**하거나, 아래 repo URL로 변경
  - repo 보기: https://github.com/kdssds03-ops/LectureRecorder/blob/main/PRIVACY_POLICY.md
- [ ] 이용약관도 공개 URL로 (앱 설정 → 이용약관이 아래를 가리킴)
  - https://github.com/kdssds03-ops/LectureRecorder/blob/main/TERMS_OF_SERVICE.md
- [ ] App Store Connect의 개인정보처리방침 URL 입력란에도 동일 URL 등록

## D. App Privacy "라벨"(데이터 수집 설문) 작성 가이드
현재 앱 기준(분석/추적 SDK 없음, 계정 없음):

| 질문 | 답변 |
|---|---|
| 데이터를 수집하나요? | 예 (서비스 제공을 위한 처리) |
| User Content – 오디오 데이터 | 수집/처리: 앱 기능(App Functionality) 목적, 신원 연결 안 함, 추적 안 함 |
| User Content – 기타(텍스트 노트) | 기기 내 저장(서버 영구저장 X). 처리 위해 일시 전송 |
| Contact Info(이메일) | 이용자가 피드백 메일을 보낼 때만. 앱이 자동 수집하지 않음 → 보통 "수집 안 함"으로 표기 가능 |
| Identifiers / IDFA | 수집 안 함 |
| Tracking | 아니요 (ATT 불필요) |

> 핵심: 오디오·텍스트가 **제3자(AssemblyAI/OpenAI, 미국)** 로 전송됨을 개인정보처리방침과 라벨에 정확히 반영해야 5.1.1 위반을 피합니다. (이미 방침에 반영됨)

## E. 기술/심사 리스크 점검
- [x] 마이크 권한 설명 문구(NSMicrophoneUsageDescription) 존재
- [x] 음성인식 권한 설명(NSSpeechRecognitionUsageDescription) 존재
- [x] 암호화 수출 규정: ITSAppUsesNonExemptEncryption=false 설정됨
- [x] 백그라운드 오디오 모드(UIBackgroundModes: audio) — 실제 사용과 일치해야 함
- [ ] 계정 삭제(5.1.1 v): 계정 기능이 없으므로 해당 없음. 단 "데이터 삭제는 앱 내 삭제/앱 삭제로 가능"을 설명에 명시 권장
- [ ] 빈/플레이스홀더 화면 없는지(2.1 완전성) 최종 점검
- [ ] 실제 기기에서 녹음→인식→요약→번역→퀴즈→내보내기 전 과정 1회 테스트
- [ ] (주의) `expo-av`는 SDK 54가 마지막 지원. 지금 심사는 통과 가능하나 SDK 55 전 `expo-audio`로 이전 필요

## F. 인앱 결제(구독) 출시 시 추가 (2단계에서 구현 예정)
- [ ] App Store Connect에서 구독 상품(자동 갱신) 생성 + 유료 계약(Paid Apps Agreement) 체결
- [ ] 앱 내 구매 화면에 가격·기간·자동갱신·해지 방법 명시
- [ ] "구매 복원(Restore Purchases)" 버튼 제공 (필수)
- [ ] 이용약관에 구독 조항 포함(이미 6항에 반영)
- [ ] 디지털 콘텐츠는 외부 결제 금지 — 반드시 Apple 인앱 결제 사용(3.1.1)

## G. 백엔드(Railway)
- [ ] 최신 코드 푸시 후 Railway 재배포(새 `/api/quiz` 포함)
- [ ] 환경변수(OPENAI_API_KEY, ASSEMBLYAI_API_KEY, APP_SECRET) 설정 확인
- [ ] (보안) 앱에 하드코딩된 공유키는 누구나 추출 가능 → 2단계에서 사용량 제한/구독 연동으로 보완 예정
