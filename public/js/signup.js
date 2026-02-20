/**
 * 회원가입 - 이메일/비밀번호 + 성명, 전화번호 (Firestore bo_users 저장)
 */
import { firebaseConfig } from "./firebase-config.js";

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// 리다이렉트는 폼 제출 후 bo_users 저장이 끝난 뒤에만 수행 (onAuthStateChanged에서 하면 저장 전에 이탈함)
const form = document.getElementById("signupForm");
const nameEl = document.getElementById("name");
const phoneEl = document.getElementById("phone");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const passwordConfirmEl = document.getElementById("passwordConfirm");
const togglePw = document.getElementById("togglePw");
const togglePwConfirm = document.getElementById("togglePwConfirm");
const btnSubmit = document.getElementById("btnSubmit");
const authError = document.getElementById("authError");

function showError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
}

function hideError() {
  authError.style.display = "none";
}

/** 전화번호: 숫자만 허용, 010-XXXX-XXXX 형식 표시 */
function digitsOnly(str) {
  return (str || "").replace(/\D/g, "");
}
function formatPhoneDisplay(digits) {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
}
function handlePhoneInput(el) {
  const d = digitsOnly(el.value);
  const formatted = formatPhoneDisplay(d);
  if (el.value !== formatted) el.value = formatted;
}

phoneEl.addEventListener("input", () => handlePhoneInput(phoneEl));
phoneEl.addEventListener("blur", () => handlePhoneInput(phoneEl));

togglePw.addEventListener("click", () => {
  passwordEl.type = passwordEl.type === "password" ? "text" : "password";
});
togglePwConfirm.addEventListener("click", () => {
  passwordConfirmEl.type = passwordConfirmEl.type === "password" ? "text" : "password";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  const password = passwordEl.value;
  const passwordConfirm = passwordConfirmEl.value;
  if (password !== passwordConfirm) {
    showError("비밀번호가 일치하지 않습니다.");
    return;
  }
  if (password.length < 6) {
    showError("비밀번호는 6자 이상이어야 합니다.");
    return;
  }
  btnSubmit.disabled = true;
  const email = emailEl.value.trim();
  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCred.user;
    await user.updateProfile({ displayName: name });
    // Firestore bo_users 컬렉션에 회원 정보 저장 (문서 ID = uid)
    const db = firebase.firestore ? firebase.firestore() : null;
    if (db) {
      try {
        const now = new Date();
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        await db.collection("bo_users").doc(user.uid).set({
          Name: name || "",
          userId: user.uid,
          Phone: phone || "",
          userType: "200", // 회원가입 시 신청자(200)
          eMail: email || "",
          emailyn: "200", // 회원가입 시 알림메일유무 기본값(200)
          create_ymd: ymd,
        });
      } catch (boErr) {
        console.error("bo_users 저장 실패:", boErr);
        showError(boErr?.message || "회원 정보 저장에 실패했습니다. 다시 시도해 주세요.");
        btnSubmit.disabled = false;
        return;
      }
    }
    window.location.replace("/");
  } catch (err) {
    const code = err.code || "";
    if (code === "auth/api-key-not-valid" || (err.message && err.message.includes("api-key-not-valid"))) {
      showError("Firebase 설정이 필요합니다. 사이트 관리자는 Firebase 콘솔에서 웹 앱의 API 키와 App ID를 확인한 뒤 firebase-config.js에 입력해 주세요.");
    } else if (code === "auth/email-already-in-use") {
      showError("이미 사용 중인 이메일입니다.");
    } else if (code === "auth/invalid-email") {
      showError("올바른 이메일을 입력해 주세요.");
    } else if (code === "auth/weak-password") {
      showError("비밀번호는 6자 이상이어야 합니다.");
    } else {
      showError(err.message || "회원가입에 실패했습니다.");
    }
  } finally {
    btnSubmit.disabled = false;
  }
});
