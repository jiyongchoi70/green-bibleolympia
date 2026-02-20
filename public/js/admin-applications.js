/**
 * 관리자 신청 목록: 조회 조건, AG Grid, 상세 영역, 저장, 엑셀 다운로드
 * 이 페이지(applications.html)에만 로드됨.
 */
import { getCurrentUser, addAuthStateListener } from "./auth.js";
import { admin } from "./api.js";
import { showModal } from "./modal.js";

const gridDom = document.getElementById("agGridApplications");
if (!gridDom) {
  // 이 페이지가 아님
} else {
  let gridApi = null;
  let applicationsInitDone = false;
  const dirtyRowKeys = new Set(); // "applicationId|personId" 수정된 행

  // bo_lookup_value 기준: 100=응시구분, 110=참가여부, 120=환불요청, 130=참가비확인·담당자연락·환불지급
  const lookup100 = []; // 응시구분 (type_cd 100)
  const lookup110 = []; // 참가여부 (type_cd 110)
  const lookup120 = []; // 환불요청 (type_cd 120)
  const lookup130 = []; // 참가비확인여부, 담당자연락여부, 환불지급여부 (type_cd 130)

  function rowKey(row) {
    return (row?.applicationId || "") + "|" + (row?.personId || "");
  }

  async function loadLookupOptions() {
    try {
      const [r100, r110, r120, r130] = await Promise.all([
        admin.lookupOptions("100"),
        admin.lookupOptions("110"),
        admin.lookupOptions("120"),
        admin.lookupOptions("130"),
      ]);
      if (r100?.options) lookup100.push(...r100.options);
      if (r110?.options) lookup110.push(...r110.options);
      if (r120?.options) lookup120.push(...r120.options);
      if (r130?.options) lookup130.push(...r130.options);
    } catch (e) {
      console.warn("lookup options load failed", e);
    }
  }

  function fillSelect(selectEl, options, allLabel = "전체") {
    if (!selectEl) return;
    const first = selectEl.querySelector("option");
    selectEl.innerHTML = "";
    if (first && first.value === "") {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = allLabel;
        selectEl.appendChild(o);
    } else if (allLabel) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = allLabel;
      selectEl.appendChild(o);
    }
    (options || []).forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value_cd ?? opt.value ?? "";
      option.textContent = opt.value_nm ?? opt.label ?? option.value;
      selectEl.appendChild(option);
    });
  }

  function initFilterDropdowns() {
    fillSelect(document.getElementById("filterExamType"), lookup100);
    fillSelect(document.getElementById("filterParticipationStatus"), lookup110);
    fillSelect(document.getElementById("filterFeeConfirmed"), lookup130);
    fillSelect(document.getElementById("filterContacConfirmed"), lookup130);
    fillSelect(document.getElementById("filterRefundRequest"), lookup120);
    fillSelect(document.getElementById("filterRefundConfirmed"), lookup130);
  }

  /** 휴대폰: 숫자만 추출 (신청서 휴대폰(숫자만등록)과 동일) */
  function digitsOnly(str) {
    return (str || "").replace(/\D/g, "");
  }
  /** 휴대폰: 010-XXXX-XXXX 형식 (신청서 휴대폰(숫자만등록)과 동일, 최대 11자리) */
  function formatPhoneDisplay(digits) {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  /** 휴대폰(응시자) 전용 셀 에디터: 숫자만 입력, 입력 중 010-XXX-XXXX 포맷 적용 (신청서와 동일) */
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

  /** value_cd → value_nm 표시 */
  function getLookupLabel(options, valueCd) {
    if (valueCd == null || valueCd === "") return "";
    const o = (options || []).find((x) => String(x.value_cd ?? x.value ?? "") === String(valueCd));
    return o ? (o.value_nm ?? o.label ?? "") : valueCd;
  }

  /** 셀 편집 시 value_nm 선택값 → value_cd 로 저장 */
  function parseLookupValue(options, valueNm) {
    const o = (options || []).find((x) => (x.value_nm ?? x.label ?? "") === valueNm);
    return o ? (o.value_cd ?? o.value ?? "") : valueNm;
  }

  /** DB 저장 시 value_nm이 들어와도 value_cd로 변환하여 항상 value_cd만 전송 */
  function toValueCd(options, val) {
    if (val == null || val === "") return "";
    const v = String(val).trim();
    const byCd = (options || []).find((x) => String(x.value_cd ?? x.value ?? "") === v);
    if (byCd) return byCd.value_cd ?? byCd.value ?? "";
    const byNm = (options || []).find((x) => (x.value_nm ?? x.label ?? "") === v);
    return byNm ? (byNm.value_cd ?? byNm.value ?? "") : v;
  }

  /** 수정 가능 컬럼 헤더: 제목 + 연필 아이콘 + 정렬 클릭 (AG Grid 커스텀 헤더) */
  const EDIT_ICON_SVG = '<svg class="ag-header-edit-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
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
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function initGrid() {
    const columnDefs = [
      { field: "order", headerName: "순서", width: 70, editable: false, pinned: "left" },
      { field: "churchName", headerName: "교회명", width: 260, editable: false, pinned: "left" },
      { field: "contactName", headerName: "담당자", width: 90, editable: false, pinned: "left" },
      {
        field: "examType",
        headerName: "응시구분",
        width: 110,
        editable: true,
        pinned: "left",
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "응시구분" },
        valueFormatter: (p) => getLookupLabel(lookup100, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: lookup100.map((o) => o.value_nm ?? o.label ?? "") },
        valueParser: (p) => parseLookupValue(lookup100, p.newValue),
      },
      { field: "applicantName", headerName: "응시자", width: 110, editable: true, pinned: "left", headerComponent: "EditableColumnHeader", headerComponentParams: { displayName: "응시자" } },
      {
        field: "mobile",
        headerName: "휴대폰(응시자)",
        width: 170,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "휴대폰(응시자)" },
        cellEditor: "MobileCellEditor",
        valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value ?? ""),
        valueParser: (p) => (p.newValue != null && p.newValue !== "" ? formatPhoneDisplay(p.newValue) : ""),
      },
      { field: "depositNote", headerName: "응시비 입금시 기록 내용", width: 230, editable: true, headerComponent: "EditableColumnHeader", headerComponentParams: { displayName: "응시비 입금시 기록 내용" } },
      {
        field: "participationStatus",
        headerName: "참가여부",
        width: 110,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "참가여부" },
        valueFormatter: (p) => getLookupLabel(lookup110, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: lookup110.map((o) => o.value_nm ?? o.label ?? "") },
        valueParser: (p) => parseLookupValue(lookup110, p.newValue),
      },
      {
        field: "feeConfirmed",
        headerName: "참가비확인여부",
        width: 160,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "참가비확인여부" },
        valueFormatter: (p) => getLookupLabel(lookup130, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: lookup130.map((o) => o.value_nm ?? o.label ?? "") },
        valueParser: (p) => parseLookupValue(lookup130, p.newValue),
      },
      {
        field: "contacConfirmed",
        headerName: "담당자연락여부",
        width: 160,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "담당자연락여부" },
        valueFormatter: (p) => getLookupLabel(lookup130, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: lookup130.map((o) => o.value_nm ?? o.label ?? "") },
        valueParser: (p) => parseLookupValue(lookup130, p.newValue),
      },
      {
        field: "refundRequest",
        headerName: "환불요청",
        width: 110,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "환불요청" },
        valueFormatter: (p) => getLookupLabel(lookup120, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", ...lookup120.map((o) => o.value_nm ?? o.label ?? "")] },
        valueParser: (p) => (p.newValue === "" ? "" : parseLookupValue(lookup120, p.newValue)),
      },
      {
        field: "refundConfirmed",
        headerName: "환불지급여부",
        width: 140,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "환불지급여부" },
        valueFormatter: (p) => getLookupLabel(lookup130, p.value),
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", ...lookup130.map((o) => o.value_nm ?? o.label ?? "")] },
        valueParser: (p) => (p.newValue === "" ? "" : parseLookupValue(lookup130, p.newValue)),
      },
      { field: "applicationNo", headerName: "등록번호", width: 90, editable: false },
      { field: "examineNumber", headerName: "수험번호", width: 200, editable: true, headerComponent: "EditableColumnHeader", headerComponentParams: { displayName: "수험번호" } },
      { field: "contactPosition", headerName: "직분", width: 80, editable: false },
      {
        field: "contactPhone",
        headerName: "휴대폰(담당자)",
        width: 150,
        editable: true,
        headerComponent: "EditableColumnHeader",
        headerComponentParams: { displayName: "휴대폰(담당자)" },
        cellEditor: "MobileCellEditor",
        valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value ?? ""),
        valueParser: (p) => (p.newValue != null && p.newValue !== "" ? formatPhoneDisplay(p.newValue) : ""),
      },
      { field: "submittedAt", headerName: "제출일", width: 120, editable: false },
      { field: "pastorName", headerName: "담임목사", width: 140, editable: false },
      { field: "churchAddress", headerName: "교회주소", width: 260, editable: false },
      { field: "submitterName", headerName: "제출자", width: 90, editable: false },
      { field: "submitterPhone", headerName: "휴대폰(제출자)", width: 150, editable: false, valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value ?? "") },
      { field: "denomination", headerName: "소속교단", width: 130, editable: false },
    ];
    const gridOptions = {
      columnDefs,
      components: { EditableColumnHeader: EditableColumnHeader, MobileCellEditor: MobileCellEditor },
      defaultColDef: { sortable: true, resizable: true, minWidth: 80 },
      singleClickEdit: true,
      rowSelection: "single",
      getRowId: (params) => rowKey(params.data),
      onCellValueChanged: (event) => {
        if (event.data) dirtyRowKeys.add(rowKey(event.data));
      },
      rowData: [],
      domLayout: "normal",
      enableCellTextSelection: true,
      suppressRowClickSelection: false,
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

  function getFilterParams() {
    const p = {};
    const v = (id) => (document.getElementById(id) && document.getElementById(id).value) || "";
    if (v("filterChurchName")) p.churchName = v("filterChurchName");
    if (v("filterContactName")) p.contactName = v("filterContactName");
    if (v("filterApplicant")) p.applicant = v("filterApplicant");
    if (v("filterExamType")) p.examType = v("filterExamType");
    if (v("filterParticipationStatus")) p.participationStatus = v("filterParticipationStatus");
    if (v("filterFeeConfirmed")) p.feeConfirmed = v("filterFeeConfirmed");
    if (v("filterContacConfirmed")) p.contacConfirmed = v("filterContacConfirmed");
    if (v("filterRefundRequest")) p.refundRequest = v("filterRefundRequest");
    if (v("filterRefundConfirmed")) p.refundConfirmed = v("filterRefundConfirmed");
    return p;
  }

  function showProgress(message) {
    const overlay = document.getElementById("progressOverlay");
    const msgEl = document.getElementById("progressMessage");
    if (overlay) overlay.classList.remove("hidden");
    if (msgEl) msgEl.textContent = message || "처리 중...";
  }
  function hideProgress() {
    const overlay = document.getElementById("progressOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  async function onSearch() {
    if (!gridApi) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    await new Promise((r) => setTimeout(r, 50));
    showProgress("조회 중...");
    try {
      const data = await admin.applications(getFilterParams());
      const items = (data && data.items) || [];
      setGridRowData(items);
      dirtyRowKeys.clear();
      hideProgress();
    } catch (e) {
      hideProgress();
      showModal("조회 실패: " + (e.message || e.data?.error || ""));
    }
  }

  /** 저장 시 필수값 검증: 응시자, 휴대폰(응시자), 응시비 입금시 기록 내용 */
  function validateRequiredForSave(rows) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const order = (r.order != null && r.order !== "") ? r.order : i + 1;
      if (!(r.applicantName || "").trim()) return `${order}번째 행: 응시자를 입력해 주세요.`;
      if (!(r.mobile || "").trim()) return `${order}번째 행: 휴대폰(응시자)를 입력해 주세요.`;
      if (!(r.depositNote || "").trim()) return `${order}번째 행: 응시비 입금시 기록 내용을 입력해 주세요.`;
    }
    return null;
  }

  async function onSave() {
    if (!gridApi) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (typeof gridApi.stopEditing === "function") gridApi.stopEditing(false);
    await new Promise((r) => setTimeout(r, 50));
    const rows = getGridRowData();
    const toSend = rows.filter((r) => dirtyRowKeys.has(rowKey(r)));
    if (toSend.length === 0) {
      showModal("저장할 변경 사항이 없습니다.");
      return;
    }
    const err = validateRequiredForSave(toSend);
    if (err) {
      showModal(err);
      return;
    }
    const updates = toSend.map((r) => ({
      applicationId: r.applicationId,
      personId: r.personId || "",
      churchName: r.churchName,
      pastorName: r.pastorName,
      churchAddress: r.churchAddress,
      contactName: r.contactName,
      contactPosition: r.contactPosition,
      contactPhone: r.contactPhone,
      denomination: r.denomination,
      applicantName: r.applicantName,
      mobile: r.mobile,
      examType: toValueCd(lookup100, r.examType),
      applicationNo: r.applicationNo,
      examineNumber: r.examineNumber,
      depositNote: r.depositNote,
      participationStatus: toValueCd(lookup110, r.participationStatus),
      feeConfirmed: toValueCd(lookup130, r.feeConfirmed),
      contacConfirmed: toValueCd(lookup130, r.contacConfirmed),
      refundRequest: toValueCd(lookup120, r.refundRequest),
      refundConfirmed: toValueCd(lookup130, r.refundConfirmed),
    }));
    showProgress("저장 중...");
    try {
      await admin.patchApplications(updates);
      toSend.forEach((r) => dirtyRowKeys.delete(rowKey(r)));
      hideProgress();
      showModal("저장되었습니다.");
    } catch (e) {
      hideProgress();
      showModal("저장 실패: " + (e.message || e.data?.error || ""));
    }
  }

  /** 엑셀 다운로드 시 셀 값: 드롭다운 컬럼은 value_nm, 휴대폰은 포맷, 나머지는 그대로 */
  function getExcelCellValue(field, value) {
    if (value == null || value === "") return "";
    const v = String(value).trim();
    if (field === "examType") return getLookupLabel(lookup100, v) || v;
    if (field === "participationStatus") return getLookupLabel(lookup110, v) || v;
    if (field === "feeConfirmed" || field === "contacConfirmed" || field === "refundConfirmed") return getLookupLabel(lookup130, v) || v;
    if (field === "refundRequest") return getLookupLabel(lookup120, v) || v;
    if (field === "mobile" || field === "contactPhone" || field === "submitterPhone") return formatPhoneDisplay(v) || v;
    return v;
  }

  function onExcel() {
    if (!gridApi) return;
    const cols = gridApi.getColumnDefs?.() || gridApi.getGridOption?.("columnDefs") || [];
    const processCell = (params) => {
      const field = params.column?.getColId?.() ?? params.column?.colId ?? params.colDef?.field;
      return getExcelCellValue(field, params.value) ?? "";
    };
    const csv = typeof gridApi.getDataAsCsv === "function"
      ? gridApi.getDataAsCsv({ processCellCallback: processCell })
      : null;
    if (!csv) {
      const rows = getGridRowData();
      const headers = cols.map((c) => c.headerName || c.field || "").join(",");
      const lines = [headers];
      rows.forEach((r) => {
        lines.push(cols.map((c) => '"' + String(getExcelCellValue(c.field, r[c.field] ?? "")).replace(/"/g, '""') + '"').join(","));
      });
      downloadCsv(lines.join("\n"), "신청목록.csv");
      return;
    }
    downloadCsv("\uFEFF" + csv, "신청목록.csv"); // BOM for Excel
  }

  function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** 엑셀 업로드 템플릿: Firebase Storage에 있는 xlsx 파일 다운로드 */
  async function onExcelTemplate() {
    if (typeof firebase === "undefined" || !firebase.storage) {
      showModal("Storage를 사용할 수 없습니다.");
      return;
    }
    const storagePath = "bible_olympia_exam_template.xlsx";
    const downloadFileName = "바이블올림피아드대회_수험번호등록_템플릿.xlsx";
    const pathsToTry = [
      storagePath,
      "templates/" + storagePath,
    ];
    let lastError = null;
    for (const templatePath of pathsToTry) {
      try {
        const ref = firebase.storage().ref(templatePath);
        const url = await ref.getDownloadURL();
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadFileName;
        a.rel = "noopener";
        a.target = "_blank";
        a.click();
        return;
      } catch (e) {
        lastError = e;
      }
    }
    const msg = (lastError && lastError.code === "storage/object-not-found")
      ? "Storage에 템플릿 파일이 없습니다. Firebase 콘솔 > Storage에 파일명 'bible_olympia_exam_template.xlsx' 로 업로드해 주세요."
      : "템플릿 다운로드 실패: " + (lastError ? (lastError.message || String(lastError)) : "");
    showModal(msg);
  }

  /** 엑셀 업로드: PC 파일에서 A열=등록번호, B열=수험번호 읽어 bo_person.examineNumber DB 반영 (1행 타이틀, 2행부터 처리) */
  async function onExcelUpload() {
    const input = document.getElementById("inputExcelUpload");
    if (!input) return;
    input.value = "";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
      let updates = [];
      if (isXlsx && typeof XLSX !== "undefined") {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
        const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        for (let i = 1; i < (rows?.length || 0); i++) {
          const row = rows[i] || [];
          const applicationNo = String(row[0] ?? "").trim();
          const examineNumber = String(row[1] ?? "").trim();
          if (applicationNo) updates.push({ applicationNo, examineNumber });
        }
      } else {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result || "").toString());
          reader.onerror = reject;
          reader.readAsText(file, "UTF-8");
        });
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length < 2) {
          showModal("1행은 타이틀, 2행부터 등록번호(A)·수험번호(B)가 필요합니다.");
          return;
        }
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i]);
          const applicationNo = String(values[0] ?? "").trim();
          const examineNumber = String(values[1] ?? "").trim();
          if (applicationNo) updates.push({ applicationNo, examineNumber });
        }
      }
      if (updates.length === 0) {
        showModal("등록번호(A열)가 있는 데이터 행이 없습니다. 2행부터 입력해 주세요.");
        return;
      }
      showProgress("수험번호 반영 중...");
      try {
        const res = await admin.bulkUpdateExamineNumber(updates);
        hideProgress();
        const count = res?.updated ?? 0;
        showModal(count + "건 수험번호가 반영되었습니다.");
        onSearch();
      } catch (e) {
        hideProgress();
        showModal("반영 실패: " + (e.message || e.data?.error || String(e)));
      }
    };
    input.click();
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (inQuotes) {
        cur += ch;
      } else if (ch === ",") {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  async function init() {
    if (!gridDom) return;
    if (applicationsInitDone) return;
    const user = getCurrentUser();
    if (!user) return;
    applicationsInitDone = true;
    await loadLookupOptions();
    initFilterDropdowns();
    initGrid();
    document.getElementById("btnSearch")?.addEventListener("click", onSearch);
    document.getElementById("btnSave")?.addEventListener("click", onSave);
    document.getElementById("btnExcelTemplate")?.addEventListener("click", onExcelTemplate);
    document.getElementById("btnExcelUpload")?.addEventListener("click", onExcelUpload);
    document.getElementById("btnExcel")?.addEventListener("click", onExcel);
    onSearch();
  }

  // Auth 복원/로그인 후에만 그리드 초기화 (getCurrentUser()가 null인 채로 init()이 실행되는 것 방지)
  addAuthStateListener((user) => {
    if (user && gridDom) init();
  });
  // 이미 로그인된 상태로 페이지 진입한 경우(복원이 먼저 끝났을 수 있음)
  if (getCurrentUser() && gridDom) init();
}
