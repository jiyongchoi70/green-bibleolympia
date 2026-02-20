"""
전국 바이블 올림피아드 - Cloud Functions (Python)
신청서, 신청현황, 사용자, 공고내용, 공통코드 API
"""
import json
import os
from flask import Flask, request, jsonify

# 지연 초기화: 배포 discovery 타임아웃 방지 (firebase_admin 미로드)
_db = None
_firestore_module = None

def get_db():
    global _db, _firestore_module
    if _db is None:
        import firebase_admin
        from firebase_admin import firestore
        _firestore_module = firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _db = firestore.client()
    return _db

def _firestore():
    """firestore 모듈 (SERVER_TIMESTAMP, Query 등). get_db() 호출 후 사용."""
    get_db()
    return _firestore_module

app = Flask(__name__)


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _json_response(data, status=200):
    return (json.dumps(data, ensure_ascii=False, default=str), status, _cors_headers())


def _get_auth_header():
    """Authorization 헤더 존재 여부"""
    return request.headers.get("Authorization") or ""


def _get_decoded_token():
    """Authorization: Bearer <idToken> 검증 후 decoded payload 반환. 실패 시 None."""
    from firebase_admin import auth
    get_db()  # Firebase Admin 초기화 (auth 사용 전에 필요)
    auth_header = _get_auth_header()
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split("Bearer ")[-1].strip()
    if not token:
        return None
    try:
        return auth.verify_id_token(token)
    except Exception:
        return None


def _get_uid_from_token():
    """Authorization: Bearer <idToken> 에서 uid 추출"""
    decoded = _get_decoded_token()
    return (decoded or {}).get("uid") if decoded else None


def _get_admin_claim(uid):
    """uid의 admin custom claim 값 반환 (Auth 서버 기준)."""
    from firebase_admin import auth
    if not uid:
        return None
    try:
        user = auth.get_user(uid)
        return (user.custom_claims or {}).get("admin")
    except Exception:
        return None


def _require_admin(uid, decoded=None):
    """관리자 여부: 토큰 payload의 admin 우선, 없으면 Auth 서버 custom_claims 사용."""
    if decoded is not None and decoded.get("admin"):
        return True
    return bool(_get_admin_claim(uid))


# ---------- 신청 (Applicant) ----------

@app.route("/api/applications", methods=["GET", "OPTIONS"])
def list_applications():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    uid = _get_uid_from_token()
    if not uid:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    # 본인 신청서만 조회
    ref = get_db().collection("applications").where("userId", "==", uid)
    docs = ref.stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return _json_response({"items": items})


@app.route("/api/my-applications", methods=["GET", "OPTIONS"])
def my_applications():
    """로그인 사용자 본인의 신청현황: applications + bo_person 조인, person 단위 행 (조회 전용)."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    uid = _get_uid_from_token()
    if not uid:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    db = get_db()
    ref = db.collection("applications").where("userId", "==", uid)
    app_docs = list(ref.stream())
    app_ids = [d.id for d in app_docs]
    if not app_ids:
        return _json_response({"items": []})

    person_by_app = {aid: [] for aid in app_ids}
    chunk_size = 30
    for i in range(0, len(app_ids), chunk_size):
        chunk = app_ids[i : i + chunk_size]
        person_snap = db.collection("bo_person").where("applicationId", "in", chunk).get()
        for p in person_snap:
            data = p.to_dict()
            aid = data.get("applicationId")
            if aid in person_by_app:
                person_by_app[aid].append({"id": p.id, **data})

    def _create_ymd_to_display(ymd):
        if not ymd:
            return ""
        s = str(ymd).strip()
        if len(s) >= 8:
            return s[:4] + "-" + s[4:6] + "-" + s[6:8]
        return s

    rows = []
    seq = 0
    for d in app_docs:
        app_data = d.to_dict()
        app_id = d.id
        persons = person_by_app.get(app_id, [])
        created_at = app_data.get("createdAt")
        created_str = ""
        if hasattr(created_at, "isoformat"):
            created_str = created_at.isoformat()[:10] if created_at else ""
        elif isinstance(created_at, str):
            created_str = created_at[:10] if len(created_at) >= 10 else created_at
        app_row_base = {
            "applicationId": app_id,
            "churchName": (app_data.get("churchName") or ""),
            "contactName": (app_data.get("contactName") or ""),
            "pastorName": (app_data.get("pastorName") or ""),
            "churchAddress": (app_data.get("churchAddress") or ""),
            "denomination": (app_data.get("denomination") or ""),
            "submittedAt": created_str,
        }
        if not persons:
            seq += 1
            row = {
                **app_row_base,
                "personId": "",
                "order": seq,
                "examineNumber": "",
                "examType": "",
                "applicantName": "",
                "mobile": "",
                "depositNote": "",
                "participationStatus": "",
                "feeConfirmed": "",
                "refundRequest": "",
                "refundConfirmed": "",
            }
            rows.append(row)
        else:
            for p in persons:
                seq += 1
                app_no = p.get("applicationNo")
                app_no_str = str(app_no) if app_no not in (None, "") else ""
                examine_no = p.get("examineNumber")
                examine_no_str = str(examine_no).strip() if examine_no not in (None, "") else ""
                row = {
                    **app_row_base,
                    "personId": p.get("id", ""),
                    "order": seq,
                    "examineNumber": examine_no_str,
                    "examType": (p.get("examType") or ""),
                    "applicantName": (p.get("applicantName") or ""),
                    "mobile": (p.get("mobile") or ""),
                    "depositNote": (p.get("depositNote") or ""),
                    "participationStatus": (p.get("participationStatus") or ""),
                    "feeConfirmed": (p.get("feeConfirmed") or ""),
                    "refundRequest": (p.get("refundRequest") or ""),
                    "refundConfirmed": (p.get("refundConfirmed") or ""),
                }
                row["submittedAt"] = _create_ymd_to_display(p.get("create_ymd")) or created_str
                rows.append(row)
    rows.sort(key=lambda r: ((r.get("examType") or "").strip(), (r.get("applicantName") or "").strip()))
    for i, r in enumerate(rows, start=1):
        r["order"] = i
    return _json_response({"items": rows})


def _today_ymd_app():
    from datetime import date
    return date.today().strftime("%Y%m%d")


def _ymd_to_int_app(ymd):
    if not ymd:
        return None
    s = str(ymd).replace("-", "").strip()
    if len(s) != 8 or not s.isdigit():
        return None
    return int(s)


@app.route("/api/lookup-options", methods=["GET", "OPTIONS"])
def public_lookup_options():
    """로그인 사용자용 공통코드 옵션 (type_cd=100,110,120,130). 관리자 아님도 호출 가능."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    type_cd = (request.args.get("type_cd") or "").strip()
    if not type_cd:
        return _json_response({"error": "type_cd 필요"}, 400)
    today = _ymd_to_int_app(_today_ymd_app()) or 0
    db = get_db()
    ref = db.collection("bo_lookup_value").where("type_cd", "==", type_cd)
    docs = list(ref.stream())
    options = []
    for d in docs:
        data = d.to_dict()
        start_int = _ymd_to_int_app(data.get("start_ymd"))
        end_int = _ymd_to_int_app(data.get("end_ymd"))
        if start_int is not None and end_int is not None and start_int <= today <= end_int:
            options.append({
                "value_cd": str(data.get("value_cd", "")),
                "value_nm": str(data.get("value_nm", "")),
            })
    options.sort(key=lambda x: (x["value_nm"], x["value_cd"]))
    return _json_response({"options": options})


