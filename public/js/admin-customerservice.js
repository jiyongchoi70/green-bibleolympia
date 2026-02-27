/**
 * C/S 요청 (customerservice.html): 목록, 조회, 추가, 수정, 삭제, 엑셀.
 * 수정/삭제: 작성자만 표시, jiyong-choi@hanmail.net 이면 전체 표시.
 * 접수일/완료일: jiyong-choi@hanmail.net 일 때만 입력 가능.
 */
import { getCurrentUser } from "./auth.js";
import { admin } from "./api.js";
import { showModal, showConfirmModal } from "./modal.js";

const CS_EMAIL_ALL = "jiyong-choi@hanmail.net";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : s;
  return d.innerHTML;
}

function ymdDisplay(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  const s = String(ymd).trim().replace(/-/g, "").slice(0, 8);
  if (s.length !== 8) return "—";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function canEditRow(row, currentUid, currentEmail) {
  if (!row || !currentUid) return false;
  if (currentEmail === CS_EMAIL_ALL) return true;
  return (row.create_user || "").trim() === currentUid;
}

function canEditDates(currentEmail) {
  return currentEmail === CS_EMAIL_ALL;
}

let csListData = [];
let quillCs = null;
let flatpickrStart = null;
let flatpickrEnd = null;
/** 첨부: 등록 시 업로드할 파일 */
let csPendingFiles = [];
/** 수정 시 기존 첨부 목록 (Firestore attachments) */
let csExistingAttachments = [];
/** 수정 시 사용자가 제거한 기존 첨부 URL */
let csRemovedAttachmentUrls = [];
/** 조회 팝업에서 댓글 대상 C/S 문서 id */
let csViewCurrentId = null;

function renderList() {
  const tbody = document.getElementById("csListBody");
  const titleFilter = (document.getElementById("csFilterTitle") || {}).value.trim().toLowerCase();
  const user = getCurrentUser();
  const uid = user ? user.uid : "";
  const email = (user && user.email) ? String(user.email).trim() : "";

  let items = csListData;
  if (titleFilter) {
    items = items.filter((r) => ((r.title || "").toLowerCase().indexOf(titleFilter) >= 0));
  }

  if (!tbody) return;
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">데이터가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map(
      (r, idx) => {
        const showActions = canEditRow(r, uid, email);
        return (
          "<tr data-id=\"" +
          esc(r.id) +
          "\">" +
          "<td>" +
          (idx + 1) +
          "</td>" +
          "<td>" +
          esc(r.customerservice_cd_name || r.customerservice_cd || "—") +
          "</td>" +
          "<td>" +
          (r.comment_count > 0 ? '<span class=\"cs-title-comment-count\">(' + Number(r.comment_count) + ")</span> " : "") +
          '<a href=\"#\" class=\"cs-title-view\" data-id=\"' +
          esc(r.id) +
          "\">" +
          esc(r.title || "—") +
          "</a></td>" +
          "<td>" +
          ymdDisplay(r.create_ymd) +
          "</td>" +
          "<td>" +
          ymdDisplay(r.start_ymd) +
          "</td>" +
          "<td>" +
          ymdDisplay(r.end_ymd) +
          "</td>" +
          "<td>" +
          esc(r.create_user_name || "—") +
          "</td>" +
          "<td>" +
          (showActions ? '<button type="button" class="btn btn-outline btn-cs-edit" data-id="' + esc(r.id) + '">수정</button>' : "—") +
          "</td>" +
          "<td>" +
          (showActions ? '<button type="button" class="btn btn-outline btn-cs-delete" data-id="' + esc(r.id) + '">삭제</button>' : "—") +
          "</td></tr>"
        );
      }
    )
    .join("");

  tbody.querySelectorAll(".btn-cs-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.getAttribute("data-id")));
  });
  tbody.querySelectorAll(".btn-cs-delete").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete(btn.getAttribute("data-id")));
  });
  tbody.querySelectorAll(".cs-title-view").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openView(a.getAttribute("data-id"));
    });
  });
}

