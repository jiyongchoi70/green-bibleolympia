import { getCurrentUser, initAuthUI, addAuthStateListener } from "./auth.js";
import { getLookupValueList } from "./lookup.js";
import { showModal } from "./modal.js";
import { initApplicationPeriodGuard } from "./application-period-guard.js";
import { announcements } from "./api.js";

initApplicationPeriodGuard();

/** 오늘 날짜 YYYYMMDD */
function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 공고 중 오늘(date)이 deadline_ymd 이전이거나 같은 경우가 하나라도 있으면 true */
function isWithinDeadline(items) {
  const today = todayYmd();
  return (items || []).some((a) => {
    const deadline = a.deadline_ymd != null ? String(a.deadline_ymd).trim().replace(/-/g, "").slice(0, 8) : "";
    return deadline.length === 8 && today <= deadline;
  });
}

/** deadline_ymd(YYYYMMDD 또는 YYYY-MM-DD)를 yyyy-mm-dd 형식으로 반환 */
function formatDeadlineYmd(deadline_ymd) {
  if (deadline_ymd == null) return "";
  const s = String(deadline_ymd).trim().replace(/-/g, "").slice(0, 8);
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 공고 목록에서 표시용 마감일 하나 반환 (아직 마감 전인 것 중 가장 늦은 날짜, 없으면 첫 항목) */
function getDisplayDeadline(items) {
  const today = todayYmd();
  let best = "";
  (items || []).forEach((a) => {
    const d = a.deadline_ymd != null ? String(a.deadline_ymd).trim().replace(/-/g, "").slice(0, 8) : "";
    if (d.length === 8 && today <= d && (best === "" || d > best)) best = d;
  });
  if (best.length === 8) return formatDeadlineYmd(best);
  const first = (items || [])[0];
  return first ? formatDeadlineYmd(first.deadline_ymd) : "";
}

/** 6. 지원자 제목 및 + 버튼: 등록마감일 표시 / 마감 시 문구(빨간색) 및 + 버튼 숨김 */
function updateApplicantsSectionHeading(items) {
  const labelEl = document.getElementById("labelApplicants");
  const addBtn = document.getElementById("btnAddApplicant");
  if (!labelEl) return;
  const within = isWithinDeadline(items);
  if (within) {
    const displayDate = getDisplayDeadline(items);
    labelEl.textContent = displayDate ? `6. 지원자 (등록마감일 : ${displayDate})` : "6. 지원자";
    if (addBtn) addBtn.classList.remove("hidden");
  } else {
    labelEl.innerHTML = "6. 지원자 (<span class=\"apply-deadline-closed\">등록이 마감 되었습니다.</span>)";
    if (addBtn) addBtn.classList.add("hidden");
  }
}

/** 제출/수정 버튼 영역 표시 여부 (current_date <= deadline_ymd 일 때만 표시) */
function updateSubmitButtonVisibility(items) {
  const formActions = document.querySelector(".form-actions");
  if (!formActions) return;
  const show = isWithinDeadline(items);
  formActions.classList.toggle("hidden", !show);
}

/** 이미 떠 있는 공지사항 팝업 오버레이 제거 (중복 오버레이로 두 번 눌러야 닫히는 현상 방지) */
function removeExistingAnnouncementPopups() {
  document.querySelectorAll(".app-modal-overlay[data-announcement-popup]").forEach((el) => el.remove());
}

/** 공지사항 HTML을 팝업으로 표시 (제목 "공지사항", 닫기/ESC/오버레이로 닫기) */
function showAnnouncementPopup(html) {
  removeExistingAnnouncementPopups();
  const content = html != null && String(html).trim() !== "" ? String(html).trim() : "<p class=\"text-muted\">내용이 없습니다.</p>";
  const overlay = document.createElement("div");
  overlay.className = "app-modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("data-announcement-popup", "true");
  overlay.innerHTML =
    '<div class="app-modal-box app-preview-box" style="max-width:800px; max-height:90vh; display:flex; flex-direction:column;">' +
    '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-shrink:0;">' +
    '<p class="app-modal-message" style="margin:0;">공지사항</p>' +
    '<button type="button" class="btn btn-outline">닫기</button></div>' +
    '<div class="app-preview-content" style="flex:1; min-height:0; overflow:auto; padding:1rem; background:var(--color-bg,#1e1e1e); color:var(--color-text,#e6edf3); border:1px solid var(--color-border,#333); border-radius:6px; text-align:left;"></div></div>';
  const contentEl = overlay.querySelector(".app-preview-content");
  contentEl.innerHTML = content;
  const closeBtn = overlay.querySelector(".app-preview-box .btn");
  let hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    if (overlay.parentNode) overlay.remove();
  }
  // 캡처 단계에서 배경/닫기 버튼 pointerdown 시 즉시 닫기 (한 번에 닫히도록)
  overlay.addEventListener("pointerdown", (e) => {
    const isBackdrop = e.target === overlay;
    const isCloseButton = closeBtn === e.target || closeBtn.contains(e.target);
    if (isBackdrop || isCloseButton) {
      e.preventDefault();
      e.stopPropagation();
      hide();
    }
  }, { capture: true });
  closeBtn.addEventListener("click", (e) => { e.preventDefault(); hide(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  overlay.querySelector(".app-modal-box").addEventListener("click", (e) => e.stopPropagation());
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  document.body.appendChild(overlay);
  overlay.classList.add("is-visible");
}

/** 공고 중 note가 있는 항목이 있으면 공지사항 팝업 표시 */
function showAnnouncementNotePopupIfAny(items) {
  const withNote = (items || []).find((a) => a.note != null && String(a.note).trim() !== "");
  if (!withNote) return;
  showAnnouncementPopup(withNote.note);
}

/** 공통코드 기반 옵션 (응시구분 100, 참가여부 110, 환불요청 120) - 로드 후 채워짐 */
let examTypeLookupOptions = [];
let participationLookupOptions = [];
let refundLookupOptions = [];

function showNeedLogin() {
  document.getElementById("needLogin").classList.remove("hidden");
  const wrap = document.getElementById("applyWrap");
  if (wrap) wrap.classList.add("hidden");
}

function showForm() {
  document.getElementById("needLogin").classList.add("hidden");
  const wrap = document.getElementById("applyWrap");
  if (wrap) wrap.classList.remove("hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById("sectionApplicants")?.classList.remove("apply-section-deferred");
      }, 80);
    });
  });
}