@app.route("/api/applications", methods=["POST", "OPTIONS"])
def create_application():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    uid = _get_uid_from_token()
    if not uid:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    data = request.get_json() or {}
    data["userId"] = uid
    data["status"] = data.get("status", "제출")
    data["createdAt"] = _firestore().SERVER_TIMESTAMP
    ref = get_db().collection("applications").document()
    ref.set(data)
    return _json_response({"id": ref.id, **data}, 201)


@app.route("/api/applications/<app_id>", methods=["GET", "OPTIONS"])
def get_application(app_id):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    uid = _get_uid_from_token()
    if not uid:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    doc = get_db().collection("applications").document(app_id).get()
    if not doc.exists:
        return _json_response({"error": "신청서를 찾을 수 없습니다."}, 404)
    d = doc.to_dict()
    if d.get("userId") != uid and not _require_admin(uid):
        return _json_response({"error": "권한이 없습니다."}, 403)
    return _json_response({"id": doc.id, **d})


# ---------- 관리자: 권한 확인 (디버그용, 로그인 사용자만 호출 가능) ----------

@app.route("/api/admin/check", methods=["GET", "OPTIONS"])
def admin_check():
    """현재 로그인 사용자의 관리자 여부 확인. 401/403 원인 파악용."""
    from firebase_admin import auth as firebase_auth
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    # Firebase Admin 초기화 (auth 사용 전에 필요)
    get_db()
    has_header = _get_auth_header().startswith("Bearer ")
    token_str = (_get_auth_header().split("Bearer ")[-1] or "").strip() if has_header else ""
    decoded = None
    verify_error = None
    if has_header and token_str:
        try:
            decoded = firebase_auth.verify_id_token(token_str)
        except firebase_auth.ExpiredIdTokenError:
            verify_error = "토큰이 만료되었습니다. 로그아웃 후 다시 로그인하세요."
        except firebase_auth.RevokedIdTokenError:
            verify_error = "토큰이 폐기되었습니다. 로그아웃 후 다시 로그인하세요."
        except firebase_auth.InvalidIdTokenError as e:
            verify_error = "토큰이 올바르지 않습니다. (다른 프로젝트 토큰일 수 있음. firebase-config.js projectId와 배포한 프로젝트가 동일한지 확인하세요.)"
        except Exception as e:
            verify_error = "토큰 검증 실패: " + str(e)[:80]
    if not decoded:
        hint = verify_error if verify_error else (
            "Authorization 헤더가 없거나 토큰이 올바르지 않습니다. (firebase-config.js의 projectId가 이 프로젝트와 같은지 확인하세요.)" if has_header
            else "Authorization 헤더가 전달되지 않았습니다. 로그아웃 후 다시 로그인하세요."
        )
        return _json_response({"error": "인증이 필요합니다.", "hint": hint}, 401)
    uid = decoded.get("uid")
    claim_from_token = decoded.get("admin")
    claim_from_server = _get_admin_claim(uid)
    is_admin = _require_admin(uid, decoded)
    return _json_response({
        "uid": uid,
        "admin": is_admin,
        "admin_claim": claim_from_server,
        "admin_in_token": claim_from_token,
    })


