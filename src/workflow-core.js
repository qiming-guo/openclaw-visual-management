const DEFAULT_ROLE_CATALOG = [
  { id: 'leader', label: '产品 / 负责人', icon: '🐕', capabilityTags: ['planning', 'ownership'] },
  { id: 'designer', label: '设计', icon: '🎨', capabilityTags: ['design', 'ux'] },
  { id: 'frontend', label: '前端', icon: '🖥️', capabilityTags: ['frontend', 'ui'] },
  { id: 'backend', label: '后端', icon: '🗄️', capabilityTags: ['backend', 'api'] },
  { id: 'qa', label: '测试 / 验收', icon: '✅', capabilityTags: ['qa', 'validation'] },
];

const DEFAULT_WORKFLOW_STAGES = [
  { id: 'discovery', label: '需求梳理', ownerRoleId: 'leader', completionSignal: 'brief-approved' },
  { id: 'design', label: 'UI 设计', ownerRoleId: 'designer', completionSignal: 'design-ready' },
  { id: 'frontend', label: '前端实现', ownerRoleId: 'frontend', completionSignal: 'frontend-ready' },
  { id: 'backend', label: '后端实现', ownerRoleId: 'backend', completionSignal: 'backend-ready' },
  { id: 'qa', label: '测试验收', ownerRoleId: 'qa', completionSignal: 'qa-approved' },
];

const DEFAULT_STAGE_BEHAVIOR_MAP = {
  discovery: {
    cueLabel: '需求集结',
    bubbleText: '先把需求边界和目标讲清楚。',
    handoffText: '需求明确，交给设计推进。',
    accentColor: '#f59e0b',
    motionMode: 'gather',
  },
  design: {
    cueLabel: '设计评审',
    bubbleText: '输出界面草图与交互路线。',
    handoffText: '设计完成，前端可以开工了。',
    accentColor: '#ec4899',
    motionMode: 'focus',
  },
  frontend: {
    cueLabel: '界面施工',
    bubbleText: '把页面结构和交互实现出来。',
    handoffText: '前端已对齐，交给后端联调。',
    accentColor: '#3b82f6',
    motionMode: 'focus',
  },
  backend: {
    cueLabel: '能力接线',
    bubbleText: '接通接口、状态和服务能力。',
    handoffText: '后端就绪，请 QA 开始验收。',
    accentColor: '#22c55e',
    motionMode: 'focus',
  },
  qa: {
    cueLabel: '验收冲刺',
    bubbleText: '按清单回归验证并确认完成。',
    handoffText: '测试通过，本轮流程完成。',
    accentColor: '#ef4444',
    motionMode: 'focus',
  },
};

function createId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function timestamped(payload) {
  return {
    ...payload,
    at: new Date().toISOString(),
  };
}

