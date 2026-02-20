/**
 * 담당자 목록: applications 기준 조회·저장·엑셀 다운로드
 * 컬럼: 순서, 교회명, 담당자, 직분, 휴대폰(담당자), 담임목사, 교회주소, 소속교단
 */
import { getCurrentUser, addAuthStateListener } from "./auth.js";
import { admin } from "./api.js";
import { showModal } from "./modal.js";

const gridDom = document.getElementById("agGridContactList");
if (!gridDom) {
  // not on this page
} else {
  let gridApi = null;
  let contactListInitDone = false;
  const dirtyIds = new Set();

  function getFilterParams() {
    const v = (id) => (document.getElementById(id) && document.getElementById(id).value) || "";
    return {
      churchName: v("filterChurchName"),
      contactName: v("filterContactName"),
      contactPhone: v("filterContactPhone"),
    };
  }

  function getGridRowData() {
    if (!gridApi) return [];
    if (typeof gridApi.getRowData === "function") return gridApi.getRowData() || [];
    return gridApi.getGridOption?.("rowData") || [];
  }

  function setGridRowData(items) {
    if (!gridApi) return;
    if (typeof gridApi.setRowData === "function") gridApi.setRowData(items);
    else if (typeof gridApi.setGridOption === "function") gridApi.setGridOption("rowData", items);
  }

  function showProgress(msg) {
    const overlay = document.getElementById("progressOverlay");
    const msgEl = document.getElementById("progressMessage");
    if (overlay) overlay.classList.remove("hidden");
    if (msgEl) msgEl.textContent = msg || "처리 중...";
  }
  function hideProgress() {
    const overlay = document.getElementById("progressOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  /** 수정 가능 컬럼 헤더: 제목 + 연필 아이콘 (클릭 시 정렬) */
  const EDIT_ICON_SVG = '<svg class="ag-header-edit-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function EditableColumnHeader() {}
  EditableColumnHeader.prototype.init = function (params) {
    const displayName = (params.displayName != null ? params.displayName : params.colDef?.headerName) || "";
    this.eGui = document.createElement("span");
    this.eGui.className = "ag-header-cell-editable-wrap";
    this.eGui.innerHTML = "<span class=\"ag-header-cell-text\">" + escapeHtml(displayName) + "</span>" + EDIT_ICON_SVG;
    this.eGui.style.cursor = "pointer";
    this.eGui.title = "클릭하면 정렬됩니다";
    this.eGui.addEventListener("click", function () {
      if (typeof params.progressSort === "function") {
        params.progressSort();
      } else if (params.column && params.api) {
        const sort = params.column.getSort();
        params.api.applyColumnState({
          state: [{ colId: params.column.getColId(), sort: sort === "asc" ? "desc" : "asc" }],
          defaultState: { sort: null },
        });
      }
    });
  };
  EditableColumnHeader.prototype.getGui = function () { return this.eGui; };

  /** 휴대폰: 숫자만 추출 (신청 목록 휴대폰(응시자)와 동일) */
  function digitsOnly(str) {
    return (str || "").replace(/\D/g, "");
  }
  /** 휴대폰: 010-XXXX-XXXX 형식, 최대 11자리 (0105 → 010-5 등) */
  function formatPhoneDisplay(digits) {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }
  /** 휴대폰(담당자) 전용 셀 에디터: 숫자만 입력, 010-XXX-XXXX 포맷, 11자 제한 */
  function MobileCellEditor() {}
  MobileCellEditor.prototype.init = function (params) {
    this.eInput = document.createElement("input");
    this.eInput.type = "tel";
    this.eInput.inputMode = "numeric";
    this.eInput.maxLength = 13;
    this.eInput.placeholder = "010-1234-5678";
    this.eInput.value = formatPhoneDisplay(params.value) || (params.value ?? "") || "";
    const self = this;
    function applyFormat() {
      const d = digitsOnly(self.eInput.value);
      const formatted = formatPhoneDisplay(d);
      if (self.eInput.value !== formatted) self.eInput.value = formatted;
    }
    this.eInput.addEventListener("input", applyFormat);
    this.eInput.addEventListener("blur", applyFormat);
    this.eInput.addEventListener("keydown", function (e) {
      const k = e.key;
      if (k === "Backspace" || k === "Delete" || k === "Tab" || k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End") return;
      if (e.ctrlKey || e.metaKey) return;
      if (!/^\d$/.test(k)) e.preventDefault();
    });
    setTimeout(function () { self.eInput.focus(); self.eInput.select(); }, 0);
  };
  MobileCellEditor.prototype.getValue = function () {
    const formatted = formatPhoneDisplay(this.eInput.value);
    return formatted || "";
  };
  MobileCellEditor.prototype.getGui = function () { return this.eInput; };

  function initGrid() {
    const columnDefs = [
      { field: "order", headerName: "순서", width: 70, editable: false },
      { field: "churchName", headerName: "교회명", width: 200, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "교회명" } },
      { field: "contactName", headerName: "담당자", width: 100, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "담당자" } },
      { field: "contactPosition", headerName: "직분", width: 80, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "직분" } },
      {
        field: "contactPhone",
        headerName: "휴대폰(담당자)",
        width: 140,
        editable: true,
        headerComponent: EditableColumnHeader,
        headerComponentParams: { displayName: "휴대폰(담당자)" },
        cellEditor: MobileCellEditor,
        valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value ?? ""),
        valueParser: (p) => (p.newValue != null && p.newValue !== "" ? formatPhoneDisplay(p.newValue) : ""),
      },
      { field: "pastorName", headerName: "담임목사", width: 130, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "담임목사" } },
      { field: "churchAddress", headerName: "교회주소", width: 260, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "교회주소" } },
      { field: "denomination", headerName: "소속교단", width: 160, editable: true, headerComponent: EditableColumnHeader, headerComponentParams: { displayName: "소속교단" } },
    ];
    const gridOptions = {
      columnDefs,
      defaultColDef: { sortable: true, resizable: true, minWidth: 80 },
      singleClickEdit: true,
      getRowId: (params) => params.data?.applicationId || "",
      onCellValueChanged: (event) => {
        if (event.data?.applicationId) dirtyIds.add(event.data.applicationId);
      },
      rowData: [],
      domLayout: "normal",
      components: { EditableColumnHeader, MobileCellEditor },
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

  async function onSearch() {
    if (!gridApi) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    await new Promise((r) => setTimeout(r, 50));
    showProgress("조회 중...");
    try {
      const data = await admin.contactList(getFilterParams());
      const items = (data && data.items) || [];
      setGridRowData(items);
      dirtyIds.clear();
      hideProgress();
    } catch (e) {
      hideProgress();
      showModal("조회 실패: " + (e.message || e.data?.error || ""));
    }
  }

  async function onSave() {
    if (!gridApi) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    await new Promise((r) => setTimeout(r, 50));
    const rows = getGridRowData();
    const toSend = rows.filter((r) => r?.applicationId && dirtyIds.has(r.applicationId));
    if (toSend.length === 0) {
      showModal("저장할 변경 사항이 없습니다.");
      return;
    }
    const updates = toSend.map((r) => ({
      applicationId: r.applicationId,
      churchName: r.churchName ?? "",
      contactName: r.contactName ?? "",
      contactPosition: r.contactPosition ?? "",
      contactPhone: r.contactPhone ?? "",
      denomination: r.denomination ?? "",
      pastorName: r.pastorName ?? "",
      churchAddress: r.churchAddress ?? "",
    }));
    showProgress("저장 중...");
    try {
      await admin.patchContactList(updates);
      toSend.forEach((r) => dirtyIds.delete(r.applicationId));
      hideProgress();
      showModal("저장되었습니다.");
    } catch (e) {
      hideProgress();
      showModal("저장 실패: " + (e.message || e.data?.error || ""));
    }
  }

  function onExcel() {
    if (!gridApi) return;
    const cols = gridApi.getColumnDefs?.() || gridApi.getGridOption?.("columnDefs") || [];
    const rows = getGridRowData();
    const headers = cols.map((c) => c.headerName || c.field || "").join(",");
    const lines = [headers];
    rows.forEach((r) => {
      const row = cols.map((c) => {
        const v = r[c.field];
        const s = v != null ? String(v).replace(/"/g, '""') : "";
        return '"' + s + '"';
      });
      lines.push(row.join(","));
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "담당자목록_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function init() {
    if (contactListInitDone) return;
    const user = getCurrentUser();
    if (!user) return;
    contactListInitDone = true;
    initGrid();
    document.getElementById("btnSearch")?.addEventListener("click", onSearch);
    document.getElementById("btnSave")?.addEventListener("click", onSave);
    document.getElementById("btnExcel")?.addEventListener("click", onExcel);
    onSearch();
  }

  addAuthStateListener((user) => {
    if (user && gridDom) init();
  });
  if (getCurrentUser() && gridDom) init();
}
