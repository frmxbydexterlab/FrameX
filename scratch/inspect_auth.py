import os
import firebase_admin
from firebase_admin import credentials, auth

def main():
    sa_path = "firebase-service-account.json"
    if not os.path.exists(sa_path):
        print(f"Error: Certificate file not found.")
        return

    if not firebase_admin._apps:
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
    
    print("--- FIREBASE AUTH USERS ---")
    page = auth.list_users()
    while page:
        for user in page.users:
            print(f"UID: {user.uid} | Email: {user.email} | Claims: {user.custom_claims}")
        page = page.get_next_page()

if __name__ == "__main__":
    main()
