# 전국 바이블 올림피아드

Python + Firebase Hosting + Firestore 기반 웹 애플리케이션입니다.

## 기능 구성

| 구분 | 기능 | 설명 |
|------|------|------|
| **신청** | 신청서 | 참가 신청서 작성 및 제출 |
| **신청** | 신청현황 | 제출한 신청서 목록 및 상태 확인 |
| **관리자** | 사용자 | 가입 사용자 목록 조회 |
| **관리자** | 공고내용 | 공고 등록/수정/삭제 |
| **관리자** | 공통코드 | 공통 코드(참가부문 등) 관리 |

## 프로젝트 구조

```
bible_olympia/
├── firebase.json          # Firebase 설정 (Hosting, Functions, Firestore)
├── .firebaserc             # 프로젝트 ID (배포 전 수정)
├── firestore.rules         # Firestore 보안 규칙
├── firestore.indexes.json  # Firestore 인덱스
├── functions/              # Python Cloud Functions (API)
│   ├── main.py
│   └── requirements.txt
└── public/                 # 정적 사이트 (Firebase Hosting)
    ├── index.html
    ├── login.html          # BTA 로그인 (이메일/비밀번호)
    ├── signup.html         # 회원가입
    ├── password-reset.html # 비밀번호 재설정
    ├── apply.html          # 신청서
    ├── status.html         # 신청현황
    ├── admin/              # 관리자
    ├── css/
    │   ├── style.css
    │   └── auth.css        # 로그인/회원가입/비밀번호재설정 스타일
    └── js/
```

## 사전 요구 사항

- Node.js (Firebase CLI용)
- Python 3.11+
- Firebase 프로젝트

## 설정 방법

### 1. Firebase 프로젝트 (green-bibleolympia)

- 프로젝트 ID `green-bibleolympia` 기준으로 `.firebaserc` 및 `firebase-config.js`의 projectId/authDomain/storageBucket/messagingSenderId가 설정되어 있습니다.
- **Authentication** 사용 설정 후, **이메일/비밀번호** 로그인 방법을 활성화하세요. (로그인·회원가입·비밀번호 재설정에 사용)
- **Firestore Database** 생성
- **Hosting** 설정은 배포 시 자동 적용

### 2. 프론트엔드 Firebase 설정

`public/js/firebase-config.js`에 Firebase Console > 프로젝트 설정 > 일반 > 내 앱(웹)에서 **apiKey**, **appId**를 복사해 넣습니다. (projectId 등은 이미 반영됨)

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};
```

### 3. 관리자 권한 부여

관리자 메뉴 접근은 Firebase Auth **Custom Claims**로 제어합니다.

- Firebase Console > Authentication > 사용자에서 UID 확인
- Firebase Admin SDK로 해당 UID에 `admin: true` claim 설정  
  (예: Cloud Shell 또는 로컬 스크립트에서 `auth.set_custom_user_claims(uid, {'admin': True})` 실행)

## 로컬 실행

### Hosting(프론트엔드)만 로컬에서 보기

```bash
npm install -g firebase-tools
firebase login
firebase serve
```

브라우저에서 `http://localhost:5000` 접속. (API는 배포된 Cloud Functions를 쓰거나, 아래처럼 로컬 함수 실행 필요)

### Python Functions 로컬 실행 (선택)

```bash
cd functions
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
# Firebase Request/Response 호환 서버 (예: functions-framework)
pip install functions-framework
functions-framework --target=olympia_api --port=8080
```

Hosting 프록시를 로컬 함수로 쓰려면 `firebase.json`의 rewrites를 로컬 URL로 바꾸거나, 프론트엔드에서 `API_BASE`를 `http://localhost:8080`으로 두고 테스트할 수 있습니다.

## 배포

```bash
firebase login
firebase use default
firebase deploy
```

- **Hosting**: `public/` 디렉터리가 배포됩니다.
- **Functions**: `functions/`의 Python 코드가 Cloud Functions(2nd gen)로 배포됩니다.
- **Firestore**: 규칙과 인덱스가 배포됩니다.

배포 후 Hosting URL은 Firebase Console > Hosting 또는 `firebase deploy` 출력에서 확인할 수 있습니다.