/** 지원자 목록 (메모리) */
let applicantsList = [];

/** 수정 모드일 때 기존 신청서 문서 ID */
let existingApplicationId = null;

/** 공통코드 옵션 로드 (응시구분 100, 참가여부 110, 환불요청 120) */
async function loadLookupOptions() {
  const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;
  if (!db) return;
  const ymd = todayYmd();
  try {
    const [exam, participation, refund] = await Promise.all([
      getLookupValueList(db, "100", ymd),
      getLookupValueList(db, "110", ymd),
      getLookupValueList(db, "120", ymd),
    ]);
    examTypeLookupOptions = exam || [];
    participationLookupOptions = participation || [];
    refundLookupOptions = refund || [];
  } catch (e) {
    console.warn("공통코드 옵션 로드 실패:", e);
  }
}

function buildSelectOptions(options, selectedValue, emptyLabel = "선택하세요", noEmptyOption = false) {
  const parts = noEmptyOption ? [] : [`<option value="">${emptyLabel}</option>`];
  const selectedStr = selectedValue != null && selectedValue !== "" ? String(selectedValue).trim() : "";
  (options || []).forEach((o) => {
    const v = (o.value_cd ?? o.value ?? "").toString();
    const label = o.value_nm ?? o.label ?? v;
    parts.push(`<option value="${escapeAttr(v)}" ${selectedStr === v ? "selected" : ""}>${escapeAttr(label)}</option>`);
  });
  return parts.join("");
}

