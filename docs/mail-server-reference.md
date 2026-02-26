# 메일 서버 참조 (다른 프로젝트에서 참고용)

## 1. 사용 서비스

| 항목 | 내용 |
|------|------|
| **서비스** | [Resend](https://resend.com) |
| **API 엔드포인트** | `POST https://api.resend.com/emails` |
| **인증** | `Authorization: Bearer <API_KEY>` |

---

## 2. 환경 변수 (Cloud Functions 등)

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| **RESEND_API_KEY** | 예 | Resend 대시보드에서 발급한 API 키 | `re_xxxx...` |
| **RESEND_FROM_EMAIL** | 예 | 발신 주소. Resend에서 **인증(Verified)된 도메인**이어야 함 | `noreply@treegreen.co.kr` |

- `RESEND_API_KEY`가 없으면 일배치 메일은 스킵됨(에러 없이 로그만 출력).

---

## 3. 도메인 / DNS (현재 프로젝트 기준)

| 항목 | 내용 |
|------|------|
| **발신 도메인** | `treegreen.co.kr` |
| **발신 주소** | `noreply@treegreen.co.kr` |
| **DNS** | Dothome 등 도메인 관리처에서 Resend 안내에 따라 설정 |
| **Resend 설정** | 대시보드에서 도메인 추가 후 DKIM(MX/SPF/TXT) 인증 완료 필요 |

- Resend에서 도메인 인증이 완료되어야 해당 주소로 발송 가능.

---

## 4. API 호출 예시 (Python)

```python
import os
import requests

api_key = os.environㅂ.get("RESEND_API_KEY", "").strip()
from_email = os.environ.get("RESEND_FROM_EMAIL", "").strip()

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}
payload = {
    "from": from_email,
    "to": ["recipient@example.com"],  # 또는 리스트 여러 개
    "subject": "제목",
    "text": "평문 본문",
    "html": "<p>HTML 본문</p>",  # 선택
}

r = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=30)
# 200대: 성공, 4xx/5xx: 실패 (r.status_code, r.text 확인)
```

---

## 5. 이 프로젝트에서의 사용처

| 항목 | 내용 |
|------|------|
| **기능** | 일배치 메일 (지원현황) |
| **함수** | Cloud Functions `daily_report_email` (매일 08:00 KST) |
| **코드 위치** | `functions/main.py` → `_run_daily_report_email()` |
| **수신자 조건** | Firestore `bo_users` 컬렉션에서 `emailyn == '100'` 인 문서의 `eMail` |
| **제목 형식** | `전국 바이블 올림피이드 대회 지원현황 입니다. (YYYY-MM-DD)` |
| **날짜 기준** | 한국 시간(Asia/Seoul) 기준 당일 |

---

## 6. Cloud Console에서 환경 변수 설정

1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 선택
2. **Cloud Functions** → `daily_report_email` 함수 선택 → **편집**
3. **환경 변수** 섹션에서 다음 추가:
   - `RESEND_API_KEY` = Resend API 키
   - `RESEND_FROM_EMAIL` = `noreply@treegreen.co.kr` (또는 인증된 다른 주소)

---

## 7. 참고 링크

- Resend 문서: https://resend.com/docs
- Resend API: https://resend.com/docs/api-reference/emails/send-email
