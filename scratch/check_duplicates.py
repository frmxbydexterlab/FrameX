import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(frmx_path, "r") as f:
    payload = json.load(f)

for w in payload["walls"]:
    print(f"\nWall: {w['wall_id']}")
    members = w["members"]
    seen = {}
    for m in members:
        p1 = (m["start"]["x"], m["start"]["y"], m["start"]["z"])
        p2 = (m["end"]["x"], m["end"]["y"], m["end"]["z"])
        key = (p1, p2)
        rev_key = (p2, p1)
        if key in seen:
            seen[key].append(m)
        elif rev_key in seen:
            seen[rev_key].append(m)
        else:
            seen[key] = [m]
            
    duplicates = {k: v for k, v in seen.items() if len(v) > 1}
    if duplicates:
        print(f"  Found {len(duplicates)} duplicates:")
        for k, v in duplicates.items():
            print(f"    Coords: {k}")
            for m in v:
                print(f"      - ID: {m['id']} | Type: {m['type']} | Label: {m['label']} | Rot: {m['rotation']}")
    else:
        print("  No duplicate coordinates found.")
