with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "globalConfigOverrides" in line:
        print(f"Line {i+1}: {line.strip()}")
