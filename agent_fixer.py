import os
import sys
import json
import subprocess
import urllib.request
import urllib.error

def run_command(cmd):
    try:
        result = subprocess.run(cmd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running command '{cmd}': {e.stderr}")
        return None

def main():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    repository = os.environ.get("REPOSITORY")
    
    if not gemini_key:
        print("❌ Error: GEMINI_API_KEY environment variable is missing.")
        sys.exit(1)
    if not repository:
        print("❌ Error: REPOSITORY environment variable is missing.")
        sys.exit(1)

    # 1. Prevent Infinite Loops
    last_commit_msg = run_command("git log -1 --pretty=%B")
    print(f"Last commit message: '{last_commit_msg}'")
    if "[fixbot]" in last_commit_msg:
        print("🚨 Infinite Loop Protection: Last commit was already pushed by FixBot. Failing the pipeline.")
        sys.exit(1)

    # 2. Gather logs
    lint_logs = ""
    if os.path.exists("lint_output.log"):
        with open("lint_output.log", "r") as f:
            lint_logs = f.read()

    pytest_logs = ""
    if os.path.exists("pytest_output.log"):
        with open("pytest_output.log", "r") as f:
            pytest_logs = f.read()

    print("🛡️ Gathered Linter logs:")
    print(lint_logs[:200] + "..." if len(lint_logs) > 200 else lint_logs)
    print("🧪 Gathered Test logs:")
    print(pytest_logs[:200] + "..." if len(pytest_logs) > 200 else pytest_logs)

    # 3. Read calculator.py content
    calc_path = "calculator.py"
    if not os.path.exists(calc_path):
        print(f"❌ Error: {calc_path} not found.")
        sys.exit(1)

    with open(calc_path, "r") as f:
        original_code = f.read()

    print("🤖 Prompting Gemini Fixer Agent...")
    prompt = f"""You are an automated Self-Healing AI DevOps Agent (FixBot). Your job is to resolve syntax/lint defects and logic errors in the code files.
    
    SOURCE CODE ({calc_path}):
    ```python
    {original_code}
    ```

    LINT ERRORS:
    {lint_logs}

    TEST FAILURES:
    {pytest_logs}

    Identify the issues and fix the file. Return a raw JSON object matching this structure exactly (do NOT wrap it in markdown code blocks):
    {{
        "fixed_code": "The entire fully corrected content of the calculator.py file ready to be saved"
    }}
    """

    # Query Gemini API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    data = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = json.loads(response.read().decode("utf-8"))
            fix_json_str = res_body["candidates"][0]["content"]["parts"][0]["text"]
            fix_payload = json.loads(fix_json_str.strip())
    except urllib.error.HTTPError as e:
        print(f"❌ Gemini API Error: {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error communicating with Gemini API: {str(e)}")
        sys.exit(1)

    fixed_code = fix_payload.get("fixed_code")
    if not fixed_code:
        print("❌ Error: Gemini failed to generate the fixed code payload.")
        sys.exit(1)

    # 4. Write fixes back
    with open(calc_path, "w") as f:
        f.write(fixed_code)
    print(f"🩹 Applied self-healing patch to {calc_path} successfully.")

    # 5. Commit and push back to PR branch
    print("🚀 Pushing corrections back to pull request branch...")
    run_command("git config user.name 'github-actions[bot]'")
    run_command("git config user.email '41898282+github-actions[bot]@users.noreply.github.com'")
    
    # Configure push auth URL using GITHUB_TOKEN
    gh_token = os.environ.get("GITHUB_TOKEN")
    if not gh_token:
        print("❌ Error: GITHUB_TOKEN missing. Cannot push fixes.")
        sys.exit(1)

    # Add remote authentication
    origin_url = f"https://x-access-token:{gh_token}@github.com/{repository}.git"
    run_command(f"git remote set-url origin {origin_url}")
    
    # Commit changes
    run_command("git add .")
    commit_res = run_command("git commit -m 'style(agent): auto-correct code defects [fixbot]'")
    
    if "nothing to commit" in commit_res.lower() or "no changes added" in commit_res.lower():
        print("ℹ️ No code changes detected after fix attempt. Failing the pipeline.")
        sys.exit(1)

    # Push
    current_branch = run_command("git rev-parse --abbrev-ref HEAD")
    push_res = run_command(f"git push origin {current_branch}")
    
    print("✅ Self-healing code commit pushed successfully!")
    print("🔄 The pipeline will now re-run with the corrected code.")
    # Exit with 0 so this run is marked as resolved/pending next run
    sys.exit(0)

if __name__ == "__main__":
    main()