# ---------- 관리자: 신청 목록 전체 (applications + bo_person 조인, 필터) ----------

def _today_ymd():
    from datetime import date
    d = date.today()
    return d.strftime("%Y%m%d")

@app.route("/api/admin/applications", methods=["GET", "OPTIONS"])
def admin_list_applications():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    db = get_db()
    # 필터 쿼리 파라미터 (value_cd 또는 value_nm 기준)
    church_name_q = (request.args.get("churchName") or "").strip()
    contact_name_q = (request.args.get("contactName") or "").strip()
    applicant_q = (request.args.get("applicant") or "").strip()
    exam_type_q = (request.args.get("examType") or "").strip()
    participation_q = (request.args.get("participationStatus") or "").strip()
    fee_confirmed_q = (request.args.get("feeConfirmed") or "").strip()
    contac_confirmed_q = (request.args.get("contacConfirmed") or "").strip()
    refund_request_q = (request.args.get("refundRequest") or "").strip()
    refund_confirmed_q = (request.args.get("refundConfirmed") or "").strip()

    ref = db.collection("applications").order_by("userId").limit(500)
    app_docs = list(ref.stream())
    app_ids = [d.id for d in app_docs]
    if not app_ids:
        return _json_response({"items": []})

    # bo_person 조회 (applicationId in 최대 30개씩)
    person_by_app = {aid: [] for aid in app_ids}
    chunk_size = 30
    for i in range(0, len(app_ids), chunk_size):
        chunk = app_ids[i : i + chunk_size]
        person_snap = db.collection("bo_person").where("applicationId", "in", chunk).get()
        for p in person_snap:
            data = p.to_dict()
            aid = data.get("applicationId")
            if aid in person_by_app:
                person_by_app[aid].append({"id": p.id, **data})

    # bo_users 배치 조회 (1회 RPC로 여러 문서 조회, N+1 방지)
    user_ids = set()
    for d in app_docs:
        uid = (d.to_dict().get("userId") or "").strip()
        if uid:
            user_ids.add(uid)
    for aid, plist in person_by_app.items():
        for p in plist:
            puid = (p.get("userId") or "").strip()
            if puid:
                user_ids.add(puid)
    user_info = {}
    if user_ids:
        user_id_list = list(user_ids)
        # Firestore get_all 최대 개수 고려해 100건 단위로 배치 조회
        batch_size = 100
        for i in range(0, len(user_id_list), batch_size):
            chunk = user_id_list[i : i + batch_size]
            refs = [db.collection("bo_users").document(uid) for uid in chunk]
            for bu in db.get_all(refs):
                uid = bu.reference.id
                if bu.exists:
                    data = bu.to_dict() or {}
                    name_val = (data.get("Name") or "").strip()
                    phone_val = (data.get("Phone") or "").strip()
                    user_info[uid] = {"submitterName": name_val, "submitterPhone": phone_val}
                else:
                    user_info[uid] = {"submitterName": "", "submitterPhone": ""}
    for uid in user_ids:
        if uid not in user_info:
            user_info[uid] = {"submitterName": "", "submitterPhone": ""}

    rows = []
    seq = 0
    for d in app_docs:
        app_data = d.to_dict()
        app_id = d.id
        persons = person_by_app.get(app_id, [])
        created_at = app_data.get("createdAt")
        created_str = ""
        if hasattr(created_at, "isoformat"):
            created_str = created_at.isoformat()[:10] if created_at else ""
        elif isinstance(created_at, str):
            created_str = created_at[:10] if len(created_at) >= 10 else created_at
        uid = (app_data.get("userId") or "").strip()
        if not uid and persons:
            uid = (persons[0].get("userId") or "").strip()
        u = user_info.get(uid, {})
        app_row_base = {
            "applicationId": app_id,
            "churchName": (app_data.get("churchName") or ""),
            "contactName": (app_data.get("contactName") or ""),
            "contactPosition": (app_data.get("contactPosition") or ""),
            "contactPhone": (app_data.get("contactPhone") or ""),
            "pastorName": (app_data.get("pastorName") or ""),
            "churchAddress": (app_data.get("churchAddress") or ""),
            "denomination": (app_data.get("denomination") or ""),
            "userId": uid,
            "submittedAt": created_str,
            "submitterName": u.get("submitterName", ""),
            "submitterPhone": u.get("submitterPhone", ""),
        }

        def _create_ymd_to_display(ymd):
            if not ymd:
                return ""
            s = str(ymd).strip()
            if len(s) >= 8:
                return s[:4] + "-" + s[4:6] + "-" + s[6:8]
            return s
        if not persons:
            seq += 1
            row = {
                **app_row_base,
                "personId": "",
                "order": seq,
                "applicationNo": "",
                "examineNumber": "",
                "examType": "",
                "applicantName": "",
                "mobile": "",
                "depositNote": "",
                "participationStatus": "",
                "feeConfirmed": "",
                "contacConfirmed": "",
                "refundRequest": "",
                "refundConfirmed": "",
            }
            if _apply_list_filters(row, church_name_q, contact_name_q, applicant_q, exam_type_q,
                participation_q, fee_confirmed_q, contac_confirmed_q, refund_request_q, refund_confirmed_q):
                rows.append(row)
        else:
            for p in persons:
                seq += 1
                app_no = p.get("applicationNo")
                app_no_str = str(app_no) if app_no not in (None, "") else ""
                examine_no = p.get("examineNumber")
                examine_no_str = str(examine_no).strip() if examine_no not in (None, "") else ""
                row = {
                    **app_row_base,
                    "personId": p.get("id", ""),
                    "order": seq,
                    "applicationNo": app_no_str,
                    "examineNumber": examine_no_str,
                    "examType": (p.get("examType") or ""),
                    "applicantName": (p.get("applicantName") or ""),
                    "mobile": (p.get("mobile") or ""),
                    "depositNote": (p.get("depositNote") or ""),
                    "participationStatus": (p.get("participationStatus") or ""),
                    "feeConfirmed": (p.get("feeConfirmed") or ""),
                    "contacConfirmed": (p.get("contacConfirmed") or ""),
                    "refundRequest": (p.get("refundRequest") or ""),
                    "refundConfirmed": (p.get("refundConfirmed") or ""),
                }
                row["submittedAt"] = _create_ymd_to_display(p.get("create_ymd")) or created_str
                if _apply_list_filters(row, church_name_q, contact_name_q, applicant_q, exam_type_q,
                    participation_q, fee_confirmed_q, contac_confirmed_q, refund_request_q, refund_confirmed_q):
                    rows.append(row)
    rows.sort(key=lambda r: (
        (r.get("churchName") or "").strip(),
        (r.get("contactName") or "").strip(),
        (r.get("examType") or "").strip(),
        (r.get("applicantName") or "").strip(),
    ))
    for i, r in enumerate(rows, start=1):
        r["order"] = i
    return _json_response({"items": rows})


