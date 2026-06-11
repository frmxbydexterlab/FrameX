import os
import sys
import firebase_admin
from firebase_admin import credentials, auth, firestore

def delete_collection(coll_ref, batch_size=100):
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0
    for doc in docs:
        for subcoll in doc.reference.collections():
            delete_collection(subcoll, batch_size)
        doc.reference.delete()
        deleted += 1
    if deleted >= batch_size:
        delete_collection(coll_ref, batch_size)

def main():
    confirm = "--confirm" in sys.argv

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

    emails_to_keep = {"abc@testme.com", "test@dexterlab.com", "testing@testme.com"}
    companies_to_keep = {"testme.com"} 

    print("=== INSPECTING FOR DELETION ===")
    
    # 1. Firebase Auth Users
    users_to_delete = []
    users = auth.list_users().iterate_all()
    for user in users:
        if user.email not in emails_to_keep:
            users_to_delete.append(user)
            print(f"[AUTH] Will delete: UID: {user.uid} | Email: {user.email}")
        else:
            print(f"[AUTH] Keeping: UID: {user.uid} | Email: {user.email}")

    # 2. Firestore /users/{uid} documents
    users_docs_to_delete = []
    for user in users_to_delete:
        doc_ref = db.collection("users").document(user.uid)
        if doc_ref.get().exists:
            users_docs_to_delete.append(doc_ref)
            print(f"[FIRESTORE] Will delete user doc: users/{user.uid} (for {user.email})")

    # 3. Firestore /companies/{companyId} documents
    companies_ref = db.collection("companies")
    companies = companies_ref.stream()
    companies_docs_to_delete = []
    for company in companies:
        if company.id not in companies_to_keep:
            companies_docs_to_delete.append(company.reference)
            print(f"[FIRESTORE] Will delete company hub: companies/{company.id}")
        else:
            print(f"[FIRESTORE] Keeping company hub: companies/{company.id}")

    if not confirm:
        print("\n*** DRY RUN ONLY ***")
        print("To execute the deletions, run this script with --confirm")
        return

    print("\n=== EXECUTING DELETIONS ===")
    
    # Delete Firestore company hubs recursively
    for comp_ref in companies_docs_to_delete:
        print(f"Deleting company recursively: companies/{comp_ref.id} ...")
        for subcoll in comp_ref.collections():
            print(f"  Deleting subcollection: {subcoll.id}")
            delete_collection(subcoll)
        comp_ref.delete()
        print(f"Deleted companies/{comp_ref.id}")

    # Delete Firestore user docs
    for udoc_ref in users_docs_to_delete:
        print(f"Deleting user doc: users/{udoc_ref.id}")
        udoc_ref.delete()

    # Delete Firebase Auth users
    for user in users_to_delete:
        print(f"Deleting auth user: {user.email} (UID: {user.uid})")
        auth.delete_user(user.uid)

    print("\nCleanup successfully completed!")

if __name__ == "__main__":
    main()
