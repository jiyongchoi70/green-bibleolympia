/**
 * BTA 로그인 - 이메일/비밀번호
 */
import { firebaseConfig } from "./firebase-config.js";

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// 이미 로그인된 경우 홈으로
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.replace("/");
  }
});

const form = document.getElementById("loginForm");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const togglePw = document.getElementById("togglePw");
const btnSubmit = document.getElementById("btnSubmit");
const authError = document.getElementById("authError");

function showError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
}

function hideError() {
  authError.style.display = "none";
}

togglePw.addEventListener("click", () => {
  const type = passwordEl.type;
  passwordEl.type = type === "password" ? "text" : "password";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  btnSubmit.disabled = true;
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
    window.location.replace("/");
  } catch (err) {
    const code = err.code || "";
    if (code === "auth/api-key-not-valid" || (err.message && err.message.includes("api-key-not-valid"))) {
      showError("Firebase 설정이 필요합니다. 사이트 관리자는 Firebase 콘솔에서 웹 앱의 API 키와 App ID를 확인한 뒤 firebase-config.js에 입력해 주세요.");
    } else if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
      showError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } else if (code === "auth/invalid-email") {
      showError("올바른 이메일을 입력해 주세요.");
    } else {
      showError(err.message || "로그인에 실패했습니다.");
    }
  } finally {
    btnSubmit.disabled = false;
  }
});