async function loadCsViewComments(docId) {
  const listEl = document.getElementById("csViewComments");
  if (!listEl) return;
  try {
    const res = await admin.customerservice.commentsList(docId);
    const items = res?.items || [];
    if (items.length === 0) {
      listEl.innerHTML = "<span class=\"text-muted\">댓글이 없습니다.</span>";
    } else {
      listEl.innerHTML = items
        .map(
          (c) =>
            '<div class="cs-view-comment-item">' +
            '<div class="cs-comment-meta">' +
            esc(c.create_user_name || "—") +
            " " +
            (c.create_ymd ? ymdDisplay(c.create_ymd) + (c.createdAt ? " " + String(c.createdAt).slice(11, 16) : "") : "") +
            "</div>" +
            '<div class="cs-comment-body">' +
            esc((c.content || "").trim()) +
            "</div></div>"
        )
        .join("");
    }
  } catch (e) {
    listEl.innerHTML = "<span class=\"text-muted\">댓글을 불러올 수 없습니다.</span>";
  }
}

function openView(id) {
  const row = csListData.find((r) => r.id === id);
  if (!row) return;
  csViewCurrentId = id;
  const contentsEl = document.getElementById("csViewContents");
  const attachmentsEl = document.getElementById("csViewAttachments");
  if (contentsEl) contentsEl.innerHTML = row.contents || "";
  if (attachmentsEl) {
    const list = row.attachments || [];
    if (list.length === 0) {
      attachmentsEl.innerHTML = "<span class=\"text-muted\">선택된 파일 없음</span>";
    } else {
      attachmentsEl.innerHTML = list
        .map(
          (a) =>
            '<a href="' +
            esc(a.url || "#") +
            '" target="_blank" rel="noopener">' +
            esc(a.name || "첨부") +
            "</a>"
        )
        .join("");
    }
  }
  const commentInput = document.getElementById("csViewCommentInput");
  if (commentInput) commentInput.value = "";
  loadCsViewComments(id);
  document.getElementById("csViewOverlay").classList.remove("hidden");
  document.getElementById("csViewOverlay").classList.add("is-visible");
}

function closeView() {
  csViewCurrentId = null;
  document.getElementById("csViewOverlay").classList.add("hidden");
  document.getElementById("csViewOverlay").classList.remove("is-visible");
}

async function loadList() {
  try {
    const res = await admin.customerservice.list();
    csListData = res?.items || [];
    renderList();
  } catch (e) {
    showModal("목록 조회 실패: " + (e.message || e.data?.error || ""));
  }
}

function safeFileName(name) {
  if (!name || typeof name !== "string") return "file";
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
  return base;
}

function renderCsAttachments() {
  const listEl = document.getElementById("csAttachmentList");
  if (!listEl) return;
  const kept = (csExistingAttachments || []).filter((a) => !(csRemovedAttachmentUrls || []).includes(a.url));
  const parts = [];
  kept.forEach((a) => {
    const name = esc(a.name || "첨부");
    const url = esc(a.url || "#");
    parts.push(
      '<span class="cs-attachment-item" data-url="' + url + '">' +
        '<a href="' + url + '" target="_blank" rel="noopener">' + name + "</a>" +
        '<button type="button" class="cs-attach-remove" title="제거" aria-label="제거">×</button>' +
        "</span>"
    );
  });
  csPendingFiles.forEach((f, i) => {
    const name = esc(f.name || "파일");
    parts.push(
      '<span class="cs-attachment-item cs-attachment-pending" data-pending-index="' + i + '">' +
        name +
        '<button type="button" class="cs-attach-remove" title="제거" aria-label="제거">×</button>' +
        "</span>"
    );
  });
  listEl.innerHTML = parts.join("");
  listEl.querySelectorAll(".cs-attach-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".cs-attachment-item");
      if (item.hasAttribute("data-url")) {
        const u = item.getAttribute("data-url");
        if (u) csRemovedAttachmentUrls.push(u);
      } else {
        const idx = parseInt(item.getAttribute("data-pending-index"), 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < csPendingFiles.length) {
          csPendingFiles.splice(idx, 1);
        }
      }
      renderCsAttachments();
    });
  });
}

