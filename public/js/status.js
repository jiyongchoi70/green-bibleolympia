/**
 * 신청현황: 로그인 사용자 본인 신청 목록 (AG Grid, 조회 전용, 엑셀 다운로드)
 * 화면 오픈 시 자동 조회, 조회 중 모달 표시.
 */
import { getCurrentUser, initAuthUI } from "./auth.js";
import { applications, lookupOptions } from "./api.js";
import { showLoadingModal, hideLoadingModal, showModal } from "./modal.js";
import { initApplicationPeriodGuard } from "./application-period-guard.js";

initApplicationPeriodGuard();

const gridDom = document.getElementById("agGridStatus");
if (!gridDom) {
  // not on this page
} else {
  let gridApi = null;
  const lookup100 = [];
  const lookup110 = [];
  const lookup120 = [];
  const lookup130 = [];

  function showNeedLogin() {
    document.getElementById("needLogin").classList.remove("hidden");
    document.getElementById("content").classList.add("hidden");
  }

  function showContent() {
    document.getElementById("needLogin").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
  }

  function getLookupLabel(options, valueCd) {
    if (valueCd == null || valueCd === "") return "";
    const o = (options || []).find((x) => String(x.value_cd ?? x.value ?? "") === String(valueCd));
    return o ? (o.value_nm ?? o.label ?? "") : valueCd;
  }

  function formatPhoneDisplay(digits) {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  async function loadLookups() {
    try {
      const [r100, r110, r120, r130] = await Promise.all([
        lookupOptions("100"),
        lookupOptions("110"),
        lookupOptions("120"),
        lookupOptions("130"),
      ]);
      if (r100?.options) lookup100.push(...r100.options);
      if (r110?.options) lookup110.push(...r110.options);
      if (r120?.options) lookup120.push(...r120.options);
      if (r130?.options) lookup130.push(...r130.options);
    } catch (e) {
      console.warn("lookup options load failed", e);
    }
  }

  function initGrid() {
    const columnDefs = [
      { field: "order", headerName: "순서", width: 70, pinned: "left" },
      { field: "examineNumber", headerName: "수험번호", width: 140, pinned: "left" },
      { field: "examType", headerName: "응시구분", width: 110, pinned: "left", valueFormatter: (p) => getLookupLabel(lookup100, p.value) },
      { field: "applicantName", headerName: "응시자", width: 110, pinned: "left" },
      { field: "feeConfirmed", headerName: "참가비확인여부", width: 140, valueFormatter: (p) => getLookupLabel(lookup130, p.value) },
      { field: "participationStatus", headerName: "참가여부", width: 110, valueFormatter: (p) => getLookupLabel(lookup110, p.value) },
      { field: "refundRequest", headerName: "환불요청", width: 110, valueFormatter: (p) => getLookupLabel(lookup120, p.value) },
      { field: "refundConfirmed", headerName: "환불지급여부", width: 140, valueFormatter: (p) => getLookupLabel(lookup130, p.value) },
      { field: "mobile", headerName: "휴대폰", width: 140, valueFormatter: (p) => formatPhoneDisplay(p.value) || (p.value ?? "") },
      { field: "depositNote", headerName: "응시비 입금 시 기록 내용", width: 220 },
    ];
    const gridOptions = {
      columnDefs,
      defaultColDef: { sortable: true, resizable: true, minWidth: 80 },
      editable: false,
      rowData: [],
      domLayout: "normal",
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

  function getExcelCellValue(field, value) {
    if (value == null || value === "") return "";
    if (field === "examType") return getLookupLabel(lookup100, value);
    if (field === "participationStatus") return getLookupLabel(lookup110, value);
    if (field === "feeConfirmed" || field === "refundConfirmed") return getLookupLabel(lookup130, value);
    if (field === "refundRequest") return getLookupLabel(lookup120, value);
    if (field === "mobile") return formatPhoneDisplay(value) || value;
    return String(value);
  }

  function onExcelDownload() {
    if (!gridApi) return;
    const rowData = (typeof gridApi.getRowData === "function" ? gridApi.getRowData() : gridApi.getGridOption?.("rowData")) || [];
    if (rowData.length === 0) return;
    const headers = ["순서", "수험번호", "응시구분", "응시자", "참가비확인여부", "참가여부", "환불요청", "환불지급여부", "휴대폰", "응시비 입금 시 기록 내용"];
    const fields = ["order", "examineNumber", "examType", "applicantName", "feeConfirmed", "participationStatus", "refundRequest", "refundConfirmed", "mobile", "depositNote"];
    const csv = typeof gridApi.getDataAsCsv === "function"
      ? gridApi.getDataAsCsv({
          processCellCallback: (params) => {
            const field = params.column?.getColId?.() ?? "";
            return getExcelCellValue(field, params.value);
          },
        })
      : null;
    if (csv) {
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "신청현황_" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const rows = [headers.join(",")];
      rowData.forEach((r) => {
        rows.push(fields.map((f) => {
          const v = getExcelCellValue(f, r[f]);
          const s = String(v ?? "").replace(/"/g, '""');
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
        }).join(","));
      });
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + rows.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "신청현황_" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function load() {
    showLoadingModal("조회 중...");
    try {
      await loadLookups();
      const res = await applications.myList();
      const items = (res && res.items) || [];
      if (gridApi) {
        if (typeof gridApi.setRowData === "function") gridApi.setRowData(items);
        else if (typeof gridApi.setGridOption === "function") gridApi.setGridOption("rowData", items);
      }
    } catch (err) {
      const msg = (err && err.message) || (err && err.data && err.data.error) || "조회에 실패했습니다.";
      showModal("오류: " + msg);
      if (gridApi && typeof gridApi.setRowData === "function") gridApi.setRowData([]);
    } finally {
      hideLoadingModal();
    }
  }

  function init() {
    initAuthUI();
    const check = () => {
      if (getCurrentUser()) {
        showContent();
        if (!gridApi) initGrid();
        const excelBtn = document.getElementById("btnExcel");
        if (excelBtn && !excelBtn._statusBound) {
          excelBtn._statusBound = true;
          excelBtn.addEventListener("click", onExcelDownload);
        }
        load();
      } else {
        showNeedLogin();
      }
    };
    setTimeout(check, 500);
    setTimeout(check, 1500);
  }

  init();
}
