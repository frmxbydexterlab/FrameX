import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from server import _parse_and_split_request, FrameRequest, WallInput, OpeningInput

def test_control_join_disabled():
    # Setup request with 1 long wall (10m) and control joins disabled (0.0)
    request = FrameRequest(
        walls=[
            WallInput(
                wall_id="long_wall",
                label="Long Wall",
                length=10000.0,
                height=2400.0,
                thickness=92.08,
                origin_x=0.0,
                origin_y=0.0,
                origin_z=0.0,
                direction_x=1.0,
                direction_y=0.0,
                openings=[],
                config_overrides={
                    "control_join_max_length_mm": 0.0,
                    "control_join_gap_mm": 0.0
                }
            )
        ],
        config_name="us_default"
    )
    
    walls, configs, inputs = _parse_and_split_request(request)
    
    # Assert no splitting occurred
    assert len(walls) == 1
    assert walls[0].wall_id == "long_wall"
    assert walls[0].length == 10000.0

def test_control_join_splitting():
    # Setup request with 1 long wall (11m) and max length 5m, gap 20mm
    request = FrameRequest(
        walls=[
            WallInput(
                wall_id="split_wall",
                label="Split Wall",
                length=11000.0,
                height=2400.0,
                thickness=92.08,
                origin_x=100.0,
                origin_y=200.0,
                origin_z=0.0,
                direction_x=1.0,
                direction_y=0.0,
                openings=[
                    OpeningInput(
                        type="window",
                        x_offset=2000.0, # Center at 2500 -> Panel 1
                        width=1000.0,
                        height=1000.0,
                        sill_height=800.0,
                        label="W1"
                    ),
                    OpeningInput(
                        type="door",
                        x_offset=7000.0, # Center at 7400 -> Panel 2 (span 5020 to 10020)
                        width=800.0,
                        height=2000.0,
                        sill_height=0.0,
                        label="D1"
                    ),
                    OpeningInput(
                        type="window",
                        x_offset=10500.0, # Center at 10700 -> Panel 3 (span 10040 to 11000)
                        width=400.0,
                        height=1000.0,
                        sill_height=800.0,
                        label="W2"
                    )
                ],
                config_overrides={
                    "control_join_max_length_mm": 5000.0,
                    "control_join_gap_mm": 20.0
                }
            )
        ],
        config_name="us_default"
    )
    
    walls, configs, inputs = _parse_and_split_request(request)
    
    # Assert splitting occurred into 3 panels
    # Panel 1: length 5000, t_start=0, t_end=5000
    # Panel 2: length 5000, t_start=5020, t_end=10020
    # Panel 3: length 11000 - 10040 = 960, t_start=10040, t_end=11000
    assert len(walls) == 3
    
    # Panel 1 asserts
    assert walls[0].wall_id == "split_wall_P1"
    assert walls[0].label == "Split Wall - Panel 1"
    assert walls[0].length == 5000.0
    assert walls[0].origin_x == 100.0
    assert walls[0].origin_y == 200.0
    assert len(walls[0].openings) == 1
    assert walls[0].openings[0].label == "W1"
    assert walls[0].openings[0].x_offset == 2000.0
    
    # Panel 2 asserts
    assert walls[1].wall_id == "split_wall_P2"
    assert walls[1].label == "Split Wall - Panel 2"
    assert walls[1].length == 5000.0
    assert walls[1].origin_x == 100.0 + 5020.0
    assert walls[1].origin_y == 200.0
    assert len(walls[1].openings) == 1
    assert walls[1].openings[0].label == "D1"
    # x_offset relative to panel 2 start (5020.0) -> 7000 - 5020 = 1980
    assert walls[1].openings[0].x_offset == 1980.0
    
    # Panel 3 asserts
    assert walls[2].wall_id == "split_wall_P3"
    assert walls[2].label == "Split Wall - Panel 3"
    assert walls[2].length == 960.0
    assert walls[2].origin_x == 100.0 + 10040.0
    assert walls[2].origin_y == 200.0
    assert len(walls[2].openings) == 1
    assert walls[2].openings[0].label == "W2"
    # x_offset relative to panel 3 start (10040.0) -> 10500 - 10040 = 460
    assert walls[2].openings[0].x_offset == 460.0

def test_control_join_split_end():
    # Setup request with 1 long wall (11m), max length 5m, gap 20mm, start_from="end"
    request = FrameRequest(
        walls=[
            WallInput(
                wall_id="split_wall_end",
                label="Split Wall End",
                length=11000.0,
                height=2400.0,
                thickness=92.08,
                origin_x=100.0,
                origin_y=200.0,
                origin_z=0.0,
                direction_x=1.0,
                direction_y=0.0,
                openings=[
                    OpeningInput(
                        type="window",
                        x_offset=500.0,
                        width=1000.0,
                        height=1000.0,
                        sill_height=800.0,
                        label="W1"
                    )
                ],
                config_overrides={
                    "control_join_max_length_mm": 5000.0,
                    "control_join_gap_mm": 20.0,
                    "control_join_start_from": "end"
                }
            )
        ],
        config_name="us_default"
    )
    
    walls, configs, inputs = _parse_and_split_request(request)
    
    assert len(walls) == 3
    
    # Panel 1 asserts
    assert walls[0].wall_id == "split_wall_end_P1"
    assert walls[0].length == 960.0
    assert walls[0].origin_x == 100.0
    
    # Panel 2 asserts
    assert walls[1].wall_id == "split_wall_end_P2"
    assert walls[1].length == 5000.0
    assert walls[1].origin_x == 100.0 + 980.0
    
    # Panel 3 asserts
    assert walls[2].wall_id == "split_wall_end_P3"
    assert walls[2].length == 5000.0
    assert walls[2].origin_x == 100.0 + 6000.0

def test_control_join_split_equal():
    # Setup request with 1 long wall (11m), max length 5m, gap 20mm, start_from="equal"
    request = FrameRequest(
        walls=[
            WallInput(
                wall_id="split_wall_equal",
                label="Split Wall Equal",
                length=11000.0,
                height=2400.0,
                thickness=92.08,
                origin_x=100.0,
                origin_y=200.0,
                origin_z=0.0,
                direction_x=1.0,
                direction_y=0.0,
                openings=[],
                config_overrides={
                    "control_join_max_length_mm": 5000.0,
                    "control_join_gap_mm": 20.0,
                    "control_join_start_from": "equal"
                }
            )
        ],
        config_name="us_default"
    )
    
    walls, configs, inputs = _parse_and_split_request(request)
    
    assert len(walls) == 3
    assert abs(walls[0].length - 3653.33) < 0.1
    assert abs(walls[1].length - 3653.33) < 0.1
    assert abs(walls[2].length - 3653.33) < 0.1
    
    assert walls[0].origin_x == 100.0
    assert abs(walls[1].origin_x - (100.0 + 3673.33)) < 0.1
    assert abs(walls[2].origin_x - (100.0 + 7346.67)) < 0.1

if __name__ == "__main__":
    test_control_join_disabled()
    test_control_join_splitting()
    test_control_join_split_end()
    test_control_join_split_equal()
    print("Local tests passed!")
