# Agentic CI/CD Pipeline 🤖

A **self-healing CI/CD pipeline** where AI agents act as members of the pull request workflow. On every PR, the pipeline lints and tests the code, an AI reviewer posts a real peer review with inline comments, and — if the quality gate fails — a self-healing agent reads the failure logs, patches the code, and pushes the fix back to the PR branch so the pipeline re-runs automatically.

**Goal:** compress the feedback loop between a *failed build* and a *fixed build* from hours of human context-switching to minutes.

---

## How it works

The pipeline is a GitHub Actions workflow ([`.github/workflows/agent-pipeline.yml`](.github/workflows/agent-pipeline.yml)) triggered on every pull request to `main`. It runs four stages:

```
PR opened
   │
   ▼
🛡️  Stage 1 — LinterBot        flake8 static analysis (logs captured)
   │
   ▼
🧪  Stage 2 — QABot            pytest regression suite (logs captured)
   │
   ▼
🤖  Stage 3 — DevBot           AI peer review posted on the PR
   │                           (inline comments, APPROVE / REQUEST_CHANGES)
   ▼
🩹  Stage 4 — FixBot           Runs ONLY if lint or tests failed:
                               reads the failure logs, generates a fix,
                               commits & pushes to the PR branch
   │
   └──► push re-triggers the pipeline, which verifies the fix
```

### Stage details

| Stage | Agent | What it does |
|-------|-------|--------------|
| 1 | **LinterBot** | Runs `flake8` (syntax errors + complexity/style) with `continue-on-error`, so the pipeline gathers full context instead of dying at the first failure. Output saved to `lint_output.log`. |
| 2 | **QABot** | Runs the `pytest` regression suite. Output saved to `pytest_output.log`. |
| 3 | **DevBot** (`agent_review.py`) | Pulls the git diff against `main`, sends it to Gemini 2.5 Flash with a "senior engineer peer review" prompt, receives **structured JSON** (summary, review event, inline comments keyed to file + line), and posts it as a real GitHub PR review via the GitHub API. Security issues or logic errors force `REQUEST_CHANGES`. |
| 4 | **FixBot** (`agent_fixer.py`) | Triggered only when the quality gate fails. Gathers the lint + test logs and the source file, asks the model to return the fully corrected file as structured JSON, writes it to disk, commits as the `github-actions` bot with a `[fixbot]` tag, and pushes back to the PR branch. |

### The demo defect

`calculator.py` ships with a deliberate bug — `divide()` divides by zero — and `test_calculator.py` contains tests that catch it. Opening a PR with this bug exercises the full pipeline end to end: tests fail → FixBot repairs the file → the re-run goes green.

### Live dashboard

`server.js` + `public/` is a Node/Express front-end (deployable on Render via `render.yaml`) that streams pipeline runs over **WebSockets**, so agent activity can be demoed in real time in a browser.

---

## Key design decisions

- **Infinite-loop protection (circuit breaker).** Before acting, FixBot checks the last commit message for the `[fixbot]` tag. If the agent's own fix failed, the pipeline fails hard instead of the agent fixing its fix forever.
- **Structured outputs, not free text.** Both agents are forced to return raw JSON matching a strict schema (`responseMimeType: application/json`), which makes LLM output machine-actionable — it's posted directly to the GitHub Reviews API instead of parsed from prose.
- **Deterministic gates, probabilistic agents.** Lint and tests stay deterministic; the AI only *interprets* and *repairs*. The pipeline never trusts the agent — every fix must pass the same gates on re-run.
- **Human stays in the loop where it matters.** DevBot comments and requests changes; it never merges. Autonomy is scoped to low-risk repair; review authority stays advisory.
- **Least-privilege plumbing.** API keys via GitHub Actions secrets, push auth via the ephemeral `GITHUB_TOKEN`, and bot-attributed commits for a clean audit trail.

---

## Tech stack

- **Orchestration:** GitHub Actions
- **Agents:** Python + Gemini 2.5 Flash (structured JSON outputs)
- **Quality gates:** flake8, pytest
- **PR integration:** GitHub REST API (reviews, commits)
- **Dashboard:** Node.js, Express, WebSockets — deployed on Render

---

## Getting started

### 1. Fork or clone

```bash
git clone https://github.com/SangVerma/agentic-cicd-pipeline.git
cd agentic-cicd-pipeline
```

### 2. Add your API key

In your GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|--------|-------|
| `GEMINI_API_KEY` | Your Google AI Studio API key |

(`GITHUB_TOKEN` is provided automatically by GitHub Actions.)

### 3. Trigger the pipeline

Create a branch, introduce (or keep) the bug in `calculator.py`, and open a pull request against `main`:

```bash
git checkout -b demo-bug
git commit --allow-empty -m "trigger pipeline"
git push origin demo-bug
```

Then open a PR on GitHub and watch the **Actions** tab:

1. Lint and tests run (tests fail on the divide-by-zero bug)
2. DevBot posts a peer review on the PR
3. FixBot commits a fix to your branch
4. The pipeline re-runs and goes green ✅

### 4. (Optional) Run the dashboard locally

```bash
npm install
node server.js
# open http://localhost:10000
```

---

## Roadmap

- [ ] Derive FixBot's target files from the diff/logs instead of a hardcoded path
- [ ] Retry budget with escalation (open an issue / page a human after N failed fix attempts)
- [ ] Eval harness tracking fix success rate over time
- [ ] Cost/latency guardrails; cheaper model tier for lint-only failures

---

## Author

**Sangeeta Verma** — Senior engineering leader (retail technology: store commerce, payments, omnichannel) building hands-on agentic AI systems.
GitHub: [@SangVerma](https://github.com/SangVerma)
