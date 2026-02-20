/**
 * 비관리자: 신청서/신청현황 링크 클릭 시 공고 기간(start_ymd ~ end_ymd) 안에 있을 때만 이동 허용.
 * 기간 외에는 "지금은 신청서 작성일정이 아님니다." 메시지 표시.
 */
import { announcements, admin } from "./api.js";
import { showModal } from "./modal.js";

function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function normYmd(val) {
  if (val == null) return "";
  const s = String(val).trim().replace(/-/g, "");
  return s.length >= 8 ? s.slice(0, 8) : "";
}

function isInAnnouncementPeriod(items) {
  const today = getTodayYmd();
  return (items || []).some((a) => {
    const start = normYmd(a.start_ymd);
    const end = normYmd(a.end_ymd);
    return start.length === 8 && end.length === 8 && today >= start && today <= end;
  });
}

const MESSAGE_PERIOD = "지금은 바이블 올림피아드대회 신청 기간이 아닙니다.";
const MESSAGE_ADMIN_ONLY = "관리자만 접근할 수 있습니다.";

function handleApplicationLinkClick(e) {
  const link = e.target.closest('a[href="/apply.html"], a[href="/status.html"], a[href="/admin/"]');
  if (!link) return;
  e.preventDefault();
  e.stopPropagation();
  const href = link.getAttribute("href");
  const isAdminLink = href === "/admin/" || (href && href.replace(/\/$/, "") === "/admin");

  (async () => {
    try {
      const status = await admin.check();
      if (status && status.admin) {
        window.location.href = href;
        return;
      }
      // 관리자 링크인데 비관리자 → 권한 메시지 후 차단
      if (isAdminLink) {
        await showModal(MESSAGE_ADMIN_ONLY);
        return;
      }
    } catch (_) {
      // 비로그인 또는 비관리자
      if (isAdminLink) {
        await showModal(MESSAGE_ADMIN_ONLY);
        return;
      }
    }
    // 신청서/신청현황: 기간 검사
    try {
      const res = await announcements.list();
      const inPeriod = isInAnnouncementPeriod(res?.items);
      if (inPeriod) {
        window.location.href = href;
      } else {
        await showModal(MESSAGE_PERIOD);
      }
    } catch (_) {
      await showModal(MESSAGE_PERIOD);
    }
  })();
}

export function initApplicationPeriodGuard() {
  // 캡처 단계에서 document에 한 번만 등록 → 홈/신청서/신청현황 모든 페이지에서 링크 클릭 가로채기
  document.body.addEventListener("click", handleApplicationLinkClick, true);
}