**관리자 화면에서 "API 서버를 찾을 수 없습니다(404)"가 나오는 경우**  
관리자 API는 Cloud Function `olympia_api`로 연결됩니다. Hosting만 배포하고 Functions를 배포하지 않으면 404가 발생합니다. 다음으로 **Functions를 배포**하세요.

```bash
firebase deploy --only functions
```

전체 배포는 `firebase deploy`, Functions만 배포는 `firebase deploy --only functions`입니다.

### 일배치 메일 (지원현황)

매일 **08:00 KST**에 `userType='100'`인 사용자(bo_users)의 이메일(eMail)로 **지원현황** 메일이 발송됩니다.  
발송에는 **Resend** API를 사용합니다.

**준비 사항**

1. [Resend](https://resend.com) 가입 후 API Key 발급.
2. 발송용 도메인 추가 및 DNS 인증 (Resend 대시보드 안내 따름).
3. Cloud Functions 환경 변수 설정:
   - Google Cloud Console → Cloud Functions → `daily_report_email` 함수 → 편집 → 환경 변수
   - 또는 터미널:  
     `firebase functions:secrets:set RESEND_API_KEY` (값 입력)  
     그 다음 코드에서 `define_secret`로 읽도록 변경 가능.  
   - **간단한 방법**: Cloud Console에서 해당 함수에 다음 변수 추가  
     - `RESEND_API_KEY`: Resend API 키  
     - `RESEND_FROM_EMAIL`: 발신 주소 (예: `bible-olympia@geentree.org`, 반드시 Resend에서 인증한 도메인)

수신자: `bo_users` 컬렉션에서 `userType == '100'`인 문서의 `eMail`.  
제목: `전국 바이블 올림피이드 대회 지원현황 입니다.`  
본문: 당일 날짜(YYYYMMDD) 및 전체 지원자·실제 참여자·입금 확인자·전일 신청자·환불요청자·환불지급자 인원 수.

## API 개요 (Python Cloud Functions)

- `GET/POST /api/applications` — 신청 목록 조회, 신청서 제출 (인증 필요)
- `GET /api/applications/:id` — 신청서 단건 조회
- `GET /api/announcements` — 공고 목록 (공개)
- `GET /api/common-codes` — 공통코드 목록 (쿼리: `?group=...`)
- `GET /api/admin/applications` — 관리자 신청 목록
- `GET /api/admin/users` — 관리자 사용자 목록
- `GET/POST /api/admin/announcements` — 공고 목록/등록
- `PUT/DELETE /api/admin/announcements/:id` — 공고 수정/삭제
- `GET/POST /api/admin/common-codes` — 공통코드 목록/추가
- `PUT/DELETE /api/admin/common-codes/:id` — 공통코드 수정/삭제

관리자 API는 Firebase ID 토큰의 custom claim `admin: true`가 있을 때만 사용 가능합니다.

## Git 원격 저장소 (터미널)

Cursor UI 대신 **터미널**에서 원격을 등록하려면 아래 중 하나를 사용하세요.

### 방법 1: 스크립트 실행 (권장)

프로젝트 폴더에서 터미널을 연 뒤:

**PowerShell**
```powershell
cd c:\MyProject\BTA\bible_olympia
.\scripts\git-remote-add.ps1
```

**명령 프롬프트(cmd)**
```cmd
cd c:\MyProject\BTA\bible_olympia
scripts\git-remote-add.bat
```

- 기존 `origin`이 있으면 제거한 뒤, `https://github.com/jiyongchoi70/green-bibleolympia.git` 로 다시 등록합니다.

### 방법 2: 명령어 직접 입력

```bash
cd c:\MyProject\BTA\bible_olympia
git remote remove origin
git remote add origin https://github.com/jiyongchoi70/green-bibleolympia.git
git remote -v
```

- **원격 이름**은 반드시 `origin`, **URL**은 위 주소 그대로 입력해야 합니다. (이름 자리에 URL을 넣으면 오류가 납니다.)

## 라이선스

© 전국 바이블 올림피아드




## 추가사항
  1. github 추가
  2. 사용자(권한부여) 화면
     1) 전화번호 등록 css수정
  3. 공통코드 
     1) 중분류
        가. 시작일, 종료일 날짜 type으로 변경필요
        