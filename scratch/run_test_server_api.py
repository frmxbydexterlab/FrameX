import requests
import json

def test():
    # 1. Get list of walls from server
    r = requests.get("http://127.0.0.1:8000/api/walls")
    print("Available wall files:", r.json())
    
    # Let's frame the walls in the WEX file (e.g. ABX.wex or walls_input plus.wex)
    for filename in ["ABX", "walls_input new", "walls_input plus"]:
        try:
            print(f"\n--- Framing wall file: {filename} ---")
            r_walls = requests.get(f"http://127.0.0.1:8000/api/walls/{filename}")
            walls_data = r_walls.json()
            
            # Let's post to /api/frame
            payload = {
                "walls": walls_data.get("walls", []),
                "configs": {}, # use defaults
                "join_overrides": {}
            }
            # Set alignment to exterior in configs overrides if possible, or just default
            # Let's see what the FrameRequest model expects
            r_frame = requests.post("http://127.0.0.1:8000/api/frame", json=payload)
            frame_results = r_frame.json()
            if isinstance(frame_results, dict) and "walls" in frame_results:
                walls = frame_results["walls"]
                print("Frame results length:", len(walls))
                for res in walls:
                    wall_id = res["wall_id"]
                    members = res["members"]
                    # Filter for studs and check their z_offsets
                    studs = [m for m in members if m["type"] in ("stud", "end_stud")]
                    if len(studs) > 0:
                        print(f"  Wall {wall_id}: {len(members)} total members, {len(studs)} studs")
                        for s in studs[:5]:
                            print(f"    - {s['label']} ({s['type']}): z_offset={s['z_offset']}, depth={s['depth_mm']}, flange={s['flange_mm']}, rot={s['rotation']}, fam={s['revit_family_name']}, sym={s['revit_symbol_name']}")
            elif isinstance(frame_results, dict):
                print("Frame results keys:", frame_results.keys())
                if "detail" in frame_results:
                    print("Detail:", frame_results["detail"])
        except Exception as e:
            print("Error:", e)

if __name__ == "__main__":
    test()
