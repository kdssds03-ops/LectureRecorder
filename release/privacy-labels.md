# App Privacy (개인정보 수집 라벨) 작성 가이드 — 노깡 (Nokkang)

> App Store Connect → 앱 선택 → **App Privacy** 섹션에서, 화면에 나오는 순서대로 아래 항목을 클릭하세요.
> 근거: `APP_STORE_CHECKLIST.md` §D, `PRIVACY_POLICY.md`. 현재 앱은 **분석/추적 SDK 없음, 계정/로그인 없음**, 오디오·텍스트는 처리 목적으로 AssemblyAI·OpenAI(미국)에 전송됨.

---

## 0단계 — 시작 질문

**"Do you or your third-party partners collect data from this app?"**
→ **예 (Yes)** 를 선택합니다.

(주의: 여기서 "아니오"를 고르면 안 됩니다. 오디오/텍스트가 AssemblyAI·OpenAI로 전송되어 처리되므로 데이터 수집이 발생합니다.)

---

## 1단계 — 데이터 유형(Data Types) 선택

ASC는 아래와 같은 대분류 리스트를 보여줍니다. 각 대분류를 펼쳐서 해당하는 소항목만 체크하세요.

### ✅ 체크할 항목: **User Content**
- **Audio Data (오디오 데이터)** → 체크
- **Other User Content (기타 사용자 콘텐츠)** → 체크 (녹취록/요약/노트 텍스트 커버용)

### ⬜ 체크하지 않을 항목 (전부 "수집 안 함"으로 남김)
- Contact Info (이메일, 이름, 전화번호 등) — 앱이 자동으로 수집하지 않음. 이용자가 자발적으로 피드백 메일을 보내는 것은 앱 내 SDK 수집이 아니라 기기 메일 앱을 통한 별도 행위이므로 **수집 안 함**으로 처리 가능.
- Health & Fitness
- Financial Info
- Location
- Sensitive Info
- Contacts
- Browsing History
- Search History
- Identifiers (Device ID, User ID 등) — **수집 안 함** (IDFA·광고 식별자 미사용)
- Purchases
- Usage Data
- Diagnostics
- Photos or Videos

> 체크리스트 §D 표의 "기기 ID(x-device-id)" 관련 참고: 앱이 요청 헤더로 임의 생성된 디바이스 ID를 보내지만, 이는 이용자 식별·광고·트래킹 목적이 아니라 서버측 무료 한도(월 120분) 집계용 내부 식별자입니다. Apple 설문은 실제 수집·연결 목적을 기준으로 하므로, 별도 계정 시스템이 없고 이 ID가 이용자 신원과 연결되지 않는 한 **Identifiers 항목은 "수집 안 함"으로 유지**하는 것이 현재 데이터 처리 실태에 부합합니다. (추후 계정 시스템 도입 시 재검토 필요)

---

## 2단계 — 각 데이터 유형별 세부 설문 (선택한 항목마다 반복)

ASC는 체크한 각 데이터 유형에 대해 아래 3가지를 순서대로 물어봅니다.

### A. Audio Data (오디오 데이터)

| 질문 | 선택 |
|---|---|
| Is this data used for tracking purposes? (트래킹에 사용되나요?) | **No** |
| Is this data linked to the user's identity? (이용자 신원과 연결되나요?) | **No** (계정 없음, 신원과 연결 안 함) |
| What is this data used for? (사용 목적) | **App Functionality (앱 기능 제공)** 만 체크. (Analytics, Advertising, Personalization, Product Personalization, Other Purposes 전부 체크 해제) |

### B. Other User Content (녹취록/요약/노트 텍스트)

| 질문 | 선택 |
|---|---|
| Is this data used for tracking purposes? | **No** |
| Is this data linked to the user's identity? | **No** |
| What is this data used for? | **App Functionality** 만 체크 |

---

## 3단계 — Tracking(트래킹) 관련 별도 질문

ASC 앱 프라이버시 섹션 상단 또는 별도 화면에 "Does this app use tracking as defined by Apple's guidelines...ATT?" 같은 질문이 있을 수 있습니다.

| 질문 | 선택 |
|---|---|
| Does this app track users? | **No** |
| → ATT(App Tracking Transparency) 프롬프트 구현 필요 여부 | 불필요 (코드에도 ATT 관련 구현 없음 — 일치함) |

---

## 4단계 — 최종 확인 화면에 표시될 라벨 요약 (참고용)

ASC가 최종적으로 표시할 "App Privacy" 요약은 대략 아래처럼 나와야 정상입니다.

```
Data Not Linked to You
  • User Content (Audio Data) — used for App Functionality
  • User Content (Other User Content) — used for App Functionality

Data Not Collected
  • Contact Info, Identifiers, Usage Data, Diagnostics, Location, 등 나머지 전부

이 앱은 귀하를 추적하는 데 사용되는 데이터를 수집하지 않습니다.
(This app does not use data to track you.)
```

---

## 5단계 — 저장(Publish) 전 재확인 체크리스트

- [ ] Audio Data, Other User Content 두 항목 모두 "Data Not Linked to You" 그룹에 있는지 확인 (연결 안 함으로 답했으므로)
- [ ] 두 항목의 목적이 "App Functionality"만 체크되어 있고 Analytics/Advertising 등은 체크 안 되어 있는지 확인
- [ ] Tracking 관련 질문에서 "No"로 되어 있는지 확인
- [ ] 개인정보처리방침 URL이 이 라벨 설문 내용(제3자 처리·해외 이전 명시)과 실제로 일치하는지 재확인 — `PRIVACY_POLICY.md` §4 "개인정보 처리의 위탁 및 국외 이전" 표(AssemblyAI/OpenAI/Railway, 미국) 참고
  - 단, HANDOFF.md 기준 실제 백엔드는 **Render**로 배포되어 있음(`PRIVACY_POLICY.md`에는 "Railway"로 표기되어 있어 실제와 불일치). 정식 제출 전 `PRIVACY_POLICY.md` 4항의 "Railway Corp." 표기를 "Render Services, Inc."(또는 실제 사용 중인 호스팅사)로 수정 권장. (이 문서 자체는 코드가 아니므로 별도로 갱신 가능)

## 6단계 — 심사 리스크 메모 (Guideline 5.1.1)

- 오디오·텍스트가 미국 소재 제3자(AssemblyAI, OpenAI)로 전송되어 처리된다는 사실이 (1) 개인정보처리방침, (2) 위 라벨 설문 모두에서 일관되게 드러나야 합니다. 라벨에서 "App Functionality" 목적으로만 선택했더라도, 정책 문서에 국외 이전·위탁 사실이 빠져 있으면 5.1.1 위반으로 반려될 수 있습니다. 현재 `PRIVACY_POLICY.md` §4에 이미 반영되어 있으므로 이 부분은 통과 요건을 충족합니다.
- 계정 삭제 기능이 없어도 문제 없음 — 애초에 계정이 없는 앱이므로 5.1.1(v) "계정 삭제" 요건이 적용되지 않습니다. 다만 "데이터 삭제 방법(앱 내 개별 삭제 / 앱 삭제)"을 개인정보처리방침과 지원 페이지에 명시해 둘 것 (→ `release/site/privacy.html`, `index.html`에 반영됨).
