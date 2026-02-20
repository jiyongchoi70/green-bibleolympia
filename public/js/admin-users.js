/**
 * 사용자(권한부여): AG Grid 기반 조회/저장/엑셀
 * users.html 전용. admin.js와 함께 로드되며, tbody-users가 없으면 이 스크립트가 그리드를 담당.
 */
import { admin } from "./api.js";
import { showModal, showLoadingModal, hideLoadingModal } from "./modal.js";

const gridDom = document.getElementById("agGridUsers");
if (!gridDom) {
  // not on users page
} else {
  let gridApi = null;
  let lookup140 = [];
  let lookup130 = [];

  /** 메시지와 진행/취소 버튼이 있는 확인 모달. 진행 클릭 시 true, 취소 클릭 시 false */
  function showConfirmModal(message, confirmLabel, cancelLabel) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "app-modal-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      const text = (message != null ? String(message) : "").replace(/\n/g, "<br />");
      overlay.innerHTML =
        '<div class="app-modal-box">' +
        '<p class="app-modal-message" style="white-space:normal;">' + text + '</p>' +
        '<div style="display:flex; gap:0.5rem; justify-content:center; margin-top:1rem;">' +
        '<button type="button" class="btn btn-outline" data-action="cancel">' + (cancelLabel || "취소") + '</button>' +
        '<button type="button" class="btn btn-primary" data-action="confirm">' + (confirmLabel || "진행") + '</button>' +
        '</div></div>';
      const close = (result) => {
        overlay.classList.remove("is-visible");
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector("[data-action=cancel]").addEventListener("click", () => close(false));
      overlay.querySelector("[data-action=confirm]").addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector(".app-modal-box").addEventListener("click", (e) => e.stopPropagation());
      overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(false); });
      document.body.appendChild(overlay);
      overlay.classList.add("is-visible");
      overlay.querySelector("[data-action=confirm]").focus();
    });
  }

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

  function stripPhoneNumber(str) {
    if (str == null || typeof str !== "string") return "";
    return str.replace(/\D/g, "");
  }

  /** 휴대폰: 숫자만 추출 (신청 목록 휴대폰(응시자)와 동일) */
  function digitsOnly(str) {
    return (str || "").replace(/\D/g, "");
  }
  /** 휴대폰: 010-XXXX-XXXX 형식, 최대 11자리 (신청 목록과 동일) */
  function formatPhoneDisplay(digits) {
    var d = String(digits != null ? digits : "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  /** 휴대폰 전용 셀 에디터: 신청 목록 휴대폰(응시자)와 동일 */
  function MobileCellEditor() {}
  MobileCellEditor.prototype.init = function (params) {
    this.eInput = document.createElement("input");
    this.eInput.type = "tel";
    this.eInput.inputMode = "numeric";
    this.eInput.maxLength = 13;
    this.eInput.placeholder = "010-1234-5678";
    this.eInput.value = formatPhoneDisplay(params.value != null ? params.value : "") || "";
    var self = this;
    function applyFormat() {
      var d = digitsOnly(self.eInput.value);
      var formatted = formatPhoneDisplay(d);
      if (self.eInput.value !== formatted) self.eInput.value = formatted;
    }
    this.eInput.addEventListener("input", applyFormat);
    this.eInput.addEventListener("blur", applyFormat);
    this.eInput.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "Backspace" || k === "Delete" || k === "Tab" || k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End") return;
      if (e.ctrlKey || e.metaKey) return;
      if (!/^\d$/.test(k)) e.preventDefault();
    });
    setTimeout(function () { self.eInput.focus(); self.eInput.select(); }, 0);
  };
  MobileCellEditor.prototype.getValue = function () {
    return formatPhoneDisplay(this.eInput.value) || "";
  };
  MobileCellEditor.prototype.getGui = function () { return this.eInput; };

  function getUserTypeNm(valueCd) {
    if (valueCd == null || valueCd === "") return "";
    const o = lookup140.find((x) => String(x.value_cd) === String(valueCd));
    return o ? (o.value_nm || "") : valueCd;
  }

  function esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : s;
    return div.innerHTML;
  }

  /** 수정 가능 컬럼 헤더: 제목 + 연필 아이콘 (신청 목록과 동일) */
  var EDIT_ICON_SVG = '<svg class="ag-header-edit-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  function EditableColumnHeader() {}
  EditableColumnHeader.prototype.init = function (params) {
    var displayName = (params.displayName != null ? params.displayName : (params.colDef && params.colDef.headerName) ? params.colDef.headerName : "") || "";
    this.eGui = document.createElement("span");
    this.eGui.className = "ag-header-cell-editable-wrap";
    this.eGui.innerHTML = "<span class=\"ag-header-cell-text\">" + esc(displayName) + "</span>" + EDIT_ICON_SVG;
    this.eGui.style.cursor = "pointer";
    this.eGui.title = "클릭하면 정렬됩니다";
    this.eGui.addEventListener("click", function () {
      if (typeof params.progressSort === "function") {
        params.progressSort();
      } else if (params.column && params.api) {
        var sort = params.column.getSort();
        params.api.applyColumnState({
          state: [{ colId: params.column.getColId(), sort: sort === "asc" ? "desc" : "asc" }],
          defaultState: { sort: null },
        });
      }
    });
  };
  EditableColumnHeader.prototype.getGui = function () { return this.eGui; };

  async function loadLookup140() {
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
    return list.filter((o) => o.value_nm === "신청자" || o.value_nm === "관리자");
  }

  async function loadLookup130() {
    const db = typeof globalThis.firebase !== "undefined" ? globalThis.firebase.firestore() : null;
    if (!db) return [];
    const now = new Date();
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const todayNum = parseInt(today, 10);
    const snap = await db.collection("bo_lookup_value").where("type_cd", "==", "130").get();
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
  }

  function getEmailynNm(valueCd) {
    if (valueCd == null || valueCd === "") return "";
    const o = lookup130.find((x) => String(x.value_cd) === String(valueCd));
    return o ? (o.value_nm || "") : valueCd;
  }

  function initGrid() {
    const typeOptions = lookup140.map((o) => o.value_nm || o.value_cd);
    const emailynOptions = lookup130.map((o) => o.value_nm || o.value_cd);
    const columnDefs = [
      { field: "order", headerName: "순서", width: 70, valueGetter: (p) => (p.node != null && p.node.rowIndex != null ? p.node.rowIndex + 1 : ""), editable: false },
      { field: "Name", headerName: "성명", width: 120, editable: false },
      {
        field: "Phone",
        headerName: "전화번호",
        width: 170,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "전화번호" },
        cellEditor: "MobileCellEditor",
        valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value != null ? p.value : ""),
        valueParser: (p) => (p.newValue != null && p.newValue !== "" ? formatPhoneDisplay(p.newValue) : ""),
      },
      { field: "eMail", headerName: "이메일", width: 200, editable: false },
      {
        field: "userType",
        headerName: "유형",
        width: 110,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "유형" },
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: typeOptions },
      },
      {
        field: "emailyn",
        headerName: "알림메일유무",
        width: 120,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "알림메일유무" },
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: emailynOptions },
      },
    ];
    const gridOptions = {
      columnDefs,
      components: { EditableColumnHeader: EditableColumnHeader, MobileCellEditor: MobileCellEditor },
      defaultColDef: { sortable: true, resizable: true, minWidth: 80 },
      getRowId: (params) => (params.data != null && params.data.id != null ? params.data.id : ""),
      rowData: [],
      domLayout: "normal",
      singleClickEdit: true,
    };
    if (typeof agGrid !== "undefined") {
      if (typeof agGrid.createGrid === "function") {
        gridApi = agGrid.createGrid(gridDom, gridOptions);
      } else if (agGrid.Grid) {
        new agGrid.Grid(gridDom, gridOptions);
        gridApi = gridOptions.api;
      }
    }
  }

  async function doUsersSearch() {
    if (!gridApi) return;
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    showLoadingModal("조회 중...");
    try {
      var nameEl = document.getElementById("users-filter-name");
      var phoneEl = document.getElementById("users-filter-phone");
      var typeEl = document.getElementById("users-filter-type");
      const name = (nameEl && nameEl.value != null ? nameEl.value : "").trim();
      const phone = (phoneEl && phoneEl.value != null ? phoneEl.value : "").trim();
      const userType = (typeEl && typeEl.value != null ? typeEl.value : "").trim() || "전체";
      const res = await admin.users({ name, phone, userType });
      const items = (res.items || []).map((r, i) => {
        const typeNm = getUserTypeNm(r.userType);
        const emailynNm = getEmailynNm(r.emailyn);
        return {
          id: r.id,
          order: i + 1,
          Name: r.Name != null ? r.Name : "",
          Phone: r.Phone != null ? r.Phone : "",
          eMail: r.eMail != null ? r.eMail : "",
          userType: typeNm,
          emailyn: emailynNm,
          _originalPhone: (r.Phone != null ? r.Phone : "").trim(),
          _originalUserType: typeNm,
          _userTypeCd: r.userType != null ? r.userType : "",
          _originalEmailyn: emailynNm,
          _emailynCd: r.emailyn != null ? r.emailyn : "",
        };
      });
      if (typeof gridApi.setRowData === "function") gridApi.setRowData(items);
      else if (typeof gridApi.setGridOption === "function") gridApi.setGridOption("rowData", items);
      setTimeout(() => {
        if (gridApi && typeof gridApi.sizeColumnsToFit === "function") gridApi.sizeColumnsToFit();
      }, 50);
    } catch (e) {
      const msg = e.message || (e.data && e.data.error) || "알 수 없는 오류";
      showModal("오류: " + msg);
    } finally {
      hideLoadingModal();
    }
  }

  async function onSave() {
    if (!gridApi) return;
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    const rowData = (typeof gridApi.getRowData === "function" ? gridApi.getRowData() : (typeof gridApi.getGridOption === "function" ? gridApi.getGridOption("rowData") : null)) || [];
    for (var i = 0; i < rowData.length; i++) {
      var r = rowData[i];
      if (r.id && !stripPhoneNumber(r.Phone != null ? String(r.Phone) : "").trim()) {
        showModal("전화번호는 필수입니다. '" + (r.Name != null ? r.Name : "") + "' 행의 전화번호를 입력해 주세요.");
        return;
      }
    }
    const updates = [];
    for (const r of rowData) {
      if (!r.id) continue;
      const phone = (r.Phone != null ? String(r.Phone) : "").trim();
      const phoneNorm = stripPhoneNumber(phone) || phone;
      const typeNm = String(r.userType != null ? r.userType : "").trim();
      const typeCd = (() => { const o = lookup140.find((x) => (x.value_nm || "") === typeNm); return o ? o.value_cd : (r._userTypeCd != null ? r._userTypeCd : ""); })();
      const emailynNm = String(r.emailyn != null ? r.emailyn : "").trim();
      const emailynCd = (() => { const o = lookup130.find((x) => (x.value_nm || "") === emailynNm); return o ? o.value_cd : (r._emailynCd != null ? r._emailynCd : ""); })();
      const emailynChanged = emailynNm !== String(r._originalEmailyn != null ? r._originalEmailyn : "");
      if (stripPhoneNumber(r._originalPhone || "") !== phoneNorm || typeNm !== String(r._originalUserType != null ? r._originalUserType : "") || emailynChanged) {
        updates.push({ id: r.id, Phone: formatPhoneNumber(phone) || phone, eMail: (r.eMail != null ? r.eMail : "").trim(), userType: typeCd, emailyn: emailynCd });
      }
    }
    if (updates.length === 0) {
      showModal("변경된 항목이 없습니다.");
      return;
    }
    showLoadingModal("저장 중...");
    try {
      for (const u of updates) {
        await admin.userUpdate(u.id, { Phone: u.Phone, eMail: u.eMail, userType: u.userType, emailyn: u.emailyn });
      }
      hideLoadingModal();
      showModal("저장되었습니다.");
      doUsersSearch();
    } catch (e) {
      hideLoadingModal();
      showModal("저장 실패: " + (e.data && e.data.error ? e.data.error : e.message));
    }
  }

  function onExcel() {
    if (!gridApi) return;
    const rowData = (typeof gridApi.getRowData === "function" ? gridApi.getRowData() : (typeof gridApi.getGridOption === "function" ? gridApi.getGridOption("rowData") : null)) || [];
    if (rowData.length === 0) {
      showModal("다운로드할 데이터가 없습니다. 먼저 조회하세요.");
      return;
    }
    const headers = ["순서", "성명", "전화번호", "이메일", "유형", "알림메일유무"];
    const escapeCsv = (v) => {
      const s = String(v != null ? v : "").replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    const rows = rowData.map((r, i) => [i + 1, r.Name != null ? r.Name : "", formatPhoneNumber(r.Phone) || (r.Phone != null ? r.Phone : ""), r.eMail != null ? r.eMail : "", r.userType != null ? r.userType : "", r.emailyn != null ? r.emailyn : ""].map(escapeCsv).join(","));
    const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "users_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function init() {
    lookup140 = await loadLookup140();
    lookup130 = await loadLookup130();
    const filterSelect = document.getElementById("users-filter-type");
    if (filterSelect) {
      filterSelect.innerHTML = "<option value=\"전체\">전체</option>" + lookup140.map((o) => `<option value="${esc(o.value_cd)}">${esc(o.value_nm)}</option>`).join("");
    }
    initGrid();
    var resetBtn = document.getElementById("users-btn-reset");
    var searchBtn = document.getElementById("users-btn-search");
    var saveBtn = document.getElementById("users-btn-save");
    var excelBtn = document.getElementById("users-btn-excel");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const msg = "사용자(권한부여)의 관리자이외의 신청자, 제출자, 응시자를 삭제합니다.\n\n진행하시겠습니까?";
        const confirmed = await showConfirmModal(msg, "진행", "취소");
        if (!confirmed) return;
        showLoadingModal("초기화 중...");
        try {
          await admin.usersReset();
          hideLoadingModal();
          showModal("초기화되었습니다.");
          doUsersSearch();
        } catch (e) {
          hideLoadingModal();
          showModal("초기화 실패: " + (e.message || (e.data && e.data.error) || "알 수 없는 오류"));
        }
      });
    }
    if (searchBtn) searchBtn.addEventListener("click", () => doUsersSearch());
    if (saveBtn) saveBtn.addEventListener("click", () => onSave());
    if (excelBtn) excelBtn.addEventListener("click", () => onExcel());
    window.addEventListener("resize", () => {
      if (gridApi && typeof gridApi.sizeColumnsToFit === "function") gridApi.sizeColumnsToFit();
    });
    doUsersSearch();
  }

  init();
}
