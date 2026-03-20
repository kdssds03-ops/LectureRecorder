# 🎙️ LectureRecorder

> 강의 내용을 녹음하고, 텍스트로 변환하고, 요약과 번역까지 도와주는 모바일 앱

---

## 📌 Overview

**LectureRecorder**는 강의나 발표 내용을 더 효율적으로 기록하고 복습할 수 있도록 만든 앱입니다.

단순히 음성을 녹음하는 데서 끝나는 것이 아니라,

- 음성을 텍스트로 변환하고
- 핵심 내용을 요약하고
- 필요한 경우 번역까지 할 수 있도록

학습 효율을 높이는 것을 목표로 합니다.

---

## ✨ Features

- 🎤 강의 음성 녹음
- 📂 녹음 파일 저장 및 목록 확인
- ▶️ 녹음 파일 재생
- 📝 음성 텍스트 변환 (STT)
- 📌 강의 내용 요약
- 🌍 번역 기능
- ⚙️ API Key 설정 관리

---

## 🛠 Tech Stack

### Frontend
- React Native
- Expo
- Expo Router

### Language
- TypeScript

### AI / API
- AssemblyAI
- OpenAI API

---

## 📁 Project Structure

```bash
LectureRecorder/
├─ app/                # 앱 화면 및 라우팅
├─ components/         # 공통 UI 컴포넌트
├─ assets/             # 이미지 및 정적 리소스
├─ api/                # AI 서비스 API 관련 코드
├─ hooks/              # 커스텀 훅
├─ constants/          # 상수 및 테마
├─ package.json
└─ README.md
