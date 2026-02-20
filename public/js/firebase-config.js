/**
 * Firebase 클라이언트 설정 (프로젝트: green-bibleolympia)
 *
 * 회원가입/로그인 오류 시 필요한 설정:
 * 1. Firebase 콘솔 → https://console.firebase.google.com/ → 프로젝트 green-bibleolympia
 * 2. ⚙️ 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 선택
 * 3. SDK 설정에서 apiKey, appId 복사 후 아래 YOUR_API_KEY, YOUR_APP_ID 자리에 붙여넣기
 */
const firebaseConfig = {
  apiKey: "AIzaSyCU7L_T38ALdi1exYzHRlLkU38alunNIQs",
  authDomain: "green-bibleolympia.firebaseapp.com",
  projectId: "green-bibleolympia",
  storageBucket: "green-bibleolympia.firebasestorage.app",
  messagingSenderId: "360742845241",
  appId: "1:360742845241:web:413c84931c1cf0472206e8",
  measurementId: "G-F89CPD3YK3",
};

export { firebaseConfig };
