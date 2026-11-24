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

로그인 환경변수가 없는 프리뷰에서는 기존 비공개 웹앱에서 메이트 기능을 이용할 수 있습니다.

## iPhone 빌드

GitHub Actions의 [iPhone app build](https://github.com/Byesol/mandalart-mate/actions/workflows/ios-verify.yml)는 macOS에서 iOS 시뮬레이터 앱을 컴파일합니다. 실제 iPhone 설치에는 Apple Developer 팀 서명과 TestFlight 배포가 필요합니다.

## 앱 로그인 연결

새 목표판은 빈 상태로 시작합니다. 처음 사용하면 중심 목표와 첫 영역을 만드는 두 단계가 열리며, 개인 목표판은 로그인 없이도 이용할 수 있습니다.

앱의 메이트 로그인은 Supabase Auth와 시스템 브라우저의 PKCE 흐름을 사용합니다. 기존 비공개 웹앱은 기존 사이트 로그인과 메이트 데이터를 사용합니다.

1. Supabase Auth에 [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [카카오](https://supabase.com/docs/guides/auth/social-sign-in/auth-kakao), [Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple) 공급자를 설정합니다. 각 공급자에는 대시보드에 표시된 Supabase OAuth 콜백 URL을 등록합니다.
2. Supabase Auth의 Redirect URLs에 `io.github.byesol.mandalartmate://auth/callback`을 등록합니다.
3. 별도 Cloudflare Worker의 D1과 R2를 준비합니다. `wrangler.mobile.example.toml`을 `wrangler.mobile.toml`로 복사한 뒤 Supabase HTTPS 주소, 공개 키, D1 ID와 R2 이름을 넣습니다.

```sh
npm run build:mobile-api
npx wrangler d1 migrations apply DB --remote --config wrangler.mobile.toml
npx wrangler deploy --config wrangler.mobile.toml
```

4. 앱을 빌드할 때 아래 환경변수를 지정합니다. iPhone GitHub Actions에서는 같은 이름의 Repository Variables를 사용합니다.

| 이름 | 값 |
|---|---|
| `MANDALART_SUPABASE_URL` | Supabase HTTPS origin |
| `MANDALART_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_` 공개 키 |
| `MANDALART_MATES_API_URL` | 배포한 모바일 API의 HTTPS origin |

공급자의 클라이언트 시크릿과 Apple 개인 키는 대시보드 서버 설정에 보관합니다. 기기에서 공급자별 로그인, 앱 복귀, 로그아웃과 메이트 공개 범위를 확인한 뒤 스토어 검증을 진행합니다.
