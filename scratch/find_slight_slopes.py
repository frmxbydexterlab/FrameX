import json

files = [
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json",
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_9_decrypted.json"
]

for frmx_path in files:
    print(f"\n=================== CHECKING {frmx_path} ===================")
    with open(frmx_path, "r") as f:
        payload = json.load(f)
        
    for w in payload["walls"]:
        for m in w["members"]:
            if not m["is_vertical"]:
                dy = abs(m["start"]["y"] - m["end"]["y"])
                if 0.0 < dy < 1.0:
                    print(f"Wall: {w['wall_id']} | Member: {m['id']} ({m['type']})")
                    print(f"  Start Y: {m['start']['y']:.6f} | End Y: {m['end']['y']:.6f} | dy: {dy:.6f}")
