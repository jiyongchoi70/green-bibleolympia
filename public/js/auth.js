/**
 * Firebase Auth 상태 및 로그인/로그아웃
 */
import { firebaseConfig } from "./firebase-config.js";

let auth = null;
let currentUser = null;
const authStateListeners = [];

async function initAuth() {
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK not loaded. Add Firebase script to index.html.");
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateUI(user);
    authStateListeners.forEach((cb) => cb(user));
  });
  return auth;
}

/** 인증 상태가 바뀔 때마다(로그인/로그아웃/복원) 콜백 호출 */
export function addAuthStateListener(callback) {
  authStateListeners.push(callback);
}

function updateUI(user) {
  const emailEl = document.getElementById("userEmail");
  const btnLogout = document.getElementById("btnLogout");
  const btnLogin = document.getElementById("btnLogin");
  if (!emailEl && !btnLogin) return;
  if (user) {
    if (btnLogout) btnLogout.style.display = "inline-block";
    if (btnLogin) btnLogin.style.display = "none";
    const fallback = user.displayName || user.email || user.uid;
    if (emailEl) {
      emailEl.textContent = fallback;
      if (typeof firebase !== "undefined" && firebase.firestore) {
        firebase.firestore().collection("bo_users").doc(user.uid).get().then((doc) => {
          if (doc.exists && doc.data().Name) {
            emailEl.textContent = doc.data().Name;
          }
        }).catch(() => {});
      }
    }
  } else {
    if (emailEl) emailEl.textContent = "";
    if (btnLogout) btnLogout.style.display = "none";
    if (btnLogin) btnLogin.style.display = "inline-block";
  }
}

/** @param {boolean} [forceRefresh] - true면 서버에서 새 토큰을 받아옴(custom claim 갱신 시 필요) */
export async function getIdToken(forceRefresh = false) {
  if (!currentUser) return null;
  return currentUser.getIdToken(forceRefresh);
}

export function getCurrentUser() {
  return currentUser;
}

export function initAuthUI() {
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogin && btnLogin.tagName === "BUTTON") {
    btnLogin.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().signOut().then(() => {
          window.location.href = "/";
        });
      } else {
        window.location.href = "/";
      }
    });
  }
  initAuth();
}
