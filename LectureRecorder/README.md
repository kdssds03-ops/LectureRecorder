LectureRecorder
강의 내용을 더 효율적으로 기록하고 활용할 수 있도록 만든 모바일 앱입니다.
이 앱은 강의 음성을 녹음하고, 녹음 파일을 텍스트로 변환한 뒤, 요약과 번역 기능까지 제공하는 것을 목표로 합니다.

소개
LectureRecorder는 수업이나 발표 내용을 단순히 녹음하는 데서 끝나지 않고,
녹음한 음성을 텍스트로 변환하고 핵심 내용을 정리해 학습에 활용할 수 있도록 돕는 앱입니다.

이 프로젝트는 Expo + React Native + TypeScript 기반으로 개발되었으며,
AI 기능을 통해 음성 인식(STT), 요약, 번역 기능을 제공합니다.

주요 기능
강의 음성 녹음
녹음 파일 저장 및 목록 확인
녹음 파일 재생
음성 텍스트 변환(STT)
강의 내용 요약
번역 기능
설정 화면에서 API Key 관리
기술 스택
Frontend: React Native, Expo
Language: TypeScript
AI / API: AssemblyAI, OpenAI API
Etc: Expo Router
프로젝트 구조
LectureRecorder/
├─ app/                # 앱 화면 및 라우팅
├─ components/         # 공통 UI 컴포넌트
├─ assets/             # 이미지 및 정적 리소스
├─ api/                # AI 서비스 API 관련 코드
├─ hooks/              # 커스텀 훅
├─ constants/          # 상수 및 테마
├─ package.json
└─ README.md
