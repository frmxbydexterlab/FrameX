# LGSF Framing Engine

A Python-based Light Gauge Steel Framing (LGSF) engine that calculates framing member positions for walls with openings.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run framing on test walls
python main.py --walls tests/test_walls.json --config configs/us_default.json --output output/

# Run tests
python -m pytest tests/ -v
```

## Architecture

- `src/models.py` — Data classes (Wall, Opening, FramingMember, etc.)
- `src/framing_engine.py` — Core stud layout algorithm
- `src/opening_handler.py` — Opening framing (king, trimmer, header, sill, cripple studs)
- `src/nogging_placer.py` — Mid-height blocking between studs
- `src/visualizer.py` — Matplotlib elevation view renderer
- `configs/` — Region-specific configuration files
