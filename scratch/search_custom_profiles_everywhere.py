import os

for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith(".json") or file.endswith(".frmx") or file.endswith(".txt"):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if "400CH18" in content or "400CH-18" in content or "600CH18" in content or "212CH" in content:
                        print(f"Found match in {path}")
            except Exception as e:
                pass
