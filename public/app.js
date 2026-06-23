// ==========================================================================
// AgenticCI - Frontend Core Logic & WebSockets Orchestration
// ==========================================================================

// Predefined Code Presets
const PRESETS = {
    clean_py: `"""
Module containing safe utility methods for mathematical aggregate calculations.
Conforms to Python coding standards (PEP 8) with clean docstrings and safety guards.
"""

def add(a: float, b: float) -> float:
    """Safely aggregates two numbers together."""
    return a + b

def subtract(a: float, b: float) -> float:
    """Calculates the absolute difference between two values."""
    return a - b

def divide(a: float, b: float) -> float:
    """Calculates division quotient. Incorporates denominator safety guards."""
    if b == 0:
        raise ValueError("Cannot divide by a zero denominator.")
    return a / b
`,

    lint_py: `import os
import sys

def add_numbers(A,B):
    return A+B

def divide_numbers(a, b):
    # Missing docstring and bad formatting
    return a/b
`,

    logic_py: `"""
Module containing arithmetic calculator methods.
Contains severe edge-case defects leading to division-by-zero crashes.
"""

def add(a, b):
    return a + b

def divide(a, b):
    # QA regression tests will fail since b is not verified before division
    return a / 0
`,

    security_py: `"""
Module containing remote server connection configurations and auth brokers.
WARNING: Contains hardcoded sensitive security keys.
"""

import sys

# Critical Security Issue: Hardcoded API credential
REMOTE_API_KEY = "sk-5m2x789n4k12o39p87v6w5a4q3z2x1c"
API_ENDPOINT = "https://core-gateway.services.prod/v2"

def init_connection():
    """Initializes remote client connection using the hardcoded credentials."""
    print(f"Connecting to {API_ENDPOINT} with auth token: {REMOTE_API_KEY}")
    return True
`
};

// Global App State
const state = {
    activeRunId: null,
    ws: null,
    activeTab: 'terminal',
    activePreset: 'clean_py',
    apiKey: localStorage.getItem('gemini_api_key') || '',
    authorName: localStorage.getItem('developer_name') || 'Sangeeta Verma'
};

