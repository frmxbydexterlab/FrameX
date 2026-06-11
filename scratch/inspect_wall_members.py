import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(frmx_path, "r") as f:
    payload = json.load(f)

wall_data = next((w for w in payload["walls"] if w["wall_id"] == "wall_1212268"), None)
if wall_data:
    print(f"Wall: {wall_data['wall_id']}")
    print("Vertical Members:")
    for m in sorted(wall_data["members"], key=lambda x: (not x["is_vertical"], x["start"]["x"])):
        if m["is_vertical"]:
            print(f"  {m['type'].upper()} ({m['label']}): x={m['start']['x']:.2f}, y_range=({m['start']['y']:.2f} -> {m['end']['y']:.2f})")
    print("Horizontal Members:")
    for m in sorted(wall_data["members"], key=lambda x: (x["is_vertical"], x["start"]["y"])):
        if not m["is_vertical"]:
            print(f"  {m['type'].upper()} ({m['label']}): y={m['start']['y']:.2f}, x_range=({m['start']['x']:.2f} -> {m['end']['x']:.2f})")
else:
    print("Wall not found")