def _apply_list_filters(row, church_name_q, contact_name_q, applicant_q, exam_type_q,
                        participation_q, fee_confirmed_q, contac_confirmed_q,
                        refund_request_q, refund_confirmed_q):
    if church_name_q and church_name_q.lower() not in (row.get("churchName") or "").lower():
        return False
    if contact_name_q and contact_name_q.lower() not in (row.get("contactName") or "").lower():
        return False
    if applicant_q and applicant_q.lower() not in (row.get("applicantName") or "").lower():
        return False
    if exam_type_q and not _value_matches(exam_type_q, row.get("examType")):
        return False
    if participation_q and not _value_matches(participation_q, row.get("participationStatus")):
        return False
    if fee_confirmed_q and not _value_matches(fee_confirmed_q, row.get("feeConfirmed")):
        return False
    if contac_confirmed_q and not _value_matches(contac_confirmed_q, row.get("contacConfirmed")):
        return False
    if refund_request_q and not _value_matches(refund_request_q, row.get("refundRequest")):
        return False
    if refund_confirmed_q and not _value_matches(refund_confirmed_q, row.get("refundConfirmed")):
        return False
    return True


def _value_matches(param_val, stored_val):
    if not param_val:
        return True
    if param_val == stored_val:
        return True
    if str(param_val).strip() == str(stored_val or "").strip():
        return True
    try:
        if int(param_val) == int(stored_val):
            return True
    except (TypeError, ValueError):
        pass
    return False


@app.route("/api/admin/applications", methods=["PATCH", "OPTIONS"])
def admin_patch_applications():
    """관리자: 그리드 편집 저장. updates[] 각 항목에 applicationId, personId 및 수정할 필드."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    if not _require_admin(decoded.get("uid"), decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    body = request.get_json() or {}
    updates = body.get("updates") or []
    db = get_db()
    app_fields = {"churchName", "pastorName", "churchAddress", "contactName", "contactPosition", "contactPhone", "denomination"}
    person_fields = {"applicantName", "mobile", "examType", "applicationNo", "examineNumber", "depositNote", "participationStatus", "feeConfirmed", "contacConfirmed", "refundRequest", "refundConfirmed"}
    for u in updates:
        app_id = u.get("applicationId")
        person_id = u.get("personId")
        if not app_id:
            continue
        app_up = {k: u[k] for k in app_fields if k in u}
        if app_up:
            db.collection("applications").document(app_id).update(app_up)
        if person_id and isinstance(person_id, str) and person_id.strip():
            person_up = {k: u[k] for k in person_fields if k in u}
            if person_up:
                # applicationNo 숫자로 저장 가능
                if "applicationNo" in person_up and person_up["applicationNo"] not in (None, ""):
                    try:
                        person_up["applicationNo"] = int(person_up["applicationNo"])
                    except (TypeError, ValueError):
                        pass
                db.collection("bo_person").document(person_id).update(person_up)
    return _json_response({"ok": True})


@app.route("/api/admin/bulk-update-examine-number", methods=["POST", "OPTIONS"])
def admin_bulk_update_examine_number():
    """엑셀 업로드: 등록번호(A열)·수험번호(B열) 기준으로 bo_person.examineNumber 일괄 수정."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    if not _require_admin(decoded.get("uid"), decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    body = request.get_json() or {}
    updates = body.get("updates") or []
    if not updates:
        return _json_response({"updated": 0, "message": "반영할 데이터가 없습니다."})
    db = get_db()
    total_updated = 0
    for item in updates:
        app_no_raw = item.get("applicationNo")
        examine_no = (item.get("examineNumber") or "").strip()
        if app_no_raw is None and examine_no == "":
            continue
        app_no_str = str(app_no_raw).strip() if app_no_raw not in (None, "") else ""
        if not app_no_str:
            continue
        try:
            app_no_int = int(app_no_str)
        except (TypeError, ValueError):
            app_no_int = None
        docs = list(db.collection("bo_person").where("applicationNo", "==", app_no_str).limit(50).stream())
        if not docs and app_no_int is not None:
            docs = list(db.collection("bo_person").where("applicationNo", "==", app_no_int).limit(50).stream())
        for doc in docs:
            db.collection("bo_person").document(doc.id).update({"examineNumber": examine_no})
            total_updated += 1
    return _json_response({"updated": total_updated, "ok": True})


