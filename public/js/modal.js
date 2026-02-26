/**
 * 커스텀 알림 모달 (브라우저 alert 대체)
 * showModal(message) → Promise (확인 클릭 시 resolve)
 */
let overlay = null;

function getOverlay() {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "app-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "app-modal-message");
    overlay.innerHTML =
      '<div class="app-modal-box"><p class="app-modal-message" id="app-modal-message"></p><button type="button" class="app-modal-btn">확인</button></div>';
    document.body.appendChild(overlay);
    const msgEl = overlay.querySelector(".app-modal-message");
    const btn = overlay.querySelector(".app-modal-btn");
    const box = overlay.querySelector(".app-modal-box");
    btn.addEventListener("click", hide);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hide();
    });
    box.addEventListener("click", (e) => e.stopPropagation());
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
      if (e.key === "Enter" && document.activeElement === btn) hide();
    });
    function hide() {
      overlay.classList.remove("is-visible");
      if (overlay._resolve) {
        overlay._resolve();
        overlay._resolve = null;
      }
    }
    overlay._hide = hide;
  }
  return overlay;
}

/**
 * 메시지를 커스텀 모달로 표시. 확인 클릭 시 resolve되는 Promise 반환.
 * @param {string} message
 * @returns {Promise<void>}
 */
export function showModal(message) {
  return new Promise((resolve) => {
    const o = getOverlay();
    o._resolve = resolve;
    const msgEl = o.querySelector(".app-modal-message");
    msgEl.textContent = message != null ? String(message) : "";
    o.classList.add("is-visible");
    o.querySelector(".app-modal-btn").focus();
  });
}

/**
 * 확인/취소 모달 (브라우저 confirm 대체). 확인 시 true, 취소/닫기 시 false.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
let confirmOverlay = null;

function getConfirmOverlay() {
  if (!confirmOverlay) {
    confirmOverlay = document.createElement("div");
    confirmOverlay.className = "app-modal-overlay";
    confirmOverlay.setAttribute("role", "dialog");
    confirmOverlay.setAttribute("aria-modal", "true");
    confirmOverlay.setAttribute("aria-labelledby", "app-confirm-message");
    confirmOverlay.innerHTML =
      '<div class="app-modal-box">' +
      '<p class="app-modal-message" id="app-confirm-message"></p>' +
      '<div class="app-modal-actions">' +
      '<button type="button" class="app-modal-btn app-modal-cancel">취소</button>' +
      '<button type="button" class="app-modal-btn app-modal-confirm">확인</button>' +
      "</div></div>";
    document.body.appendChild(confirmOverlay);
    const box = confirmOverlay.querySelector(".app-modal-box");
    const btnCancel = confirmOverlay.querySelector(".app-modal-cancel");
    const btnConfirm = confirmOverlay.querySelector(".app-modal-confirm");
    function hide(result) {
      confirmOverlay.classList.remove("is-visible");
      if (confirmOverlay._resolve) {
        confirmOverlay._resolve(result);
        confirmOverlay._resolve = null;
      }
    }
    btnCancel.addEventListener("click", () => hide(false));
    btnConfirm.addEventListener("click", () => hide(true));
    confirmOverlay.addEventListener("click", (e) => {
      if (e.target === confirmOverlay) hide(false);
    });
    box.addEventListener("click", (e) => e.stopPropagation());
    confirmOverlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide(false);
    });
  }
  return confirmOverlay;
}

export function showConfirmModal(message) {
  return new Promise((resolve) => {
    const o = getConfirmOverlay();
    o._resolve = resolve;
    const msgEl = o.querySelector("#app-confirm-message");
    if (msgEl) msgEl.textContent = message != null ? String(message) : "";
    o.classList.add("is-visible");
    o.querySelector(".app-modal-cancel").focus();
  });
}

/** 로딩 전용 오버레이 (버튼 없음, 프로그램으로만 닫기) */
let loadingOverlay = null;

function getLoadingOverlay() {
  if (!loadingOverlay) {
    loadingOverlay = document.createElement("div");
    loadingOverlay.className = "app-modal-overlay app-loading-overlay";
    loadingOverlay.setAttribute("role", "status");
    loadingOverlay.setAttribute("aria-live", "polite");
    loadingOverlay.innerHTML = '<div class="app-modal-box"><p class="app-modal-message app-loading-message"></p></div>';
    document.body.appendChild(loadingOverlay);
  }
  return loadingOverlay;
}

/**
 * 로딩 모달 표시 (확인 버튼 없음). hideLoadingModal()로 닫기.
 * @param {string} message
 */
export function showLoadingModal(message) {
  const o = getLoadingOverlay();
  const msgEl = o.querySelector(".app-loading-message");
  if (msgEl) msgEl.textContent = message != null ? String(message) : "";
  o.classList.add("is-visible");
}

/** 로딩 모달 숨김 */
export function hideLoadingModal() {
  if (loadingOverlay) loadingOverlay.classList.remove("is-visible");
}