function asCleanText(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function slugifyId(value, fallbackPrefix = 'item') {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || createId(fallbackPrefix);
}

function cloneRole(role, index = 0) {
  return {
    slotId: role.slotId || `${role.id || 'role'}-${index + 1}`,
    id: asCleanText(role.id, `role-${index + 1}`),
    label: asCleanText(role.label, role.id || `角色 ${index + 1}`),
    icon: asCleanText(role.icon, '🤖'),
    capabilityTags: [...(role.capabilityTags || [])].map((item) => asCleanText(item)).filter(Boolean),
    assignedAgentId: role.assignedAgentId || null,
    assignedAgentName: role.assignedAgentName || null,
  };
}

function getDefaultStageBehavior(stage) {
  const mapped = DEFAULT_STAGE_BEHAVIOR_MAP[stage.id] || {};
  return {
    cueLabel: mapped.cueLabel || `${stage.label} Cue`,
    bubbleText: mapped.bubbleText || `推进阶段：${stage.label}`,
    handoffText: mapped.handoffText || `${stage.label} 完成，继续下一阶段。`,
    accentColor: mapped.accentColor || '#a78bfa',
    motionMode: mapped.motionMode || 'focus',
  };
}

function cloneStage(stage, index = 0) {
  const id = stage.id || slugifyId(stage.label, 'stage');
  const defaults = getDefaultStageBehavior({ ...stage, id });

  return {
    id,
    label: asCleanText(stage.label, `阶段 ${index + 1}`),
    ownerRoleId: asCleanText(stage.ownerRoleId, 'leader'),
    completionSignal: asCleanText(stage.completionSignal, 'manual'),
    rpg: {
      cueLabel: asCleanText(stage.rpg?.cueLabel, defaults.cueLabel),
      bubbleText: asCleanText(stage.rpg?.bubbleText, defaults.bubbleText),
      handoffText: asCleanText(stage.rpg?.handoffText, defaults.handoffText),
      accentColor: asCleanText(stage.rpg?.accentColor, defaults.accentColor),
      motionMode: asCleanText(stage.rpg?.motionMode, defaults.motionMode),
    },
  };
}

function summarizeHistoryItem(entry, workflowTemplate) {
  const stageMap = new Map((workflowTemplate?.stages || []).map((stage) => [stage.id, stage]));
  const currentStage = stageMap.get(entry.stageId);
  const fromStage = stageMap.get(entry.fromStageId);
  const toStage = stageMap.get(entry.toStageId);

  switch (entry.type) {
    case 'run.started':
      return `启动 · ${currentStage?.label || entry.stageId}`;
    case 'run.handoff':
      return `交接 · ${fromStage?.label || entry.fromStageId} → ${toStage?.label || entry.toStageId}`;
    case 'run.stage.changed':
      return `进入 · ${currentStage?.label || entry.stageId}`;
    case 'run.blocked':
      return `阻塞 · ${currentStage?.label || entry.stageId}`;
    case 'run.completed':
      return `完成 · ${currentStage?.label || entry.stageId}`;
    default:
      return entry.type;
  }
}

class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    const handlers = this.listeners.get(event) || [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
    return () => {
      const next = (this.listeners.get(event) || []).filter((item) => item !== handler);
      this.listeners.set(event, next);
    };
  }

  emit(event, payload) {
    for (const handler of this.listeners.get(event) || []) {
      handler(payload);
    }
  }
}

export class TeamTemplate {
  constructor({ id = createId('team'), name, roles }) {
    this.id = id;
    this.name = asCleanText(name, '未命名团队');
    this.roles = (roles || []).map((role, index) => cloneRole(role, index));
  }
}

export class WorkflowTemplate {
  constructor({ id = createId('workflow'), name, stages }) {
    this.id = id;
    this.name = asCleanText(name, '未命名流程');
    this.stages = (stages || []).map((stage, index) => cloneStage(stage, index));
  }
}

export class TaskRun {
  constructor({ id = createId('run'), taskTitle, teamTemplateId, workflowTemplateId }) {
    this.id = id;
    this.taskTitle = taskTitle;
    this.teamTemplateId = teamTemplateId;
    this.workflowTemplateId = workflowTemplateId;
    this.status = 'draft';
    this.currentStageId = null;
    this.currentOwnerRoleId = null;
    this.currentOwnerAgentId = null;
    this.blockReason = null;
    this.history = [];
  }
}

export function normalizeAgentSnapshot(agent, provider = 'mock') {
  return {
    id: String(agent.id),
    provider,
    providerRef: String(agent.id),
    name: agent.name || String(agent.id),
    role: agent.role || 'backend',
    status: agent.status || 'idle',
    task: agent.task || '待机中',
    model: agent.model || '—',
    uptime: agent.uptime || '—',
    tokens: agent.tokens || '—',
  };
}

export function normalizeSessionSnapshot(session, provider = 'mock') {
  return {
    key: session.key || '',
    provider,
    label: session.label || session.key || '未命名会话',
    status: session.status || 'done',
    model: session.model || '—',
    updatedAt: session.updatedAt || null,
  };
}

export function normalizeProviderSnapshot({ provider, agents = [], sessions = [] }) {
  return {
    provider,
    agents: agents.map((agent) => normalizeAgentSnapshot(agent, provider)),
    sessions: sessions.map((session) => normalizeSessionSnapshot(session, provider)),
  };
}

function buildRoleCatalog(agentSnapshots) {
  const byRole = new Map(
    DEFAULT_ROLE_CATALOG.map((role) => [role.id, { ...role }]),
  );

  for (const agent of agentSnapshots) {
    if (!byRole.has(agent.role)) {
      byRole.set(agent.role, {
        id: agent.role,
        label: agent.role,
        icon: '🤖',
        capabilityTags: [agent.role],
      });
    }
  }

  return [...byRole.values()];
}

