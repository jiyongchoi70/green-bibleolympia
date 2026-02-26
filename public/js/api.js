/**
 * 백엔드 API 호출 (Authorization Bearer 토큰 포함)
 */
import { getIdToken } from "./auth.js";

const API_BASE = "";

async function apiOnce(path, options, forceRefresh) {
  const token = await getIdToken(forceRefresh);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { error: text || "Unknown error" };
  }
  return { res, data, text };
}

export async function api(path, options = {}) {
  const isAdminPath = path.startsWith("/api/admin/");
  let { res, data, text } = await apiOnce(path, options, isAdminPath);
  // 관리자 API 403 시 토큰 강제 갱신 후 1회 재시도
  if (isAdminPath && res.status === 403 && data?.error && String(data.error).includes("관리자")) {
    const retry = await apiOnce(path, options, true);
    if (retry.res.ok) return retry.data;
    res = retry.res;
    data = retry.data;
    text = retry.text;
  }
  if (!res.ok) {
    let message = data?.error;
    if (typeof message === "string" && (message.trim().startsWith("<") || message.includes("<title>"))) {
      message = res.status === 404
        ? "API 서버를 찾을 수 없습니다(404). Cloud Functions(olympia_api)가 배포되었는지 확인하세요."
        : "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.";
      if (data && typeof data === "object") data.error = message;
    }
    if (!message) message = res.statusText || "Request failed";
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data ?? null;
}

export const applications = {
  list: () => api("/api/applications"),
  /** 신청현황: 로그인 사용자 본인 신청 person 목록 (조회 전용) */
  myList: () => api("/api/my-applications"),
  create: (body) => api("/api/applications", { method: "POST", body: JSON.stringify(body) }),
  get: (id) => api(`/api/applications/${id}`),
};

/** 공통코드 옵션 (type_cd: 100 응시구분, 110 참가여부, 120 환불요청, 130 참가비/환불지급 등). 로그인 필요. */
export function lookupOptions(typeCd) {
  return api("/api/lookup-options?type_cd=" + encodeURIComponent(typeCd || ""));
}

export const announcements = {
  list: () => api("/api/announcements"),
};

export const commonCodes = {
  list: (group) => api("/api/common-codes" + (group ? `?group=${encodeURIComponent(group)}` : "")),
};

export const admin = {
  /** 현재 사용자의 관리자 여부 확인 (디버그용) */
  check: () => api("/api/admin/check"),
  /** 신청 목록 (필터 파라미터 optional) */
  applications: (params) => {
    const q = new URLSearchParams();
    if (params?.churchName) q.set("churchName", params.churchName);
    if (params?.contactName) q.set("contactName", params.contactName);
    if (params?.applicant) q.set("applicant", params.applicant);
    if (params?.examType) q.set("examType", params.examType);
    if (params?.participationStatus) q.set("participationStatus", params.participationStatus);
    if (params?.feeConfirmed) q.set("feeConfirmed", params.feeConfirmed);
    if (params?.contacConfirmed) q.set("contacConfirmed", params.contacConfirmed);
    if (params?.refundRequest) q.set("refundRequest", params.refundRequest);
    if (params?.refundConfirmed) q.set("refundConfirmed", params.refundConfirmed);
    const query = q.toString();
    return api("/api/admin/applications" + (query ? "?" + query : ""));
  },
  /** 그리드 편집 일괄 저장 */
  patchApplications: (updates) => api("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ updates }) }),
  /** 엑셀 수험번호 일괄 반영: updates = [ { applicationNo, examineNumber }, ... ] */
  bulkUpdateExamineNumber: (updates) => api("/api/admin/bulk-update-examine-number", { method: "POST", body: JSON.stringify({ updates }) }),
  /** 담당자 목록 조회 (churchName, contactName, contactPhone 필터) */
  contactList: (params) => {
    const q = new URLSearchParams();
    if (params?.churchName) q.set("churchName", params.churchName);
    if (params?.contactName) q.set("contactName", params.contactName);
    if (params?.contactPhone) q.set("contactPhone", params.contactPhone);
    const query = q.toString();
    return api("/api/admin/contact-list" + (query ? "?" + query : ""));
  },
  /** 담당자 목록 저장 (applications 교회/담당자 필드만) */
  patchContactList: (updates) => api("/api/admin/contact-list", { method: "PATCH", body: JSON.stringify({ updates }) }),
  /** 공통코드 옵션 (type_cd: 110 참가여부, 120 환불요청, 130 참가비/담당자연락/환불지급) */
  lookupOptions: (typeCd) => api("/api/admin/lookup-options?type_cd=" + encodeURIComponent(typeCd)),
  users: (params) => {
    const q = new URLSearchParams();
    if (params?.name) q.set("name", params.name);
    if (params?.phone) q.set("phone", params.phone);
    if (params?.userType && params.userType !== "전체") q.set("userType", params.userType);
    const query = q.toString();
    return api("/api/admin/users" + (query ? "?" + query : ""));
  },
  userUpdate: (userId, body) => api(`/api/admin/users/${userId}`, { method: "PUT", body: JSON.stringify(body) }),
  /** 초기화: 관리자 외 신청자/제출자/응시자 삭제 (applications, bo_person, Auth, bo_users) */
  usersReset: () => api("/api/admin/users/reset", { method: "POST" }),
  announcements: {
    list: () => api("/api/admin/announcements"),
    create: (body) => api("/api/admin/announcements", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) => api(`/api/admin/announcements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id) => api(`/api/admin/announcements/${id}`, { method: "DELETE" }),
  },
  customerservice: {
    list: () => api("/api/admin/customerservice"),
    create: (body) => api("/api/admin/customerservice", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) => api(`/api/admin/customerservice/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id) => api(`/api/admin/customerservice/${id}`, { method: "DELETE" }),
  },
  commonCodes: {
    list: () => api("/api/admin/common-codes"),
    create: (body) => api("/api/admin/common-codes", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) => api(`/api/admin/common-codes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id) => api(`/api/admin/common-codes/${id}`, { method: "DELETE" }),
  },
};
