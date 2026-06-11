import urllib.request
import json

def main():
    url = "https://framex-348095531267.asia-south1.run.app/api/health"
    try:
        with urllib.request.urlopen(url) as response:
            status_code = response.getcode()
            body = response.read().decode('utf-8')
            print(f"Response Code: {status_code}")
            print(f"Response Body: {body}")
            
            data = json.loads(body)
            if data.get("status") == "ok" and data.get("auth_enabled") is True:
                print("Live server is UP, Healthy, and Firebase Auth is enabled!")
            else:
                print("Live server responded, but unexpected payload structure.")
    except Exception as e:
        print(f"Failed to query live server: {e}")

if __name__ == "__main__":
    main()