export function createDefaultTeamTemplate(agentSnapshots = []) {
  const catalog = buildRoleCatalog(agentSnapshots);
  const assignedByRole = new Map();

  for (const agent of agentSnapshots) {
    if (!assignedByRole.has(agent.role)) {
      assignedByRole.set(agent.role, agent);
    }
  }

  const roles = catalog.map((role) => {
    const assigned = assignedByRole.get(role.id);
    return {
      ...role,
      assignedAgentId: assigned?.id || null,
      assignedAgentName: assigned?.name || null,
    };
  });

  return new TeamTemplate({
    name: '默认多 Agent 团队',
    roles,
  });
}

export function createDefaultWorkflowTemplate() {
  return new WorkflowTemplate({
    name: '软件研发流程',
    stages: DEFAULT_WORKFLOW_STAGES,
  });
}

export function resolveStageBehavior(stage, teamTemplate) {
  if (!stage) {
    return null;
  }

  const ownerRole = teamTemplate?.roles?.find((role) => role.id === stage.ownerRoleId) || null;
  return {
    stageId: stage.id,
    stageLabel: stage.label,
    ownerRoleId: stage.ownerRoleId,
    ownerRoleLabel: ownerRole?.label || stage.ownerRoleId,
    assignedAgentId: ownerRole?.assignedAgentId || null,
    assignedAgentName: ownerRole?.assignedAgentName || null,
    cueLabel: stage.rpg?.cueLabel || getDefaultStageBehavior(stage).cueLabel,
    bubbleText: stage.rpg?.bubbleText || getDefaultStageBehavior(stage).bubbleText,
    handoffText: stage.rpg?.handoffText || getDefaultStageBehavior(stage).handoffText,
    accentColor: stage.rpg?.accentColor || getDefaultStageBehavior(stage).accentColor,
    motionMode: stage.rpg?.motionMode || getDefaultStageBehavior(stage).motionMode,
  };
}

export class WorkflowEngine extends Emitter {
  constructor({ teamTemplate, workflowTemplate } = {}) {
    super();
    this.teamTemplate = teamTemplate || createDefaultTeamTemplate();
    this.workflowTemplate = workflowTemplate || createDefaultWorkflowTemplate();
    this.provider = { provider: 'mock', agents: [], sessions: [] };
    this.currentRun = null;
  }

  getRoleSlot(roleId) {
    return this.teamTemplate.roles.find((role) => role.id === roleId) || null;
  }

  setTeamTemplate(teamTemplateLike) {
    this.teamTemplate = teamTemplateLike instanceof TeamTemplate
      ? teamTemplateLike
      : new TeamTemplate(teamTemplateLike);

    this.syncProviderSnapshot(this.provider);
    this.#reconcileCurrentRun();
    this.emit('state-changed', this.getState());
    return this.teamTemplate;
  }

  setWorkflowTemplate(workflowTemplateLike) {
    this.workflowTemplate = workflowTemplateLike instanceof WorkflowTemplate
      ? workflowTemplateLike
      : new WorkflowTemplate(workflowTemplateLike);

    this.#reconcileCurrentRun();
    this.emit('state-changed', this.getState());
    return this.workflowTemplate;
  }

  syncProviderSnapshot(snapshot) {
    this.provider = snapshot;

    const normalizedRoles = this.teamTemplate.roles.map((role) => {
      const matchedAgent = snapshot.agents.find((agent) => agent.id === role.assignedAgentId)
        || snapshot.agents.find((agent) => agent.role === role.id);

      return {
        ...role,
        assignedAgentId: matchedAgent?.id || role.assignedAgentId || null,
        assignedAgentName: matchedAgent?.name || role.assignedAgentName || null,
      };
    });

    this.teamTemplate = new TeamTemplate({
      id: this.teamTemplate.id,
      name: this.teamTemplate.name,
      roles: normalizedRoles,
    });

    if (this.currentRun) {
      this.#refreshRunAssignment();
    }

    this.emit('state-changed', this.getState());
  }

  createTaskRun(taskTitle) {
    this.currentRun = new TaskRun({
      taskTitle,
      teamTemplateId: this.teamTemplate.id,
      workflowTemplateId: this.workflowTemplate.id,
    });
    this.currentRun.status = 'ready';
    this.emit('state-changed', this.getState());
    return this.currentRun;
  }

