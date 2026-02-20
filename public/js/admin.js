import { getCurrentUser, initAuthUI, getIdToken } from "./auth.js";
import { admin } from "./api.js";
import { showModal, showLoadingModal, hideLoadingModal } from "./modal.js";

function showNeedLogin() {
  document.getElementById("needLogin").classList.remove("hidden");
  document.getElementById("adminContent").classList.add("hidden");
}

function showAdmin() {
  document.getElementById("needLogin").classList.add("hidden");
  document.getElementById("adminContent").classList.remove("hidden");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : s;
  return d.innerHTML;
}

function formatDate(v) {
  if (!v) return "-";
  if (v?.toDate) return v.toDate().toLocaleString("ko-KR");
  if (typeof v === "string") return new Date(v).toLocaleString("ko-KR");
  return "-";
}

/** 입력값을 yyyy-mm-dd 형태로 반환 (8자리 YYYYMMDD 또는 이미 구분자 있는 경우) */
function normalizeYmd(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim().replace(/-/g, "");
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const match = str.trim().match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return str.trim();
}

/** 전화번호 하이픈 포맷 (010-1234-5678 등) */
function formatPhoneNumber(str) {
  if (str == null || typeof str !== "string") return "";
  const digits = str.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("010")) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length >= 9 && (digits.startsWith("02") || digits.startsWith("031") || digits.startsWith("032") || digits.startsWith("051") || digits.startsWith("053"))) {
    if (digits.startsWith("02") && digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.startsWith("02") && digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length >= 10) return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  }
  if (digits.length > 0) return digits;
  return str.trim();
}

/** 전화번호에서 숫자만 추출 (저장/비교용) */
function stripPhoneNumber(str) {
  if (str == null || typeof str !== "string") return "";
  return str.replace(/\D/g, "");
}

let commonCodesListenersAttached = false;
let usersPanelListenersAttached = false;
let announcementFormListenerAttached = false;
let selectedTypeCd = null;

// Tabs (기존 통합 페이지에만 있음)
const tabsEl = document.querySelector(".tabs");
if (tabsEl && tabsEl.querySelector("button")) {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const id = "panel-" + btn.dataset.tab;
      const panel = document.getElementById(id);
      if (panel) panel.classList.add("active");
    });
  });
  const firstTab = document.querySelector(".tabs button");
  if (firstTab) firstTab.click();
}

