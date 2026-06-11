with open("web/app.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx in range(10519, min(10580, len(lines))):
    print(f"Line {idx+1}: {lines[idx]}", end="")