/** 공통코드 옵션에서 value_cd에 해당하는 표시명 반환 */
function getLookupLabel(options, valueCd) {
  if (valueCd == null || String(valueCd).trim() === "") return "—";
  const v = String(valueCd).trim();
  const o = (options || []).find((x) => String(x.value_cd ?? x.value ?? "").trim() === v);
  return o ? (o.value_nm ?? o.label ?? v) : v;
}

/** 참가여부 기본값(참가)의 value_cd */
function getDefaultParticipationValueCd() {
  const found = (participationLookupOptions || []).find((o) => (o.value_nm ?? o.label ?? "") === "참가");
  return found ? String(found.value_cd ?? found.value ?? "") : (participationLookupOptions?.[0]?.value_cd ?? participationLookupOptions?.[0]?.value ?? "") || "";
}

function renderApplicants() {
  const tbody = document.getElementById("applicantsTbody");
  if (!tbody) return;
  if (applicantsList.length === 0) {
    tbody.innerHTML = '<tr class="applicants-empty"><td colspan="8" class="text-muted">지원자를 추가해 주세요.</td></tr>';
    return;
  }
  const rows = applicantsList.map((a, i) => {
    const examOptions = buildSelectOptions(examTypeLookupOptions, a.examType, "선택하세요");
    const feeConfirmed = a.feeConfirmed ? escapeAttr(a.feeConfirmed) : "—";
    const refundLock = a.refundConfirmed === "100";
    const refundRequestEnabled = a.feeConfirmed === "100" && !refundLock;
    const participationLabel = getLookupLabel(participationLookupOptions, a.participationStatus || getDefaultParticipationValueCd());
    const refundLabel = getLookupLabel(refundLookupOptions, a.refundRequest);
    const participationOptions = buildSelectOptions(participationLookupOptions, a.participationStatus || getDefaultParticipationValueCd(), "선택하세요", true);
    const refundOptions = buildSelectOptions(refundLookupOptions, a.refundRequest, "선택하세요");
    const participationCell = refundLock ? `<td class="cell-readonly">${escapeAttr(participationLabel)}</td>` : `<td><select name="participationStatus">${participationOptions}</select></td>`;
    const refundCell = refundRequestEnabled ? `<td><select name="refundRequest">${refundOptions}</select></td>` : `<td class="cell-readonly">${escapeAttr(refundLabel)}</td>`;
    const showDeleteBtn = a.feeConfirmed !== "100";
    const deleteBtn = showDeleteBtn ? `<button type="button" class="btn btn-outline btn-remove-applicant" data-index="${i}">삭제</button>` : "";
    return `
      <tr data-index="${i}">
        <td><select name="examType">${examOptions}</select></td>
        <td><input type="text" name="applicantName" value="${escapeAttr(a.applicantName)}" placeholder="응시자" /></td>
        <td><input type="tel" name="mobile" value="${escapeAttr(a.mobile)}" placeholder="010-1234-5678" maxlength="13" /></td>
        <td><input type="text" name="depositNote" value="${escapeAttr(a.depositNote)}" placeholder="응시비 입금시 기록 내용" /></td>
        <td class="cell-readonly hide-col">${feeConfirmed}</td>
        ${participationCell}
        ${refundCell}
        <td>${deleteBtn}</td>
      </tr>
    `;
  }).join("");
  tbody.innerHTML = rows;
  tbody.querySelectorAll(".btn-remove-applicant").forEach((btn) => {
    btn.addEventListener("click", () => {
      applicantsList.splice(parseInt(btn.dataset.index, 10), 1);
      renderApplicants();
    });
  });
  tbody.querySelectorAll("tr[data-index] select, tr[data-index] input").forEach((el) => {
    el.addEventListener("change", () => syncApplicantFromRow(el.closest("tr")));
    el.addEventListener("blur", () => syncApplicantFromRow(el.closest("tr")));
  });
}

