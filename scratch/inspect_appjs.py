with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "/api/" in line or "fetch(" in line:
        print(f"Line {i+1}: {line.strip()}")
