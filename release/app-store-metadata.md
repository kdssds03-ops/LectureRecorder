# App Store Connect 메타데이터 — 노깡 (Nokkang)

> 이 문서의 텍스트를 그대로 App Store Connect(ASC) 각 입력란에 복사/붙여넣기 하세요.
> 글자 수는 공백 포함 기준이며, ASC 제한을 넘지 않도록 여유를 두었습니다.
> **주의:** 1.0 버전은 IAP/구독 없음(무료 + 월 120분 한도)이므로, 아래 모든 텍스트에 구독·결제 언급이 없습니다. 과장 광고 문구("최고", "1위", "국내 유일" 등)도 심사 리스크상 사용하지 않았습니다.

---

## 0. 공통 입력 값 (로케일 무관)

| 항목 | 값 |
|---|---|
| 기본 로케일(Primary Language) | 한국어 (대한민국) |
| 추가 로케일 | 영어 (미국) — English (U.S.) |
| 카테고리 (Primary) | 교육 (Education) |
| 카테고리 (Secondary, 선택) | 생산성 (Productivity) |
| 가격 | 무료 (Free) |
| 번들 ID | com.hyunminkim.nokkang |
| 저작권 | 2026 Nokkang |

### 지원 URL / 마케팅 URL (자리 표시)

- **지원 URL (Support URL, 필수):** `https://<GITHUB_USERNAME>.github.io/<REPO_NAME>/` (release/site/index.html 배포 후 확정)
  - 대안: `mailto:kdssds03@gmail.com` 은 ASC "지원 URL" 필드에 사용 불가(http/https만 허용). 반드시 웹페이지 URL을 사용하세요. index.html에 이메일 연락처가 안내되어 있습니다.
- **마케팅 URL (Marketing URL, 선택):** 동일 페이지 사용 가능, 또는 비워둠.
- **개인정보처리방침 URL (필수):** `https://<GITHUB_USERNAME>.github.io/<REPO_NAME>/privacy.html`
- 위 URL은 `release/site/`를 GitHub Pages로 배포한 뒤 실제 주소로 바꿔 넣으세요. (아래 §screenshot 전 반드시 실제 URL 확정 → ASC 입력)

---

## 1. 한국어 (대한민국) — 기본 로케일

### 앱 이름 (App Name, 최대 30자)
```
노깡 - AI 강의 녹음 요약
```
(글자 수: 15자 — 여유 있음. 필요시 "노깡 - AI 강의 녹음·요약·퀴즈"(17자)로 확장 가능)

### 부제 (Subtitle, 최대 30자)
```
녹음부터 전사·번역·퀴즈까지
```
(글자 수: 15자)

### 프로모션 텍스트 (Promotional Text, 최대 170자, 심사 없이 수시 수정 가능)
```
강의를 녹음하면 AI가 알아서 텍스트로 바꾸고, 핵심을 요약하고, 번역하고, 퀴즈까지 만들어줘요. 시험 준비와 복습 시간을 줄여주는 대학생·수험생을 위한 강의 노트 도우미, 노깡입니다.
```
(글자 수: 약 95자)

