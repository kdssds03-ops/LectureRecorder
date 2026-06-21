# 온디바이스 STT 마이그레이션 계획 (노깡)

> 목적: 음성→텍스트(STT)를 클라우드(AssemblyAI)에서 **기기 내 실행**으로 옮겨, ALT처럼 한계비용 0(무료·무제한·오프라인·프라이버시)을 달성. 이것이 장기 생존의 핵심 레버입니다.

## 왜 (비용 구조)
- 현재 비용의 대부분은 STT(약 $0.15~0.21/시간). GPT 기능은 사실상 공짜.
- 온디바이스로 옮기면 STT 한계비용이 0 → 무료·무제한 제공 가능, 서버·rate limit·사용량 강제도 대부분 불필요.

## 현재 준비된 것 (이번 작업)
- `api/sttProvider.ts` 에 **STT provider seam** 추가. 모든 전사를 `getSttProvider()`로 통하게 하면, 엔진 교체 시 UI 코드 변경 0.
- 현재는 `cloudSttProvider`(AssemblyAI) 반환. 온디바이스 구현 후 `getSttProvider()`만 바꾸면 됨.

## 기술 선택지
1. **whisper.rn** (whisper.cpp 래퍼, RN/Expo) — 가장 현실적. iOS/Android 모두. Core ML/Metal 가속(iOS), ggml 모델.
   - 모델: `tiny`(~75MB, 빠름/정확도↓), `base`(~140MB), `small`(~460MB, 한국어 쓸 만함).
   - 한국어 정확도를 위해 최소 `small` 권장 → 앱 용량/RAM 부담.
2. **Apple Speech (SFSpeechRecognizer)** — iOS 내장, 무료, 온디바이스 모드 지원. 단 언어/길이 제약, 안드로이드 미지원.
3. **자체 최적화 엔진**(ALT의 Lightning-SimulWhisper 방식) — 최고 성능이지만 개발 난이도 매우 높음(별도 R&D).

권장 경로: **whisper.rn + small 모델**로 시작(실시간은 streaming/슬라이딩 윈도우), iOS는 Apple Speech 병행 검토.

## 단계별 작업
1. **개발 빌드 전환**: whisper.rn은 네이티브 모듈 → Expo Go 불가. EAS development build 필요.
2. **모델 번들/다운로드**: 앱에 동봉(용량↑) 또는 최초 실행 시 다운로드(권장). 다운로드 UI/진행률/저장 관리.
3. **온디바이스 provider 구현**: `onDeviceSttProvider`가 `SttProvider` 인터페이스 충족.
   - `transcribeChunk`: 30초 청크 실시간 처리(스트리밍).
   - `transcribeFile`: 전체 파일 배치 처리.
4. **`getSttProvider()` 스위치**: 기기 성능/모델 존재 여부에 따라 온디바이스 또는 클라우드 폴백.
5. **성능 튜닝**: 백그라운드 스레드, 배터리/발열, 저사양 기기 폴백 정책.
6. **요금제 재설계**: 온디바이스가 기본이면 무료·무제한 가능 → 프리미엄은 "클라우드 고정밀 모델/화자분리/요약 고급" 등 부가가치로 차별화.

## 리스크/트레이드오프
- **정확도**: 기기 small 모델 < AssemblyAI. 한국어 특히 체감 차이 가능.
- **속도/발열/배터리**: 저사양 기기에서 실시간 부담.
- **앱 용량/RAM**: 모델 수백 MB, 메모리 관리 필요(ALT가 가장 공들인 부분).
- **유지보수**: 네이티브 빌드·모델 업데이트 파이프라인.

## 권장 우선순위
1. 단기: 클라우드 유지 + (이번에 한) 분 단위 한도·서버 강제로 비용 통제.
2. 중기: iOS에서 Apple Speech 온디바이스 모드 실험(무료, 쉬움)으로 무료 티어 비용 절감.
3. 장기: whisper.rn small 도입 → 무료·무제한 포지셔닝으로 전환.

> 결론: 온디바이스는 "할 수 있나"보다 "정확도/성능/용량을 감당하면서 유지보수할 수 있나"의 문제입니다. seam이 준비됐으니, 개발 빌드 환경에서 whisper.rn PoC부터 시작하길 권장합니다.
