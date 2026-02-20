/**
 * 비밀번호 재설정 - 이메일로 재설정 링크 발송
 */
import { firebaseConfig } from "./firebase-config.js";

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

const form = document.getElementById("resetForm");
const emailEl = document.getElementById("email");
const btnSubmit = document.getElementById("btnSubmit");
const authError = document.getElementById("authError");
const authSuccess = document.getElementById("authSuccess");

function showError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
  authSuccess.style.display = "none";
}

function showSuccess(msg) {
  authSuccess.textContent = msg;
  authSuccess.style.display = "block";
  authError.style.display = "none";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  authError.style.display = "none";
  authSuccess.style.display = "none";
  btnSubmit.disabled = true;
  const email = emailEl.value.trim();
  try {
    await auth.sendPasswordResetEmail(email);
    showSuccess("재설정 이메일을 보냈습니다. 이메일을 확인해 주세요.");
  } catch (err) {
    const code = err.code || "";
    if (code === "auth/api-key-not-valid" || (err.message && err.message.includes("api-key-not-valid"))) {
      showError("Firebase 설정이 필요합니다. 사이트 관리자는 Firebase 콘솔에서 웹 앱의 API 키와 App ID를 확인한 뒤 firebase-config.js에 입력해 주세요.");
    } else if (code === "auth/user-not-found") {
      showError("등록되지 않은 이메일입니다.");
    } else if (code === "auth/invalid-email") {
      showError("올바른 이메일을 입력해 주세요.");
    } else {
      showError(err.message || "이메일 전송에 실패했습니다.");
    }
  } finally {
    btnSubmit.disabled = false;
  }
});
