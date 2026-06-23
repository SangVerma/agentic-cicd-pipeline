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
    pr_number = os.environ.get("PR_NUMBER")
    repository = os.environ.get("REPOSITORY")
    
    if not gemini_key:
        print("❌ Error: GEMINI_API_KEY environment variable is missing.")
        sys.exit(1)
    if not pr_number:
        print("❌ Error: PR_NUMBER environment variable is missing.")
        sys.exit(1)
    if not repository:
        print("❌ Error: REPOSITORY environment variable is missing.")
        sys.exit(1)

    print("🚀 Fetching git diff against main branch...")
    # Fetch main branch to compare
    run_command("git fetch origin main:main")
    
    # Get files list
    changed_files = run_command("git diff --name-only main...HEAD")
    if not changed_files:
        print("ℹ️ No changed files detected.")
        sys.exit(0)
    
    file_list = changed_files.split("\n")
    print(f"📂 Changed files: {file_list}")

    # Gather full diff
    diff_content = run_command("git diff main...HEAD")
    if not diff_content:
        print("ℹ️ Empty diff. Skipping review.")
        sys.exit(0)

    print("🤖 Prompting Gemini 2.5 Flash Peer Review Agent...")
    
    prompt = f"""You are a Senior Software Engineer doing a peer code review. Analyze the following Git diff and files, identify style errors, formatting violations, unused imports, logic errors, and security issues.
    
    GIT DIFF:
    {diff_content}

    Provide your review strictly in JSON format. The response must be a single, valid JSON object matching this structure:
    {{
        "event": "COMMENT",
        "body": "Markdown text summarizing the review findings (overall architecture, bugs, security issues, style recommendations). Use clear emojis.",
        "comments": [
            {{
                "path": "path/to/file.py",
                "line": 15,
                "body": "Inline code suggestion or review comment."
            }}
        ]
    }}
    
    Note: "event" must be one of: "COMMENT", "APPROVE", or "REQUEST_CHANGES". Only approve if there are absolutely no style/format/logic/security errors.
    If you flag security credentials (like hardcoded keys) or logic errors, set "event" to "REQUEST_CHANGES".
    Ensure the path corresponds to a file path in the diff, and the line number exists in the new code diff.
    Do NOT wrap in markdown code blocks like ```json ... ```, output the raw JSON string directly.
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
            review_json_str = res_body["candidates"][0]["content"]["parts"][0]["text"]
            review_payload = json.loads(review_json_str.strip())
    except urllib.error.HTTPError as e:
        print(f"❌ Gemini API Error: {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error communicating with Gemini API: {str(e)}")
        sys.exit(1)

    # Validate payload structure
    review_body = review_payload.get("body", "PR Peer Review completed by DevBot.")
    review_event = review_payload.get("event", "COMMENT")
    inline_comments = review_payload.get("comments", [])

    print(f"📝 Review Summary generated (Event: {review_event}):")
    print(review_body)

    # Post Review via GitHub CLI
    review_data = {
        "body": review_body,
        "event": review_event,
        "comments": inline_comments
    }
    
    # Save review JSON temporarily for gh cli input
    review_json_path = "pr_review.json"
    with open(review_json_path, "w") as f:
        json.dump(review_data, f)

    print("📤 Posting peer review to GitHub PR...")
    gh_cmd = f"gh api repos/{repository}/pulls/{pr_number}/reviews --method POST --input {review_json_path}"
    gh_output = run_command(gh_cmd)
    
    if gh_output:
        print("✅ Review successfully posted to GitHub!")
    else:
        print("❌ Failed to post review to GitHub.")

if __name__ == "__main__":
    main()
