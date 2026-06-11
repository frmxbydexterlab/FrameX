import os
import sys
import firebase_admin
from firebase_admin import credentials, auth, firestore

def main():
    sa_path = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "firebase-service-account.json")
    )
    if not os.path.exists(sa_path):
        print(f"Service account file not found: {sa_path}")
        return

    cred = credentials.Certificate(sa_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("=== Firebase Auth Users ===")
    users = auth.list_users().iterate_all()
    user_list = []
    for user in users:
        print(f"UID: {user.uid} | Email: {user.email} | Display Name: {user.display_name}")
        user_list.append(user)

    print("\n=== Firestore Companies/Hubs ===")
    companies_ref = db.collection("companies")
    companies = companies_ref.stream()
    for company in companies:
        cdata = company.to_dict()
        print(f"Company ID: {company.id} | Name: {cdata.get('company_name')} | Domains: {cdata.get('domains')}")

if __name__ == "__main__":
    main()
