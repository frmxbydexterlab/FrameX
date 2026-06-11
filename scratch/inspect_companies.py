import os
import firebase_admin
from firebase_admin import credentials, firestore

def main():
    sa_path = "firebase-service-account.json"
    if not os.path.exists(sa_path):
        print(f"Error: Certificate file not found.")
        return

    if not firebase_admin._apps:
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()

    print("--- USERS ---")
    users = db.collection("users").stream()
    for u in users:
        print(f"UID: {u.id} | Email: {u.to_dict().get('email')} | Company: {u.to_dict().get('company')} | CompanyID: {u.to_dict().get('companyId')}")

    print("\n--- COMPANIES ---")
    companies = db.collection("companies").stream()
    for c in companies:
        c_data = c.to_dict()
        print(f"Company ID: {c.id} | Owner: {c_data.get('owner_uid')} | Name: {c_data.get('company_name')} | Domains: {c_data.get('domains')}")
        
        # Check projects
        projs = c.reference.collection("projects").stream()
        for p in projs:
            print(f"  -> Project Name: {p.to_dict().get('name')} | ID: {p.id}")

if __name__ == "__main__":
    main()
