import json

frmx_path = r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json"
with open(frmx_path, "r") as f:
    payload = json.load(f)

print("=== WALL DIRECTION VECTORS ===")
for w in payload["walls"]:
    print(f"Wall: {w['wall_id']} | Label: {w.get('label')}")
    print(f"  Origin: ({w['origin_x']:.4f}, {w['origin_y']:.4f}, {w['origin_z']:.4f})")
    print(f"  Direction: ({w['direction_x']:.6f}, {w['direction_y']:.6f})")
