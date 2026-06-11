import os
import firebase_admin
from firebase_admin import credentials, firestore

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

    # Ensure target company exists
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

    print("--- SCANNING USERS ---")
    users = db.collection("users").stream()
    migrated_users = []
    
    for u in users:
        u_data = u.to_dict()
        email = u_data.get("email", "")
        if email.endswith("@testme.com"):
            old_company_id = u_data.get("companyId")
            if old_company_id and old_company_id != target_company:
                print(f"User: {email} | Old CompanyId: {old_company_id} -> Migrating to {target_company}")
                # Update user doc
                u.reference.update({"companyId": target_company})
                migrated_users.append((old_company_id, email))

    print("\n--- MIGRATING DATA ---")
    # For each old company, copy its subcollections to testme.com
    for old_cid, email in migrated_users:
        if not old_cid.startswith("testme_"):
            continue
        print(f"Migrating subcollections from old company: {old_cid} (originally for {email})")
        
        old_comp_ref = db.collection("companies").document(old_cid)
        
        # 1. Migrate projects
        copy_collection(db, old_comp_ref.collection("projects"), comp_ref.collection("projects"))
        # 2. Migrate exchange_options
        copy_collection(db, old_comp_ref.collection("exchange_options"), comp_ref.collection("exchange_options"))
        # 3. Migrate versions
        copy_collection(db, old_comp_ref.collection("versions"), comp_ref.collection("versions"))
        # 4. Migrate custom_assemblies
        copy_collection(db, old_comp_ref.collection("custom_assemblies"), comp_ref.collection("custom_assemblies"))

    print("\nMigration complete!")

if __name__ == "__main__":
    main()
