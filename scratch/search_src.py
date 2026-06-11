import os

for root, dirs, files in os.walk("src"):
    for file in files:
        if file.endswith(".py"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                if "RevitCustomFamilies" in content or "customRevitProfiles" in content:
                    print(f"Found in {path}")
