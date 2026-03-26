# 🎙️ 노깡 (LectureRecorder)

> 강의 내용을 녹음하고, 실시간으로 전사하고, AI가 강의 종류에 맞게 구조화된 요약을 생성하는 모바일 앱

---

## 📌 Overview

**노깡**은 강의나 발표 내용을 더 효율적으로 기록하고 복습할 수 있도록 만든 앱입니다.

단순히 음성을 녹음하는 데서 끝나는 것이 아니라,

- 녹음 시작 전 **강의 종류를 선택**하여 AI 요약을 최적화하고
- 녹음 중 **30초 단위로 실시간 전사** 내용을 확인하고
- 녹음 완료 후 **강의 종류별 구조화된 AI 요약 노트**를 생성하며
- 필요한 경우 **번역**까지 제공하여

학습 효율을 극대화하는 것을 목표로 합니다.

---

## ✨ Features

- 🎤 강의 음성 녹음 (백그라운드 지원)
- 📚 강의 종류 선택 (수학, 코딩, 인문학, 역사 등 12가지)
- ⏱️ 녹음 중 30초 단위 실시간 전사 표시
- 📂 녹음 파일 폴더별 저장 및 목록 관리
- ▶️ 녹음 파일 재생 (배속 조절 지원)
- 📝 음성 텍스트 변환 (STT, AssemblyAI)
- 🤖 강의 종류별 구조화된 AI 요약 노트 (개요, 핵심 포인트, 키워드, 학습 팁)
- 🌍 번역 기능
- ⚙️ 설정 관리

---

## 🛠 Tech Stack

### Frontend (Mobile App)
- React Native + Expo (SDK 54)
- Expo Router (File-based routing)
- TypeScript
- Zustand (State management)
- expo-av (Audio recording & playback)

### Backend API (`lecture-api/`)
- Node.js + Express
- TypeScript
- AssemblyAI (Speech-to-text)
- OpenAI GPT-4o-mini (Summarization, Translation)

### Deployment
- Mobile: EAS Build (Expo Application Services)
- Backend: Railway (`https://lecturerecorder-production.up.railway.app`)

---

## 📁 Project Structure

```
LectureRecorder/
├── app/                    # 앱 화면 (Expo Router)
│   ├── (tabs)/index.tsx    # 홈 화면 (녹음 목록)
│   ├── record.tsx          # 녹음 화면 (강의 종류 선택 + 실시간 전사)
│   ├── detail/[id].tsx     # 상세 화면 (전사 / 구조화 요약 / 번역)
│   ├── settings.tsx        # 설정 화면
│   └── _layout.tsx         # 루트 레이아웃
├── api/
│   └── aiService.ts        # AI API 클라이언트
├── store/
│   ├── useRecordingStore.ts # 녹음 상태 관리
│   ├── useSettingsStore.ts  # 설정 상태 관리
│   └── useFolderStore.ts   # 폴더 상태 관리
├── lecture-api/            # 백엔드 Express 서버
│   └── src/
│       ├── index.ts        # 서버 엔트리포인트
│       ├── config.ts       # 환경변수 설정
│       └── routes/
│           ├── transcribe.ts  # 음성 인식 API
│           └── summarize.ts   # AI 요약 API
├── components/             # 공통 UI 컴포넌트
├── constants/              # 디자인 시스템 (Colors, theme)
├── assets/                 # 이미지 및 정적 리소스
├── .env                    # 환경변수 (EXPO_PUBLIC_BACKEND_URL)
├── app.json                # Expo 앱 설정
└── eas.json                # EAS 빌드 설정
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)

### Frontend Setup

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npx expo start
```

### Backend Setup

```bash
cd lecture-api

# 의존성 설치
npm install

# 환경변수 설정 (.env 파일 생성)
echo "OPENAI_API_KEY=your_openai_key" > .env
echo "ASSEMBLYAI_API_KEY=your_assemblyai_key" >> .env
echo "APP_SECRET=your_app_secret" >> .env

# 빌드 후 시작
npm run build && npm start

# 또는 개발 모드로 시작
npm run dev
```

### Environment Variables

| 변수명 | 설명 | 위치 |
|--------|------|------|
| `EXPO_PUBLIC_BACKEND_URL` | 백엔드 서버 URL | `.env` (앱) |
| `OPENAI_API_KEY` | OpenAI API 키 | 백엔드 환경변수 |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API 키 | 백엔드 환경변수 |
| `APP_SECRET` | 앱 인증 시크릿 | 백엔드 환경변수 |

---

## 📱 Building for Production

```bash
# iOS 빌드
eas build --platform ios --profile production

# Android 빌드
eas build --platform android --profile production

# App Store 제출
eas submit --platform ios
```

---

## 🗂️ Lecture Types

강의 종류 선택 시 AI가 해당 분야에 최적화된 요약을 생성합니다:

| 아이콘 | 종류 | 특화 요약 항목 |
|--------|------|----------------|
| 📚 | 일반 | 핵심 내용, 주요 포인트 |
| 📐 | 수학 | 공식, 정리, 풀이 방법론 |
| 🔬 | 과학 | 법칙, 실험, 과학적 원리 |
| 💻 | 코딩/프로그래밍 | 알고리즘, 자료구조, 구현 방법 |
| 🧠 | 인문학 | 사상, 논증, 철학적 개념 |
| 🗣️ | 어문학/언어 | 언어 규칙, 문법, 표현 |
| 🏛️ | 역사 | 사건, 연도, 인물, 인과관계 |
| 📊 | 경제/경영 | 이론, 모델, 경제 지표 |
| ⚖️ | 법학 | 법 조항, 판례, 법적 원칙 |
| 🩺 | 의학/생명과학 | 의학 개념, 병리, 치료법 |
| 🎨 | 예술/디자인 | 예술 개념, 기법, 작가 |
| 📝 | 기타 | 일반 요약 |
