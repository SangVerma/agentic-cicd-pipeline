const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory active runs database
const activeRuns = {};

// Helper to send real-time logs to the UI
function broadcast(runId, type, data) {
    if (activeRuns[runId] && activeRuns[runId].ws) {
        activeRuns[runId].ws.send(JSON.stringify({ type, ...data }));
    }
}

// Simulated delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fallback AI reviews based on code context analysis (when no API key is specified)
function generateHeuristicReview(code, language) {
    const comments = [];
    let summary = "";
    let status = "APPROVED"; // or CHANGES_REQUESTED

    if (code.includes('api_key') || code.includes('API_KEY') || code.includes('secret_token') || code.includes('password = "')) {
        status = "CHANGES_REQUESTED";
        summary = "⚠️ CRITICAL SECURITY WARNING: The submitted pull request contains hardcoded secrets or access credentials. Hardcoding API keys directly in the codebase is a severe security violation that compromises credential integrity.";
        
        // Find line number
        const lines = code.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('api_key') || line.includes('API_KEY') || line.includes('secret_token') || line.includes('password = "')) {
                comments.push({
                    line: idx + 1,
                    severity: 'critical',
                    text: '🔐 [Security] Hardcoded credential detected! Move this value to an environment variable (.env) and access it via process.env or os.environ.'
                });
            }
        });
    } else if (code.includes('return a / 0') || code.includes('divide(a, 0)') || code.includes('b == 0') && code.includes('return a/b') && !code.includes('try')) {
        status = "CHANGES_REQUESTED";
        summary = "❌ QUALITY GATE FAILED: Standard static analysis checks identified a potential Division by Zero defect. The logic does not properly guard against zero-valued denominators, leading to critical runtime crashes in production environments.";
        
        const lines = code.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('/') || line.includes('divide')) {
                comments.push({
                    line: idx + 1,
                    severity: 'error',
                    text: '🧮 [Logic] Potential division-by-zero vulnerability. Add a validation guard checking if the denominator is 0 before executing this mathematical expression.'
                });
            }
        });
    } else if (code.includes('import os') && !code.includes('os.') || code.includes('const fs = require') && !code.includes('fs.')) {
        status = "APPROVED"; // still approved but has warnings
        summary = "💡 PEER REVIEW: Code is structurally sound and logically correct. However, some minor style cleanup is required regarding dead imports to optimize resource bundle sizes.";
        
        const lines = code.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('import os') || line.includes('require(\'fs\')')) {
                comments.push({
                    line: idx + 1,
                    severity: 'warning',
                    text: '🧹 [Clean Code] Dead Import detected. Module is imported but never referenced in the subsequent scope. Remove to reduce overhead.'
                });
            }
        });
    } else {
        summary = "🚀 LGTM (Looks Good To Me)! Excellent pull request. Code conforms fully to modern style conventions, possesses comprehensive error handlers, and is fully ready for deployment pipeline promotion.";
    }

    return { status, summary, comments };
}

