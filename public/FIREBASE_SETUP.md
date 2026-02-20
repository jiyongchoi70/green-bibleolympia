# 회원가입/로그인 오류 시 필요한 설정

`auth/api-key-not-valid` 또는 "Firebase 설정이 필요합니다" 메시지가 나오면 아래 설정을 해주세요.

## 필요한 값 (2가지)

1. **API 키 (apiKey)**  
2. **앱 ID (appId)**

둘 다 Firebase 콘솔에서 복사합니다.

## 설정 방법

1. **Firebase 콘솔 접속**  
   https://console.firebase.google.com/  
   → 프로젝트 **green-bibleolympia** 선택

2. **프로젝트 설정 열기**  
   왼쪽 톱니바퀴(⚙️) **프로젝트 설정** 클릭

3. **일반 탭**  
   아래로 내려가 **내 앱** 영역에서 **웹(</>)** 앱 선택  
   (이미 없으면 **앱 추가** → **웹** 선택 후 앱 등록)

4. **설정값 복사**  
   **SDK 설정 및 구성**에서 다음을 복사:
   - `apiKey` (예: "AIza...")
   - `appId` (예: "1:360742845241:web:...")

5. **프로젝트에 반영**  
   프로젝트 폴더에서 아래 파일을 엽니다.  
   `public/js/firebase-config.js`

   다음 두 곳의 placeholder를 복사한 값으로 바꿉니다.

   ```js
   const firebaseConfig = {
     apiKey: "여기에_API_키_붙여넣기",
     // ...
     appId: "여기에_앱_ID_붙여넣기",
   };
   ```

6. **저장 후 배포**  
   파일 저장 후, Hosting을 다시 배포합니다.

   ```bash
   firebase deploy --only hosting
   ```

이후 회원가입·로그인·비밀번호 재설정이 정상 동작하는지 확인하면 됩니다.
