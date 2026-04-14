function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createWorkflowPanelController({
  getDataManager,
  getScene,
  getAgents,
  getCommSystem,
  getBubbleSystem,
} = {}) {
  let workflowCore = null;
  let workflowCorePromise = null;
  let workflowEngine = null;
  let workflowState = null;
  let workflowVisualSignature = '';

  const readDataManager = () => getDataManager?.() || null;
  const readScene = () => getScene?.() || null;
  const readCommSystem = () => getCommSystem?.() || null;
  const readBubbleSystem = () => getBubbleSystem?.() || null;
  const readAgents = () => getAgents?.() || [];

  function ensureWorkflowCore() {
    if (!workflowCorePromise) {
      workflowCorePromise = import('./workflow-core.js')
        .then((module) => {
          workflowCore = module;
          return module;
        });
    }
    return workflowCorePromise;
  }

  function createRoleOptions(selectedRoleId) {
    const roles = workflowState?.teamTemplate?.roles || [];
    return roles.map((role) => `
      <option value="${escapeHtml(role.id)}" ${role.id === selectedRoleId ? 'selected' : ''}>${escapeHtml(role.label)}</option>
    `).join('');
  }

  function createAgentOptions(selectedAgentId) {
    const rawAgents = readDataManager()?._rawAgents || [];
    const fallbackOption = '<option value="">未分配</option>';
    const agentOptions = rawAgents.map((agent) => `
      <option value="${escapeHtml(agent.id)}" ${agent.id === selectedAgentId ? 'selected' : ''}>${escapeHtml(agent.name)} · ${escapeHtml(agent.role)}</option>
    `).join('');
    return `${fallbackOption}${agentOptions}`;
  }

  function renderWorkflowBuilderPanels() {
    const summaryEl = document.getElementById('builder-summary');
    const teamMetaEl = document.getElementById('builder-team-meta');
    const workflowMetaEl = document.getElementById('builder-workflow-meta');
    const teamNameEl = document.getElementById('builder-team-name');
    const workflowNameEl = document.getElementById('builder-workflow-name');
    const roleListEl = document.getElementById('builder-role-list');
    const stageListEl = document.getElementById('builder-stage-list');
    const runSummaryEl = document.getElementById('workflow-run-summary');
    const runBoardEl = document.getElementById('workflow-run-board');

    if (!summaryEl || !teamMetaEl || !workflowMetaEl || !teamNameEl || !workflowNameEl || !roleListEl || !stageListEl || !runSummaryEl || !runBoardEl) {
      return;
    }

    if (!workflowCore || !workflowState) {
      summaryEl.textContent = '工作流模块加载中…';
      teamMetaEl.innerHTML = '';
      workflowMetaEl.innerHTML = '';
      runSummaryEl.textContent = '工作流模块加载中…';
      runBoardEl.textContent = '工作流模块加载中…';
      return;
    }

    if (document.activeElement !== teamNameEl) teamNameEl.value = workflowState.teamTemplate?.name || '';
    if (document.activeElement !== workflowNameEl) workflowNameEl.value = workflowState.workflowTemplate?.name || '';

    summaryEl.textContent = workflowCore.describeBuilderSummary(workflowState);
    teamMetaEl.innerHTML = `
      <span class="builder-meta-chip">👥 ${(workflowState.teamTemplate?.roles || []).length} 个角色</span>
      <span class="builder-meta-chip">🔗 ${(workflowState.teamTemplate?.roles || []).filter((role) => role.assignedAgentId).length} 个已绑定</span>
    `;
    workflowMetaEl.innerHTML = `
      <span class="builder-meta-chip">🧭 ${(workflowState.workflowTemplate?.stages || []).length} 个阶段</span>
      <span class="builder-meta-chip">🎭 ${(workflowState.workflowTemplate?.stages || []).filter((stage) => stage.rpg?.cueLabel).length} 个 cue</span>
    `;

    roleListEl.innerHTML = (workflowState.teamTemplate?.roles || []).map((role, index) => `
      <div class="builder-row-card">
        <div class="builder-row-head">
          <div>
            <strong>${escapeHtml(role.label)}</strong>
            <div class="builder-row-tags">
              <span class="builder-row-tag">${escapeHtml(role.id)}</span>
              <span class="builder-row-tag">${escapeHtml(role.assignedAgentName || '未绑定 Agent')}</span>
            </div>
          </div>
          <button class="builder-btn builder-btn-danger" onclick="BuilderUI.removeRole(${index})">移除</button>
        </div>
        <div class="builder-grid two">
          <div>
            <div class="builder-mini-label">图标</div>
            <input class="builder-input" value="${escapeHtml(role.icon || '')}" oninput="BuilderUI.updateRole(${index}, 'icon', this.value)">
          </div>
          <div>
            <div class="builder-mini-label">名称</div>
            <input class="builder-input" value="${escapeHtml(role.label)}" oninput="BuilderUI.updateRole(${index}, 'label', this.value)">
          </div>
        </div>
        <div class="builder-grid" style="margin-top:8px;">
          <div>
            <div class="builder-mini-label">能力标签（逗号分隔）</div>
            <input class="builder-input" value="${escapeHtml((role.capabilityTags || []).join(', '))}" oninput="BuilderUI.updateRole(${index}, 'capabilityTags', this.value)">
          </div>
          <div>
            <div class="builder-mini-label">绑定 Agent</div>
            <select class="builder-select" onchange="BuilderUI.updateRole(${index}, 'assignedAgentId', this.value)">${createAgentOptions(role.assignedAgentId)}</select>
          </div>
        </div>
        <div class="builder-inline-note" style="margin-top:6px;">角色代号：${escapeHtml(role.id)}</div>
      </div>
    `).join('') || '<div class="builder-empty">暂无角色，请先添加。</div>';

    stageListEl.innerHTML = (workflowState.workflowTemplate?.stages || []).map((stage, index) => `
      <div class="builder-row-card">
        <div class="builder-row-head">
          <div>
            <strong>${escapeHtml(stage.label)}</strong>
            <div class="builder-row-tags">
              <span class="builder-row-tag">${escapeHtml(stage.ownerRoleId)}</span>
              <span class="builder-row-tag">${escapeHtml(stage.rpg?.cueLabel || '未设置 Cue')}</span>
            </div>
          </div>
          <button class="builder-btn builder-btn-danger" onclick="BuilderUI.removeStage(${index})">移除</button>
        </div>
        <div class="builder-grid two">
          <div>
            <div class="builder-mini-label">阶段名称</div>
            <input class="builder-input" value="${escapeHtml(stage.label)}" oninput="BuilderUI.updateStage(${index}, 'label', this.value)">
          </div>
          <div>
            <div class="builder-mini-label">Owner 角色</div>
            <select class="builder-select" onchange="BuilderUI.updateStage(${index}, 'ownerRoleId', this.value)">${createRoleOptions(stage.ownerRoleId)}</select>
          </div>
        </div>
        <div class="builder-grid two" style="margin-top:8px;">
          <div>
            <div class="builder-mini-label">完成信号</div>
            <input class="builder-input" value="${escapeHtml(stage.completionSignal)}" oninput="BuilderUI.updateStage(${index}, 'completionSignal', this.value)">
          </div>
          <div>
            <div class="builder-mini-label">RPG Cue</div>
            <input class="builder-input" value="${escapeHtml(stage.rpg?.cueLabel || '')}" oninput="BuilderUI.updateStage(${index}, 'rpg.cueLabel', this.value)">
          </div>
        </div>
        <div style="margin-top:8px;">
          <div class="builder-mini-label">阶段提示词</div>
          <textarea class="builder-textarea" oninput="BuilderUI.updateStage(${index}, 'rpg.bubbleText', this.value)">${escapeHtml(stage.rpg?.bubbleText || '')}</textarea>
        </div>
        <div style="margin-top:8px;">
          <div class="builder-mini-label">交接语</div>
          <input class="builder-input" value="${escapeHtml(stage.rpg?.handoffText || '')}" oninput="BuilderUI.updateStage(${index}, 'rpg.handoffText', this.value)">
        </div>
      </div>
    `).join('') || '<div class="builder-empty">暂无阶段，请先添加。</div>';

    const run = workflowState.currentRun;
    const cue = workflowState.currentStageBehavior;
    const progressRatio = Math.max(0, Math.min(1, workflowState.progress?.ratio || 0));
    const historyItems = (workflowState.runHistory || []).slice(-6).reverse();

    runSummaryEl.innerHTML = !run ? `
      <div class="builder-empty">尚未启动流程。点击顶部「启动流程」后，这里会显示当前阶段、Owner 和进度。</div>
    ` : `
      <div class="builder-summary-grid">
        <div class="builder-summary-pill">
          <span class="builder-inline-note">当前阶段</span>
          <strong>${escapeHtml(workflowState.currentStage?.label || '—')}</strong>
        </div>
        <div class="builder-summary-pill">
          <span class="builder-inline-note">Owner</span>
          <strong>${escapeHtml(cue?.assignedAgentName || cue?.ownerRoleLabel || run.currentOwnerRoleId || '未分配')}</strong>
        </div>
        <div class="builder-summary-pill">
          <span class="builder-inline-note">状态</span>
          <strong>${escapeHtml(run.status)}</strong>
        </div>
        <div class="builder-summary-pill">
          <span class="builder-inline-note">RPG Cue</span>
          <strong>${escapeHtml(cue?.cueLabel || '—')}</strong>
        </div>
      </div>
      <div class="builder-progress"><span style="width:${Math.round(progressRatio * 100)}%"></span></div>
      <div class="builder-inline-note">${escapeHtml(cue?.bubbleText || run.blockReason || '等待阶段推进')}</div>
    `;

    runBoardEl.innerHTML = !run ? `
      <div class="builder-empty">尚未启动流程。先配置团队 / 阶段，再点击顶部「启动流程」。</div>
    ` : `
      <div class="builder-metrics">
        <div class="builder-metric">
          <span class="builder-inline-note">当前阶段</span>
          <strong>${escapeHtml(workflowState.currentStage?.label || '—')}</strong>
        </div>
        <div class="builder-metric">
          <span class="builder-inline-note">Owner</span>
          <strong>${escapeHtml(cue?.assignedAgentName || cue?.ownerRoleLabel || run.currentOwnerRoleId || '未分配')}</strong>
        </div>
        <div class="builder-metric">
          <span class="builder-inline-note">运行状态</span>
          <strong>${escapeHtml(run.status)}</strong>
        </div>
        <div class="builder-metric">
          <span class="builder-inline-note">RPG Cue</span>
          <strong>${escapeHtml(cue?.cueLabel || '—')}</strong>
        </div>
      </div>
      <div class="builder-progress"><span style="width:${Math.round(progressRatio * 100)}%"></span></div>
      <div class="builder-inline-note">${escapeHtml(cue?.bubbleText || run.blockReason || '等待阶段推进')}</div>
      <div class="builder-history" style="margin-top:10px;">
        ${historyItems.map((entry) => `
          <div class="builder-history-item">
            <div>${escapeHtml(entry.summary)}</div>
            <div class="builder-inline-note">${escapeHtml((entry.at || '').replace('T', ' ').replace('Z', ''))}</div>
          </div>
        `).join('') || '<div class="builder-empty">暂无历史</div>'}
      </div>
    `;
  }

  function applyWorkflowVisualState() {
    if (!workflowState) {
      workflowVisualSignature = '';
      readScene()?.applyWorkflowState?.(null);
      return;
    }

    readScene()?.applyWorkflowState?.(workflowState);

    const run = workflowState.currentRun;
    const cue = workflowState.currentStageBehavior;
    if (!run || !cue) {
      workflowVisualSignature = '';
      return;
    }

    const signature = `${run.id}:${run.status}:${workflowState.currentStage?.id}:${workflowState.runHistory?.length || 0}`;
    if (signature === workflowVisualSignature) {
      return;
    }
    workflowVisualSignature = signature;

    const latest = workflowState.runHistory?.at(-1);
    if (latest?.type === 'run.handoff') {
      const toRole = workflowState.teamTemplate.roles.find((role) => role.id === latest.toRoleId);
      if (latest.fromAgentId && toRole?.assignedAgentId) {
        readCommSystem()?.trigger(latest.fromAgentId, toRole.assignedAgentId, cue.handoffText, readAgents(), readBubbleSystem());
      }
    }

    if (run.currentOwnerAgentId && ['running', 'blocked'].includes(run.status)) {
      readBubbleSystem()?.show(run.currentOwnerAgentId, run.status === 'blocked' ? (run.blockReason || cue.bubbleText) : cue.bubbleText, 4.2);
    }
  }

  function syncWorkflowStatusUI() {
    const workflowEl = document.getElementById('workflow-info');
    const cueEl = document.getElementById('workflow-cue-info');
    const startBtn = document.getElementById('btn-workflow-start');
    const nextBtn = document.getElementById('btn-workflow-next');

    if (workflowEl) {
      workflowEl.textContent = workflowCore && workflowState
        ? workflowCore.summarizeRunState(workflowState)
        : '加载中…';
    }

    if (cueEl) {
      cueEl.textContent = workflowState?.currentStageBehavior?.cueLabel
        || workflowState?.currentRun?.blockReason
        || '—';
    }

    if (startBtn) {
      startBtn.textContent = workflowState?.currentRun ? '🔁 重启流程' : '🧩 启动流程';
    }

    if (nextBtn) {
      const runStatus = workflowState?.currentRun?.status;
      nextBtn.disabled = !runStatus || ['completed', 'failed', 'cancelled'].includes(runStatus);
    }

    renderWorkflowBuilderPanels();
  }

  function decorateAgents(baseAgents) {
    if (!workflowCore || !workflowState) {
      return baseAgents;
    }
    return workflowCore.decorateAgentsForRun(baseAgents, workflowState);
  }

  function refreshWorkflowProjection() {
    if (!workflowCore || !workflowEngine) {
      return;
    }
    workflowState = workflowEngine.getState();
    readScene()?.syncAgents(readDataManager()?.getAgents?.() || []);
    syncWorkflowStatusUI();
    applyWorkflowVisualState();
  }

  const BuilderUI = {
    _cloneRoles() {
      return (workflowState?.teamTemplate?.roles || []).map((role) => ({ ...role, capabilityTags: [...(role.capabilityTags || [])] }));
    },

    _cloneStages() {
      return (workflowState?.workflowTemplate?.stages || []).map((stage) => ({
        ...stage,
        rpg: { ...(stage.rpg || {}) },
      }));
    },

    _applyTeam(nextRoles, nextName = workflowState?.teamTemplate?.name) {
      if (!workflowEngine) return;
      workflowEngine.setTeamTemplate({
        id: workflowState?.teamTemplate?.id,
        name: (nextName || '').trim() || '未命名团队',
        roles: nextRoles,
      });
    },

    _applyWorkflow(nextStages, nextName = workflowState?.workflowTemplate?.name) {
      if (!workflowEngine) return;
      workflowEngine.setWorkflowTemplate({
        id: workflowState?.workflowTemplate?.id,
        name: (nextName || '').trim() || '未命名流程',
        stages: nextStages,
      });
    },

    setTeamName(value) {
      this._applyTeam(this._cloneRoles(), value);
    },

    updateRole(index, field, value) {
      const roles = this._cloneRoles();
      if (!roles[index]) return;

      if (field === 'capabilityTags') {
        roles[index].capabilityTags = String(value).split(',').map((item) => item.trim()).filter(Boolean);
      } else if (field === 'assignedAgentId') {
        const matchedAgent = (readDataManager()?._rawAgents || []).find((agent) => agent.id === value);
        roles[index].assignedAgentId = value || null;
        roles[index].assignedAgentName = matchedAgent?.name || null;
      } else {
        roles[index][field] = value;
      }

      this._applyTeam(roles);
    },

    addRole() {
      const roles = this._cloneRoles();
      const nextIndex = roles.length + 1;
      roles.push({
        slotId: `custom-role-${nextIndex}`,
        id: `custom-${nextIndex}`,
        label: `新角色 ${nextIndex}`,
        icon: '🧩',
        capabilityTags: ['custom'],
        assignedAgentId: null,
        assignedAgentName: null,
      });
      this._applyTeam(roles);
    },

    removeRole(index) {
      const roles = this._cloneRoles();
      if (roles.length <= 3) {
        window.alert('团队至少保留 3 个角色。');
        return;
      }
      const removed = roles[index];
      roles.splice(index, 1);
      this._applyTeam(roles);

      if (!removed) return;
      const fallbackRoleId = roles[0]?.id || 'leader';
      const stages = this._cloneStages().map((stage) => ({
        ...stage,
        ownerRoleId: stage.ownerRoleId === removed.id ? fallbackRoleId : stage.ownerRoleId,
      }));
      this._applyWorkflow(stages);
    },

    resetTeamTemplate() {
      const dataManager = readDataManager();
      const defaults = workflowCore.createDefaultTeamTemplate(
        workflowCore.normalizeProviderSnapshot({
          provider: dataManager?._mode === 'live' ? 'openclaw' : 'mock',
          agents: dataManager?._rawAgents || [],
        }).agents,
      );
      workflowEngine.setTeamTemplate(defaults);
    },

    setWorkflowName(value) {
      this._applyWorkflow(this._cloneStages(), value);
    },

    updateStage(index, field, value) {
      const stages = this._cloneStages();
      if (!stages[index]) return;

      if (field.startsWith('rpg.')) {
        const key = field.split('.')[1];
        stages[index].rpg[key] = value;
      } else {
        stages[index][field] = value;
      }

      this._applyWorkflow(stages);
    },

    addStage() {
      const stages = this._cloneStages();
      const roles = workflowState?.teamTemplate?.roles || [];
      const ownerRoleId = roles[Math.min(stages.length, Math.max(roles.length - 1, 0))]?.id || roles[0]?.id || 'leader';
      const nextIndex = stages.length + 1;
      stages.push({
        id: `stage-${nextIndex}`,
        label: `新阶段 ${nextIndex}`,
        ownerRoleId,
        completionSignal: `signal-${nextIndex}`,
        rpg: {
          cueLabel: `阶段 ${nextIndex}`,
          bubbleText: '补充这个阶段需要触发的 RPG 表现。',
          handoffText: '当前阶段完成，准备进入下一阶段。',
          accentColor: '#a78bfa',
          motionMode: 'focus',
        },
      });
      this._applyWorkflow(stages);
    },

    removeStage(index) {
      const stages = this._cloneStages();
      if (stages.length <= 4) {
        window.alert('流程至少保留 4 个阶段。');
        return;
      }
      stages.splice(index, 1);
      this._applyWorkflow(stages);
    },

    resetWorkflowTemplate() {
      workflowEngine.setWorkflowTemplate(workflowCore.createDefaultWorkflowTemplate());
    },
  };

  function syncWorkflowProviderSnapshot() {
    return ensureWorkflowCore()
      .then((module) => {
        const dataManager = readDataManager();
        const snapshot = module.normalizeProviderSnapshot({
          provider: dataManager?._mode === 'live' ? 'openclaw' : 'mock',
          agents: dataManager?._rawAgents || [],
          sessions: dataManager?._rawSessions || [],
        });

        if (!workflowEngine) {
          workflowEngine = module.createWorkflowRuntime(snapshot);
          workflowEngine.on('state-changed', () => refreshWorkflowProjection());
        } else {
          workflowEngine.syncProviderSnapshot(snapshot);
        }

        workflowState = workflowEngine.getState();
        syncWorkflowStatusUI();
      })
      .catch((error) => {
        console.warn('[workflow] core bootstrap failed:', error);
        const workflowEl = document.getElementById('workflow-info');
        if (workflowEl) workflowEl.textContent = '模块加载失败';
      });
  }

  function startWorkflowRun() {
    ensureWorkflowCore()
      .then(() => syncWorkflowProviderSnapshot())
      .then(() => {
        const dataManager = readDataManager();
        if (!workflowEngine) return;
        const title = dataManager?._mode === 'live'
          ? 'Live 多 Agent 工作流'
          : 'Mock 多 Agent 工作流';
        workflowEngine.resetRun();
        workflowEngine.startRun(title);
        refreshWorkflowProjection();
      })
      .catch((error) => console.warn('[workflow] start failed:', error));
  }

  function advanceWorkflowRun() {
    if (!workflowEngine) return;
    try {
      workflowEngine.advanceStage('manual');
      refreshWorkflowProjection();
    } catch (error) {
      console.warn('[workflow] advance failed:', error);
    }
  }

  function resetWorkflowRun() {
    if (!workflowEngine) return;
    workflowEngine.resetRun();
    refreshWorkflowProjection();
  }

  return {
    ensureWorkflowCore,
    decorateAgents,
    renderWorkflowBuilderPanels,
    applyWorkflowVisualState,
    syncWorkflowStatusUI,
    refreshWorkflowProjection,
    syncWorkflowProviderSnapshot,
    startWorkflowRun,
    advanceWorkflowRun,
    resetWorkflowRun,
    builderUI: BuilderUI,
  };
}
