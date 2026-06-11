import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(frmx_path, "r") as f:
    payload = json.load(f)

for wall_id in ["wall_1212237", "wall_1212268"]:
    w = next((x for x in payload["walls"] if x["wall_id"] == wall_id), None)
    if not w:
        print(f"Wall {wall_id} not found")
        continue
    
    print(f"\n=================== {wall_id} ===================")
    print(f"Label: {w['label']}")
    print(f"Length: {w['length_mm']}")
    print("Vertical Members:")
    for m in sorted(w["members"], key=lambda x: (not x["is_vertical"], x["start"]["x"])):
        if m["is_vertical"]:
            print(f"  {m['type'].upper()} ({m['label']}): x={m['start']['x']:.2f}, y_range=({m['start']['y']:.2f} -> {m['end']['y']:.2f})")
    print("Horizontal Members:")
    for m in sorted(w["members"], key=lambda x: (x["is_vertical"], x["start"]["y"])):
        if not m["is_vertical"]:
            print(f"  {m['type'].upper()} ({m['label']}): y={m['start']['y']:.2f}, x_range=({m['start']['x']:.2f} -> {m['end']['x']:.2f})")