// DOM References
const elements = {
    codeEditor: document.getElementById('codeEditor'),
    editorLineNumbers: document.getElementById('editorLineNumbers'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    pushButton: document.getElementById('pushButton'),
    pushSpinner: document.getElementById('pushSpinner'),
    commitMessage: document.getElementById('commitMessage'),
    langBadge: document.getElementById('langBadge'),
    
    // Configuration drawer
    configTriggerBtn: document.getElementById('configTriggerBtn'),
    configOverlay: document.getElementById('configOverlay'),
    configSidePanel: document.getElementById('configSidePanel'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    geminiApiKey: document.getElementById('geminiApiKey'),
    developerName: document.getElementById('developerName'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    // Pipeline Graph Nodes
    globalStatusBadge: document.getElementById('globalStatusBadge'),
    nodes: {
        commit: document.getElementById('node-commit'),
        lint: document.getElementById('node-lint'),
        review: document.getElementById('node-review'),
        qa: document.getElementById('node-qa'),
        hitl: document.getElementById('node-hitl'),
        deploy: document.getElementById('node-deploy')
    },
    lines: {
        line1: document.getElementById('line-1'),
        line2: document.getElementById('line-2'),
        line3: document.getElementById('line-3'),
        line4: document.getElementById('line-4'),
        line5: document.getElementById('line-5')
    },

    // Tab buttons & contents
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    clearTermBtn: document.getElementById('clearTermBtn'),
    terminalLogs: document.getElementById('terminalLogs'),

    // Linter view
    linterBadge: document.getElementById('linterBadge'),
    lintErrCount: document.getElementById('lintErrCount'),
    lintWarnCount: document.getElementById('lintWarnCount'),
    lintInfoCount: document.getElementById('lintInfoCount'),
    lintIssuesList: document.getElementById('lintIssuesList'),

    // Peer Review view
    reviewDot: document.getElementById('reviewDot'),
    reviewDecisionCard: document.getElementById('reviewDecisionCard'),
    reviewDecisionText: document.getElementById('reviewDecisionText'),
    reviewSummaryText: document.getElementById('reviewSummaryText'),
    reviewAnnotationsList: document.getElementById('reviewAnnotationsList'),

    // QA view
    qaDot: document.getElementById('qaDot'),
    coverageProgress: document.getElementById('coverageProgress'),
    coverageValue: document.getElementById('coverageValue'),
    qaTotalCount: document.getElementById('qaTotalCount'),
    qaPassedCount: document.getElementById('qaPassedCount'),
    qaFailedCount: document.getElementById('qaFailedCount'),
    testCasesList: document.getElementById('testCasesList'),

    // HITL Gate view
    hitlPulseRing: document.getElementById('hitlPulseRing'),
    hitlBoard: document.getElementById('hitlBoard'),
    hitlWaitingBanner: document.getElementById('hitlWaitingBanner'),
    hitlGatePanel: document.getElementById('hitlGatePanel'),
    hitlPrTitle: document.getElementById('hitlPrTitle'),
    prResLint: document.getElementById('pr-res-lint'),
    prResReview: document.getElementById('pr-res-review'),
    prResQa: document.getElementById('pr-res-qa'),
    gateRecText: document.getElementById('gateRecText'),
    rejectPRBtn: document.getElementById('rejectPRBtn'),
    approvePRBtn: document.getElementById('approvePRBtn'),

    toastContainer: document.getElementById('toastContainer')
};

// ==========================================================================
// 1. CORE LAYOUT & INTERACTIVE EVENTS
// ==========================================================================

// Sync editor line numbers
function syncLineNumbers() {
    const lines = elements.codeEditor.value.split('\n');
    const numbers = lines.map((_, idx) => idx + 1).join('<br>');
    elements.editorLineNumbers.innerHTML = numbers;
}

// Show Preset
function loadPreset(presetKey) {
    state.activePreset = presetKey;
    elements.codeEditor.value = PRESETS[presetKey];
    syncLineNumbers();

    // Set badges & default commit messages
    if (presetKey.endsWith('_py')) {
        elements.langBadge.innerText = "PYTHON 3.14";
    } else {
        elements.langBadge.innerText = "JAVASCRIPT ES15";
    }

    const messages = {
        clean_py: "feat: restructure math operations module safely",
        lint_py: "refactor: apply math division scripts",
        logic_py: "bugfix: alter math divide functions",
        security_py: "feat: connect cloud auth endpoints"
    };
    elements.commitMessage.value = messages[presetKey] || "update module";

    elements.presetBtns.forEach(btn => {
        if (btn.dataset.preset === presetKey) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    showToast(`📝 Loaded preset: ${presetKey.replace('_py', '')} code template.`, 'info');
}

// Config Panel Slideout controls
function toggleConfigPanel(isOpen) {
    if (isOpen) {
        elements.geminiApiKey.value = state.apiKey;
        elements.developerName.value = state.authorName;
        elements.configOverlay.classList.add('active');
        elements.configSidePanel.classList.add('open');
    } else {
        elements.configOverlay.classList.remove('active');
        elements.configSidePanel.classList.remove('open');
    }
}

// Tab switcher
function switchTab(targetTab) {
    state.activeTab = targetTab;
    
    // Update headers
    elements.tabBtns.forEach(btn => {
        if (btn.dataset.tab === targetTab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update body content
    elements.tabContents.forEach(content => {
        if (content.id === `content-${targetTab}`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

// Custom Toast Engine
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '🔔'}</span>
        <span class="toast-msg">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);
    
    // Trigger animation frame
    setTimeout(() => toast.classList.add('show'), 50);

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// Clear Terminal
function clearTerminal() {
    elements.terminalLogs.innerHTML = `<div class="term-line system-msg">Console cleared. Awaiting logs...</div>`;
}

// Append logs in retro console style
function appendTerminalLog(text) {
    const line = document.createElement('div');
    line.className = 'term-line';
    
    // Format logs with styles
    if (text.includes('❌') || text.includes('FAILED') || text.includes('[Error]')) {
        line.classList.add('error-msg');
    } else if (text.includes('✅') || text.includes('PASSED') || text.includes('SUCCESS') || text.includes('LGTM')) {
        line.classList.add('success-msg');
    } else if (text.includes('⚠️') || text.includes('paused') || text.includes('Awaiting')) {
        line.style.color = '#fcd34d'; // yellow
    }

    line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    elements.terminalLogs.appendChild(line);
    elements.terminalLogs.scrollTop = elements.terminalLogs.scrollHeight;
}

// Reset entire dashboard view back to fresh state before run
function resetDashboardUI() {
    // Reset Pipeline Stage Map Styles
    Object.keys(elements.nodes).forEach(key => {
        elements.nodes[key].className = 'pipeline-node IDLE';
    });
    Object.keys(elements.lines).forEach(key => {
        elements.lines[key].className = 'connector-line';
    });

    // Reset Tabs metadata dots/badges
    elements.linterBadge.classList.add('hidden');
    elements.reviewDot.className = 'tab-status-dot dot-idle';
    elements.qaDot.className = 'tab-status-dot dot-idle';
    elements.hitlPulseRing.classList.add('hidden');

    // Reset linter tab
    elements.lintErrCount.innerText = '0';
    elements.lintWarnCount.innerText = '0';
    elements.lintInfoCount.innerText = '0';
    elements.lintIssuesList.innerHTML = `<div class="empty-state"><p>Awaiting linter analysis run...</p></div>`;

    // Reset Review tab
    elements.reviewDecisionCard.className = 'reviewer-decision-card class-idle';
    elements.reviewDecisionText.innerText = "Awaiting Pipeline Start";
    elements.reviewSummaryText.innerText = "The senior review agent will output a comprehensive review summary once you trigger the pipeline.";
    elements.reviewAnnotationsList.innerHTML = `<div class="empty-state">No comments yet.</div>`;

    // Reset QA tab
    setQACoverageCircle(0);
    elements.qaTotalCount.innerText = '0';
    elements.qaPassedCount.innerText = '0';
    elements.qaFailedCount.innerText = '0';
    elements.testCasesList.innerHTML = `<div class="empty-state">No test suite executed yet.</div>`;

    // Reset HITL Tab
    elements.hitlBoard.classList.add('disabled');
    elements.hitlWaitingBanner.classList.remove('hidden');
    elements.hitlGatePanel.classList.add('hidden');
    
    // Set standard loading sub-cards in HITL
    elements.prResLint.className = 'pr-res-card';
    elements.prResLint.querySelector('.res-body').innerText = "Awaiting Run";
    elements.prResReview.className = 'pr-res-card';
    elements.prResReview.querySelector('.res-body').innerText = "Awaiting Run";
    elements.prResQa.className = 'pr-res-card';
    elements.prResQa.querySelector('.res-body').innerText = "Awaiting Run";
    elements.gateRecText.innerText = "Awaiting quality checks to issue recommendation.";
}

// Circular progress gauge renderer
function setQACoverageCircle(pct) {
    elements.coverageValue.textContent = `${pct}%`;
    const dasharray = `${pct}, 100`;
    elements.coverageProgress.setAttribute('stroke-dasharray', dasharray);
    
    // Color thresholds
    elements.coverageProgress.className.baseVal = "circle";
    if (pct < 60) {
        elements.coverageProgress.classList.add('bad');
    } else if (pct < 90) {
        elements.coverageProgress.classList.add('warn');
    }
}

// ==========================================================================
// 2. BACKEND API & WEBSOCKET SYNC
// ==========================================================================

// Trigger Push & Orchestrate
async function commitAndPushCode() {
    if (elements.pushButton.disabled) return;

    resetDashboardUI();
    clearTerminal();
    
    // Update IDE buttons loading
    elements.pushButton.disabled = true;
    elements.pushSpinner.classList.remove('hidden');
    elements.pushButton.querySelector('.btn-text').innerText = "PUSHING COMMIT...";

    const codeContent = elements.codeEditor.value;
    const isPython = elements.langBadge.innerText.includes("PYTHON");

    appendTerminalLog("📤 Initiating secure socket connection with repository backend...");

    try {
        const response = await fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: codeContent,
                language: isPython ? 'python' : 'javascript',
                apiKey: state.apiKey,
                author: state.authorName
            })
        });

        if (!response.ok) {
            throw new Error(`Push API failure: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success) {
            state.activeRunId = data.runId;
            showToast(`🚀 Commit pushed successfully! Hash: ${data.commitSha}`, 'success');
            
            // Connect WebSocket to stream logs
            connectWSStream(data.runId);
        } else {
            throw new Error(data.error || "Failed pushing changes.");
        }

    } catch (err) {
        showToast(err.message, 'error');
        appendTerminalLog(`💥 Push Error: ${err.message}`);
        elements.pushButton.disabled = false;
        elements.pushSpinner.classList.add('hidden');
        elements.pushButton.querySelector('.btn-text').innerText = "🚀 COMMIT & PUSH TO GITHUB";
    }
}

// Socket sync stream
function connectWSStream(runId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        // Subscribe to our active run updates
        state.ws.send(JSON.stringify({
            type: 'subscribe',
            runId: runId
        }));
    };

    state.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handlePipelineEvent(msg);
        } catch (e) {
            console.error('Socket parse fail:', e);
        }
    };

    state.ws.onclose = () => {
        console.log("WebSocket socket stream disconnected.");
    };

    state.ws.onerror = (err) => {
        console.error("WS connection error:", err);
    };
}

// Pipeline Events Parser
function handlePipelineEvent(event) {
    switch (event.type) {
        case 'subscribed':
            appendTerminalLog("📡 Stream connected. Active multi-agent pipeline monitoring enabled.");
            break;
            
        case 'stage_update':
            updateStageStatus(event.stage, event.status);
            break;
            
        case 'log':
            appendTerminalLog(event.text);
            break;
            
        case 'review_completed':
            renderReviewTab(event);
            break;
            
        case 'qa_completed':
            renderQATab(event);
            break;
            
        case 'hitl_gate_reached':
            unlockHITLGate(event);
            break;
            
        case 'run_ended':
            handlePipelineEnd(event);
            break;
    }
}

// Render horizontal flowchart nodes & lines
function updateStageStatus(stage, status) {
    const node = elements.nodes[stage];
    if (node) {
        node.className = `pipeline-node ${status}`;
    }

    // Light up connectors
    const lineMap = {
        commit: elements.lines.line1,
        lint: elements.lines.line2,
        review: elements.lines.line3,
        qa: elements.lines.line4,
        hitl: elements.lines.line5
    };
    
    const line = lineMap[stage];
    if (line) {
        line.className = `connector-line ${status}`;
    }

    // Set Global status badge
    if (stage === 'hitl' && status === 'RUNNING') {
        elements.globalStatusBadge.innerText = "AWAITING APPROVAL";
        elements.globalStatusBadge.className = "pipeline-global-status AWAITING_APPROVAL";
    } else {
        elements.globalStatusBadge.innerText = status;
        elements.globalStatusBadge.className = `pipeline-global-status ${status}`;
    }

    // Auto-switch to tab to guide the user's attention
    if (status === 'RUNNING') {
        if (stage === 'lint') {
            switchTab('linter');
        } else if (stage === 'review') {
            switchTab('review');
            elements.reviewDot.className = 'tab-status-dot dot-running';
        } else if (stage === 'qa') {
            switchTab('qa');
            elements.qaDot.className = 'tab-status-dot dot-running';
        }
    }
}

// Populate Linter logs
function renderReviewTab(data) {
    // Decision card
    const card = elements.reviewDecisionCard;
    elements.reviewDecisionText.innerText = data.status === 'APPROVED' ? '✅ LGTM: APPROVED BY DEVBOT' : '❌ REJECTED: CHANGES REQUESTED BY DEVBOT';
    card.className = `reviewer-decision-card ${data.status === 'APPROVED' ? 'class-approved' : 'class-changes'}`;
    elements.reviewSummaryText.innerText = data.summary;

    // Dot indicators
    elements.reviewDot.className = `tab-status-dot ${data.status === 'APPROVED' ? 'dot-passed' : 'dot-failed'}`;

    // Inline annotations list
    const list = elements.reviewAnnotationsList;
    list.innerHTML = '';
    
    if (data.comments && data.comments.length > 0) {
        data.comments.forEach(comment => {
            const item = document.createElement('div');
            item.className = `annotation-item ${comment.severity}`;
            item.innerHTML = `
                <div class="annot-meta">LINE ${comment.line} | ${comment.severity.toUpperCase()}</div>
                <div class="annot-text">${comment.text}</div>
            `;
            list.appendChild(item);
        });

        // Toggle Linter badge count in header
        elements.linterBadge.classList.remove('hidden');
        elements.linterBadge.innerText = data.comments.length.toString();
        
        // Also populate static linter issues
        renderLinterIssues(data.comments);
    } else {
        list.innerHTML = `<div class="empty-state">✨ Senior Developer Agent flagged 0 style/logic concerns in this pull request!</div>`;
        elements.linterBadge.classList.add('hidden');
    }
}

// Populate linter issues list
function renderLinterIssues(comments) {
    const list = elements.lintIssuesList;
    list.innerHTML = '';

    let errors = 0;
    let warnings = 0;
    let infos = 0;

    comments.forEach(comment => {
        if (comment.severity === 'critical' || comment.severity === 'error') {
            errors++;
        } else if (comment.severity === 'warning') {
            warnings++;
        } else {
            infos++;
        }

        const item = document.createElement('div');
        item.className = `lint-issue-item ${comment.severity === 'critical' ? 'error' : comment.severity}`;
        item.innerHTML = `
            <div class="lint-meta">
                <span class="lint-loc">LINE ${comment.line}</span>
                <span class="lint-rule">devbot::${comment.severity}</span>
            </div>
            <div class="lint-msg">${comment.text}</div>
        `;
        list.appendChild(item);
    });

    elements.lintErrCount.innerText = errors;
    elements.lintWarnCount.innerText = warnings;
    elements.lintInfoCount.innerText = infos;
}

// Populate QA Unit/Integration tests
function renderQATab(data) {
    elements.qaDot.className = data.failedCount > 0 ? 'tab-status-dot dot-failed' : 'tab-status-dot dot-passed';

    // Coverage animate gauge
    setQACoverageCircle(data.coverage);

    // Summary counts
    elements.qaTotalCount.innerText = data.passedCount + data.failedCount;
    elements.qaPassedCount.innerText = data.passedCount;
    elements.qaFailedCount.innerText = data.failedCount;

    // Test cases list
    const list = elements.testCasesList;
    list.innerHTML = '';

    data.testCases.forEach(tc => {
        const item = document.createElement('div');
        item.className = 'test-item';
        item.innerHTML = `
            <div class="test-name-wrap">
                <span class="test-badge ${tc.status}">${tc.status}</span>
                <span class="test-name">${tc.name}</span>
            </div>
            <span class="test-duration">${tc.duration}</span>
        `;
        list.appendChild(item);
    });
}

// Unlock manual HITL approve gate panel
function unlockHITLGate(data) {
    switchTab('hitl');
    
    // Pulse animation around HITL tab
    elements.hitlPulseRing.classList.remove('hidden');

    elements.hitlBoard.classList.remove('disabled');
    elements.hitlWaitingBanner.classList.add('hidden');
    elements.hitlGatePanel.classList.remove('hidden');

    // Title
    elements.hitlPrTitle.innerText = elements.commitMessage.value;

    // Pull request sub-cards indicators
    const isClean = state.activePreset === 'clean_py';
    const isLint = state.activePreset === 'lint_py';
    const isLogic = state.activePreset === 'logic_py';
    const isSecurity = state.activePreset === 'security_py';

    // 1. Static Lint check
    if (isLint) {
        elements.prResLint.className = "pr-res-card FAILED";
        elements.prResLint.querySelector('.res-body').innerText = "⚠️ Warn/Error";
    } else {
        elements.prResLint.className = "pr-res-card PASSED";
        elements.prResLint.querySelector('.res-body').innerText = "✨ Clean (0 Errors)";
    }

    // 2. Peer Review Check
    if (isSecurity) {
        elements.prResReview.className = "pr-res-card FAILED";
        elements.prResReview.querySelector('.res-body').innerText = "❌ Security Red Flag";
        elements.gateRecText.innerText = "🚨 REJECT: PR contains severe credential leaks. Approving will compromise remote database security.";
    } else {
        elements.prResReview.className = "pr-res-card PASSED";
        elements.prResReview.querySelector('.res-body').innerText = "✅ Approved (LGTM)";
    }

    // 3. QA Testing Check
    if (isLogic) {
        elements.prResQa.className = "pr-res-card FAILED";
        elements.prResQa.querySelector('.res-body').innerText = "❌ 1 Failure (58% Cov)";
        elements.gateRecText.innerText = "❌ REJECT: Automated Jest/pytest runs failed. The logic division-by-zero boundary check must be patched.";
    } else {
        elements.prResQa.className = "pr-res-card PASSED";
        elements.prResQa.querySelector('.res-body').innerText = "✅ 3 Passed (94% Cov)";
    }

    if (isClean) {
        elements.gateRecText.innerText = "💚 MERGE RECOMMENDED: All quality metrics, peer reviews, and regression testing suites passed successfully.";
    } else if (isLint) {
        elements.gateRecText.innerText = "⚠️ CAUTION: Code is executable, but static linter warnings are present. Merge with minor formatting oversight.";
    }
}

// PR Decisions
async function handlePrDecision(action) {
    if (!state.activeRunId) return;

    elements.rejectPRBtn.disabled = true;
    elements.approvePRBtn.disabled = true;
    elements.hitlPulseRing.classList.add('hidden');

    try {
        const response = await fetch(`/api/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: state.activeRunId })
        });

        if (response.ok) {
            showToast(`Branch Action: Commit successfully ${action}ed!`, action === 'approve' ? 'success' : 'warning');
            
            // Switch back to terminal to watch deploy
            switchTab('terminal');
        } else {
            throw new Error(`API rejection: ${response.statusText}`);
        }
    } catch (e) {
        showToast(`Failed acting on PR: ${e.message}`, 'error');
        elements.rejectPRBtn.disabled = false;
        elements.approvePRBtn.disabled = false;
    }
}

// Reset loader buttons when runner completes
function handlePipelineEnd(event) {
    elements.pushButton.disabled = false;
    elements.pushSpinner.classList.add('hidden');
    elements.pushButton.querySelector('.btn-text').innerText = "🚀 COMMIT & PUSH TO GITHUB";

    elements.rejectPRBtn.disabled = false;
    elements.approvePRBtn.disabled = false;

    // Disconnect active WS
    if (state.ws) {
        state.ws.close();
    }

    // Set Global status badge
    elements.globalStatusBadge.innerText = event.status;
    elements.globalStatusBadge.className = `pipeline-global-status ${event.status}`;

    // Final alerts
    if (event.status === 'PASSED') {
        showToast("🎉 Pipeline Success! Module is fully deployed in production.", 'success');
        updateStageStatus('deploy', 'PASSED');
    } else {
        showToast(`❌ Quality Check Failed: ${event.reason}`, 'error');
        // Flag whichever stage was active when failed
        Object.keys(elements.nodes).forEach(key => {
            const node = elements.nodes[key];
            if (node.classList.contains('RUNNING')) {
                node.className = `pipeline-node FAILED`;
            }
        });
    }
}

// ==========================================================================
// 3. INITIALIZATION & STORAGE BINDINGS
// ==========================================================================

function initApp() {
    // Add textarea indentation helper (tab key)
    elements.codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = elements.codeEditor.selectionStart;
            const end = elements.codeEditor.selectionEnd;
            elements.codeEditor.value = elements.codeEditor.value.substring(0, start) + "    " + elements.codeEditor.value.substring(end);
            elements.codeEditor.selectionStart = elements.codeEditor.selectionEnd = start + 4;
            syncLineNumbers();
        }
    });

    elements.codeEditor.addEventListener('input', syncLineNumbers);

    // Bind Preset button clicks
    elements.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            loadPreset(btn.dataset.preset);
        });
    });

    // Configuration modal binds
    elements.configTriggerBtn.addEventListener('click', () => toggleConfigPanel(true));
    elements.closePanelBtn.addEventListener('click', () => toggleConfigPanel(false));
    elements.configOverlay.addEventListener('click', () => toggleConfigPanel(false));

    elements.saveSettingsBtn.addEventListener('click', () => {
        state.apiKey = elements.geminiApiKey.value.trim();
        state.authorName = elements.developerName.value.trim() || 'Sangeeta Verma';

        localStorage.setItem('gemini_api_key', state.apiKey);
        localStorage.setItem('developer_name', state.authorName);

        showToast("⚙️ Orchestrator settings applied and stored.", "success");
        toggleConfigPanel(false);
    });

    // Tab buttons binds
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    elements.clearTermBtn.addEventListener('click', clearTerminal);

    // Action button pushes
    elements.pushButton.addEventListener('click', commitAndPushCode);

    elements.approvePRBtn.addEventListener('click', () => handlePrDecision('approve'));
    elements.rejectPRBtn.addEventListener('click', () => handlePrDecision('reject'));

    // Load initial default values
    loadPreset('clean_py');
}

// Launch app!
window.addEventListener('DOMContentLoaded', initApp);