### 설명 (Description, 최대 4000자)
```
노깡은 강의를 녹음하는 순간부터 시험 준비가 끝나는 순간까지 함께하는 AI 강의 노트 앱입니다.

수업 중에는 강의를 듣는 데 집중하고, 필기와 정리는 노깡에게 맡겨보세요. 녹음이 끝나면 AI가 음성을 텍스트로 변환하고, 핵심 내용을 요약하며, 필요하면 번역하고, 배운 내용을 스스로 점검할 수 있는 퀴즈까지 만들어 드립니다.

■ 주요 기능

- 강의 녹음: 수업, 세미나, 스터디 내용을 간편하게 녹음합니다. 화자 구분(발화자 분리) 기능으로 여러 명이 말하는 대화도 누가 말했는지 구분해서 볼 수 있습니다.
- 자동 텍스트 변환(STT): 녹음이 끝나면 AI가 음성을 텍스트(녹취록)로 자동 변환합니다.
- AI 요약: 긴 강의 내용에서 핵심만 뽑아 구조화된 요약 노트로 정리합니다. 전공·과목 특성에 맞춘 요약 템플릿을 직접 편집할 수도 있습니다.
- 번역: 변환된 텍스트나 요약을 원하는 언어로 번역합니다. 외국어 강의나 원서 수업 복습에 유용합니다.
- 퀴즈 생성: 강의 내용을 기반으로 AI가 자동으로 문제를 만들어, 복습과 시험 대비에 활용할 수 있습니다.
- AI 채팅: 강의 내용에 대해 궁금한 점을 AI에게 바로 질문하고 답을 받을 수 있습니다.
- 내보내기 및 공유: 녹취록과 요약을 텍스트나 PDF로 내보내고 공유할 수 있습니다.

■ 이런 분들에게 추천합니다

- 강의를 녹음해두고 필기에 집중하고 싶은 대학생
- 시험 전 요약과 퀴즈로 빠르게 복습하고 싶은 수험생
- 스터디·세미나 내용을 정리하고 나중에 다시 찾아보고 싶은 분

■ 무료 이용 안내

노깡은 별도의 회원가입이나 로그인 없이 바로 사용할 수 있습니다. 매월 일정 시간(월 120분)까지 무료로 음성 인식·요약 기능을 이용할 수 있으며, 한도는 매월 초기화됩니다.

■ 개인정보 보호에 대한 안내

노깡은 회원가입 없이 이용할 수 있는 앱입니다. 녹음 파일과 변환·요약 결과는 기본적으로 이용자의 기기에 저장되며, 앱에서 개별 항목을 삭제하거나 앱을 삭제하면 함께 삭제됩니다. 음성 인식·요약·번역·퀴즈 생성 처리를 위해 음성 및 텍스트 데이터가 처리 목적으로 해외 서버(미국 소재 AssemblyAI, OpenAI)에 전송되며, 자세한 내용은 개인정보처리방침에서 확인하실 수 있습니다. 노깡은 별도의 분석·추적(Analytics/Tracking) SDK를 사용하지 않습니다.

■ 안내

- AI가 생성한 텍스트 변환·요약·번역·퀴즈 결과는 부정확하거나 불완전할 수 있습니다. 시험이나 중요한 용도로 사용하기 전에는 반드시 원본 내용과 비교해 확인해 주세요.
- 타인의 강의나 대화를 녹음할 때는 관련 법령과 학교·기관의 규정을 준수해 주시기 바랍니다.

문의 및 피드백: kdssds03@gmail.com
```
(대략 900자 내외 — 4000자 제한에 충분히 여유)

### 키워드 (Keywords, 최대 100자, 쉼표로 구분, 공백 없이)
```
강의녹음,강의노트,수업녹음,필기,전사,요약,번역,퀴즈,시험공부,대학생,수험생,음성인식,녹음앱,스터디,복습
```
(글자 수: 약 75자. 앱 이름/부제에 이미 들어간 단어는 키워드에서 최대한 중복 제거함)

### 연령 등급 설문 (Age Rating Questionnaire) 답변 가이드

ASC의 새 연령 등급 설문(콘텐츠 설명자 방식)에서, 노깡은 사용자 생성 콘텐츠(녹음·텍스트)나 AI 생성 콘텐츠를 포함하지만 폭력·음란·도박 등 성인 콘텐츠를 앱 자체가 제공하지 않습니다. 아래와 같이 답하세요.

| 항목 | 답변 |
|---|---|
| 만화/판타지 폭력, 사실적 폭력 | 없음 |
| 성적 콘텐츠 또는 나체 | 없음 |
| 욕설 또는 비속어 | 없음 |
| 도박(시뮬레이션 포함) | 없음 |
| 주류·담배·약물 사용/언급 | 없음 |
| 공포/스릴 콘텐츠 | 없음 |
| 의료/치료 정보 | 없음 (강의 요약 도구일 뿐 의료 조언 제공 아님) |
| 미성년자 대상 부적절한 주제 | 없음 |
| 사용자 생성 콘텐츠(User-Generated Content) | 예 — 사용자가 녹음한 음성/텍스트를 처리·저장 (단, 공개 게시·소셜 공유 기능 없음, 이용자 본인 기기 내에만 저장) |
| 제한 없는 웹 접근 | 아니요 |
| 채팅/메시징 기능(타 사용자와) | 아니요 (AI 챗봇과의 1:1 대화만 있으며, 사용자 간 채팅 아님) |

