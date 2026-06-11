import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(frmx_path, "r") as f:
    payload = json.load(f)

w = next(x for x in payload["walls"] if x["wall_id"] == "wall_1212437")
print(f"Wall: {w['wall_id']} | Label: {w.get('label')}")
print("Members:")
for m in sorted(w["members"], key=lambda x: (not x["is_vertical"], x["start"]["x"], x["start"]["y"])):
    print(f"  {m['id'][-5:]} | {m['type']:12} | Label: {m['label']:12} | Start: ({m['start']['x']:.2f}, {m['start']['y']:.2f}) | End: ({m['end']['x']:.2f}, {m['end']['y']:.2f}) | Z-Off: {m['z_offset']:.2f} | Rot: {m['rotation']:.1f}")
