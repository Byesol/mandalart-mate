# 만다라트 메이트

9×9 목표판, 영역별 실행 목표, 사진 기록을 제공하는 모바일 중심 서비스입니다.

- [웹앱](https://mandalart-mate-goals.aridninja3.chatgpt.site/)
- [Android 테스트 배포](https://github.com/Byesol/mandalart-mate/releases)

## 프로젝트 구조

| 경로 | 내용 |
|---|---|
| `web/` | 웹과 모바일에서 쓰는 목표판 화면 |
| `worker/` · `drizzle/` | 웹 메이트 API와 D1 마이그레이션 |
| `native/` | 앱의 카메라, 시스템 공유, 브라우저 연결 |
| `android/` · `ios/` | Android Studio와 Xcode 프로젝트 |

## 웹 빌드

Node.js 22 이상에서 실행합니다. `dist/`는 현재 Sites 웹 배포의 빌드 결과입니다.

```sh
npm ci
npm run build
```

## Android

JDK 21과 Android SDK 36으로 빌드합니다. Android Studio에 `android/`를 열면 SDK 경로를 설정할 수 있습니다.

```powershell
npm ci
npm run build:android
```

- `artifacts/android/mandalart-mate-debug.apk`는 설치 테스트용 APK입니다.
- `artifacts/android/mandalart-mate-unsigned.aab`는 서명 전의 배포용 번들입니다. Play Console에는 업로드 키로 서명한 번들을 제출합니다.

## iPhone

macOS와 Xcode 26 이상이 필요합니다. Xcode에서 서명 팀을 선택한 뒤 실기기 테스트, Archive, TestFlight 업로드로 진행합니다.

```sh
npm ci
npm run sync:ios
npx cap open ios
```

Android 앱 ID와 iOS 번들 ID는 `io.github.byesol.mandalartmate`입니다.

## 모바일 프리뷰 범위

목표판과 사진은 앱에 저장되며 인터넷 연결 없이 열 수 있습니다. 사진 촬영·선택과 이미지 공유는 기기의 시스템 기능을 이용합니다.

메이트 연결과 친구 소식은 앱의 메이트 탭에서 기존 비공개 웹앱을 엽니다. 앱 안의 메이트 로그인과 데이터 연동, 스토어용 서명 및 제출은 출시 작업으로 남아 있습니다.