  startRun(taskTitle = '简单工作流演示任务') {
    const run = this.currentRun || this.createTaskRun(taskTitle);
    run.status = 'starting';
    run.teamTemplateId = this.teamTemplate.id;
    run.workflowTemplateId = this.workflowTemplate.id;

    const firstStage = this.workflowTemplate.stages[0];
    run.currentStageId = firstStage?.id || null;
    run.currentOwnerRoleId = firstStage?.ownerRoleId || null;
    this.#refreshRunAssignment();

    if (!run.currentOwnerAgentId) {
      run.status = 'blocked';
      run.blockReason = `阶段「${firstStage?.label || '未命名阶段'}」缺少可用 Agent`;
      run.history.push(timestamped({
        type: 'run.blocked',
        stageId: run.currentStageId,
        ownerRoleId: run.currentOwnerRoleId,
      }));
    } else {
      run.status = 'running';
      run.blockReason = null;
      run.history.push(timestamped({
        type: 'run.started',
        stageId: run.currentStageId,
        ownerRoleId: run.currentOwnerRoleId,
        ownerAgentId: run.currentOwnerAgentId,
      }));
    }

    this.emit('state-changed', this.getState());
    return run;
  }

  resetRun() {
    this.currentRun = null;
    this.emit('state-changed', this.getState());
  }

  advanceStage(signal = 'manual') {
    if (!this.currentRun) {
      throw new Error('run-not-started');
    }

    if (!['running', 'blocked'].includes(this.currentRun.status)) {
      throw new Error(`invalid-transition:${this.currentRun.status}`);
    }

    const currentIndex = this.workflowTemplate.stages.findIndex(
      (stage) => stage.id === this.currentRun.currentStageId,
    );
    const nextStage = this.workflowTemplate.stages[currentIndex + 1];

    if (!nextStage) {
      this.currentRun.status = 'completed';
      this.currentRun.blockReason = null;
      this.currentRun.history.push(timestamped({
        type: 'run.completed',
        signal,
        stageId: this.currentRun.currentStageId,
        ownerRoleId: this.currentRun.currentOwnerRoleId,
        ownerAgentId: this.currentRun.currentOwnerAgentId,
      }));
      this.emit('state-changed', this.getState());
      return this.currentRun;
    }

    this.currentRun.status = 'handoff_pending';
    this.currentRun.history.push(timestamped({
      type: 'run.handoff',
      signal,
      fromStageId: this.currentRun.currentStageId,
      toStageId: nextStage.id,
      fromRoleId: this.currentRun.currentOwnerRoleId,
      toRoleId: nextStage.ownerRoleId,
      fromAgentId: this.currentRun.currentOwnerAgentId,
    }));

    this.currentRun.currentStageId = nextStage.id;
    this.currentRun.currentOwnerRoleId = nextStage.ownerRoleId;
    this.#refreshRunAssignment();

    if (!this.currentRun.currentOwnerAgentId) {
      this.currentRun.status = 'blocked';
      this.currentRun.blockReason = `阶段「${nextStage.label}」缺少可用 Agent`;
      this.currentRun.history.push(timestamped({
        type: 'run.blocked',
        stageId: nextStage.id,
        ownerRoleId: nextStage.ownerRoleId,
      }));
    } else {
      this.currentRun.status = 'running';
      this.currentRun.blockReason = null;
      this.currentRun.history.push(timestamped({
        type: 'run.stage.changed',
        stageId: nextStage.id,
        ownerRoleId: nextStage.ownerRoleId,
        ownerAgentId: this.currentRun.currentOwnerAgentId,
      }));
    }

    this.emit('state-changed', this.getState());
    return this.currentRun;
  }

  getState() {
    const currentStage = this.workflowTemplate.stages.find(
      (stage) => stage.id === this.currentRun?.currentStageId,
    ) || null;
    const currentStageBehavior = resolveStageBehavior(currentStage, this.teamTemplate);

    return {
      provider: this.provider.provider,
      teamTemplate: this.teamTemplate,
      workflowTemplate: this.workflowTemplate,
      currentRun: this.currentRun,
      currentStage,
      currentStageBehavior,
      runHistory: (this.currentRun?.history || []).map((entry) => ({
        ...entry,
        summary: summarizeHistoryItem(entry, this.workflowTemplate),
      })),
      progress: this.#buildProgress(currentStage),
    };
  }

  #buildProgress(currentStage) {
    const total = this.workflowTemplate.stages.length;
    const currentIndex = currentStage
      ? this.workflowTemplate.stages.findIndex((stage) => stage.id === currentStage.id)
      : -1;