// Linter static analysis runner
function runLinter(code, language) {
    const errors = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
        const lineNum = index + 1;
        // Unused imports rule
        if (line.trim().startsWith('import ') && !line.includes('*')) {
            const parts = line.replace('import ', '').split(/[, ]+/);
            const importedVar = parts[0].trim();
            const restOfCode = lines.slice(index + 1).join('\n');
            if (importedVar && !restOfCode.includes(importedVar)) {
                errors.push({
                    line: lineNum,
                    column: 8,
                    severity: 'warning',
                    message: `Unused import statement: '${importedVar}' is imported but never used.`,
                    rule: 'no-unused-vars'
                });
            }
        }

        // Hardcoded API key rule
        if ((line.includes('key =') || line.includes('KEY =') || line.includes('token =')) && (line.includes("'") || line.includes('"')) && line.match(/[a-zA-Z0-9]{20,}/)) {
            errors.push({
                line: lineNum,
                column: line.indexOf('=') + 2,
                severity: 'error',
                message: 'Hardcoded API credential detected. Secrets must be populated from environmental variables.',
                rule: 'no-hardcoded-credentials'
            });
        }

        // Missing docstrings / functions check
        if (language === 'python' && line.trim().startsWith('def ') && !lines[index + 1]?.trim().startsWith('"""')) {
            errors.push({
                line: lineNum,
                column: 5,
                severity: 'info',
                message: 'Missing docstring for function definition. Documenting parameters improves code readability.',
                rule: 'require-jsdoc'
            });
        }

        // Semicolon warnings for JavaScript
        if (language === 'javascript' && line.trim() && !line.trim().endsWith(';') && !line.trim().endsWith('{') && !line.trim().endsWith('}') && !line.trim().startsWith('//')) {
            errors.push({
                line: lineNum,
                column: line.length + 1,
                severity: 'warning',
                message: 'Missing semicolon at end of statement.',
                rule: 'semi'
            });
        }

        // Division by Zero static check
        if (line.includes('/ 0')) {
            errors.push({
                line: lineNum,
                column: line.indexOf('/ 0') + 1,
                severity: 'error',
                message: 'Divide by zero error. Division operations must not divide by a zero constant.',
                rule: 'no-divide-by-zero'
            });
        }
    });

    return errors;
}

// QA virtual test execution
function runQATests(code, language) {
    const logs = [];
    const testCases = [];
    let passedCount = 0;
    let failedCount = 0;

    logs.push("⚙️ Starting Virtual Test Runner...");
    logs.push("📦 Scanning workspace for test suites...");

    if (language === 'python') {
        logs.push("🔍 Found test suite 'test_calculator.py' with 3 test cases.");
        logs.push("🚀 Running pytest v8.1.1 on Python 3.14...");
        logs.push("-------------------------------------------------------");

        // Case 1: Standard Add logic
        testCases.push({ name: "test_addition_integers", status: "PASSED", duration: "0.01s" });
        logs.push("test_calculator.py::test_addition_integers PASSED    [ 33%]");
        passedCount++;

        // Case 2: Zero divide check
        if (code.includes('a / 0') || code.includes('divide(a, 0)') || (code.includes('b == 0') && code.includes('return a/b') && !code.includes('try'))) {
            testCases.push({ name: "test_division_by_zero_handling", status: "FAILED", duration: "0.02s", error: "ZeroDivisionError: division by zero" });
            logs.push("test_calculator.py::test_division_by_zero_handling FAILED  [ 66%]");
            logs.push(">>> ERROR: ZeroDivisionError encountered at runtime inside divide() method.");
            logs.push(">>> Stacktrace:\n    File \"calculator.py\", line 12, in divide\n      return a / b\n    ZeroDivisionError: division by zero");
            failedCount++;
        } else {
            testCases.push({ name: "test_division_by_zero_handling", status: "PASSED", duration: "0.01s" });
            logs.push("test_calculator.py::test_division_by_zero_handling PASSED  [ 66%]");
            passedCount++;
        }

        // Case 3: Floating point operations
        testCases.push({ name: "test_floating_point_math", status: "PASSED", duration: "0.01s" });
        logs.push("test_calculator.py::test_floating_point_math PASSED      [100%]");
        passedCount++;

    } else { // Javascript
        logs.push("🔍 Found test suite 'math.test.js' with 3 test cases.");
        logs.push("🚀 Running Jest v29.7.0 on Node.js v24...");
        logs.push("-------------------------------------------------------");

        testCases.push({ name: "Add method aggregates correctly", status: "PASSED", duration: "3ms" });
        logs.push(" PASS  ./math.test.js\n  ✓ Add method aggregates correctly (3 ms)");
        passedCount++;

        if (code.includes('/ 0') || code.includes('b === 0') && code.includes('return a / b')) {
            testCases.push({ name: "Divide method rejects zero divisor", status: "FAILED", duration: "8ms", error: "AssertionError: Expected division to throw error" });
            logs.push(" FAIL  ./math.test.js\n  ✕ Divide method rejects zero divisor (8 ms)");
            logs.push("  ● Divide method rejects zero divisor\n\n    expect(received).toThrow()\n\n    Received: NaN or Infinity without guarding.\n\n      at Object.test (math.test.js:15:23)");
            failedCount++;
        } else {
            testCases.push({ name: "Divide method rejects zero divisor", status: "PASSED", duration: "2ms" });
            logs.push(" PASS  ./math.test.js\n  ✓ Divide method rejects zero divisor (2 ms)");
            passedCount++;
        }

        testCases.push({ name: "Multiply behaves linearly", status: "PASSED", duration: "1ms" });
        logs.push(" PASS  ./math.test.js\n  ✓ Multiply behaves linearly (1 ms)");
        passedCount++;
    }

    logs.push("-------------------------------------------------------");
    const total = passedCount + failedCount;
    logs.push(`🏁 Test Summary: ${passedCount} passed, ${failedCount} failed, total ${total}`);
    const coverage = failedCount > 0 ? 58 : 94; // lowered coverage on logic bugs
    logs.push(`📊 Code Coverage: ${coverage}% statement coverage.`);

    return { logs, testCases, passedCount, failedCount, coverage };
}

