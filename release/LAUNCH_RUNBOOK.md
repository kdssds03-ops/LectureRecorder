# 노깡 iOS 1.0 출시 런북

_작성: 2026-07-04. 결정사항: iOS 우선 / IAP 없이 무료+월 120분 한도 / 구독은 1.1._

코드·자료 준비는 완료 상태입니다. 아래는 **직접 실행해야 하는 순서**입니다.

## 0. 이번 세션에서 완료된 것 (참고)

- whisper.rn 의존성 제거 (온디바이스 STT seam은 유지, 재도입 가능)
- 무IAP 대응: RevenueCat 키 없으면 페이월 대신 "무료 사용량 안내" 화면, 설정의 구독 섹션 → 사용량 섹션. 키 설정 시 기존 페이월 그대로 동작(1.1 대비)
- 페이월에 Apple 표준 EULA + 개인정보처리방침 링크 추가
- 실험실(실시간 받아쓰기) `__DEV__` 가드로 프로덕션 숨김
- Expo 템플릿 잔재 컴포넌트 9개 삭제, `npx tsc --noEmit` 통과
- PRIVACY_POLICY.md의 Railway → Render 오기 수정
- `release/` 폴더: ASC 메타데이터(한/영), Privacy 라벨 가이드, 호스팅용 HTML 3종, 스크린샷 가이드

## 1. 로컬 동기화

```bash
cd C:\dev\LectureRecorder
npm install          # 갱신된 package-lock 반영
npx tsc --noEmit     # 통과 확인
```

## 2. 법률 문서 호스팅 (필수 — Privacy URL)

현재 리포는 **비공개**라 GitHub Pages를 무료로 못 씁니다. 권장:

1. 공개 리포 `nokkang-site` 새로 생성
2. `release/site/`의 `index.html`, `privacy.html`, `terms.html` 업로드
3. Settings → Pages → main 브랜치 활성화
4. 최종 URL 확인 (예: `https://kdssds03-ops.github.io/nokkang-site/`)

## 3. 앱 내 링크를 최종 URL로 교체

Pages URL 확정 후 아래 4곳 수정 (gist/repo 링크 → Pages URL):

- `app/settings.tsx:107` (개인정보처리방침)
- `app/settings.tsx:114` (이용약관)
- `app/paywall.tsx:31~32` (PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL)

수정 후 `npx tsc --noEmit` 재확인.

## 4. 커밋 & 푸시 (EAS는 git 기준)

```bash
git add -A && git commit -m "chore: 1.0 release prep" && git push
```

## 5. 프로덕션 빌드 & 제출

```bash
eas build -p ios --profile production
eas submit -p ios
```

## 6. App Store Connect 입력

- 메타데이터: `release/app-store-metadata.md` 복사 (한국어 기본 + 영어 로컬라이제이션)
- App Privacy 설문: `release/privacy-labels.md` 순서대로
- 개인정보처리방침 URL / 지원 URL: 2번에서 만든 Pages URL
- 스크린샷: `release/screenshot-guide.md` (6.7" 필수. supportsTablet=true라 iPad 스크린샷도 요구될 수 있음 — 준비 어려우면 app.json에서 `supportsTablet: false`로 변경 후 빌드하는 것도 방법)
- 카테고리: 교육 / 연령등급 설문: 가이드 참고 (예상 4+)

## 7. 제출 전 최종 테스트 (실기기 1회)

- [ ] 녹음 → 전사 → 요약 → 번역 → 퀴즈 → 채팅 → 내보내기 전 과정
- [ ] 무료 한도 도달 시 "무료 사용량 안내" 화면(구매 버튼 없음) 확인
- [ ] 설정에 실험실 섹션이 **안 보이는지** (프로덕션 빌드)
- [ ] 설정 → 개인정보처리방침/이용약관 링크가 새 URL로 열리는지
- [ ] 잠금화면/제어센터 재생 컨트롤 동작

## 8. 출시 후 / 1.1 백로그

- RevenueCat 구독 (엔타이틀먼트 `premium`, ASC 구독 상품, Paid Apps 계약, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` + 백엔드 `REVENUECAT_SECRET_KEY`)
- Render에 Redis 연결 (`REDIS_URL`) — 현재 재배포 시 사용량 카운터 초기화됨
- expo-av → expo-audio 마이그레이션 (SDK 55 전)
- Render 무료 플랜 콜드스타트(~50초) → 유료 전환 검토
- 클라우드 동기화, 위젯/Live Activity (NEXT_STEPS.md 참고)