@app.route("/api/admin/contact-list", methods=["GET", "PATCH", "OPTIONS"])
def admin_contact_list():
    """담당자 목록: GET=조회(applications만), PATCH=저장(교회/담당자 필드)."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    if not _require_admin(decoded.get("uid"), decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    db = get_db()
    if request.method == "PATCH":
        body = request.get_json() or {}
        updates = body.get("updates") or []
        app_fields = {"churchName", "pastorName", "churchAddress", "contactName", "contactPosition", "contactPhone", "denomination"}
        for u in updates:
            app_id = u.get("applicationId")
            if not app_id:
                continue
            app_up = {k: u[k] for k in app_fields if k in u}
            if app_up:
                db.collection("applications").document(app_id).update(app_up)
        return _json_response({"ok": True})
    church_q = (request.args.get("churchName") or "").strip()
    contact_q = (request.args.get("contactName") or "").strip()
    phone_q = (request.args.get("contactPhone") or "").strip()
    ref = db.collection("applications").order_by("userId").limit(500)
    app_docs = list(ref.stream())
    rows = []
    for i, d in enumerate(app_docs):
        app_data = d.to_dict() or {}
        row = {
            "order": i + 1,
            "applicationId": d.id,
            "churchName": (app_data.get("churchName") or "").strip(),
            "contactName": (app_data.get("contactName") or "").strip(),
            "contactPosition": (app_data.get("contactPosition") or "").strip(),
            "contactPhone": (app_data.get("contactPhone") or "").strip(),
            "denomination": (app_data.get("denomination") or "").strip(),
            "pastorName": (app_data.get("pastorName") or "").strip(),
            "churchAddress": (app_data.get("churchAddress") or "").strip(),
        }
        if church_q and church_q.lower() not in (row["churchName"] or "").lower():
            continue
        if contact_q and contact_q.lower() not in (row["contactName"] or "").lower():
            continue
        if phone_q and phone_q.replace("-", "").replace(" ", "") not in (row["contactPhone"] or "").replace("-", "").replace(" ", ""):
            continue
        rows.append(row)
    return _json_response({"items": rows})


# ---------- 관리자: 공통코드(bo_lookup_value) 옵션 (조회 SQL 기준) ----------
# 100=응시구분, 110=참가여부, 120=환불요청, 130=참가비확인여부·담당자연락여부·환불지급여부

@app.route("/api/admin/lookup-options", methods=["GET", "OPTIONS"])
def admin_lookup_options():
    """type_cd=100,110,120,130. 현재일이 start_ymd~end_ymd 구간인 value_nm 목록 반환."""
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    if not _require_admin(decoded.get("uid"), decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    type_cd = (request.args.get("type_cd") or "").strip()
    if not type_cd:
        return _json_response({"error": "type_cd 필요"}, 400)
    today = _ymd_to_int(_today_ymd()) or 0
    db = get_db()
    ref = db.collection("bo_lookup_value").where("type_cd", "==", type_cd)
    docs = list(ref.stream())
    options = []
    for d in docs:
        data = d.to_dict()
        start_int = _ymd_to_int(data.get("start_ymd"))
        end_int = _ymd_to_int(data.get("end_ymd"))
        if start_int is not None and end_int is not None and start_int <= today <= end_int:
            options.append({
                "value_cd": str(data.get("value_cd", "")),
                "value_nm": str(data.get("value_nm", "")),
            })
    options.sort(key=lambda x: (x["value_nm"], x["value_cd"]))
    return _json_response({"options": options})


# ---------- 관리자: 사용자 ----------

def _ymd_to_int(ymd):
    """YYYYMMDD 문자열을 정수로 (비교용)."""
    if not ymd:
        return None
    s = str(ymd).replace("-", "").strip()
    if len(s) != 8 or not s.isdigit():
        return None
    return int(s)

def _value_cd_matches(want, stored):
    """value_cd 비교 (문자열/숫자 혼용). Firestore에 1 vs '1' 저장 차이 대비."""
    if want is None and stored is None:
        return True
    if want == stored:
        return True
    if str(want) == str(stored):
        return True
    try:
        if int(want) == int(stored):
            return True
    except (TypeError, ValueError):
        pass
    return False


def _get_lookup_value_name_140(value_cd, create_ymd):
    """type_cd=140, value_cd, create_ymd 기준으로 value_nm 반환. value_cd는 문자열/숫자 모두 허용."""
    if value_cd is None or value_cd == "":
        return ""
    ref = get_db().collection("bo_lookup_value").where("type_cd", "==", "140")
    docs = list(ref.stream())
    return _resolve_lookup_140_from_docs(docs, value_cd, create_ymd)


def _resolve_lookup_140_from_docs(lookup_docs, value_cd, create_ymd):
    """이미 조회한 bo_lookup_value(type_cd=140) 문서 리스트로 value_nm 반환 (N+1 쿼리 방지)."""
    if value_cd is None or value_cd == "":
        return ""
    create_int = _ymd_to_int(create_ymd) or 0
    first_nm = ""
    for d in lookup_docs:
        data = d.to_dict()
        stored_cd = data.get("value_cd")
        if not _value_cd_matches(value_cd, stored_cd):
            continue
        nm = data.get("value_nm", "")
        if first_nm == "" and nm:
            first_nm = nm
        start_int = _ymd_to_int(data.get("start_ymd"))
        end_int = _ymd_to_int(data.get("end_ymd"))
        if start_int is not None and end_int is not None and create_int and start_int <= create_int <= end_int:
            return nm
    return first_nm


@app.route("/api/admin/users", methods=["GET", "OPTIONS"])
def admin_list_users():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    name_q = (request.args.get("name") or "").strip()
    phone_q = (request.args.get("phone") or "").strip()
    user_type_q = (request.args.get("userType") or "").strip()

    db = get_db()
    # lookup 140 한 번만 조회 (행 수만큼 반복 조회 제거)
    lookup_140_docs = list(db.collection("bo_lookup_value").where("type_cd", "==", "140").stream())

    ref = db.collection("bo_users").order_by("Name").limit(500)
    docs = ref.stream()
    items = []
    for d in docs:
        data = d.to_dict()
        name_val = data.get("Name", "") or ""
        phone_val = data.get("Phone", "") or ""
        user_type_val = data.get("userType", "") or ""
        if (name_val or "").strip() == "최지용":
            continue
        if name_q and name_q.lower() not in (name_val or "").lower():
            continue
        if phone_q and phone_q not in (phone_val or ""):
            continue
        if user_type_q and user_type_q != "전체" and str(user_type_val) != str(user_type_q):
            continue
        create_ymd = data.get("create_ymd", "")
        user_type_name = _resolve_lookup_140_from_docs(lookup_140_docs, user_type_val, create_ymd)
        items.append({
            "id": d.id,
            "Name": name_val,
            "Phone": phone_val,
            "eMail": data.get("eMail", ""),
            "userType": user_type_val,
            "userTypeName": user_type_name,
            "emailyn": data.get("emailyn", "") or "",
            "create_ymd": create_ymd,
            "email": data.get("eMail", ""),
            "displayName": name_val,
        })
    return _json_response({"items": items})


@app.route("/api/admin/users/reset", methods=["POST", "OPTIONS"])
def admin_reset_users():
    """
    초기화: 관리자(userType=='100') 외 신청자/제출자/응시자 삭제.
    - applications 전체 삭제
    - bo_person 전체 삭제
    - Firebase Auth: bo_users에서 userType != '100' 인 uid 삭제
    - bo_users: userType != '100' 문서 삭제
    """
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)

    from firebase_admin import auth

    db = get_db()
    batch_size = 500

    # 1. applications 전체 삭제
    app_refs = [d.reference for d in db.collection("applications").stream()]
    for i in range(0, len(app_refs), batch_size):
        batch = db.batch()
        for ref in app_refs[i : i + batch_size]:
            batch.delete(ref)
        batch.commit()

    # 2. bo_person 전체 삭제
    person_refs = [d.reference for d in db.collection("bo_person").stream()]
    for i in range(0, len(person_refs), batch_size):
        batch = db.batch()
        for ref in person_refs[i : i + batch_size]:
            batch.delete(ref)
        batch.commit()

    # 3. bo_users에서 userType != '100' 인 문서의 uid 수집 후 Auth 삭제, bo_users 문서 삭제
    to_delete_uids = []
    to_delete_refs = []
    for d in db.collection("bo_users").stream():
        data = d.to_dict() or {}
        if str(data.get("userType") or "") != "100":
            to_delete_uids.append(d.id)
            to_delete_refs.append(d.reference)

    for uid_to_del in to_delete_uids:
        try:
            auth.delete_user(uid_to_del)
        except Exception as e:
            import logging
            logging.warning("auth.delete_user %s failed: %s", uid_to_del, e)

    for i in range(0, len(to_delete_refs), batch_size):
        batch = db.batch()
        for ref in to_delete_refs[i : i + batch_size]:
            batch.delete(ref)
        batch.commit()

    return _json_response({"ok": True, "message": "초기화되었습니다."})


@app.route("/api/admin/users/<user_id>", methods=["PUT", "OPTIONS"])
def admin_update_user(user_id):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    ref = get_db().collection("bo_users").document(user_id)
    doc = ref.get()
    if not doc.exists:
        return _json_response({"error": "사용자를 찾을 수 없습니다."}, 404)
    data = request.get_json() or {}
    update_data = {}
    if "Phone" in data:
        phone_val = (data["Phone"] or "").strip()
        if not phone_val or not "".join(c for c in phone_val if c.isdigit()):
            return _json_response({"error": "전화번호는 필수입니다."}, 400)
        update_data["Phone"] = data["Phone"]
    if "eMail" in data and (data["eMail"] or "").strip():
        update_data["eMail"] = (data["eMail"] or "").strip()
    if "userType" in data:
        update_data["userType"] = data["userType"]
    if "emailyn" in data:
        update_data["emailyn"] = data["emailyn"]
    if not update_data:
        return _json_response({"id": user_id, **doc.to_dict()})
    ref.update(update_data)
    # 유형이 '관리자'이면 Firebase Auth admin custom claim 부여, 아니면 제거
    if "userType" in data:
        import logging
        from datetime import date
        from firebase_admin import auth
        new_type = data["userType"]
        doc_dict = doc.to_dict() or {}
        create_ymd = doc_dict.get("create_ymd", "")
        type_name = _get_lookup_value_name_140(new_type, create_ymd)
        if not type_name:
            today_ymd = date.today().strftime("%Y%m%d")
            type_name = _get_lookup_value_name_140(new_type, today_ymd)
        # 공백 제거 후 비교. 요청값이 "관리자" 문자열인 경우도 허용 (공통코드 조회 실패 대비)
        type_name_clean = (type_name or "").strip()
        new_type_clean = (str(new_type) or "").strip()
        is_admin = type_name_clean == "관리자" or new_type_clean == "관리자"
        logging.info("admin claim: user_id=%s userType=%s type_name=%r is_admin=%s", user_id, new_type, type_name, is_admin)
        try:
            auth.set_custom_user_claims(user_id, {"admin": is_admin})
            logging.info("set_custom_user_claims ok: user_id=%s admin=%s", user_id, is_admin)
        except Exception as e:
            logging.warning("set_custom_user_claims failed for %s: %s", user_id, e)
    return _json_response({"id": user_id, **ref.get().to_dict()})


# ---------- 관리자: 공고내용 ----------

@app.route("/api/announcements", methods=["GET", "OPTIONS"])
def list_announcements():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    ref = get_db().collection("announcements").order_by("createdAt", direction=_firestore().Query.DESCENDING).limit(50)
    docs = ref.stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return _json_response({"items": items})


@app.route("/api/admin/announcements", methods=["GET", "POST", "OPTIONS"])
def admin_announcements():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    if request.method == "GET":
        ref = get_db().collection("announcements").order_by("createdAt", direction=_firestore().Query.DESCENDING)
        docs = ref.stream()
        items = [{"id": d.id, **d.to_dict()} for d in docs]
        return _json_response({"items": items})
    data = request.get_json() or {}
    data["createdAt"] = _firestore().SERVER_TIMESTAMP
    data["createdBy"] = uid
    ref = get_db().collection("announcements").document()
    ref.set(data)
    return _json_response({"id": ref.id, **data}, 201)


@app.route("/api/admin/announcements/<doc_id>", methods=["PUT", "DELETE", "OPTIONS"])
def admin_announcement_detail(doc_id):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    ref = get_db().collection("announcements").document(doc_id)
    if request.method == "PUT":
        data = request.get_json() or {}
        data["updatedAt"] = _firestore().SERVER_TIMESTAMP
        ref.update(data)
        return _json_response({"id": doc_id, **ref.get().to_dict()})
    ref.delete()
    return _json_response({"ok": True}, 200)


# ---------- 관리자: 공통코드 ----------

@app.route("/api/common-codes", methods=["GET", "OPTIONS"])
def list_common_codes():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    group = request.args.get("group")
    ref = get_db().collection("common_codes")
    if group:
        ref = ref.where("group", "==", group)
    ref = ref.order_by("order").order_by("code")
    docs = ref.stream()
    items = [{"id": d.id, **d.to_dict()} for d in docs]
    return _json_response({"items": items})


@app.route("/api/admin/common-codes", methods=["GET", "POST", "OPTIONS"])
def admin_common_codes():
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    if request.method == "GET":
        ref = get_db().collection("common_codes").order_by("group").order_by("order")
        docs = ref.stream()
        items = [{"id": d.id, **d.to_dict()} for d in docs]
        return _json_response({"items": items})
    data = request.get_json() or {}
    ref = get_db().collection("common_codes").document()
    ref.set(data)
    return _json_response({"id": ref.id, **data}, 201)


@app.route("/api/admin/common-codes/<doc_id>", methods=["PUT", "DELETE", "OPTIONS"])
def admin_common_code_detail(doc_id):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())
    decoded = _get_decoded_token()
    if not decoded:
        return _json_response({"error": "인증이 필요합니다."}, 401)
    uid = decoded.get("uid")
    if not _require_admin(uid, decoded):
        return _json_response({"error": "관리자 권한이 필요합니다."}, 403)
    ref = get_db().collection("common_codes").document(doc_id)
    if request.method == "PUT":
        ref.update(request.get_json() or {})
        return _json_response({"id": doc_id, **ref.get().to_dict()})
    ref.delete()
    return _json_response({"ok": True}, 200)


# ---------- 일배치: 지원현황 메일 (매일 08:00 KST) ----------

def _run_daily_report_email():
    """
    emailyn='100' 수신자에게 전국 바이블 올림피아드 대회 지원현황 메일 발송.
    Resend API 사용. RESEND_API_KEY, RESEND_FROM_EMAIL 환경변수 필요.
    """
    import logging
    from datetime import date, timedelta
    import requests

    logger = logging.getLogger(__name__)
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_email = os.environ.get("RESEND_FROM_EMAIL", "bible-olympia@geentree.org").strip()
    if not api_key:
        logger.warning("RESEND_API_KEY not set, skipping daily report email")
        return

    db = get_db()
    today_ymd = date.today().strftime("%Y-%m-%d")  # 메일 본문 표시용
    yesterday_ymd = (date.today() - timedelta(days=1)).strftime("%Y%m%d")  # Firestore 조회용(create_ymd)

    # 수신자: bo_users where emailyn == '100'
    recipients = []
    for d in db.collection("bo_users").where("emailyn", "==", "100").stream():
        email = (d.to_dict().get("eMail") or "").strip()
        if email and "@" in email:
            recipients.append(email)
    if not recipients:
        logger.info("daily report: no recipients (emailyn=100 with eMail)")
        return

    # bo_person 집계 (Firestore 쿼리 후 카운트)
    def count_person(where_clauses=None):
        q = db.collection("bo_person")
        for w in (where_clauses or []):
            q = q.where(w[0], w[1], w[2])
        return sum(1 for _ in q.stream())

    n_total = count_person()
    n_participation = count_person([("participationStatus", "==", "100")])
    n_fee_confirmed = count_person([("feeConfirmed", "==", "100")])
    n_yesterday = count_person([("create_ymd", "==", yesterday_ymd)])
    n_refund_request = count_person([("refundRequest", "==", "100")])
    n_refund_confirmed = count_person([("refundConfirmed", "==", "100")])

    subject = "전국 바이블 올림피이드 대회 지원현황 입니다. (" + today_ymd + ")"
    body_lines = [
        f"{today_ymd} 전국 바이블 올림피아드 대회 지원현황입니다.",
        "",
        "■ 전체 지원자: {}명".format(n_total),
        "■ 실제 참여자: {}명".format(n_participation),
        "■ 입금 확인자: {}명".format(n_fee_confirmed),
        "■ 전일 신청자: {}명".format(n_yesterday),
        "■ 환불요청자(전체): {}명".format(n_refund_request),
        "■ 환불지급자(전체): {}명".format(n_refund_confirmed),
    ]
    text_body = "\n".join(body_lines)
    html_body = (
        '<div style="font-size: 2em; line-height: 1.5;">'
        + "<p style='margin: 0.5em 0;'>" + f"{today_ymd} 전국 바이블 올림피아드 대회 지원현황입니다." + "</p>"
        + "<p style='margin: 0.5em 0;'>■ 전체 지원자: {}명</p>".format(n_total)
        + "<p style='margin: 0.5em 0;'>■ 실제 참여자: {}명</p>".format(n_participation)
        + "<p style='margin: 0.5em 0;'>■ 입금 확인자: {}명</p>".format(n_fee_confirmed)
        + "<p style='margin: 0.5em 0;'>■ 전일 신청자: {}명</p>".format(n_yesterday)
        + "<p style='margin: 0.5em 0;'>■ 환불요청자(전체): {}명</p>".format(n_refund_request)
        + "<p style='margin: 0.5em 0;'>■ 환불지급자(전체): {}명</p>".format(n_refund_confirmed)
        + "</div>"
    )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "from": from_email,
        "to": recipients,
        "subject": subject,
        "text": text_body,
        "html": html_body,
    }
    try:
        r = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=30)
        if r.status_code >= 400:
            logger.error("Resend API error: %s %s", r.status_code, r.text)
        else:
            logger.info("daily report email sent to %d recipients", len(recipients))
    except Exception as e:
        logger.exception("daily report email failed: %s", e)


# ---------- Cloud Functions 진입점 ----------

def api(req):
    """Firebase Hosting에서 /api/* 로 프록시되거나, 직접 호출용."""
    with app.request_context(req.environ):
        return app.full_dispatch_request()


# Firebase 2nd gen Python에서는 on_request 로 Flask 앱을 래핑
# 참고: Firebase Python Functions는 functions_framework 또는 직접 Flask를 사용할 수 있음
# 여기서는 배포 시 단일 HTTP 함수로 노출하는 방식을 사용합니다.

try:
    from firebase_functions import https_fn, scheduler_fn
    from firebase_functions.options import CorsOptions

    @https_fn.on_request(
        cors=CorsOptions(cors_origins="*", cors_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]),
        region="asia-northeast3",
    )
    def olympia_api(req: https_fn.Request) -> https_fn.Response:
        with app.request_context(req.environ):
            return app.full_dispatch_request()

    @scheduler_fn.on_schedule(
        schedule="0 8 * * *",
        timezone=scheduler_fn.Timezone("Asia/Seoul"),
        region="asia-northeast3",
    )
    def daily_report_email(event: scheduler_fn.ScheduledEvent) -> None:
        _run_daily_report_email()
except ImportError:
    # 로컬 테스트: flask run 시 사용
    pass
