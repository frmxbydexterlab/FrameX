import json

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\scratch\revit_framing_data_decrypted.json", "r") as f:
    data = json.load(f)

for w in data.get("walls", []):
    if w["wall_id"] == "wall_1264681":
        print(f"=== Wall: {w['wall_id']} ===")
        # Print all members sorted by X coordinate
        members = sorted(w.get("members", []), key=lambda m: m["start"]["x"])
        for m in members:
            print(f"  Member {m['label']} ({m['type']}): X={m['start']['x']}, Y_Start={m['start']['y']}, Y_End={m['end']['y']}")
