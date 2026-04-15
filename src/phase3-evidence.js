function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutError(label) {
  return new Error(`${label} timeout`);
}

function toPlainWorkflowState(state) {
  if (!state) return null;
  return JSON.parse(JSON.stringify({
    provider: state.provider,
    currentRun: state.currentRun,
    currentStage: state.currentStage,
    currentStageBehavior: state.currentStageBehavior,
    progress: state.progress,
    runHistory: state.runHistory,
    teamTemplate: state.teamTemplate,
    workflowTemplate: state.workflowTemplate,
  }));
}

export function createPhase3EvidenceDriver({ DataManager, workflowPanel, game, Scene } = {}) {
  const statusEl = document.createElement('div');
  statusEl.id = 'phase3-evidence-status';
  statusEl.style.cssText = [
    'position:fixed',
    'right:14px',
    'bottom:14px',
    'z-index:9999',
    'max-width:340px',
    'padding:10px 12px',
    'border-radius:12px',
    'border:1px solid rgba(148,163,184,0.25)',
    'background:rgba(15,23,42,0.92)',
    'box-shadow:0 14px 40px rgba(15,23,42,0.35)',
    'color:#e2e8f0',
    'font:12px/1.45 Inter, system-ui, sans-serif',
    'white-space:pre-wrap',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(statusEl);

  const state = {
    status: 'idle',
    mode: 'manual',
    targetStage: null,
    runId: null,
    workflowStatus: null,
    currentStageId: null,
    provider: null,
    providerStatus: null,
    recentEvents: [],
    capturedAt: null,
    error: null,
  };

  function readWorkflowState() {
    return workflowPanel.getWorkflowState?.() || null;
  }

  function readExecutionEvidence() {
    return DataManager.getExecutionEvidence?.() || null;
  }

  function publishStatus(patch = {}) {
    Object.assign(state, patch);
    const payload = {
      ...state,
      workflow: toPlainWorkflowState(readWorkflowState()),
      executionEvidence: readExecutionEvidence(),
    };
    window.__PHASE3_EVIDENCE__ = payload;
    document.body.dataset.phase3EvidenceStatus = state.status;
    document.body.dataset.phase3EvidenceStage = state.currentStageId || '';
    document.body.dataset.phase3EvidenceRunId = state.runId || '';
    document.body.dataset.phase3EvidenceMode = state.mode || '';

    const eventLines = (payload.executionEvidence?.recentEvents || [])
      .slice(0, 5)
      .map((event) => `• ${event.type}${event.stageId ? ` @ ${event.stageId}` : ''}`);

    statusEl.textContent = [
      `Phase 3 Evidence · ${state.status}`,
      `target=${state.targetStage || '—'}`,
      `run=${state.runId || '—'}`,
      `stage=${state.currentStageId || '—'}`,
      `provider=${payload.executionEvidence?.provider || '—'} / ${payload.executionEvidence?.status || '—'}`,
      eventLines.length ? `events:\n${eventLines.join('\n')}` : 'events: —',
      state.error ? `error=${state.error}` : null,
    ].filter(Boolean).join('\n');

    return payload;
  }

  async function waitFor(label, predicate, timeoutMs = 15000, intervalMs = 80) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const value = predicate();
      if (value) return value;
      await sleep(intervalMs);
    }
    throw createTimeoutError(label);
  }

  function resolveLiveRoleAssignments() {
    const agents = DataManager._rawAgents || [];
    const findByRole = (role) => agents.find((agent) => agent.role === role)?.id || null;
    const findById = (id) => agents.find((agent) => agent.id === id)?.id || null;
    const firstId = agents[0]?.id || null;

    const leaderId = findByRole('leader') || findById('main') || firstId;
    const designerId = findByRole('designer') || findById('design-agent') || findById('husky') || leaderId;
    const frontendId = findByRole('frontend') || findById('fe-agent') || findById('husky') || designerId || leaderId;
    const backendId = findByRole('backend') || findById('be-agent') || leaderId;
    const qaId = findByRole('qa') || findById('qa-agent') || leaderId;

    return {
      leader: leaderId,
      designer: designerId,
      frontend: frontendId,
      backend: backendId,
      qa: qaId,
    };
  }

  async function ensureLiveConnected() {
    if (readExecutionEvidence()?.status !== 'live') {
      await game.reconnectLive?.();
    }

    await waitFor('live-connection', () => {
      const evidence = readExecutionEvidence();
      return evidence?.status === 'live';
    }, 15000);

    await waitFor('live-agents', () => (DataManager._rawAgents || []).length > 0 || (DataManager.getAdapterContract?.()?.getAgents?.() || []).length > 0, 15000);
    await workflowPanel.syncWorkflowProviderSnapshot?.();
  }

  async function applyLivePhase3Preset() {
    await workflowPanel.ensureWorkflowCore?.();
    await workflowPanel.syncWorkflowProviderSnapshot?.();
    workflowPanel.builderUI?.resetTeamTemplate?.();
    workflowPanel.builderUI?.resetWorkflowTemplate?.();

    const assignments = resolveLiveRoleAssignments();
    workflowPanel.applyTeamRoleAssignments?.(assignments, 'Phase 3 Live Closure Team');
    const workflowState = readWorkflowState();
    publishStatus({
      provider: workflowState?.provider || readExecutionEvidence()?.provider || null,
    });
    return assignments;
  }

  async function driveUntil(targetStage = 'completed', { stepDelayMs = 900 } = {}) {
    const normalizeTarget = targetStage === 'qa' ? 'completed' : targetStage;
    let current = readWorkflowState();
    publishStatus({
      currentStageId: current?.currentStage?.id || null,
      workflowStatus: current?.currentRun?.status || null,
    });

    if (!current?.currentRun) {
      await game.startWorkflowDemo();
      current = await waitFor('workflow-start', () => {
        const next = readWorkflowState();
        return next?.currentRun ? next : null;
      }, 15000);
      publishStatus({
        runId: current.currentRun?.id || null,
        currentStageId: current.currentStage?.id || null,
        workflowStatus: current.currentRun?.status || null,
      });
    }

    const maxSteps = 8;
    let steps = 0;
    while (steps < maxSteps) {
      current = readWorkflowState();
      const run = current?.currentRun;
      const stageId = current?.currentStage?.id || null;
      publishStatus({
        runId: run?.id || null,
        currentStageId: stageId,
        workflowStatus: run?.status || null,
        provider: readExecutionEvidence()?.provider || null,
        providerStatus: readExecutionEvidence()?.status || null,
      });

      const isTargetReached = normalizeTarget === 'completed'
        ? run?.status === 'completed'
        : stageId === normalizeTarget;
      if (isTargetReached) {
        return current;
      }

      await game.advanceWorkflow();
      await sleep(stepDelayMs);
      steps += 1;
    }

    throw new Error(`Unable to reach target stage: ${targetStage}`);
  }

  async function runLiveClosure(targetStage = 'completed', options = {}) {
    const { stepDelayMs = 900, settleMs = 1200, switchToBuilder = true } = options;
    try {
      publishStatus({
        status: 'preparing',
        mode: 'phase3-live-ui',
        targetStage,
        error: null,
      });
      if (switchToBuilder) {
        game.showBuilder?.();
      }
      game.setZoomLevel?.(0.75);
      await ensureLiveConnected();
      await applyLivePhase3Preset();
      publishStatus({ status: 'running' });
      const finalState = await driveUntil(targetStage, { stepDelayMs });
      await sleep(settleMs);
      const executionEvidence = readExecutionEvidence();
      publishStatus({
        status: 'ready',
        runId: finalState?.currentRun?.id || executionEvidence?.activeRun?.runId || null,
        currentStageId: finalState?.currentStage?.id || null,
        workflowStatus: finalState?.currentRun?.status || null,
        provider: executionEvidence?.provider || null,
        providerStatus: executionEvidence?.status || null,
        recentEvents: executionEvidence?.recentEvents || [],
        capturedAt: new Date().toISOString(),
      });
      return window.__PHASE3_EVIDENCE__;
    } catch (error) {
      publishStatus({
        status: 'failed',
        error: error.message,
        capturedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  async function autoRunFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const enabled = params.get('phase3-evidence');
    if (!enabled || ['0', 'false', 'off'].includes(enabled)) {
      publishStatus({ status: 'idle', mode: 'manual' });
      return null;
    }

    const targetStage = params.get('target-stage') || 'completed';
    const stepDelayMs = Number(params.get('step-delay-ms') || 900);
    const settleMs = Number(params.get('settle-ms') || 1200);
    return runLiveClosure(targetStage, { stepDelayMs, settleMs, switchToBuilder: true });
  }

  publishStatus({ status: 'idle', mode: 'manual' });

  return {
    waitFor,
    runLiveClosure,
    autoRunFromUrl,
    getSnapshot: () => publishStatus({}),
  };
}