// Active orchestrator that steps through the pipeline
async function orchestratePipeline(runId) {
    const run = activeRuns[runId];
    if (!run) return;

    try {
        // --- STAGE 1: CHECK IN & COMMIT ---
        run.status = "RUNNING";
        run.currentStage = "commit";
        broadcast(runId, 'stage_update', { stage: 'commit', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "🚀 GitHub Webhook Triggered! Commit received." });
        broadcast(runId, 'log', { text: `💻 Commit SHA: ${run.commitSha} | Developer: ${run.author}` });
        broadcast(runId, 'log', { text: `📁 Files altered: main.${run.language === 'python' ? 'py' : 'js'}` });
        await delay(1500);
        broadcast(runId, 'stage_update', { stage: 'commit', status: 'PASSED' });
        broadcast(runId, 'log', { text: "✅ Workspace prepared. Initializing Quality Gates." });

        // --- STAGE 2: LINT & STATIC REVIEW ---
        run.currentStage = "lint";
        broadcast(runId, 'stage_update', { stage: 'lint', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "🔍 Running static lint analysis (LinterBot)..." });
        await delay(2000);

        const lintErrors = runLinter(run.code, run.language);
        run.lintResults = lintErrors;

        const hasCriticalLint = lintErrors.some(e => e.severity === 'error');
        if (hasCriticalLint) {
            lintErrors.forEach(err => {
                broadcast(runId, 'log', { text: `❌ [Lint Error] L${err.line}: ${err.message} (${err.rule})` });
            });
            broadcast(runId, 'stage_update', { stage: 'lint', status: 'FAILED' });
            run.status = "FAILED";
            broadcast(runId, 'run_ended', { status: 'FAILED', reason: 'Linter quality checks failed.' });
            return;
        } else if (lintErrors.length > 0) {
            lintErrors.forEach(err => {
                broadcast(runId, 'log', { text: `⚠️ [Lint Warning] L${err.line}: ${err.message}` });
            });
            broadcast(runId, 'log', { text: "ℹ️ Static lint checks completed with warnings." });
        } else {
            broadcast(runId, 'log', { text: "✨ Static lint checks completed with 0 errors!" });
        }
        broadcast(runId, 'stage_update', { stage: 'lint', status: 'PASSED' });
        await delay(1000);

        // --- STAGE 3: SR DEVELOPER PEER REVIEW AGENT ---
        run.currentStage = "review";
        broadcast(runId, 'stage_update', { stage: 'review', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "🤖 Senior Developer Peer Review Agent (DevBot) is reviewing code diff..." });

        let reviewResult = null;
        if (run.apiKey) {
            // Live Gemini API review call
            try {
                broadcast(runId, 'log', { text: "🔗 Contacting live Gemini API..." });
                const prompt = `You are a Senior Software Engineer doing a peer code review. Analyze this codebase (language: ${run.language}) and provide feedback.
                
                CODE:
                \`\`\`${run.language}
                ${run.code}
                \`\`\`

                Provide a JSON response only. Do NOT wrap in markdown \`\`\`json blocks, output pure raw JSON string directly. The JSON must match this structure exactly:
                {
                    "status": "APPROVED" | "CHANGES_REQUESTED",
                    "summary": "Full overview text of the PR code quality, architecture, style, and issues",
                    "comments": [
                        { "line": 5, "severity": "error" | "warning" | "info" | "critical", "text": "Inline code suggestion text" }
                    ]
                }`;

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${run.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                if (response.ok) {
                    const jsonRes = await response.json();
                    const textContent = jsonRes.candidates[0].content.parts[0].text;
                    reviewResult = JSON.parse(textContent);
                } else {
                    const errMsg = await response.text();
                    broadcast(runId, 'log', { text: `⚠️ Gemini API returned an error. Falling back to static review engine. Error: ${errMsg}` });
                }
            } catch (err) {
                broadcast(runId, 'log', { text: `⚠️ Gemini Connection error: ${err.message}. Falling back to static review engine.` });
            }
        }

        if (!reviewResult) {
            // Fallback heuristics
            await delay(2500);
            reviewResult = generateHeuristicReview(run.code, run.language);
        }

        run.reviewResult = reviewResult;
        broadcast(runId, 'review_completed', reviewResult);

        broadcast(runId, 'log', { text: `📝 DevBot Review Status: ${reviewResult.status}` });
        broadcast(runId, 'log', { text: `📝 DevBot Review Summary: ${reviewResult.summary}` });
        reviewResult.comments.forEach(c => {
            broadcast(runId, 'log', { text: `💬 Inline Comment [L${c.line}] [${c.severity}]: ${c.text}` });
        });

        if (reviewResult.status === "CHANGES_REQUESTED") {
            broadcast(runId, 'stage_update', { stage: 'review', status: 'FAILED' });
            run.status = "FAILED";
            broadcast(runId, 'run_ended', { status: 'FAILED', reason: 'Peer review requested changes.' });
            return;
        }

        broadcast(runId, 'stage_update', { stage: 'review', status: 'PASSED' });
        await delay(1000);

        // --- STAGE 4: QA AGENT UNIT & INTEGRATION TESTING ---
        run.currentStage = "qa";
        broadcast(runId, 'stage_update', { stage: 'qa', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "🧪 QA Agent (QABot) launching virtual testing environment..." });
        await delay(1500);

        const qaResults = runQATests(run.code, run.language);
        run.qaResults = qaResults;

        // Print qa logs
        for (const logLine of qaResults.logs) {
            broadcast(runId, 'log', { text: logLine });
            await delay(150);
        }

        broadcast(runId, 'qa_completed', qaResults);

        if (qaResults.failedCount > 0) {
            broadcast(runId, 'stage_update', { stage: 'qa', status: 'FAILED' });
            run.status = "FAILED";
            broadcast(runId, 'run_ended', { status: 'FAILED', reason: 'QA regression testing failed.' });
            return;
        }

        broadcast(runId, 'stage_update', { stage: 'qa', status: 'PASSED' });
        await delay(1000);

        // --- STAGE 5: HITL Gate (Human-In-The-Loop) ---
        run.currentStage = "hitl";
        broadcast(runId, 'stage_update', { stage: 'hitl', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "⏳ PIPELINE PAUSED: HITL Gate Reached." });
        broadcast(runId, 'log', { text: "👑 Awaiting human release manager approval to deploy to main branch..." });

        run.status = "AWAITING_APPROVAL";
        broadcast(runId, 'hitl_gate_reached', {
            review: run.reviewResult,
            qa: run.qaResults,
            linter: run.lintResults
        });

    } catch (error) {
        broadcast(runId, 'log', { text: `💥 Pipeline crash error: ${error.message}` });
        run.status = "FAILED";
        broadcast(runId, 'run_ended', { status: 'FAILED', reason: `Internal execution error: ${error.message}` });
    }
}

// Resume and Deploy once HITL Approved
async function deployPipeline(runId) {
    const run = activeRuns[runId];
    if (!run || run.status !== "AWAITING_APPROVAL") return;

    try {
        run.status = "RUNNING";
        broadcast(runId, 'stage_update', { stage: 'hitl', status: 'PASSED' });
        broadcast(runId, 'log', { text: "💚 HITL Approval Approved by human release manager!" });
        await delay(800);

        // --- STAGE 6: DEPLOYMENT ---
        run.currentStage = "deploy";
        broadcast(runId, 'stage_update', { stage: 'deploy', status: 'RUNNING' });
        broadcast(runId, 'log', { text: "🐳 Creating isolated Docker container instance..." });
        await delay(1000);
        broadcast(runId, 'log', { text: "⚡ Compiling & packaging deployment production assets..." });
        await delay(1200);
        broadcast(runId, 'log', { text: "📤 Pushing production container image to private registry..." });
        await delay(1000);
        broadcast(runId, 'log', { text: "🔄 Deploying container pod to Kubernetes cluster (main)..." });
        await delay(1200);
        broadcast(runId, 'log', { text: "🌐 Configuring load-balancer routing paths..." });
        await delay(800);
        broadcast(runId, 'log', { text: "🚀 Deployment health check: SUCCESS! Live at https://calculator-prod.app" });
        
        broadcast(runId, 'stage_update', { stage: 'deploy', status: 'PASSED' });
        run.status = "PASSED";
        broadcast(runId, 'run_ended', { status: 'PASSED', reason: 'Pipeline executed fully. Application deployed!' });
    } catch (error) {
        broadcast(runId, 'log', { text: `💥 Deployment crash error: ${error.message}` });
        run.status = "FAILED";
        broadcast(runId, 'stage_update', { stage: 'deploy', status: 'FAILED' });
        broadcast(runId, 'run_ended', { status: 'FAILED', reason: `Deployment error: ${error.message}` });
    }
}

// WebSockets link to client
wss.on('connection', (ws) => {
    let clientRunId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'subscribe') {
                clientRunId = data.runId;
                if (!activeRuns[clientRunId]) {
                    activeRuns[clientRunId] = {};
                }
                activeRuns[clientRunId].ws = ws;
                ws.send(JSON.stringify({ type: 'subscribed', runId: clientRunId }));
            }
        } catch (e) {
            console.error('WS Error:', e);
        }
    });

    ws.on('close', () => {
        if (clientRunId && activeRuns[clientRunId]) {
            activeRuns[clientRunId].ws = null;
        }
    });
});