/** Firebase Storage에 업로드 후 { name, url } 반환 */
async function uploadCsAttachment(docId, file) {
  if (typeof globalThis.firebase === "undefined" || !globalThis.firebase.storage) {
    throw new Error("Storage를 사용할 수 없습니다.");
  }
  const name = safeFileName(file.name);
  const path = "cs_attachments/" + docId + "/" + Date.now() + "_" + name;
  const ref = globalThis.firebase.storage().ref(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return { name: file.name, url };
}

/** 구분 옵션: type_cd=150, current_date between start_ymd and end_ymd. 저장값은 value_cd 사용 */
async function loadCsFormOptions() {
  const sel = document.getElementById("csFormCd");
  if (!sel || sel.tagName !== "SELECT") return;
  try {
    const res = await admin.lookupOptions("150");
    const options = res?.options || [];
    sel.innerHTML = '<option value="">선택하세요</option>';
    options.forEach((o) => {
      const cd = o.value_cd != null ? String(o.value_cd).trim() : "";
      const nm = (o.value_nm || "").trim();
      if (cd || nm) sel.appendChild(new Option(nm || cd, cd || nm));
    });
  } catch (_) {
    sel.innerHTML = '<option value="">선택하세요</option>';
  }
}

async function openAdd() {
  const user = getCurrentUser();
  const email = user && user.email ? String(user.email).trim() : "";
  await loadCsFormOptions();
  document.getElementById("csFormTitle").textContent = "C/S 요청 등록";
  document.getElementById("csFormId").value = "";
  document.getElementById("csFormCd").value = "";
  document.getElementById("csFormTitleInput").value = "";
  const today = new Date();
  const todayYmd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  document.getElementById("csFormCreateYmd").value = todayYmd;
  document.getElementById("csFormCreateUser").value = "";
  if (quillCs) quillCs.root.innerHTML = "";
  if (user && typeof globalThis.firebase !== "undefined" && globalThis.firebase.firestore) {
    try {
      const db = globalThis.firebase.firestore();
      const bu = await db.collection("bo_users").doc(user.uid).get();
      if (bu.exists) {
        const d = bu.data() || {};
        const name = (d.Name || d.eMail || "").trim();
        document.getElementById("csFormCreateUser").value = name || user.email || "";
      } else {
        document.getElementById("csFormCreateUser").value = user.displayName || user.email || "";
      }
    } catch (_) {
      document.getElementById("csFormCreateUser").value = user.displayName || user.email || "";
    }
  }

  const startEl = document.getElementById("csFormStartYmd");
  const endEl = document.getElementById("csFormEndYmd");
  startEl.value = "";
  endEl.value = "";
  if (canEditDates(email)) {
    startEl.removeAttribute("readonly");
    endEl.removeAttribute("readonly");
    startEl.classList.remove("cs-date-readonly");
    endEl.classList.remove("cs-date-readonly");
    startEl.removeAttribute("tabindex");
    endEl.removeAttribute("tabindex");
    if (flatpickrStart) { flatpickrStart.config.allowInput = true; try { flatpickrStart.enable?.(); } catch (_) {} }
    if (flatpickrEnd) { flatpickrEnd.config.allowInput = true; try { flatpickrEnd.enable?.(); } catch (_) {} }
  } else {
    startEl.setAttribute("readonly", "readonly");
    endEl.setAttribute("readonly", "readonly");
    startEl.classList.add("cs-date-readonly");
    endEl.classList.add("cs-date-readonly");
    startEl.setAttribute("tabindex", "-1");
    endEl.setAttribute("tabindex", "-1");
    if (flatpickrStart) { flatpickrStart.config.allowInput = false; try { flatpickrStart.disable?.(); } catch (_) {} }
    if (flatpickrEnd) { flatpickrEnd.config.allowInput = false; try { flatpickrEnd.disable?.(); } catch (_) {} }
  }

  csPendingFiles = [];
  csExistingAttachments = [];
  csRemovedAttachmentUrls = [];
  const fileInput = document.getElementById("csFormFiles");
  if (fileInput) fileInput.value = "";
  renderCsAttachments();

  document.getElementById("csFormOverlay").classList.remove("hidden");
  document.getElementById("csFormOverlay").classList.add("is-visible");
}

async function openEdit(id) {
  const row = csListData.find((r) => r.id === id);
  if (!row) return;
  const user = getCurrentUser();
  const email = user && user.email ? String(user.email).trim() : "";
  await loadCsFormOptions();
  document.getElementById("csFormTitle").textContent = "C/S 요청 수정";
  document.getElementById("csFormId").value = row.id;
  const cdSel = document.getElementById("csFormCd");
  if (cdSel) {
    const stored = (row.customerservice_cd || "").trim();
    cdSel.value = stored;
    if (stored && cdSel.value !== stored) {
      const opt = Array.from(cdSel.options).find((o) => o.textContent.trim() === stored);
      if (opt) cdSel.value = opt.value;
    }
  }
  document.getElementById("csFormTitleInput").value = row.title || "";
  document.getElementById("csFormCreateYmd").value = ymdDisplay(row.create_ymd);
  document.getElementById("csFormCreateUser").value = row.create_user_name || "—";
  if (quillCs) quillCs.root.innerHTML = row.contents || "";

  const startEl = document.getElementById("csFormStartYmd");
  const endEl = document.getElementById("csFormEndYmd");
  startEl.value = ymdDisplay(row.start_ymd);
  endEl.value = ymdDisplay(row.end_ymd);
  if (canEditDates(email)) {
    startEl.removeAttribute("readonly");
    endEl.removeAttribute("readonly");
    startEl.classList.remove("cs-date-readonly");
    endEl.classList.remove("cs-date-readonly");
    startEl.removeAttribute("tabindex");
    endEl.removeAttribute("tabindex");
    if (flatpickrStart) {
      flatpickrStart.config.allowInput = true;
      try { flatpickrStart.enable?.(); } catch (_) {}
      flatpickrStart.setDate(startEl.value, false);
    }
    if (flatpickrEnd) {
      flatpickrEnd.config.allowInput = true;
      try { flatpickrEnd.enable?.(); } catch (_) {}
      flatpickrEnd.setDate(endEl.value, false);
    }
  } else {
    startEl.setAttribute("readonly", "readonly");
    endEl.setAttribute("readonly", "readonly");
    startEl.classList.add("cs-date-readonly");
    endEl.classList.add("cs-date-readonly");
    startEl.setAttribute("tabindex", "-1");
    endEl.setAttribute("tabindex", "-1");
    if (flatpickrStart) { flatpickrStart.config.allowInput = false; try { flatpickrStart.disable?.(); } catch (_) {} }
    if (flatpickrEnd) { flatpickrEnd.config.allowInput = false; try { flatpickrEnd.disable?.(); } catch (_) {} }
  }

  csPendingFiles = [];
  csExistingAttachments = Array.isArray(row.attachments) ? row.attachments.slice() : [];
  csRemovedAttachmentUrls = [];
  const fileInput = document.getElementById("csFormFiles");
  if (fileInput) fileInput.value = "";
  renderCsAttachments();

  document.getElementById("csFormOverlay").classList.remove("hidden");
  document.getElementById("csFormOverlay").classList.add("is-visible");
}

function closeForm() {
  document.getElementById("csFormOverlay").classList.add("hidden");
  document.getElementById("csFormOverlay").classList.remove("is-visible");
}

function ymdToYyyymmdd(val) {
  if (!val || typeof val !== "string") return "";
  return String(val).trim().replace(/-/g, "").slice(0, 8);
}

async function confirmDelete(id) {
  const ok = await showConfirmModal("이 C/S 요청을 삭제하시겠습니까?");
  if (!ok) return;
  try {
    await admin.customerservice.delete(id);
    showModal("삭제되었습니다.");
    loadList();
  } catch (e) {
    showModal("삭제 실패: " + (e.message || e.data?.error || ""));
  }
}

function downloadExcel() {
  const titleFilter = (document.getElementById("csFilterTitle") || {}).value.trim().toLowerCase();
  let items = csListData;
  if (titleFilter) items = items.filter((r) => (r.title || "").toLowerCase().indexOf(titleFilter) >= 0);
  const headers = ["순서", "구분", "제목", "제출일", "접수일", "완료일", "작성자"];
  const rows = items.map((r, i) => [
    i + 1,
    r.customerservice_cd_name || r.customerservice_cd || "",
    (r.title || "").replace(/"/g, '""'),
    ymdDisplay(r.create_ymd),
    ymdDisplay(r.start_ymd),
    ymdDisplay(r.end_ymd),
    (r.create_user_name || "").replace(/"/g, '""'),
  ]);
  const csv = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.map((c) => '"' + c + '"').join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "CS요청목록.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function initCsPage() {
  const tbody = document.getElementById("csListBody");
  if (!tbody) return;

  if (typeof window.Quill !== "undefined") {
    const el = document.getElementById("csQuillEditor");
    if (el && !el.querySelector(".ql-container")) {
      quillCs = new window.Quill(el, {
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

  const user = getCurrentUser();
  const email = user && user.email ? String(user.email).trim() : "";
  if (typeof window.flatpickr !== "undefined") {
    const fpOpt = { locale: "ko", dateFormat: "Y-m-d", allowInput: canEditDates(email) };
    const startEl = document.getElementById("csFormStartYmd");
    const endEl = document.getElementById("csFormEndYmd");
    if (startEl) flatpickrStart = window.flatpickr(startEl, fpOpt);
    if (endEl) flatpickrEnd = window.flatpickr(endEl, fpOpt);
    if (!canEditDates(email)) {
      if (startEl) { startEl.setAttribute("readonly", "readonly"); startEl.classList.add("cs-date-readonly"); startEl.setAttribute("tabindex", "-1"); }
      if (endEl) { endEl.setAttribute("readonly", "readonly"); endEl.classList.add("cs-date-readonly"); endEl.setAttribute("tabindex", "-1"); }
    }
  }

  document.getElementById("csBtnSearch")?.addEventListener("click", () => renderList());
  document.getElementById("csBtnExcel")?.addEventListener("click", downloadExcel);
  document.getElementById("csBtnAdd")?.addEventListener("click", openAdd);
  document.getElementById("csFormFiles")?.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files && files.length) {
      for (let i = 0; i < files.length; i++) csPendingFiles.push(files[i]);
      e.target.value = "";
      renderCsAttachments();
    }
  });
  document.getElementById("csViewClose")?.addEventListener("click", closeView);
  document.getElementById("csViewCommentSave")?.addEventListener("click", async () => {
    const docId = csViewCurrentId;
    const input = document.getElementById("csViewCommentInput");
    const content = (input?.value || "").trim();
    if (!docId) return;
    if (!content) {
      showModal("댓글을 입력하세요.");
      return;
    }
    const btn = document.getElementById("csViewCommentSave");
    if (btn) btn.disabled = true;
    try {
      await admin.customerservice.commentCreate(docId, { content });
      if (input) input.value = "";
      await loadCsViewComments(docId);
      showModal("댓글이 저장되었습니다.");
    } catch (e) {
      showModal("댓글 저장 실패: " + (e.message || e.data?.error || ""));
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  document.getElementById("csViewOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "csViewOverlay") closeView();
  });
  document.getElementById("csViewOverlay")?.querySelector(".app-modal-box")?.addEventListener("click", (e) => e.stopPropagation());
  document.getElementById("csFormClose")?.addEventListener("click", closeForm);
  document.getElementById("csFormCancel")?.addEventListener("click", closeForm);
  document.getElementById("csFormOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "csFormOverlay") closeForm();
  });
  document.getElementById("csFormOverlay")?.querySelector(".app-modal-box")?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.getElementById("csViewOverlay")?.classList.contains("is-visible")) closeView();
      else if (document.getElementById("csFormOverlay")?.classList.contains("is-visible")) closeForm();
    }
  });
  document.getElementById("csForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("csFormSubmit");
    const id = document.getElementById("csFormId").value.trim();
    const customerserviceCd = document.getElementById("csFormCd").value.trim();
    const title = document.getElementById("csFormTitleInput").value.trim();
    const contentsHtml = quillCs ? quillCs.root.innerHTML : "";
    const contentsText = (() => {
      if (!contentsHtml) return "";
      const div = document.createElement("div");
      div.innerHTML = contentsHtml;
      return (div.textContent || div.innerText || "").trim();
    })();

    if (!customerserviceCd) {
      showModal("구분을 선택하세요.");
      return;
    }
    if (!title) {
      showModal("제목을 입력하세요.");
      return;
    }
    if (!contentsText) {
      showModal("내용을 입력하세요.");
      return;
    }

    const progressWrap = document.getElementById("csFormProgressWrap");
    if (progressWrap) {
      progressWrap.classList.remove("hidden");
      progressWrap.setAttribute("aria-hidden", "false");
    }
    if (submitBtn) submitBtn.disabled = true;
    const payload = {
      customerservice_cd: customerserviceCd,
      title,
      contents: contentsHtml,
      start_ymd: ymdToYyyymmdd(document.getElementById("csFormStartYmd").value),
      end_ymd: ymdToYyyymmdd(document.getElementById("csFormEndYmd").value),
    };
    if (canEditDates((getCurrentUser() || {}).email)) {
      if (payload.start_ymd) payload.start_ymd = payload.start_ymd;
      if (payload.end_ymd) payload.end_ymd = payload.end_ymd;
    }
    try {
      let docId = id;
      if (docId) {
        const uploaded = [];
        for (const file of csPendingFiles) {
          const one = await uploadCsAttachment(docId, file);
          uploaded.push(one);
        }
        const kept = (csExistingAttachments || []).filter((a) => !(csRemovedAttachmentUrls || []).includes(a.url));
        payload.attachments = kept.concat(uploaded);
        await admin.customerservice.update(docId, payload);
        showModal("수정되었습니다.");
      } else {
        const created = await admin.customerservice.create(payload);
        docId = created?.id;
        if (docId && csPendingFiles.length > 0) {
          const uploaded = [];
          for (const file of csPendingFiles) {
            const one = await uploadCsAttachment(docId, file);
            uploaded.push(one);
          }
          await admin.customerservice.update(docId, { attachments: uploaded });
        }
        showModal("등록되었습니다.");
      }
      closeForm();
      loadList();
    } catch (err) {
      showModal("저장 실패: " + (err.message || err.data?.error || ""));
    } finally {
      if (progressWrap) {
        progressWrap.classList.add("hidden");
        progressWrap.setAttribute("aria-hidden", "true");
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  loadList();
}

if (document.getElementById("csListBody")) {
  const checkThenInit = () => {
    if (document.getElementById("adminContent") && !document.getElementById("adminContent").classList.contains("hidden")) {
      initCsPage();
    } else {
      setTimeout(checkThenInit, 200);
    }
  };
  setTimeout(checkThenInit, 300);
}
