r"""
bo_users 컬렉션에서 이메일로 사용자를 찾아 Name 필드를 변경하는 스크립트.

사용법 (serviceAccountKey.json 필요, set_admin_claim.py와 동일):
  python update_user_name.py 이메일@example.com [새이름]
  새이름을 생략하면 이메일 @ 앞부분(예: cc@hanmail.net → cc)으로 설정합니다.
"""
import sys
import os

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")


def main():
    if len(sys.argv) < 2:
        print("사용법: python update_user_name.py 이메일@example.com [새이름]")
        sys.exit(1)
    email = sys.argv[1].strip()
    new_name = (sys.argv[2].strip() if len(sys.argv) > 2 else "").strip()
    if not email or "@" not in email:
        print("올바른 이메일을 입력하세요.")
        sys.exit(1)
    if not new_name:
        new_name = email.split("@")[0] or "user"
    if not os.path.isfile(KEY_PATH):
        print("서비스 계정 키가 없습니다. 이 폴더에 serviceAccountKey.json 을 저장하세요.")
        sys.exit(1)
    os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", KEY_PATH)
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
    db = firestore.client()
    ref = db.collection("bo_users").where("eMail", "==", email).limit(1)
    docs = list(ref.stream())
    if not docs:
        print(f"bo_users에서 해당 이메일을 찾을 수 없습니다: {email}")
        sys.exit(1)
    doc = docs[0]
    doc.reference.update({"Name": new_name})
    print(f"변경 완료: {email} → Name = '{new_name}' (문서 ID: {doc.id})")


if __name__ == "__main__":
    main()