    return {
      totalStages: total,
      currentIndex,
      completedStages: currentIndex < 0 ? 0 : currentIndex,
      ratio: total > 0 && currentIndex >= 0
        ? (currentIndex + (this.currentRun?.status === 'completed' ? 1 : 0)) / total
        : 0,
    };
  }

  #reconcileCurrentRun() {
    if (!this.currentRun) {
      return;
    }

    const currentStage = this.workflowTemplate.stages.find(
      (stage) => stage.id === this.currentRun.currentStageId,
    ) || this.workflowTemplate.stages[0] || null;

    this.currentRun.workflowTemplateId = this.workflowTemplate.id;
    this.currentRun.teamTemplateId = this.teamTemplate.id;
    this.currentRun.currentStageId = currentStage?.id || null;
    this.currentRun.currentOwnerRoleId = currentStage?.ownerRoleId || null;
    this.#refreshRunAssignment();

    if (['running', 'blocked', 'handoff_pending', 'starting', 'ready'].includes(this.currentRun.status)) {
      if (!this.currentRun.currentOwnerAgentId) {
        this.currentRun.status = 'blocked';
        this.currentRun.blockReason = currentStage
          ? `阶段「${currentStage.label}」缺少可用 Agent`
          : '流程未配置阶段';
      } else if (currentStage) {
        this.currentRun.status = this.currentRun.status === 'completed' ? 'completed' : 'running';
        this.currentRun.blockReason = null;
      }
    }
  }

  #refreshRunAssignment() {
    if (!this.currentRun?.currentOwnerRoleId) {
      this.currentRun.currentOwnerAgentId = null;
      return;
    }

    const slot = this.getRoleSlot(this.currentRun.currentOwnerRoleId);
    this.currentRun.currentOwnerAgentId = slot?.assignedAgentId || null;
  }
}

export function createWorkflowRuntime(snapshot) {
  const engine = new WorkflowEngine({
    teamTemplate: createDefaultTeamTemplate(snapshot?.agents || []),
    workflowTemplate: createDefaultWorkflowTemplate(),
  });

  if (snapshot) {
    engine.syncProviderSnapshot(snapshot);
  }

  return engine;
}

export function decorateAgentsForRun(agents, state) {
  const currentRun = state?.currentRun;
  const currentStage = state?.currentStage;
  const currentBehavior = state?.currentStageBehavior;

  if (!currentRun || !currentStage) {
    return agents.map((agent) => ({ ...agent }));
  }

  return agents.map((agent) => {
    const isOwner = agent.id === currentRun.currentOwnerAgentId;
    const roleSlot = state.teamTemplate.roles.find((role) => role.assignedAgentId === agent.id);
    const stageLabel = currentStage.label;
    const roleLabel = roleSlot?.label || roleSlot?.id || agent.role;

    if (currentRun.status === 'completed') {
      return {
        ...agent,
        status: 'idle',
        task: `✅ 已完成 · ${currentRun.taskTitle}`,
      };
    }

    if (currentRun.status === 'blocked') {
      return {
        ...agent,
        status: isOwner ? 'idle' : agent.status,
        task: isOwner
          ? `⛔ 阻塞 · ${stageLabel}`
          : agent.task,
      };
    }

    if (isOwner) {
      return {
        ...agent,
        status: 'working',
        task: `🧩 ${stageLabel} · ${roleLabel} · ${currentBehavior?.cueLabel || '执行中'}`,
      };
    }

    return {
      ...agent,
      status: 'idle',
      task: roleSlot
        ? `待命 · ${roleLabel}`
        : agent.task,
    };
  });
}

export function summarizeRunState(state) {
  const run = state?.currentRun;
  const stage = state?.currentStage;
  const behavior = state?.currentStageBehavior;

  if (!run || !stage) {
    return '未启动';
  }

  if (run.status === 'completed') {
    return `已完成 · ${run.taskTitle}`;
  }

  if (run.status === 'blocked') {
    return `阻塞 · ${stage.label}`;
  }

  return `${stage.label} · ${run.currentOwnerRoleId || '未分配'} · ${behavior?.cueLabel || '执行中'}`;
}

export function describeBuilderSummary(state) {
  const teamName = state?.teamTemplate?.name || '未命名团队';
  const workflowName = state?.workflowTemplate?.name || '未命名流程';
  const roleCount = state?.teamTemplate?.roles?.length || 0;
  const stageCount = state?.workflowTemplate?.stages?.length || 0;

  return `${teamName} · ${roleCount} 角色 / ${workflowName} · ${stageCount} 阶段`;
}
