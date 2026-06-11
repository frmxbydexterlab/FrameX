import os
import firebase_admin
from firebase_admin import credentials, firestore, auth

def copy_collection(db, src_ref, dest_ref):
    docs = src_ref.get()
    for doc in docs:
        data = doc.to_dict()
        dest_ref.document(doc.id).set(data)
        print(f"    Copied doc {doc.id} from {src_ref.id} to {dest_ref.id}")

def main():
    sa_path = "firebase-service-account.json"
    if not os.path.exists(sa_path):
        print(f"Error: Certificate file not found.")
        return

    if not firebase_admin._apps:
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    target_company = "testme.com"

    # 1. Ensure target company document exists
    comp_ref = db.collection("companies").document(target_company)
    if not comp_ref.get().exists:
        comp_ref.set({
            "owner_uid": "ap1iA8J4QuNKADO0soa9ZfIN8kk2", # Owner will be new@testme.com or testing@testme.com
            "domains": [target_company],
            "allowed_read_domains": [],
            "allowed_write_domains": [],
            "company_name": target_company
        })
        print(f"Created company hub: {target_company}")

    # 2. Update Firebase Auth Custom Claims & Firestore user docs for testme.com users
    print("\n--- UPDATING AUTH CUSTOM CLAIMS & FIRESTORE USER DOCS ---")
    page = auth.list_users()
    testme_uids = []
    while page:
        for user in page.users:
            if user.email and user.email.endswith("@testme.com"):
                print(f"User: {user.email} | UID: {user.uid}")
                # Update custom claims in Firebase Auth
                auth.set_custom_user_claims(user.uid, {"companyId": target_company})
                print(f"  -> Set custom claims to 'testme.com'")
                
                # Update user document in Firestore
                user_doc_ref = db.collection("users").document(user.uid)
                if user_doc_ref.get().exists:
                    user_doc_ref.update({"companyId": target_company})
                    print(f"  -> Updated Firestore user doc companyId to 'testme.com'")
                else:
                    user_doc_ref.set({
                        "email": user.email,
                        "companyId": target_company,
                        "displayName": user.display_name or user.email.split("@")[0]
                    }, merge=True)
                    print(f"  -> Created/merged Firestore user doc companyId to 'testme.com'")
                testme_uids.append(user.uid)
        page = page.get_next_page()

    # 3. Migrate data from legacy companies (testme, testme_*) to testme.com
    print("\n--- MIGRATING DATA FROM LEGACY COMPANIES ---")
    legacy_companies = ["testme", "testme_1781176633634", "testme_1781176986325"]
    for old_cid in legacy_companies:
        print(f"Checking data under old company: {old_cid}")
        old_comp_ref = db.collection("companies").document(old_cid)
        
        # Check subcollections
        for sub in ["projects", "exchange_options", "versions", "custom_assemblies"]:
            copy_collection(db, old_comp_ref.collection(sub), comp_ref.collection(sub))

    print("\nMigration complete!")

if __name__ == "__main__":
    main()
