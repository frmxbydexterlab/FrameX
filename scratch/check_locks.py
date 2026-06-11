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
    
    companies = ["testme", "testme.com"]
    for cid in companies:
        print(f"\n--- Checking Company: {cid} ---")
        comp_ref = db.collection("companies").document(cid)
        options = comp_ref.collection("exchange_options").stream()
        for opt in options:
            data = opt.to_dict()
            print(f"Option ID: {opt.id} | Name: {data.get('name')}")
            print(f"  lockedBy: {data.get('lockedBy')}")
            print(f"  lockedByName: {data.get('lockedByName')}")
            print(f"  lockedAt: {data.get('lockedAt')}")

if __name__ == "__main__":
    main()
