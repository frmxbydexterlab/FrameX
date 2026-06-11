import json

transcript_path = r"C:\Users\RaunakC\.gemini\antigravity-ide\brain\eb3d6086-74d0-4b35-9fe7-4eecbfaec509\.system_generated\logs\transcript.jsonl"

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        if '"step_index":1687' in line or '"step_index": 1687' in line:
            data = json.loads(line)
            content = data.get("content", "")
            idx = content.find("Step 235: capture_browser_console_logs")
            if idx != -1:
                print("Found Step 235 in subagent content at index:", idx)
                # Print from idx to 3000 chars after
                print(content[idx:idx+3000])
            else:
                # Let's search for any 'console_logs' or similar in content
                print("Step 235 not found as a literal heading. Searching for any console output...")
                idx2 = content.find("capture_browser_console_logs")
                while idx2 != -1:
                    print(f"Match for capture_browser_console_logs at {idx2}:")
                    print(content[idx2:idx2+1000])
                    print("*" * 40)
                    idx2 = content.find("capture_browser_console_logs", idx2+1)
            break
