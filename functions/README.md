# Firebase Functions (Python)

## 배포 전 준비 (로컬에서 한 번만)

Functions 배포 시 Firebase CLI가 **함수 목록을 찾기 위해** `functions/venv` 안의 Python을 실행합니다.  
아래 중 한 가지 방법으로 venv를 만들어 두세요.

### 방법 1: 수동으로 venv 생성 (권장)

**PowerShell** 또는 **명령 프롬프트**에서 프로젝트 루트가 아닌 **functions 폴더**에서 실행하세요.

```powershell
cd c:\MyProject\BTA\bible_olympia\functions
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> `python -m venv venv`에서 오류가 나면, Python 설치 시 "Add pip" 옵션이 있는지 확인하거나,  
> 관리자 권한으로 `python -m ensurepip --upgrade` 를 한 번 실행해 보세요.

### 방법 2: predeploy 스크립트 사용

프로젝트 루트에서:

```powershell
cd c:\MyProject\BTA\bible_olympia
node scripts/ensure-functions-venv.js
```

venv가 정상 생성되면, 이후 배포는 그대로 진행하면 됩니다.

## 배포

venv 준비가 끝났으면 프로젝트 루트에서:

```powershell
cd c:\MyProject\BTA\bible_olympia
firebase deploy --only functions
```

> **"spawn EPERM"** 이 나오면:  
> - 터미널을 **관리자 권한**으로 다시 열고 시도하거나  
> - **명령 프롬프트(cmd)** 에서 같은 명령을 실행해 보세요.

## 관리자 권한 부여 ("관리자 권한이 필요합니다" 오류 시)

관리자 페이지(신청 목록, 사용자, 공고, 공통코드)는 **Firebase Auth custom claim** `admin: true` 가 있는 계정만 사용할 수 있습니다.

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 선택 → **프로젝트 설정**(휴지통 옆) → **서비스 계정** 탭
2. **"새 비공개 키 생성"** 클릭 후 JSON 파일 다운로드
3. 다운로드한 파일을 `functions/serviceAccountKey.json` 으로 저장 (파일명이 다르면 해당 이름으로 저장 후 4단계에서 경로 지정)
4. 터미널에서:

```powershell
cd c:\MyProject\BTA\bible_olympia\functions
.\venv\Scripts\Activate.ps1
python set_admin_claim.py jiyong-choi@hanmail.net
```

5. **로그아웃 후 다시 로그인**하면 관리자 메뉴가 동작합니다. (custom claim은 새 토큰에만 반영됩니다)
