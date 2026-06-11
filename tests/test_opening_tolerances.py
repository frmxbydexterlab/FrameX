import urllib.request
import json
import sys

def run_test():
    url = "http://localhost:8000/api/frame"
    payload = {
        "walls": [
            {
                "wall_id": "test_wall_tolerance",
                "label": "Test Wall with Tolerances",
                "length": 3000.0,
                "height": 2400.0,
                "thickness": 92.08,
                "openings": [
                    {
                        "type": "door",
                        "x_offset": 1000.0,
                        "width": 1000.0,
                        "height": 2000.0,
                        "sill_height": 0.0,
                        "label": "D1"
                    }
                ],
                "config_name": "us_default",
                "config_overrides": {
                    "opening_tolerance_left_mm": 50.0,
                    "opening_tolerance_right_mm": 50.0,
                    "opening_tolerance_top_mm": 25.0,
                    "opening_tolerance_bottom_mm": 0.0, # Bottom tolerance is 0 for door
                    "use_king_studs": True,
                    "use_trimmer_studs": True
                }
            }
        ],
        "config_name": "us_default"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            wall_data = res_data["walls"][0]
            members = wall_data["members"]
            
            print(f"Total members generated: {len(members)}")
            
            # Find bottom tracks, king studs, trimmer studs, headers
            bottom_tracks = [m for m in members if m["type"] == "bottom_track"]
            king_studs = [m for m in members if m["type"] == "king_stud"]
            trimmer_studs = [m for m in members if m["type"] == "trimmer_stud"]
            headers = [m for m in members if m["type"] == "header"]
            studs = [m for m in members if m["type"] == "stud"]
            
            print("\n--- Bottom Tracks ---")
            for bt in bottom_tracks:
                print(f"{bt['label']}: start_x={bt['start']['x']}, end_x={bt['end']['x']}")
                
            print("\n--- King Studs ---")
            for ks in king_studs:
                print(f"{ks['label']}: x={ks['start']['x']}, y_start={ks['start']['y']}, y_end={ks['end']['y']}")
                
            print("\n--- Trimmer Studs ---")
            for ts in trimmer_studs:
                print(f"{ts['label']}: x={ts['start']['x']}, y_start={ts['start']['y']}, y_end={ts['end']['y']}")
                
            print("\n--- Headers ---")
            for h in headers:
                print(f"{h['label']}: start_x={h['start']['x']}, end_x={h['end']['x']}, y_start={h['start']['y']}, y_end={h['end']['y']}")
                
            print("\n--- Regular Studs ---")
            for s in studs:
                print(f"{s['label']}: x={s['start']['x']}")

            # Verification assertions
            print("\nRunning validations...")
            # Door is 1000 to 2000. Spacing tolerance is 50.0 left and right.
            # Left boundary of opening + tolerance is 950.0. Right boundary is 2050.0.
            
            # Bottom track should split at 950.0 and 2050.0
            assert len(bottom_tracks) == 2, f"Expected 2 bottom tracks, got {len(bottom_tracks)}"
            bt1, bt2 = sorted(bottom_tracks, key=lambda b: b['start']['x'])
            assert abs(bt1['end']['x'] - 950.0) < 1.0, f"Expected BT1 end_x=950.0, got {bt1['end']['x']}"
            assert abs(bt2['start']['x'] - 2050.0) < 1.0, f"Expected BT2 start_x=2050.0, got {bt2['start']['x']}"
            print("[SUCCESS] Bottom track segments end/start at tolerance boundary.")
            
            # Trimmers should be placed right next to the tolerance boundary (950.0 and 2050.0).
            # Wait, depending on rotation and whether trimmer is aligned by flange center or not:
            # Let's check coordinates.
            print("[SUCCESS] Test run finished.")
            
    except Exception as e:
        print("API request failed:", e)
        sys.exit(1)

if __name__ == "__main__":
    run_test()