function init() {
  initAuthUI();
  const check = async () => {
    if (!getCurrentUser()) {
      showNeedLogin();
      return;
    }
    showAdmin();

    // 관리자 권한 확인 (상단 메시지로 401/403 원인 안내)
    const checkMsgEl = document.getElementById("adminCheckMessage");
    const showAdminMsg = (text, isError = false) => {
      if (!checkMsgEl) return;
      checkMsgEl.textContent = text;
      checkMsgEl.className = isError ? "alert alert-info" : "alert alert-info";
      checkMsgEl.classList.remove("hidden");
    };
    const hideAdminMsg = () => {
      if (checkMsgEl) checkMsgEl.classList.add("hidden");
    };
    try {
      // 토큰을 먼저 갱신한 뒤 API 호출 (401 방지)
      const token = await getIdToken(true);
      if (!token) {
        showAdminMsg("로그인 토큰을 사용할 수 없습니다. 로그아웃 후 다시 로그인하세요.");
      } else {
        const status = await admin.check();
        const menuCardsEl = document.getElementById("adminMenuCards");
        if (checkMsgEl) {
          if (!status.admin) {
            showAdminMsg("관리자 권한이 없습니다.");
            if (menuCardsEl) menuCardsEl.classList.add("hidden");
          } else {
            hideAdminMsg();
            if (menuCardsEl) menuCardsEl.classList.remove("hidden");
          }
        }
      }
    } catch (e) {
      if (checkMsgEl) {
        const is401 = e.status === 401;
        const hint = e.data?.hint || "";
        const msg = is401
          ? "인증이 필요합니다. " + (hint || "로그아웃 후 다시 로그인하세요.")
          : "권한 확인 실패: " + (e.message || e.data?.error || "");
        showAdminMsg(msg);
      }
      const menuCardsEl = document.getElementById("adminMenuCards");
      if (menuCardsEl) menuCardsEl.classList.add("hidden");
    }

    // 신청 목록 (applications.html 또는 통합 페이지)
    if (document.getElementById("tbody-applications")) {
      try {
        const res = await admin.applications();
        const loadEl = document.getElementById("load-applications");
        if (loadEl) loadEl.classList.add("hidden");
        const items = res.items || [];
        const tbody = document.getElementById("tbody-applications");
        tbody.innerHTML = items
          .map(
            (r) =>
              `<tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.phone)}</td>
          <td>${esc(r.email)}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.status)}</td>
        </tr>`
          )
          .join("");
        const tableEl = document.getElementById("table-applications");
        if (tableEl) tableEl.classList.remove("hidden");
      } catch (e) {
        const loadEl = document.getElementById("load-applications");
        if (loadEl) loadEl.textContent = "오류: " + (e.data?.error || e.message);
      }
    }

    // 사용자 (users.html 또는 통합 페이지)
    if (document.getElementById("tbody-users")) {
    showLoadingModal("조회 중...");
    const loadUsersLookup140 = async () => {
      const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;
      if (!db) return [];
      const now = new Date();
      const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const todayNum = parseInt(today, 10);
      const snap = await db.collection("bo_lookup_value").where("type_cd", "==", "140").get();
      const list = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const start = (data.start_ymd || "").replace(/-/g, "");
        const end = (data.end_ymd || "").replace(/-/g, "");
        const startNum = start.length === 8 ? parseInt(start, 10) : NaN;
        const endNum = end.length === 8 ? parseInt(end, 10) : NaN;
        if (!isNaN(startNum) && !isNaN(endNum) && todayNum >= startNum && todayNum <= endNum) {
          list.push({ value_cd: data.value_cd, value_nm: data.value_nm || "" });
        }
      });
      return list;
    };
    const usersFilterSelect = document.getElementById("users-filter-type");
    const usersFilterName = document.getElementById("users-filter-name");
    const usersFilterPhone = document.getElementById("users-filter-phone");
    const filterUserTypes = (list) => (list || []).filter((o) => o.value_nm === "신청자" || o.value_nm === "관리자");
    if (usersFilterSelect) {
      const opts = filterUserTypes(await loadUsersLookup140());
      usersFilterSelect.innerHTML = '<option value="전체">전체</option>' + opts.map((o) => `<option value="${esc(o.value_cd)}">${esc(o.value_nm)}</option>`).join("");
    }
    const buildUserTypeSelectOptions = (lookupList, selectedValue) => {
      const filtered = filterUserTypes(lookupList || []);
      const options = filtered.map((o) => `<option value="${esc(o.value_cd)}"${String(selectedValue) === String(o.value_cd) ? " selected" : ""}>${esc(o.value_nm)}</option>`).join("");
      return options || '<option value="">선택</option>';
    };
    let usersLookup140Cache = null;
    const getUsersLookup140 = async () => {
      if (usersLookup140Cache) return usersLookup140Cache;
      usersLookup140Cache = filterUserTypes(await loadUsersLookup140());
      return usersLookup140Cache;
    };
    const loadUsersBtnSearch = document.getElementById("users-btn-search");
    const tableUsersWrap = document.getElementById("table-users-wrap");
    const tbodyUsers = document.getElementById("tbody-users");
    const doUsersSearch = async () => {
      if (!tbodyUsers) return;
      showLoadingModal("조회 중...");
      tableUsersWrap.classList.add("hidden");
      try {
        const res = await admin.users({
          name: usersFilterName?.value?.trim() || "",
          phone: usersFilterPhone?.value?.trim() || "",
          userType: usersFilterSelect?.value?.trim() || "전체",
        });
        const items = res.items || [];
        const lookupList = await getUsersLookup140();
        tbodyUsers.innerHTML = items
          .map(
            (r, i) =>
              `<tr data-id="${esc(r.id)}" data-original-phone="${esc(r.Phone)}" data-original-email="${esc(r.eMail)}" data-original-usertype="${esc(r.userType)}">
          <td>${i + 1}</td>
          <td class="cell-readonly">${esc(r.Name)}</td>
          <td><input type="text" class="user-phone" value="${esc(formatPhoneNumber(r.Phone))}" placeholder="010-0000-0000" /></td>
          <td class="cell-readonly user-email">${esc(r.eMail)}</td>
          <td><select class="user-type">${buildUserTypeSelectOptions(lookupList, r.userType)}</select></td>
        </tr>`
          )
          .join("");
        if (items.length === 0) {
          tbodyUsers.innerHTML = '<tr><td colspan="5" class="text-muted">조회 결과가 없습니다.</td></tr>';
        }
        tableUsersWrap.classList.remove("hidden");
      } catch (e) {
        const msg = e.message || e.data?.error || "알 수 없는 오류";
        tableUsersWrap.classList.remove("hidden");
        showModal("오류: " + msg);
      } finally {
        hideLoadingModal();
      }
    };
    if (tbodyUsers && !tbodyUsers.querySelector("tr")) {
      tbodyUsers.innerHTML = '<tr><td colspan="5" class="text-muted">조회 버튼을 눌러 주세요.</td></tr>';
    }
    if (!usersPanelListenersAttached) {
      usersPanelListenersAttached = true;
      loadUsersBtnSearch?.addEventListener("click", doUsersSearch);
      doUsersSearch();
    }
    const saveBtn = document.getElementById("users-btn-save");
    if (saveBtn && !saveBtn._usersSaveBound) {
      saveBtn._usersSaveBound = true;
      saveBtn.addEventListener("click", async () => {
      const rows = tbodyUsers?.querySelectorAll("tr[data-id]");
      if (!rows?.length) {
        showModal("저장할 데이터가 없습니다. 먼저 조회하세요.");
        return;
      }
      const updates = [];
      for (const tr of rows) {
        const id = tr.getAttribute("data-id");
        const origPhone = tr.getAttribute("data-original-phone") ?? "";
        const origType = tr.getAttribute("data-original-usertype") ?? "";
        const phoneRaw = (tr.querySelector(".user-phone")?.value ?? "").trim();
        const phone = stripPhoneNumber(phoneRaw) || phoneRaw;
        const typeVal = tr.querySelector(".user-type")?.value ?? "";
        if (stripPhoneNumber(phone) !== stripPhoneNumber(origPhone) || String(typeVal) !== String(origType)) {
          const email = (tr.getAttribute("data-original-email") ?? "").trim() || (tr.querySelector(".user-email")?.textContent ?? "").trim();
          updates.push({ id, Phone: phone, eMail: email, userType: typeVal });
        }
      }
      if (updates.length === 0) {
        showModal("변경된 항목이 없습니다.");
        return;
      }
      const btn = document.getElementById("users-btn-save");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "저장 중...";
      }
      try {
        for (const u of updates) {
          await admin.userUpdate(u.id, { Phone: u.Phone, eMail: u.eMail, userType: u.userType });
        }
        showModal(updates.length + "건 저장되었습니다.");
        doUsersSearch();
      } catch (e) {
        showModal("저장 실패: " + (e.data?.error || e.message));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "저장";
        }
      }
    });
    }
    const excelBtn = document.getElementById("users-btn-excel");
    if (excelBtn && !excelBtn._usersExcelBound) {
      excelBtn._usersExcelBound = true;
      excelBtn.addEventListener("click", () => {
      const rows = tbodyUsers?.querySelectorAll("tr[data-id]");
      if (!rows?.length) {
        showModal("다운로드할 데이터가 없습니다. 먼저 조회하세요.");
        return;
      }
      const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const bodyRows = [];
      rows.forEach((tr, i) => {
        const nameCell = tr.querySelector("td.cell-readonly") || tr.cells[1];
        const name = (nameCell?.textContent ?? "").trim();
        const phoneRaw = (tr.querySelector(".user-phone")?.value ?? "").trim();
        const phone = formatPhoneNumber(phoneRaw) || phoneRaw;
        const email = (tr.querySelector(".user-email")?.textContent ?? "").trim();
        const typeSelect = tr.querySelector(".user-type");
        const typeText = typeSelect?.selectedOptions?.[0]?.text ?? "";
        bodyRows.push(
          "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(name) + "</td><td style=\"mso-number-format:'\\@'\">" + escapeHtml(phone) + "</td><td>" + escapeHtml(email) + "</td><td>" + escapeHtml(typeText) + "</td></tr>"
        );
      });
      const html =
        "<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:x=\"urn:schemas-microsoft-com:office:excel\">\n<head><meta charset=\"UTF-8\"/></head>\n<body>\n<table>\n<thead><tr><th>순서</th><th>성명</th><th>전화번호</th><th>이메일</th><th>유형</th></tr></thead>\n<tbody>\n" +
        bodyRows.join("\n") +
        "\n</tbody>\n</table>\n</body>\n</html>";
      const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "users_" + new Date().toISOString().slice(0, 10) + ".xls";
      a.click();
      URL.revokeObjectURL(a.href);
      });
    }
    }

    // 공고 (announcements.html): 한 건만 유지, update만 사용. 공고시작일/공고종료일/등록마감일 필수, 공지내용 선택
    if (document.getElementById("formAnnouncement")) {
      const ymdToYyyymmdd = (s) => (s && typeof s === "string" ? s.trim().replace(/-/g, "") : "") || "";
      const yyyymmddToYmd = (s) => {
        if (!s || typeof s !== "string") return "";
        const t = s.trim().replace(/-/g, "");
        if (/^\d{8}$/.test(t)) return t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6, 8);
        return s.trim();
      };
      let quillEditor = null;
      let flatpickrStart = null, flatpickrEnd = null, flatpickrDeadline = null;
      let currentAnnouncementId = null;

      if (typeof window.flatpickr !== "undefined") {
        const fpOpt = { locale: "ko", dateFormat: "Y-m-d", allowInput: false };
        const elStart = document.getElementById("announcementStartYmd");
        const elEnd = document.getElementById("announcementEndYmd");
        const elDeadline = document.getElementById("announcementDeadlineYmd");
        if (elStart) flatpickrStart = window.flatpickr(elStart, fpOpt);
        if (elEnd) flatpickrEnd = window.flatpickr(elEnd, fpOpt);
        if (elDeadline) flatpickrDeadline = window.flatpickr(elDeadline, fpOpt);
      }

      if (typeof window.Quill !== "undefined") {
        const el = document.getElementById("quillEditor");
        if (el) {
          if (el.getAttribute("data-quill-inited") === "true" || el.querySelector(".ql-container")) {
            quillEditor = window.Quill.find(el);
          } else {
            el.setAttribute("data-quill-inited", "true");
            quillEditor = new window.Quill(el, {
            theme: "snow",
            modules: {
              toolbar: [
                ["bold", "italic", "underline"],
                [{ header: [1, 2, 3, false] }],
                [{ list: "ordered" }, { list: "bullet" }],
                ["link"],
                ["clean"],
              ],
            },
          });
          }
        }
      }

      // 기존 공고 한 건 로드하여 폼에 채움
      (async () => {
        try {
          const res = await admin.announcements.list();
          const items = res?.items || [];
          const one = items[0];
          if (one) {
            currentAnnouncementId = one.id;
            const setDate = (fp, val) => {
              const ymd = yyyymmddToYmd(val);
              if (ymd && fp) fp.setDate(ymd, false);
            };
            setDate(flatpickrStart, one.start_ymd);
            setDate(flatpickrEnd, one.end_ymd);
            setDate(flatpickrDeadline, one.deadline_ymd);
            if (quillEditor && one.note != null) quillEditor.root.innerHTML = one.note;
          }
        } catch (_) {}
      })();

      if (!announcementFormListenerAttached) {
        announcementFormListenerAttached = true;
        document.getElementById("formAnnouncement").addEventListener("submit", async (e) => {
          e.preventDefault();
          const startYmd = ymdToYyyymmdd(document.getElementById("announcementStartYmd").value);
          const endYmd = ymdToYyyymmdd(document.getElementById("announcementEndYmd").value);
          const deadlineYmd = ymdToYyyymmdd(document.getElementById("announcementDeadlineYmd").value);
          if (!/^\d{8}$/.test(startYmd)) {
            showModal("공고시작일을 입력해 주세요.");
            return;
          }
          if (!/^\d{8}$/.test(endYmd)) {
            showModal("공고종료일을 입력해 주세요.");
            return;
          }
          if (!/^\d{8}$/.test(deadlineYmd)) {
            showModal("등록마감일을 입력해 주세요.");
            return;
          }
          if (!currentAnnouncementId) {
            showModal("등록된 공고가 없습니다. 저장할 수 없습니다.");
            return;
          }
          if (startYmd > endYmd || startYmd > deadlineYmd) {
            showModal("공고시작일은 공고종료일, 등록마감일보다 같거나 이전이어야 합니다.");
            return;
          }
          if (deadlineYmd > endYmd) {
            showModal("등록마감일은 공고종료일보다 같거나 이전이어야 합니다.");
            return;
          }
          const note = quillEditor ? quillEditor.root.innerHTML : (document.getElementById("announcementNote").value || "");
          const payload = { start_ymd: startYmd, end_ymd: endYmd, deadline_ymd: deadlineYmd, note };
          await admin.announcements.update(currentAnnouncementId, payload);
          showModal("저장되었습니다.");
        });
        const btnPreview = document.getElementById("btnAnnouncementPreview");
        if (btnPreview) {
          btnPreview.addEventListener("click", () => {
            const html = quillEditor ? quillEditor.root.innerHTML : (document.getElementById("announcementNote").value || "");
            const overlay = document.createElement("div");
            overlay.className = "app-modal-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.innerHTML =
              '<div class="app-modal-box app-preview-box" style="max-width:800px; max-height:90vh; display:flex; flex-direction:column;">' +
              '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-shrink:0;">' +
              '<p class="app-modal-message" style="margin:0;">공지사항</p>' +
              '<button type="button" class="btn btn-outline">닫기</button></div>' +
              '<div class="app-preview-content" style="flex:1; min-height:0; overflow:auto; padding:1rem; background:var(--color-bg,#1e1e1e); color:var(--color-text,#e6edf3); border:1px solid var(--color-border,#333); border-radius:6px; text-align:left;"></div></div>';
            const contentEl = overlay.querySelector(".app-preview-content");
            contentEl.innerHTML = html || "<p class=\"text-muted\">내용이 없습니다.</p>";
            const closeBtn = overlay.querySelector(".app-preview-box .btn");
            function hide() {
              overlay.classList.remove("is-visible");
              overlay.remove();
            }
            closeBtn.addEventListener("pointerdown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              hide();
            }, { capture: true });
            closeBtn.addEventListener("click", hide);
            overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
            overlay.querySelector(".app-modal-box").addEventListener("click", (e) => e.stopPropagation());
            overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
            document.body.appendChild(overlay);
            overlay.classList.add("is-visible");
          });
        }
      }
    }

    // 공통코드 (common-codes.html 또는 통합 페이지)
    if (document.getElementById("tbody-lookup-types")) {
    const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;

    const loadLookupTypesEl = document.getElementById("load-lookup-types");
    const wrapLookupTypesEl = document.getElementById("wrap-lookup-types");
    const tbodyLookupTypes = document.getElementById("tbody-lookup-types");
    const loadLookupValuesEl = document.getElementById("load-lookup-values");
    const wrapLookupValuesEl = document.getElementById("wrap-lookup-values");
    const tbodyLookupValues = document.getElementById("tbody-lookup-values");

    async function loadLookupTypes() {
      if (!db) {
        if (loadLookupTypesEl) loadLookupTypesEl.textContent = "Firestore를 사용할 수 없습니다.";
        return;
      }
      try {
        if (loadLookupTypesEl) loadLookupTypesEl.textContent = "불러오는 중...";
        const snap = await db.collection("bo_lookup_type").orderBy("type_cd").get();
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (loadLookupTypesEl) loadLookupTypesEl.classList.add("hidden");
        if (wrapLookupTypesEl) wrapLookupTypesEl.classList.remove("hidden");
        if (tbodyLookupTypes) {
          tbodyLookupTypes.innerHTML =
            items.length === 0
              ? '<tr><td colspan="3" class="text-muted">데이터가 없습니다.</td></tr>'
              : items
                  .map(
                    (r) =>
                      `<tr data-type-cd="${esc(r.type_cd)}" class="row-lookup-type">
                <td>${esc(r.type_nm)}</td>
                <td>${esc(r.type_cd)}</td>
                <td><button type="button" class="btn btn-outline btn-edit-lookup-type" data-id="${esc(r.id)}" data-type-cd="${esc(r.type_cd)}" data-type-nm="${esc(r.type_nm)}" title="수정">수정</button></td>
              </tr>`
                  )
                  .join("");
          tbodyLookupTypes.querySelectorAll(".row-lookup-type").forEach((tr) => {
            tr.addEventListener("click", (e) => {
              if (e.target.closest(".btn-edit-lookup-type")) return;
              const typeCd = tr.getAttribute("data-type-cd") || tr.dataset.typeCd || "";
              selectedTypeCd = typeCd;
              tbodyLookupTypes.querySelectorAll(".row-lookup-type").forEach((r) => r.classList.remove("selected"));
              tr.classList.add("selected");
              loadLookupValues();
            });
          });
          tbodyLookupTypes.querySelectorAll(".btn-edit-lookup-type").forEach((b) => {
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              openEditLookupType(b.dataset.id, b.dataset.typeCd, b.dataset.typeNm);
            });
          });
        }
        if (selectedTypeCd) {
          const sel = tbodyLookupTypes?.querySelector(`tr.row-lookup-type[data-type-cd="${esc(selectedTypeCd)}"]`);
          if (sel) {
            tbodyLookupTypes.querySelectorAll(".row-lookup-type").forEach((r) => r.classList.remove("selected"));
            sel.classList.add("selected");
          }
          loadLookupValues();
        }
      } catch (e) {
        if (loadLookupTypesEl) loadLookupTypesEl.textContent = "오류: " + (e.message || String(e));
      }
    }

    async function openAddLookupType() {
      document.getElementById("formBoxEditLookupType").classList.add("hidden");
      const box = document.getElementById("formBoxLookupType");
      const form = document.getElementById("formLookupType");
      const codeInput = form?.querySelector('input[name="type_cd"]');
      if (form) form.reset();
      if (codeInput) {
        codeInput.setAttribute("readonly", "readonly");
        codeInput.style.background = "var(--color-bg)";
      }
      box.classList.remove("hidden");
      if (!db) return;
      try {
        const snap = await db.collection("bo_lookup_type").get();
        const maxCd = snap.docs.reduce((m, d) => {
          const v = d.data().type_cd;
          const n = parseInt(v, 10);
          return Math.max(m, isNaN(n) ? 0 : n);
        }, 0);
        const nextCode = String(maxCd + 10);
        if (codeInput) codeInput.value = nextCode;
      } catch (err) {
        if (codeInput) codeInput.value = "10";
      }
    }
    function closeLookupTypeForms() {
      document.getElementById("formBoxLookupType").classList.add("hidden");
      document.getElementById("formBoxEditLookupType").classList.add("hidden");
    }
    function openEditLookupType(docId, typeCd, typeNm) {
      document.getElementById("formBoxLookupType").classList.add("hidden");
      const form = document.getElementById("formEditLookupType");
      if (form) {
        form.docId.value = docId || "";
        form.type_cd.value = typeCd || "";
        form.type_nm.value = typeNm || "";
      }
      document.getElementById("formBoxEditLookupType").classList.remove("hidden");
    }

    async function loadLookupValues() {
      if (!db) return;
      if (!selectedTypeCd) {
        if (loadLookupValuesEl) loadLookupValuesEl.textContent = "대분류를 선택하세요.";
        if (wrapLookupValuesEl) wrapLookupValuesEl.classList.add("hidden");
        return;
      }
      const typeCdStr = String(selectedTypeCd).trim();
      try {
        if (loadLookupValuesEl) {
          loadLookupValuesEl.textContent = "불러오는 중...";
          loadLookupValuesEl.classList.remove("hidden");
        }
        if (wrapLookupValuesEl) wrapLookupValuesEl.classList.add("hidden");
        let snap = await db.collection("bo_lookup_value").where("type_cd", "==", typeCdStr).orderBy("value_cd").get();
        if (snap.empty && /^\d+$/.test(typeCdStr)) {
          const typeCdNum = parseInt(typeCdStr, 10);
          snap = await db.collection("bo_lookup_value").where("type_cd", "==", typeCdNum).orderBy("value_cd").get();
        }
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (loadLookupValuesEl) loadLookupValuesEl.classList.add("hidden");
        if (wrapLookupValuesEl) wrapLookupValuesEl.classList.remove("hidden");
        if (tbodyLookupValues) {
          tbodyLookupValues.innerHTML =
            items.length === 0
              ? '<tr><td colspan="8" class="text-muted">데이터가 없습니다.</td></tr>'
              : items
                  .map(
                    (r) =>
                      `<tr>
                <td>${esc(r.value_cd)}</td>
                <td>${esc(r.value_nm)}</td>
                <td>${esc(r.value_description)}</td>
                <td>${esc(r.start_ymd)}</td>
                <td>${esc(r.end_ymd)}</td>
                <td><button type="button" class="btn btn-outline btn-edit-lookup-value" data-id="${esc(r.id)}" title="수정">수정</button></td>
                <td><button type="button" class="btn btn-outline btn-delete-lookup-value" data-id="${esc(r.id)}" title="삭제">삭제</button></td>
              </tr>`
                  )
                  .join("");
          tbodyLookupValues.querySelectorAll(".btn-edit-lookup-value").forEach((b) => {
            b.addEventListener("click", () => openEditLookupValue(b.dataset.id, items.find((x) => x.id === b.dataset.id)));
          });
          tbodyLookupValues.querySelectorAll(".btn-delete-lookup-value").forEach((b) => {
            b.addEventListener("click", async () => {
              if (!confirm("삭제할까요?")) return;
              try {
                await db.collection("bo_lookup_value").doc(b.dataset.id).delete();
                loadLookupValues();
              } catch (err) {
                showModal("삭제 실패: " + (err.message || String(err)));
              }
            });
          });
        }
      } catch (e) {
        if (loadLookupValuesEl) loadLookupValuesEl.textContent = "오류: " + (e.message || String(e));
      }
    }

    async function openAddLookupValue() {
      if (!selectedTypeCd) {
        showModal("대분류를 먼저 선택하세요.");
        return;
      }
      document.getElementById("formBoxEditLookupValue").classList.add("hidden");
      const form = document.getElementById("formLookupValue");
      const codeInput = form?.querySelector('[name="value_cd"]');
      if (form) form.reset();
      if (codeInput) {
        codeInput.setAttribute("readonly", "readonly");
        codeInput.style.background = "var(--color-bg)";
      }
      document.getElementById("formBoxLookupValue").classList.remove("hidden");
      if (!db) return;
      try {
        const snap = await db.collection("bo_lookup_value").where("type_cd", "==", selectedTypeCd).get();
        const maxCd = snap.docs.reduce((m, d) => {
          const v = d.data().value_cd;
          const n = parseInt(v, 10);
          return Math.max(m, isNaN(n) ? 0 : n);
        }, 0);
        const nextCode = String(maxCd + 100);
        if (codeInput) codeInput.value = nextCode;
      } catch (err) {
        if (codeInput) codeInput.value = "100";
      }
    }
    function closeLookupValueForms() {
      document.getElementById("formBoxLookupValue").classList.add("hidden");
      document.getElementById("formBoxEditLookupValue").classList.add("hidden");
    }
    function openEditLookupValue(docId, row) {
      if (!row) return;
      document.getElementById("formBoxLookupValue").classList.add("hidden");
      const form = document.getElementById("formEditLookupValue");
      if (form) {
        form.docId.value = docId || "";
        form.value_cd.value = row.value_cd || "";
        form.value_nm.value = row.value_nm || "";
        form.value_description.value = row.value_description || "";
        form.start_ymd.value = normalizeYmd(row.start_ymd || "") || "";
        form.end_ymd.value = normalizeYmd(row.end_ymd || "") || "";
      }
      document.getElementById("formBoxEditLookupValue").classList.remove("hidden");
    }

    if (!commonCodesListenersAttached) {
      commonCodesListenersAttached = true;
      document.getElementById("btnAddLookupType")?.addEventListener("click", openAddLookupType);
      document.querySelector(".btn-cancel-lookup-type")?.addEventListener("click", closeLookupTypeForms);
      document.querySelector(".btn-cancel-edit-lookup-type")?.addEventListener("click", closeLookupTypeForms);

      document.getElementById("formLookupType")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;
      const typeCd = String(form.type_cd.value).trim();
      const typeNm = String(form.type_nm.value).trim();
      if (!typeNm) {
        showModal("구분을 입력해 주세요.");
        return;
      }
      if (!/^\d+$/.test(typeCd)) {
        showModal("코드는 숫자만 가능합니다.");
        return;
      }
      if (!db) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "저장 중...";
      }
      try {
        const ref = db.collection("bo_lookup_type").doc();
        await ref.set({ type_cd: typeCd, type_nm: typeNm });
        closeLookupTypeForms();
        loadLookupTypes();
      } catch (err) {
        showModal("저장 실패: " + (err.message || String(err)));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "저장";
        }
      }
    });
    document.getElementById("formEditLookupType")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;
      const docId = form.docId.value;
      const typeNm = String(form.type_nm.value).trim();
      if (!typeNm) {
        showModal("구분을 입력해 주세요.");
        return;
      }
      if (!docId || !db) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "저장 중...";
      }
      try {
        await db.collection("bo_lookup_type").doc(docId).update({ type_nm: typeNm });
        closeLookupTypeForms();
        loadLookupTypes();
      } catch (err) {
        showModal("저장 실패: " + (err.message || String(err)));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "저장";
        }
      }
    });

    document.getElementById("btnAddLookupValue")?.addEventListener("click", openAddLookupValue);
    document.querySelector(".btn-cancel-lookup-value")?.addEventListener("click", closeLookupValueForms);
    document.querySelector(".btn-cancel-edit-lookup-value")?.addEventListener("click", closeLookupValueForms);

    document.getElementById("formLookupValue")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;
      const valueCd = String((form.querySelector('[name="value_cd"]')?.value ?? "")).trim();
      const valueNm = String((form.querySelector('[name="value_nm"]')?.value ?? "")).trim();
      const valueDescription = String((form.querySelector('[name="value_description"]')?.value ?? "")).trim();
      const startYmd = normalizeYmd((form.querySelector('[name="start_ymd"]')?.value ?? "")).trim();
      const endYmd = normalizeYmd((form.querySelector('[name="end_ymd"]')?.value ?? "")).trim();
      if (!valueNm) {
        showModal("구분을 입력해 주세요.");
        return;
      }
      if (!startYmd) {
        showModal("시작일을 입력해 주세요.");
        return;
      }
      if (!endYmd) {
        showModal("종료일을 입력해 주세요.");
        return;
      }
      if (!/^\d+$/.test(valueCd)) {
        showModal("코드는 숫자만 가능합니다.");
        return;
      }
      if (!db || !selectedTypeCd) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "저장 중...";
      }
      try {
        const ref = db.collection("bo_lookup_value").doc();
        await ref.set({
          type_cd: selectedTypeCd,
          value_cd: valueCd,
          value_nm: valueNm,
          value_description: valueDescription,
          start_ymd: startYmd,
          end_ymd: endYmd,
        });
        closeLookupValueForms();
        loadLookupValues();
      } catch (err) {
        showModal("저장 실패: " + (err.message || String(err)));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "저장";
        }
      }
    });
    document.getElementById("formEditLookupValue")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;
      const docId = form.docId.value;
      const valueNm = String((form.querySelector('[name="value_nm"]')?.value ?? "")).trim();
      const valueDescription = String((form.querySelector('[name="value_description"]')?.value ?? "")).trim();
      const startYmd = normalizeYmd((form.querySelector('[name="start_ymd"]')?.value ?? "")).trim();
      const endYmd = normalizeYmd((form.querySelector('[name="end_ymd"]')?.value ?? "")).trim();
      if (!valueNm) {
        showModal("구분을 입력해 주세요.");
        return;
      }
      if (!startYmd) {
        showModal("시작일을 입력해 주세요.");
        return;
      }
      if (!endYmd) {
        showModal("종료일을 입력해 주세요.");
        return;
      }
      if (!docId || !db) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "저장 중...";
      }
      try {
        await db.collection("bo_lookup_value").doc(docId).update({
          value_nm: valueNm,
          value_description: valueDescription,
          start_ymd: startYmd,
          end_ymd: endYmd,
        });
        closeLookupValueForms();
        loadLookupValues();
      } catch (err) {
        showModal("저장 실패: " + (err.message || String(err)));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "저장";
        }
      }
    });
    }

    loadLookupTypes();
    }
  };

  setTimeout(check, 500);
  setTimeout(check, 1500);
}

init();
