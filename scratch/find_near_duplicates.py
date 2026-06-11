import json
import math

files = [
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json",
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_9_decrypted.json"
]

def dist(p1, p2):
    return math.sqrt((p1["x"] - p2["x"])**2 + (p1["y"] - p2["y"])**2 + (p1["z"] - p2["z"])**2)

for frmx_path in files:
    print(f"\n=================== CHECKING {frmx_path} ===================")
    with open(frmx_path, "r") as f:
        payload = json.load(f)
        
    for w in payload["walls"]:
        members = w["members"]
        near_dups = []
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                m1 = members[i]
                m2 = members[j]
                
                # Check if they have the same type or are both vertical/horizontal
                if m1["is_vertical"] != m2["is_vertical"]:
                    continue
                    
                # Distance between starts and ends
                d_start = dist(m1["start"], m2["start"])
                d_end = dist(m1["end"], m2["end"])
                
                # Reverse distance check
                d_start_rev = dist(m1["start"], m2["end"])
                d_end_rev = dist(m1["end"], m2["start"])
                
                if (d_start < 50.0 and d_end < 50.0) or (d_start_rev < 50.0 and d_end_rev < 50.0):
                    near_dups.append((m1, m2, min(d_start, d_start_rev), min(d_end, d_end_rev)))
                    
        if near_dups:
            print(f"Wall: {w['wall_id']} | Label: {w.get('label')}")
            for m1, m2, ds, de in near_dups:
                print(f"  Near Dup: {m1['id']} ({m1['type']}) and {m2['id']} ({m2['type']})")
                print(f"    - {m1['id']}: start={m1['start']}, end={m1['end']}, z_offset={m1['z_offset']}")
                print(f"    - {m2['id']}: start={m2['start']}, end={m2['end']}, z_offset={m2['z_offset']}")
                print(f"    - ds={ds:.2f}, de={de:.2f}")
