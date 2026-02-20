r"""
특정 사용자에게 관리자 권한(admin custom claim)을 부여하는 스크립트.

사용법:
  1. Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성" 으로 JSON 키 다운로드
  2. 해당 파일을 이 폴더에 serviceAccountKey.json 으로 저장
  3. 터미널에서:
     cd functions
     venv\Scripts\activate
     python set_admin_claim.py 이메일@example.com
  4. 브라우저에서 관리자 페이지를 새로 고침한 뒤 조회 버튼을 다시 누르세요.
"""
import sys
import os

# 서비스 계정 키 경로 (같은 폴더의 serviceAccountKey.json)
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

def main():
    if len(sys.argv) < 2:
        print("사용법: python set_admin_claim.py 이메일@example.com")
        sys.exit(1)
    email = sys.argv[1].strip()
    if not email or "@" not in email:
        print("올바른 이메일을 입력하세요.")
        sys.exit(1)
    if not os.path.isfile(KEY_PATH):
        print("서비스 계정 키가 없습니다.")
        print("Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > '새 비공개 키 생성'")
        print(f"다운로드한 JSON 파일을 {KEY_PATH} 로 저장하세요.")
        sys.exit(1)
    os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", KEY_PATH)
    import firebase_admin
    from firebase_admin import credentials, auth
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
    try:
        user = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        print(f"해당 이메일로 등록된 사용자가 없습니다: {email}")
        sys.exit(1)
    auth.set_custom_user_claims(user.uid, {"admin": True})
    # 설정 확인
    user2 = auth.get_user(user.uid)
    print(f"관리자 권한을 부여했습니다: {email} (uid: {user.uid})")
    print(f"확인: custom_claims = {user2.custom_claims}")
    print("반드시 해당 계정으로 로그아웃 후 다시 로그인하세요. (그다음 관리자 페이지에서 조회)")

if __name__ == "__main__":
    main()
