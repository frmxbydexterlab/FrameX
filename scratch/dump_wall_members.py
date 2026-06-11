import json

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\scratch\revit_framing_data_decrypted.json", "r") as f:
    data = json.load(f)

wall = [w for w in data["walls"] if w["wall_id"] == "wall_1264681"][0]
print(f"=== Wall {wall['wall_id']} ===")
for m in wall["members"]:
    print(f"  {m['type'].upper()} ({m['label']}): start=({m['start']['x']}, {m['start']['y']}), end=({m['end']['x']}, {m['end']['y']}), rotation={m['rotation']}")
