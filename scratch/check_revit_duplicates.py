import json

files = [
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_1_decrypted.json",
    r"C:\Users\RaunakC\.gemini\antigravity\scratch\lgsf-framing-engine\tests\revit_framing_data_9_decrypted.json"
]

MmToFeet = 0.0032808398950131

for frmx_path in files:
    print(f"\n=================== CHECKING {frmx_path} ===================")
    with open(frmx_path, "r") as f:
        payload = json.load(f)
        
    for w in payload["walls"]:
        origin_x = w["origin_x"] * MmToFeet
        origin_y = w["origin_y"] * MmToFeet
        origin_z = w["origin_z"] * MmToFeet
        dir_x = w["direction_x"]
        dir_y = w["direction_y"]
        
        seen = {}
        for m in w["members"]:
            local_start_x = m["start"]["x"]
            local_start_y = m["start"]["y"]
            local_end_x = m["end"]["x"]
            local_end_y = m["end"]["y"]
            
            world_start_x = origin_x + (local_start_x * MmToFeet * dir_x)
            world_start_y = origin_y + (local_start_x * MmToFeet * dir_y)
            world_start_z = origin_z + (local_start_y * MmToFeet)
            
            world_end_x = origin_x + (local_end_x * MmToFeet * dir_x)
            world_end_y = origin_y + (local_end_x * MmToFeet * dir_y)
            world_end_z = origin_z + (local_end_y * MmToFeet)
            
            if m["is_vertical"]:
                world_end_x = world_start_x
                world_end_y = world_start_y
            elif abs(local_start_y - local_end_y) < 0.01:
                world_end_z = world_start_z
                
            p1 = (world_start_x, world_start_y, world_start_z)
            p2 = (world_end_x, world_end_y, world_end_z)
            
            # Apply z_offset
            if abs(m["z_offset"]) > 0.01:
                offset_ft = m["z_offset"] * MmToFeet
                normal_x = -dir_y
                normal_y = dir_x
                p1 = (p1[0] + normal_x * offset_ft, p1[1] + normal_y * offset_ft, p1[2])
                p2 = (p2[0] + normal_x * offset_ft, p2[1] + normal_y * offset_ft, p2[2])
                
            # Round to 5 decimals to handle floating point precision
            rp1 = tuple(round(coord, 5) for coord in p1)
            rp2 = tuple(round(coord, 5) for coord in p2)
            
            # Canonical order
            if rp1 > rp2:
                key = (rp2, rp1)
            else:
                key = (rp1, rp2)
                
            if key in seen:
                seen[key].append(m)
            else:
                seen[key] = [m]
                
        duplicates = {k: v for k, v in seen.items() if len(v) > 1}
        if duplicates:
            print(f"Wall: {w['wall_id']} | Label: {w.get('label')}")
            print(f"  Found {len(duplicates)} duplicate coordinates in Revit world space:")
            for k, v in duplicates.items():
                print(f"    Coords: {k}")
                for m in v:
                    print(f"      - ID: {m['id']} | Type: {m['type']} | Label: {m['label']} | Rot: {m['rotation']} | Z-Offset: {m['z_offset']}")