→ 예상 등급: **4+ (전체 이용가)**. 설문상 UGC 항목에 "예"로 표시하더라도 실제 콘텐츠가 사용자 본인만 열람하는 사적 저장물이므로 등급에 영향이 크지 않습니다. 설문 진행 중 화면 문구에 따라 세부 선택이 다를 수 있으니, 위 표를 참고해 그때그때 "없음/아니요"를 우선 선택하세요.

---

## 2. English (U.S.) — 영어(미국) 로컬라이제이션

### App Name (max 30 chars)
```
Nokkang: AI Lecture Notes
```
(26 chars)

### Subtitle (max 30 chars)
```
Record, Summarize, Translate
```
(29 chars)

### Promotional Text (max 170 chars)
```
Record your lecture and let AI transcribe, summarize, translate, and turn it into a quiz. Nokkang helps students study smarter and review faster.
```
(≈148 chars)

### Description (max 4000 chars)
```
Nokkang is an AI-powered lecture notes app that stays with you from the moment you hit record to the moment you're ready for the exam.

Focus on listening in class — let Nokkang handle the note-taking. Once you stop recording, AI transcribes your lecture into text, summarizes the key points, translates it if needed, and even generates a quiz so you can check your understanding.

■ Key Features

- Lecture Recording: Easily record lectures, seminars, and study sessions. Speaker diarization helps you tell who said what in multi-speaker conversations.
- Automatic Transcription (STT): Your recording is automatically converted into text once you finish.
- AI Summary: Long lectures are condensed into structured, easy-to-scan summary notes. You can even customize summary instructions per subject.
- Translation: Translate your transcript or summary into another language — useful for reviewing foreign-language lectures or textbooks.
- Quiz Generation: AI creates quiz questions based on your lecture content, so you can review and prepare for exams.
- AI Chat: Ask questions about your lecture content and get answers directly from AI.
- Export & Share: Export your transcript and summary as text or PDF and share them easily.

■ Who It's For

- College students who want to record lectures and focus on listening instead of writing everything down
- Exam-takers who want to review quickly using summaries and quizzes
- Anyone organizing study group or seminar notes for later reference

■ Free to Use

Nokkang works without any account or sign-up. You get a free monthly allowance (120 minutes) for speech recognition and summarization, which resets each month.

■ A Note on Privacy

Nokkang doesn't require an account. Your recordings, transcripts, and summaries are stored on your device by default, and deleting an item in the app (or deleting the app) removes them. To provide transcription, summarization, translation, and quiz features, audio and text data is sent to processing servers located outside your country (AssemblyAI and OpenAI, both based in the United States). See our Privacy Policy for full details. Nokkang does not use any analytics or tracking SDKs.

■ Please Note

- AI-generated transcripts, summaries, translations, and quizzes may contain errors or omissions. Please verify important content against the original recording before relying on it for exams or other important purposes.
- When recording other people's voices, please make sure you comply with the consent laws and institutional policies that apply to you.

Questions or feedback: kdssds03@gmail.com
```

### Keywords (max 100 chars, comma-separated, no spaces)
```
lecture,notes,recording,transcript,summary,translate,quiz,study,student,exam,voice,transcription
```
(≈97 chars)

### Age Rating Questionnaire — same answers as the Korean section above (no region-specific content).

---

## 3. 스크린샷/아이콘 관련 메모

- 스크린샷 세부 계획은 `release/screenshot-guide.md` 참고.
- 앱 아이콘 1024×1024는 `assets/images/icon.png` 확인 후 업로드(투명 배경/알파 채널 없는지 확인 필요 — ASC는 알파 채널 있는 아이콘을 거부함).

## 4. 제출 전 체크리스트 (메타데이터 관련만)

- [ ] 위 URL 자리 표시자를 실제 GitHub Pages 주소로 교체
- [ ] 앱 내 설정 화면(`app/settings.tsx`)의 개인정보처리방침/이용약관 링크도 동일한 최종 URL로 갱신 (코드 수정 필요 — 이 작업은 별도 진행)
- [ ] "구독", "프리미엄", "결제", "월 이용료" 등 문구가 스토어 자료에 없는지 재확인 (본 문서에는 없음)
- [ ] 과장 문구("최고", "1위", "유일") 없는지 재확인 (본 문서에는 없음)
