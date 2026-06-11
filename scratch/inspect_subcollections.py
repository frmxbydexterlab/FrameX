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
    
    company_ids = ["testme", "testme.com", "testme_1781176633634", "testme_1781176986325"]
    for cid in company_ids:
        print(f"\n--- Checking Company: {cid} ---")
        comp_ref = db.collection("companies").document(cid)
        doc = comp_ref.get()
        print(f"Document exists: {doc.exists}")
        if doc.exists:
            print(f"Data: {doc.to_dict()}")
        
        # Check subcollections
        for sub in ["projects", "exchange_options", "versions", "custom_assemblies"]:
            docs = list(comp_ref.collection(sub).stream())
            print(f"  Subcollection '{sub}': {len(docs)} documents")
            for d in docs:
                print(f"    -> {d.id}: {d.to_dict().get('name') or d.to_dict().get('title') or d.to_dict().get('comment') or d.to_dict()}")

if __name__ == "__main__":
    main()