function syncApplicantFromRow(tr) {
  const i = parseInt(tr?.dataset?.index, 10);
  if (isNaN(i) || !applicantsList[i]) return;
  const examType = tr.querySelector('select[name="examType"]')?.value || "";
  const applicantName = tr.querySelector('input[name="applicantName"]')?.value?.trim() || "";
  const mobile = tr.querySelector('input[name="mobile"]')?.value?.trim() || "";
  const depositNote = tr.querySelector('input[name="depositNote"]')?.value?.trim() || "";
  const prev = applicantsList[i];
  const lockRefundFields = prev.refundConfirmed === "100";
  const refundRequestEditable = prev.feeConfirmed === "100" && !lockRefundFields;
  const refundRequest = refundRequestEditable ? (tr.querySelector('select[name="refundRequest"]')?.value || "") : (prev.refundRequest ?? "");
  const participationStatus = lockRefundFields ? (prev.participationStatus ?? "") : (tr.querySelector('select[name="participationStatus"]')?.value || "");
  applicantsList[i] = {
    examType,
    applicantName,
    mobile,
    depositNote,
    feeConfirmed: prev.feeConfirmed ?? "",
    contacConfirmed: prev.contacConfirmed ?? "",
    refundRequest,
    participationStatus,
    refundConfirmed: prev.refundConfirmed ?? "",
    applicationNo: prev.applicationNo != null && prev.applicationNo !== "" ? prev.applicationNo : "",
    create_ymd: prev.create_ymd ?? "",
  };
}

