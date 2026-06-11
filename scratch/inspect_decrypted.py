import json

with open(r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\scratch\revit_framing_data_decrypted.json", "r") as f:
    data = json.load(f)

for w in data.get("walls", []):
    print(f"=== Wall ID: {w['wall_id']} ===")
    print(f"  Length: {w['length_mm']}, Height: {w['height_mm']}")
    print(f"  Height Start: {w.get('height_start')}, Height End: {w.get('height_end')}")
    print(f"  Base Start: {w.get('base_start')}, Base End: {w.get('base_end')}")
    print(f"  Openings:")
    for o in w.get("openings", []):
        print(f"    - Type: {o['type']}, Label: {o['label']}, XOffset: {o['x_offset']}, Width: {o['width']}, Height: {o['height']}, SillHeight: {o.get('sill_height')}")
    print(f"  Members:")
    # Print headers, sills, and cripples
    for m in w.get("members", []):
        mtype = m["type"]
        if mtype in ("header", "sill", "cripple_stud") or "W" in m["label"] or "D" in m["label"]:
            print(f"    - {mtype.upper()} ({m['label']}): start=({m['start']['x']}, {m['start']['y']}), end=({m['end']['x']}, {m['end']['y']})")
    print("-" * 50)