// REST API Endpoints
app.post('/api/push', (req, res) => {
    const { code, language, apiKey, author } = req.body;
    const runId = 'run_' + Math.random().toString(36).substr(2, 9);
    const commitSha = Math.random().toString(16).substr(2, 7);

    activeRuns[runId] = {
        runId,
        code,
        language,
        apiKey,
        author: author || 'Sangeeta Verma',
        commitSha,
        status: 'PENDING',
        currentStage: null,
        ws: null
    };

    // Run in background asynchronously
    setTimeout(() => {
        orchestratePipeline(runId);
    }, 500);

    res.json({ success: true, runId, commitSha });
});

app.post('/api/approve', async (req, res) => {
    const { runId } = req.body;
    const run = activeRuns[runId];

    if (!run || run.status !== 'AWAITING_APPROVAL') {
        return res.status(400).json({ success: false, error: 'Invalid run ID or status.' });
    }

    // Deploy asynchronously
    deployPipeline(runId);

    res.json({ success: true });
});

app.post('/api/reject', (req, res) => {
    const { runId } = req.body;
    const run = activeRuns[runId];

    if (!run || run.status !== 'AWAITING_APPROVAL') {
        return res.status(400).json({ success: false, error: 'Invalid run ID or status.' });
    }

    run.status = "FAILED";
    broadcast(runId, 'stage_update', { stage: 'hitl', status: 'FAILED' });
    broadcast(runId, 'log', { text: "❌ HITL: PR rejected and closed by human manager." });
    broadcast(runId, 'run_ended', { status: 'FAILED', reason: 'Human release manager rejected changes.' });

    res.json({ success: true });
});

// Serve UI for anything else
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 AgenticCI Server running on http://localhost:${PORT}`);
});