function escapeAttr(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML.replace(/"/g, "&quot;");
}

function getApplicantsFromTable() {
  document.querySelectorAll("#applicantsTbody tr[data-index]").forEach((tr) => syncApplicantFromRow(tr));
  return applicantsList.map((a) => ({ ...a }));
}

/** 지원자 필수값 검증 (환불요청 제외). 오류 시 메시지 반환, 통과 시 null */
function validateApplicantsRequired() {
  for (let i = 0; i < applicantsList.length; i++) {
    const a = applicantsList[i];
    const row = i + 1;
    if (!(a.examType || "").trim()) return `6. 지원자 ${row}번째 행: 응시구분을 선택해 주세요.`;
    if (!(a.applicantName || "").trim()) return `6. 지원자 ${row}번째 행: 응시자를 입력해 주세요.`;
    if (!(a.mobile || "").trim()) return `6. 지원자 ${row}번째 행: 휴대폰을 입력해 주세요.`;
    if (!(a.depositNote || "").trim()) return `6. 지원자 ${row}번째 행: 응시비 입금시 기록 내용을 입력해 주세요.`;
    if (!(a.participationStatus || "").trim()) return `6. 지원자 ${row}번째 행: 참가여부를 선택해 주세요.`;
  }
  return null;
}

/** Firestore에 직접 저장 */
function saveApplicationToFirestore(userId, body) {
  const firebase = globalThis.firebase;
  if (typeof firebase === "undefined" || !firebase.firestore) {
    throw new Error("Firestore를 사용할 수 없습니다.");
  }
  const db = firebase.firestore();
  const doc = {
    userId,
    status: "제출",
    denomination: body.denomination || "",
    churchName: body.churchName || "",
    pastorName: body.pastorName || "",
    churchAddress: body.churchAddress || "",
    contactName: body.contactName || "",
    contactPosition: body.contactPosition || "",
    contactPhone: body.contactPhone || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  return db.collection("applications").add(doc);
}

/** Firestore 기존 문서 수정 */
function updateApplicationInFirestore(docId, body) {
  const firebase = globalThis.firebase;
  if (typeof firebase === "undefined" || !firebase.firestore) {
    throw new Error("Firestore를 사용할 수 없습니다.");
  }
  const db = firebase.firestore();
  const updates = {
    status: "제출",
    denomination: body.denomination || "",
    churchName: body.churchName || "",
    pastorName: body.pastorName || "",
    churchAddress: body.churchAddress || "",
    contactName: body.contactName || "",
    contactPosition: body.contactPosition || "",
    contactPhone: body.contactPhone || "",
    applicants: firebase.firestore.FieldValue.delete(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  return db.collection("applications").doc(docId).update(updates);
}

/** 로그인 사용자의 최신 신청서 1건 조회 */
async function loadExistingApplication(uid) {
  const firebase = globalThis.firebase;
  if (typeof firebase === "undefined" || !firebase.firestore) return null;
  const snap = await firebase.firestore().collection("applications").where("userId", "==", uid).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() ?? (typeof a.createdAt === "string" ? new Date(a.createdAt).getTime() : 0);
    const tb = b.createdAt?.toDate?.()?.getTime() ?? (typeof b.createdAt === "string" ? new Date(b.createdAt).getTime() : 0);
    return tb - ta;
  });
  return items[0] || null;
}

/** 해당 신청서의 bo_person 목록 조회 (지원자) - applicationId는 applications 문서 ID */
async function loadBoPerson(applicationId, userId) {
  const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;
  if (!db || !applicationId || !userId) return [];
  const snap = await db.collection("bo_person").where("applicationId", "==", applicationId).where("userId", "==", userId).orderBy("applicationNo", "asc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    const examTypeRaw = data.examType;
    const examType = examTypeRaw != null && examTypeRaw !== "" ? String(examTypeRaw) : "";
    return {
      examType,
      applicantName: data.applicantName ?? "",
      mobile: data.mobile ?? "",
      depositNote: data.depositNote ?? "",
      participationStatus: data.participationStatus ?? "",
      feeConfirmed: data.feeConfirmed ?? "",
      contacConfirmed: data.contacConfirmed ?? "",
      refundRequest: data.refundRequest ?? "",
      refundConfirmed: data.refundConfirmed ?? "",
      applicationNo: data.applicationNo != null && data.applicationNo !== "" ? (typeof data.applicationNo === "number" ? data.applicationNo : parseInt(data.applicationNo, 10)) : "",
      create_ymd: data.create_ymd ?? "",
    };
  });
}

/** bo_person 전체 컬렉션에서 max(ifnull(applicationNo, 1000)) + 1 조회 (where 조건 없음) */
async function getNextApplicationNo(db) {
  try {
    const snap = await db.collection("bo_person").orderBy("applicationNo", "desc").limit(1).get();
    if (snap.empty) return 1001;
    const v = snap.docs[0].data().applicationNo;
    const n = (v == null || v === "") ? 1000 : (typeof v === "number" ? v : parseInt(v, 10));
    return (isNaN(n) ? 1000 : n) + 1;
  } catch (indexErr) {
    if (indexErr?.code === 9 || indexErr?.message?.includes("index")) {
      const snap = await db.collection("bo_person").get();
      let maxNo = 1000;
      snap.docs.forEach((d) => {
        const v = d.data().applicationNo;
        const n = (v == null || v === "") ? 1000 : (typeof v === "number" ? v : parseInt(v, 10));
        if (!isNaN(n) && n > maxNo) maxNo = n;
      });
      return maxNo + 1;
    }
    throw indexErr;
  }
}

/** applicationNo 유효 숫자 여부 */
function hasValidApplicationNo(a) {
  const v = a.applicationNo;
  if (v == null || v === "") return false;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return !isNaN(n);
}

/** 지원자 목록을 bo_person에 저장 (기존 삭제 후 일괄 추가). applicationNo는 UK: 값 있으면 유지, 없으면 전체 max(ifnull(applicationNo,1000))+1부터 문서마다 서로 다른 번호 부여 */
async function saveBoPerson(applicationId, userId, applicants) {
  const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;
  if (!db || !applicationId || !userId) return;
  const ymd = todayYmd();
  const existing = await db.collection("bo_person").where("applicationId", "==", applicationId).where("userId", "==", userId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  const applicantList = applicants || [];
  if (applicantList.length === 0) {
    await batch.commit();
    return;
  }
  let nextNo = await getNextApplicationNo(db);
  applicantList.forEach((a) => {
    const applicationNo = hasValidApplicationNo(a)
      ? (typeof a.applicationNo === "number" ? a.applicationNo : parseInt(a.applicationNo, 10))
      : nextNo++;
    const ref = db.collection("bo_person").doc();
    const existingYmd = (a.create_ymd != null && String(a.create_ymd).trim() !== "") ? String(a.create_ymd).trim() : "";
    const createYmdToSave = existingYmd || ymd;
    // 제출/수정 시 수험번호(examineNumber)는 넣지 않음. 관리자만 신청목록에서 입력.
    // create_ymd: 최초 제출·신규 추가 시에만 오늘 날짜, 수정 시에는 기존 값 유지
    batch.set(ref, {
      userId,
      applicationId,
      applicationNo,
      examType: a.examType ?? "",
      applicantName: a.applicantName ?? "",
      mobile: a.mobile ?? "",
      depositNote: a.depositNote ?? "",
      participationStatus: a.participationStatus ?? "",
      feeConfirmed: a.feeConfirmed ?? "",
      contacConfirmed: a.contacConfirmed ?? "",
      refundRequest: a.refundRequest ?? "",
      refundConfirmed: a.refundConfirmed ?? "",
      create_ymd: createYmdToSave,
    });
  });
  await batch.commit();
}

function setSubmitButtonLabel(text) {
  const btn = document.getElementById("btnSubmitApply");
  if (btn) btn.textContent = text;
}

/** 1~5번만 채우기 (소속교단 ~ 바이블 올림피아드 담당자) */
function fillFormSections1To5(data) {
  if (!data) return;
  const form = document.getElementById("applyForm");
  if (!form) return;
  if (data.denomination != null) form.denomination.value = data.denomination || "";
  if (data.churchName != null) form.churchName.value = data.churchName || "";
  if (data.pastorName != null) form.pastorName.value = data.pastorName || "";
  if (data.churchAddress != null) form.churchAddress.value = data.churchAddress || "";
  if (data.contactName != null) form.contactName.value = data.contactName || "";
  if (data.contactPosition != null) form.contactPosition.value = data.contactPosition || "";
  if (data.contactPhone != null) form.contactPhone.value = data.contactPhone || "";
}

/** 6. 지원자만 채우기 */
function fillFormApplicants(persons) {
  applicantsList = (persons || []).map((a) => {
    const examTypeRaw = a.examType;
    const examType = examTypeRaw != null && examTypeRaw !== "" ? String(examTypeRaw) : "";
    return {
    examType,
    applicantName: a.applicantName ?? "",
    mobile: a.mobile ?? "",
    depositNote: a.depositNote ?? "",
    feeConfirmed: a.feeConfirmed ?? "",
    contacConfirmed: a.contacConfirmed ?? "",
    refundRequest: a.refundRequest ?? "",
    refundConfirmed: a.refundConfirmed ?? "",
    participationStatus: a.participationStatus ?? "참가",
    applicationNo: a.applicationNo != null && a.applicationNo !== "" ? (typeof a.applicationNo === "number" ? a.applicationNo : parseInt(a.applicationNo, 10)) : "",
    create_ymd: a.create_ymd ?? "",
  };
  });
  renderApplicants();
}

/** 기존 신청 데이터로 폼 채우기 (전체) */
function fillFormFromApplication(data) {
  if (!data) return;
  fillFormSections1To5(data);
  fillFormApplicants(data.applicants || []);
}

function init() {
  const check = async () => {
    const user = getCurrentUser();
    if (user) {
      showForm();
      await loadLookupOptions();
      const existing = await loadExistingApplication(user.uid);
      if (existing) {
        existingApplicationId = existing.id;
        fillFormSections1To5(existing);
        setSubmitButtonLabel("수정");
        applicantsList = [];
        renderApplicants();
        requestAnimationFrame(() => {
          loadBoPerson(existing.id, user.uid).then((persons) => {
            fillFormApplicants(persons);
          });
        });
      } else {
        existingApplicationId = null;
        applicantsList = [];
        renderApplicants();
        setSubmitButtonLabel("제출");
      }
      let announcementItems = [];
      try {
        const res = await announcements.list();
        announcementItems = res?.items || [];
      } catch (_) {}
      updateSubmitButtonVisibility(announcementItems);
      updateApplicantsSectionHeading(announcementItems);
      // 화면 open 시 자동 팝업은 로드 직후 포커스/이벤트 상태 때문에 닫기가 두 번 눌려야 하는 현상이 있어, 짧게 지연해 열어 공지사항 보기 버튼으로 연 것과 동일하게 한 번에 닫히게 함
      setTimeout(() => showAnnouncementNotePopupIfAny(announcementItems), 100);
    } else {
      showNeedLogin();
      existingApplicationId = null;
    }
  };
  addAuthStateListener(() => check());
  initAuthUI();
  setTimeout(() => check(), 800);

  document.getElementById("btnViewAnnouncement")?.addEventListener("click", async () => {
    try {
      const res = await announcements.list();
      const withNote = (res?.items || []).find((a) => a.note != null && String(a.note).trim() !== "");
      if (withNote) {
        showAnnouncementPopup(withNote.note);
      } else {
        showModal("등록된 공지사항이 없습니다.");
      }
    } catch (_) {
      showModal("공지사항을 불러올 수 없습니다.");
    }
  });

  const form = document.getElementById("applyForm");
  if (!form) return;

  document.getElementById("btnAddApplicant")?.addEventListener("click", () => {
    applicantsList.push({
      examType: "",
      applicantName: "",
      mobile: "",
      depositNote: "",
      feeConfirmed: "",
      refundRequest: "",
      refundConfirmed: "",
      participationStatus: getDefaultParticipationValueCd(),
      applicationNo: "",
      create_ymd: "",
    });
    renderApplicants();
  });

  document.getElementById("btnSearchAddress")?.addEventListener("click", () => {
    if (typeof kakao === "undefined" || !kakao.Postcode) {
      showModal("주소 검색 서비스를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    new kakao.Postcode({
      oncomplete: function (data) {
        let addr = "";
        let extra = "";
        if (data.userSelectedType === "R") {
          addr = data.roadAddress || "";
          if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname;
          if (data.buildingName && data.apartment === "Y") extra += (extra ? ", " : "") + data.buildingName;
          if (extra) extra = " (" + extra + ")";
        } else {
          addr = data.jibunAddress || "";
        }
        const full = data.zonecode ? "[" + data.zonecode + "] " + addr + extra : addr + extra;
        const el = document.getElementById("churchAddress");
        if (el) el.value = full.trim();
      },
    }).open();
  });

  const DENOMINATION_ALLOWED = "예수교대한성결교회";

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
  document.getElementById("contactPhone")?.addEventListener("input", function () {
    handlePhoneInput(this);
  });
  document.getElementById("contactPhone")?.addEventListener("blur", function () {
    handlePhoneInput(this);
  });
  form.addEventListener("input", (e) => {
    if (e.target.matches('input[name="mobile"]')) handlePhoneInput(e.target);
  });
  form.addEventListener("blur", (e) => {
    if (e.target.matches('input[name="mobile"]')) handlePhoneInput(e.target);
  }, true);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      showModal("로그인 후 제출해 주세요.");
      return;
    }
    const denominationVal = (form.denomination?.value || "").trim();
    if (denominationVal !== DENOMINATION_ALLOWED) {
      showModal('1. 소속 교단은 "예수교대한성결교회"만 지원 가능합니다. 정확히 입력해 주세요.');
      form.denomination?.focus();
      return;
    }
    getApplicantsFromTable();
    const addressVal = form.churchAddress?.value?.trim() || "";
    if (!addressVal) {
      showModal("교회 주소는 「주소 찾기」 버튼을 클릭하여 선택해 주세요.");
      form.churchAddress?.focus();
      return;
    }
    if (applicantsList.length === 0) {
      showModal("6. 지원자를 최소 1명 이상 추가해 주세요.");
      return;
    }
    const requiredMsg = validateApplicantsRequired();
    if (requiredMsg) {
      showModal(requiredMsg);
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const resultEl = document.getElementById("submitResult");
    resultEl.classList.add("hidden");
    const body = {
      denomination: form.denomination?.value?.trim() || "",
      churchName: (form.churchName?.value || "").replace(/\s+/g, " ").trim() || "",
      pastorName: (form.pastorName?.value || "").replace(/\s+/g, " ").trim() || "",
      churchAddress: addressVal,
      contactName: form.contactName?.value?.trim() || "",
      contactPosition: form.contactPosition?.value?.trim() || "",
      contactPhone: form.contactPhone?.value?.trim() || "",
      applicants: getApplicantsFromTable(),
    };
    const isUpdate = !!existingApplicationId;
    body.applicants = body.applicants.map((a) => {
      let participationStatus = a.participationStatus ?? "";
      let refundRequest = a.refundRequest ?? "";
      let refundConfirmed = a.refundConfirmed ?? null;
      if (a.refundConfirmed === "100") {
        participationStatus = a.participationStatus ?? "";
        refundRequest = a.refundRequest ?? "";
        refundConfirmed = a.refundConfirmed;
      } else {
        const rq = (a.refundRequest != null && String(a.refundRequest).trim() !== "") ? String(a.refundRequest).trim() : null;
        if (rq === "100") {
          participationStatus = "200";
          refundConfirmed = "200";
        } else {
          /* 사용자가 선택한 참가여부 유지, 없을 때만 기본값 100(참가) */
          participationStatus = (a.participationStatus != null && String(a.participationStatus).trim() !== "") ? String(a.participationStatus).trim() : "100";
          refundConfirmed = null;
        }
      }
      return {
        ...a,
        participationStatus,
        refundRequest,
        refundConfirmed,
        feeConfirmed: isUpdate ? (a.feeConfirmed != null && String(a.feeConfirmed).trim() !== "" ? a.feeConfirmed : "200") : "200",
        contacConfirmed: isUpdate ? (a.contacConfirmed != null && String(a.contacConfirmed).trim() !== "" ? a.contacConfirmed : "200") : "200",
      };
    });
    try {
      let appId = existingApplicationId;
      if (existingApplicationId) {
        await updateApplicationInFirestore(existingApplicationId, body);
        await showModal("수정이 완료되었습니다. 신청현황에서 확인할 수 있습니다.");
      } else {
        const ref = await saveApplicationToFirestore(user.uid, body);
        if (ref?.id) {
          existingApplicationId = ref.id;
          appId = ref.id;
        }
        await showModal("신청이 완료되었습니다. 신청현황에서 확인할 수 있습니다.");
        setSubmitButtonLabel("수정");
      }
      if (appId) {
        await saveBoPerson(appId, user.uid, body.applicants);
        const persons = await loadBoPerson(appId, user.uid);
        fillFormApplicants(persons);
      }
    } catch (err) {
      resultEl.className = "alert alert-error";
      const msg = err.message || err.data?.error || "제출에 실패했습니다.";
      resultEl.textContent = msg.length > 200 ? "제출에 실패했습니다. 로그인 상태와 네트워크를 확인해 주세요." : msg;
      resultEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  renderApplicants();
}

init();
