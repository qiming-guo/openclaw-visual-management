const DEFAULT_PROVIDER_CAPABILITIES = Object.freeze({
  supportsLiveRuns: false,
  supportsStageAdvance: false,
  supportsMessaging: false,
  supportsAgentManagement: false,
  supportsWorkflowSync: false,
});

const DEFAULT_LIVE_CONFIG = {
  url: 'ws://127.0.0.1:18789',
  token: 'fcbd02f22ef8e29b1b8713a5ff4af25915e0df8ca959cfb5',
};

function createAdapterError(message, code = 'NOT_SUPPORTED', extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function cloneCapabilities(capabilities = {}) {
  return {
    ...DEFAULT_PROVIDER_CAPABILITIES,
    ...capabilities,
  };
}

function buildProviderEvent(provider, type, extra = {}) {
  return {
    provider,
    type,
    ts: Date.now(),
    payload: {},
    ...extra,
    payload: extra.payload || {},
  };
}

function isSocketOpen(socket) {
  if (!socket) return false;
  const openValue = socket.OPEN ?? globalThis.WebSocket?.OPEN ?? 1;
  return socket.readyState === openValue;
}

function appendRunTimeline(run, entry) {
  run.timeline = run.timeline || [];
  run.timeline.push({
    at: new Date().toISOString(),
    ...entry,
  });
  if (run.timeline.length > 30) {
    run.timeline = run.timeline.slice(-30);
  }
}

function summarizeWorkflowStages(workflowTemplate) {
  return (workflowTemplate?.stages || []).map((stage) => ({
    id: stage.id,
    label: stage.label,
    ownerRoleId: stage.ownerRoleId,
    completionSignal: stage.completionSignal,
  }));
}

function normalizeStagePayload(stage) {
  if (!stage) return null;
  return {
    id: stage.id,
    label: stage.label,
    ownerRoleId: stage.ownerRoleId,
    completionSignal: stage.completionSignal,
    rpg: stage.rpg ? {
      cueLabel: stage.rpg.cueLabel,
      bubbleText: stage.rpg.bubbleText,
      handoffText: stage.rpg.handoffText,
    } : undefined,
  };
}

function resolveSessionKeyForRole({ sessions = [], teamTemplate, roleId, fallbackAgentId = null }) {
  const role = (teamTemplate?.roles || []).find((item) => item.id === roleId);
  const agentId = role?.assignedAgentId || fallbackAgentId;

  if (agentId) {
    const exact = sessions.find((session) => session.key === `agent:${agentId}:main`);
    if (exact) return exact.key;

    const partial = sessions.find((session) => session.key?.startsWith(`agent:${agentId}:`));
    if (partial) return partial.key;

    return `agent:${agentId}:main`;
  }

  const fallbackSession = sessions.find((session) => session.status === 'running')
    || sessions.find((session) => session.key?.startsWith('agent:'))
    || sessions[0];

  return fallbackSession?.key || null;
}

function buildWorkflowRunRequest(workflowState, sessions = []) {
  const currentRun = workflowState?.currentRun || null;
  const currentStage = normalizeStagePayload(workflowState?.currentStage);
  const workflowTemplate = workflowState?.workflowTemplate || null;
  const teamTemplate = workflowState?.teamTemplate || null;
  const ownerRoleId = currentStage?.ownerRoleId || currentRun?.currentOwnerRoleId || null;
  const sessionKey = resolveSessionKeyForRole({
    sessions,
    teamTemplate,
    roleId: ownerRoleId,
    fallbackAgentId: currentRun?.currentOwnerAgentId || null,
  });

  return {
    runId: currentRun?.id || null,
    taskTitle: currentRun?.taskTitle || 'Workflow Run',
    currentStage,
    currentRun: currentRun ? {
      id: currentRun.id,
      status: currentRun.status,
      currentStageId: currentRun.currentStageId,
      currentOwnerRoleId: currentRun.currentOwnerRoleId,
      currentOwnerAgentId: currentRun.currentOwnerAgentId,
      blockReason: currentRun.blockReason || null,
    } : null,
    teamTemplate: teamTemplate ? {
      id: teamTemplate.id,
      name: teamTemplate.name,
      roles: (teamTemplate.roles || []).map((role) => ({
        id: role.id,
        label: role.label,
        assignedAgentId: role.assignedAgentId || null,
        assignedAgentName: role.assignedAgentName || null,
      })),
    } : null,
    workflowTemplate: workflowTemplate ? {
      id: workflowTemplate.id,
      name: workflowTemplate.name,
      stages: summarizeWorkflowStages(workflowTemplate),
    } : null,
    sessionKey,
  };
}

function buildStageMessage({ action, taskTitle, workflowTemplate, currentStage, signal = 'manual' }) {
  const stageLabel = currentStage?.label || currentStage?.id || '未命名阶段';
  const workflowLabel = workflowTemplate?.name || '默认流程';
  const bubbleText = currentStage?.rpg?.bubbleText || '请基于当前阶段推进。';
  const handoffText = currentStage?.rpg?.handoffText || '完成后请给出下一阶段交接建议。';

  if (action === 'start') {
    return [
      `【Workflow Run】${taskTitle || '未命名任务'}`,
      `流程：${workflowLabel}`,
      `当前阶段：${stageLabel}`,
      currentStage?.completionSignal ? `完成信号：${currentStage.completionSignal}` : null,
      `阶段目标：${bubbleText}`,
      '请从当前阶段开始执行，并在完成后说明交接依据。',
    ].filter(Boolean).join('\n');
  }

  return [
    `【Stage Advance】${taskTitle || '未命名任务'}`,
    `切换到阶段：${stageLabel}`,
    `触发信号：${signal}`,
    currentStage?.completionSignal ? `本阶段完成信号：${currentStage.completionSignal}` : null,
    `执行说明：${bubbleText}`,
    `交接提示：${handoffText}`,
  ].filter(Boolean).join('\n');
}


export class DataAdapter {
  constructor({ provider = 'unknown', capabilities } = {}) {
    this._listeners = {};
    this._provider = provider;
    this._status = 'idle';
    this._providerSubscribers = new Set();
    this._capabilities = cloneCapabilities(capabilities);
  }

  connect() {
    this.start();
  }

  disconnect() {
    this.stop();
  }

  start() {}

  stop() {}

  getProviderId() {
    return this._provider;
  }

  getStatus() {
    return this._status;
  }

  getCapabilities() {
    return cloneCapabilities(this._capabilities);
  }

  getAgents() { return []; }

  getSessions() { return []; }

  async listAgents() {
    return this.getAgents();
  }

  async listSessions() {
    return this.getSessions();
  }

  async startTaskRun() {
    throw createAdapterError('current adapter does not support startTaskRun');
  }

  async advanceStage() {
    throw createAdapterError('current adapter does not support advanceStage');
  }

  async sendMessage() {
    throw createAdapterError('current adapter does not support sendMessage');
  }

  async bootstrapAgentMainSession() {
    throw createAdapterError('current adapter does not support bootstrapAgentMainSession');
  }

  subscribeEvents(handler) {
    this._providerSubscribers.add(handler);
    return () => {
      this._providerSubscribers.delete(handler);
    };
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => {
      this._listeners[event] = (this._listeners[event] || []).filter((item) => item !== fn);
    };
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }

  _emitProviderEvent(type, extra = {}) {
    const event = buildProviderEvent(this.getProviderId(), type, extra);
    this._providerSubscribers.forEach((handler) => handler(event));
    this._emit('provider-event', event);
    return event;
  }

  _setStatus(type, payload = {}) {
    this._status = type;
    this._emit('status', { type, ...payload });
    this._emitProviderEvent('connection.status.changed', {
      status: type,
      payload,
    });
  }
}

export class MockAdapter extends DataAdapter {
  constructor() {
    super({
      provider: 'mock',
      capabilities: {
        supportsStageAdvance: true,
        supportsMessaging: true,
      },
    });
    this._agents = [
      { id: 'leader-01', name: 'Arch Lead', role: 'leader', status: 'working', task: '设计系统架构', model: 'claude-opus-4-6', uptime: '2h 34m', tokens: '128k' },
      { id: 'fe-01', name: 'FE Agent', role: 'frontend', status: 'idle', task: '等待任务', model: 'claude-sonnet-4-6', uptime: '1h 12m', tokens: '45k' },
      { id: 'be-01', name: 'BE Agent', role: 'backend', status: 'working', task: '实现 API 接口', model: 'claude-sonnet-4-6', uptime: '3h 05m', tokens: '210k' },
      { id: 'design-01', name: 'Design Agent', role: 'designer', status: 'working', task: '生成 UI 组件', model: 'claude-haiku-4-5', uptime: '45m', tokens: '22k' },
      { id: 'qa-01', name: 'QA Agent', role: 'qa', status: 'idle', task: '等待测试任务', model: 'claude-haiku-4-5', uptime: '58m', tokens: '31k' },
    ];
    this._sessions = this._agents.map((agent) => ({
      key: `agent:${agent.id}:main`,
      label: `${agent.name} 对话`,
      channelIcon: '🧪',
      status: 'idle',
      updatedAt: null,
      model: agent.model,
    }));
    this._timer = null;
    this._runCounter = 0;
    this._runs = new Map();
  }

  getAgents() { return [...this._agents]; }

  getSessions() { return [...this._sessions]; }

  start() {
    this._setStatus('mock');
    this._emit('agents-updated', this.getAgents());
    this._emit('sessions-updated', this.getSessions());
    this._emitProviderEvent('agents.updated', {
      payload: { count: this._agents.length },
    });
    this._emitProviderEvent('sessions.updated', {
      payload: { count: this._sessions.length },
    });

    this._timer = setInterval(() => {
      const idx = Math.floor(Math.random() * this._agents.length);
      this._agents[idx] = {
        ...this._agents[idx],
        status: this._agents[idx].status === 'working' ? 'idle' : 'working',
      };
      this._emit('agents-updated', this.getAgents());
      this._emitProviderEvent('agents.updated', {
        payload: { count: this._agents.length },
      });
    }, 8000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._setStatus('idle');
  }

  async sendMessage(sessionKey, text) {
    const receipt = {
      ok: true,
      sessionKey,
      text,
      provider: this.getProviderId(),
    };

    this._emitProviderEvent('run.message', {
      sessionKey,
      payload: {
        direction: 'outbound',
        sessionKey,
        text,
      },
    });

    return receipt;
  }

  async startTaskRun(payload = {}) {
    const runId = payload.runId || `mock-run-${++this._runCounter}`;
    const run = {
      runId,
      provider: this.getProviderId(),
      status: 'running',
      taskTitle: payload.taskTitle || 'Mock Workflow Run',
      currentStageId: payload.currentStage?.id || null,
      ownerRoleId: payload.currentStage?.ownerRoleId || null,
      sessionKey: payload.sessionKey || resolveSessionKeyForRole({
        sessions: this._sessions,
        teamTemplate: payload.teamTemplate,
        roleId: payload.currentStage?.ownerRoleId,
      }),
      timeline: [],
    };

    appendRunTimeline(run, {
      type: 'run.created',
      stageId: run.currentStageId,
      sessionKey: run.sessionKey,
    });
    this._runs.set(runId, run);

    this._emitProviderEvent('run.created', {
      runId,
      stageId: run.currentStageId,
      payload: {
        taskTitle: run.taskTitle,
        sessionKey: run.sessionKey,
      },
    });

    if (run.sessionKey) {
      await this.sendMessage(run.sessionKey, buildStageMessage({
        action: 'start',
        taskTitle: run.taskTitle,
        workflowTemplate: payload.workflowTemplate,
        currentStage: payload.currentStage,
      }));
    }

    this._emitProviderEvent('run.started', {
      runId,
      stageId: run.currentStageId,
      payload: {
        sessionKey: run.sessionKey,
      },
    });

    appendRunTimeline(run, {
      type: 'run.started',
      stageId: run.currentStageId,
      sessionKey: run.sessionKey,
    });

    return { ...run, timeline: [...run.timeline] };
  }

  async advanceStage(runId, stageId, signal = 'manual', payload = {}) {
    const run = this._runs.get(runId);
    if (!run) {
      throw createAdapterError(`unknown run: ${runId}`, 'STAGE_ADVANCE_FAILED', { runId, stageId });
    }

    run.currentStageId = stageId;
    run.ownerRoleId = payload.currentStage?.ownerRoleId || run.ownerRoleId;
    run.sessionKey = payload.sessionKey || resolveSessionKeyForRole({
      sessions: this._sessions,
      teamTemplate: payload.teamTemplate,
      roleId: run.ownerRoleId,
    });

    if (payload.currentRun?.status === 'completed' || payload.isTerminal) {
      run.status = 'completed';
      appendRunTimeline(run, {
        type: 'run.completed',
        stageId,
        sessionKey: run.sessionKey,
        signal,
      });
      this._emitProviderEvent('run.completed', {
        runId,
        stageId,
        payload: {
          signal,
          sessionKey: run.sessionKey,
        },
      });
      return { ...run, timeline: [...run.timeline] };
    }

    run.status = 'running';
    appendRunTimeline(run, {
      type: 'run.stage.changed',
      stageId,
      sessionKey: run.sessionKey,
      signal,
    });

    this._emitProviderEvent('run.stage.changed', {
      runId,
      stageId,
      payload: {
        signal,
        sessionKey: run.sessionKey,
      },
    });

    if (run.sessionKey) {
      await this.sendMessage(run.sessionKey, buildStageMessage({
        action: 'advance',
        taskTitle: run.taskTitle,
        workflowTemplate: payload.workflowTemplate,
        currentStage: payload.currentStage,
        signal,
      }));
    }

    return { ...run, timeline: [...run.timeline] };
  }
}

export class OpenClawAdapter extends DataAdapter {
  constructor(options = {}) {
    super({
      provider: 'openclaw',
      capabilities: {
        supportsLiveRuns: true,
        supportsStageAdvance: true,
        supportsMessaging: true,
        supportsAgentManagement: true,
      },
    });
    this._url = options.url || DEFAULT_LIVE_CONFIG.url;
    this._token = options.token || DEFAULT_LIVE_CONFIG.token;
    this._createSocket = options.createSocket || ((url) => new WebSocket(url));
    this._ws = null;
    this._reqId = 0;
    this._pending = new Map();
    this._agents = [];
    this._sessions = [];
    this._pollTimer = null;
    this._reconnectTimer = null;
    this._connected = false;
    this._runCounter = 0;
    this._runs = new Map();
    this._subscribedMessageKeys = new Set();
    this._closing = false;
  }

  getSessions() { return [...this._sessions]; }

  getAgents() { return [...this._agents]; }

  start() {
    this._closing = false;
    this._connect();
  }

  stop() {
    this._closing = true;
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._ws) { this._ws.close(); this._ws = null; }
    this._connected = false;
    this._subscribedMessageKeys.clear();
    this._setStatus('idle');
  }

  async listAgents() {
    if (this._connected) {
      await this._fetchAll();
    }
    return this.getAgents();
  }

  async listSessions() {
    if (this._connected) {
      await this._fetchAll();
    }
    return this.getSessions();
  }

  _connect() {
    this._setStatus('connecting');

    try {
      this._ws = this._createSocket(this._url);
    } catch (error) {
      this._onError(error);
      return;
    }

    this._ws.onopen = () => {};
    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._onMessage(msg);
      } catch {}
    };
    this._ws.onerror = (error) => this._onError(error);
    this._ws.onclose = () => {
      this._connected = false;
      this._setStatus('error');
      if (!this._closing) {
        this._reconnectTimer = setTimeout(() => this._connect(), 5000);
      }
    };
  }

  _onMessage(msg) {
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      this._send({
        type: 'req',
        id: 'rpg-connect-1',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'openclaw-tui',
            version: '1.0.0',
            platform: 'darwin',
            mode: 'cli',
          },
          caps: ['tool-events'],
          auth: { token: this._token },
          role: 'operator',
          scopes: ['operator.admin'],
        },
      });
      return;
    }

    if (msg.type === 'res' && msg.id !== undefined) {
      if (msg.id === 'rpg-connect-1') {
        if (msg.ok) {
          this._connected = true;
          this._setStatus('live');
          this._startPolling();
        } else {
          this._setStatus('error');
          console.warn('[OpenClawAdapter] connect 失败:', msg.error?.message);
        }
        return;
      }

      const pending = this._pending.get(msg.id);
      if (pending) {
        this._pending.delete(msg.id);
        if (msg.ok) pending.resolve(msg.payload);
        else pending.reject(createAdapterError(msg.error?.message || 'RPC error', 'EVENT_STREAM_ERROR', { requestId: msg.id }));
      }
      return;
    }

    if (msg.type === 'event') {
      this._onServerEvent(msg);
    }
  }

  _onServerEvent(msg) {
    if (msg.event === 'chat') {
      const { state, message, sessionKey } = msg.payload || {};
      if (state === 'final' && message?.role === 'assistant') {
        const text = message.content?.[0]?.text || message.content || '';
        if (text && !text.startsWith('HEARTBEAT')) {
          this._emit('reply', { sessionKey, text });
          const agentId = sessionKey?.split(':')?.[1] || 'main';
          this._emit('message', { fromId: agentId, text: text.slice(0, 50) });
          this._recordInboundRunMessage(sessionKey, text);
        }
      }
    }

    if (msg.event === 'agent') {
      const { phase, delta } = msg.payload?.data || {};
      const sessionKey = msg.payload.sessionKey;
      if (phase === 'start') this._emit('agent-running', { sessionKey });
      if (phase === 'end') this._emit('agent-idle', { sessionKey });
      if (delta) this._emit('agent-replying', { sessionKey });
    }
  }

  _recordInboundRunMessage(sessionKey, text) {
    for (const run of this._runs.values()) {
      if (run.sessionKey !== sessionKey) continue;
      appendRunTimeline(run, {
        type: 'run.message',
        direction: 'inbound',
        sessionKey,
        text,
      });
      this._emitProviderEvent('run.message', {
        runId: run.runId,
        stageId: run.currentStageId,
        sessionKey,
        payload: {
          direction: 'inbound',
          sessionKey,
          text,
        },
      });
    }
  }

  _onError(error) {
    this._connected = false;
    this._setStatus('error', { error: error?.message || String(error) });
    console.warn('[OpenClawAdapter] 连接失败:', error);
  }

  _request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!isSocketOpen(this._ws)) {
        reject(createAdapterError('not connected', 'CONNECTION_FAILED'));
        return;
      }
      const id = `rpg-req-${++this._reqId}`;
      const timeout = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(createAdapterError('timeout', 'EVENT_STREAM_ERROR', { requestId: id }));
        }
      }, 5000);

      this._pending.set(id, {
        resolve: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this._send({ type: 'req', id, method, params });
    });
  }

  _send(obj) {
    if (isSocketOpen(this._ws)) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  _startPolling() {
    this._fetchAll();
    this._pollTimer = setInterval(() => this._fetchAll(), 5000);
    this._subscribeMessages('agent:main:main');
    this._subscribeMessages('agent:husky:main');
  }

  _subscribeMessages(sessionKey) {
    if (!sessionKey || this._subscribedMessageKeys.has(sessionKey)) return;
    this._subscribedMessageKeys.add(sessionKey);
    const id = `rpg-sub-${sessionKey.replace(/[^a-z0-9]/gi, '_')}`;
    this._send({ type: 'req', id, method: 'sessions.messages.subscribe', params: { key: sessionKey } });
  }

  async _fetchAll() {
    let agentsFetched = false;
    let sessionsFetched = false;

    try {
      const agentsResult = await this._request('agents.list', {});
      const agents = agentsResult?.agents || [];
      this._agents = agents.map((agent) => this._mapAgent(agent));
      agentsFetched = true;
    } catch (error) {
      this._emitProviderEvent('run.failed', {
        payload: {
          scope: 'agents.list',
          code: error.code || 'EVENT_STREAM_ERROR',
          message: error.message,
        },
      });
      console.warn('[OpenClawAdapter] 拉取 agents 失败:', error.message);
    }

    try {
      const sessResult = await this._request('sessions.list', {});
      this._sessions = (sessResult?.sessions || []).map((session) => this._mapSessionEntry(session, this._agents));
      sessionsFetched = true;
    } catch (error) {
      this._emitProviderEvent('run.failed', {
        payload: {
          scope: 'sessions.list',
          code: error.code || 'EVENT_STREAM_ERROR',
          message: error.message,
        },
      });
      console.warn('[OpenClawAdapter] 拉取 sessions 失败:', error.message);
    }

    const running = this._sessions.some((session) => session.status === 'running');
    if (this._agents[0]) this._agents[0].status = running ? 'working' : 'idle';

    if (agentsFetched) {
      this._emit('agents-updated', this.getAgents());
      this._emitProviderEvent('agents.updated', {
        payload: { count: this._agents.length },
      });
    }

    if (sessionsFetched) {
      this._emit('sessions-updated', this.getSessions());
      this._emitProviderEvent('sessions.updated', {
        payload: { count: this._sessions.length },
      });
    }
  }

  _mapAgent(agent) {
    const isMain = agent.id === 'main';
    const rawName = agent.identity?.name || agent.name || agent.id;
    const rawEmoji = agent.identity?.emoji || '';
    const lowerIdName = [agent.id, rawName].join(' ').toLowerCase();
    const workspaceLeaf = String(agent.workspace || '').split('/').filter(Boolean).at(-1) || '';
    const lowerWorkspaceLeaf = workspaceLeaf.toLowerCase();

    let role = 'backend';
    if (agent.id === 'main' || lowerIdName.includes('leader') || lowerIdName.includes('arch')) role = 'leader';
    else if (agent.id === 'husky' || lowerIdName.includes('frontend') || lowerIdName.includes('fe-agent')) role = 'frontend';
    else if (lowerIdName.includes('design') || lowerIdName.includes('designer')) role = 'designer';
    else if (lowerIdName.includes('qa') || lowerIdName.includes('test')) role = 'qa';
    else if (lowerIdName.includes('backend') || lowerIdName.includes('be-agent')) role = 'backend';
    else if (['frontend', 'designer', 'qa', 'backend'].includes(lowerWorkspaceLeaf)) role = lowerWorkspaceLeaf;

    return {
      id: agent.id,
      name: rawName,
      emoji: rawEmoji,
      role,
      status: 'idle',
      task: '待机中',
      model: agent.model?.primary?.split('/').pop() || '—',
      uptime: '—',
      tokens: '—',
      isMain,
      _raw: agent,
    };
  }

  _humanizeAgentLabel(agentId) {
    return String(agentId || '未知 Agent')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  _mapSessionEntry(session, agents = this._agents) {
    const key = session.key || '';
    const parts = key.split(':');
    const isAgentSession = parts[0] === 'agent' && parts.length >= 3;
    const agentId = isAgentSession ? parts[1] : null;
    const rawSessionName = isAgentSession ? parts.slice(2).join(':') : (parts.at(-1) || key);
    const isAgentMainSession = Boolean(isAgentSession && rawSessionName === 'main');
    const mappedAgent = agentId ? agents.find((agent) => agent.id === agentId) : null;

    let label = session.displayName || rawSessionName || key;
    if (label.includes('@im.wechat')) label = '微信用户 💬';
    else if (label === 'heartbeat') label = '心跳 💓';
    else if (!isAgentMainSession && label.length > 20) label = `${label.slice(0, 18)}…`;

    const channel = session.lastChannel || session.origin?.provider || '';
    const channelIcon = channel.includes('weixin') ? '💬' : channel === 'heartbeat' ? '💓' : '🖥️';
    const agentLabel = mappedAgent?.name || (agentId ? this._humanizeAgentLabel(agentId) : label);
    const agentAvatar = mappedAgent?.emoji || null;
    const sessionLabel = isAgentMainSession ? '主会话' : label;

    return {
      key,
      label,
      channelIcon,
      status: session.status || 'done',
      updatedAt: session.updatedAt,
      model: session.model || '—',
      agentId,
      agentLabel,
      agentAvatar,
      agentRole: mappedAgent?.role || null,
      sessionLabel,
      isAgentSession,
      isAgentMainSession,
      isHistoricalSession: Boolean(isAgentSession && !isAgentMainSession),
      sortPriority: isAgentMainSession ? 0 : isAgentSession ? 1 : 2,
    };
  }

  async sendMessage(sessionKey, text, options = {}) {
    if (!sessionKey) {
      throw createAdapterError('sessionKey is required', 'INVALID_ASSIGNMENT');
    }

    const key = `rpg-send-${Date.now()}`;
    const result = await this._request('sessions.send', {
      key: sessionKey,
      message: text,
      idempotencyKey: key,
    });

    this._subscribeMessages(sessionKey);
    this._emitProviderEvent(options.eventType || 'run.message', {
      runId: options.runId,
      stageId: options.stageId,
      sessionKey,
      payload: {
        direction: 'outbound',
        sessionKey,
        text,
        ack: result || null,
      },
    });

    return result;
  }

  async bootstrapAgentMainSession(agentId, options = {}) {
    if (!this._connected) {
      throw createAdapterError('provider not connected', 'CONNECTION_FAILED');
    }
    if (!agentId) {
      throw createAdapterError('agentId is required', 'INVALID_ASSIGNMENT');
    }

    const sessionKey = `agent:${agentId}:main`;
    const createResult = await this._request('sessions.create', { key: sessionKey });
    this._subscribeMessages(sessionKey);

    const bootstrapMessage = typeof options.message === 'string'
      ? options.message
      : null;

    let messageResult = null;
    if (bootstrapMessage) {
      messageResult = await this.sendMessage(sessionKey, bootstrapMessage, {
        eventType: 'agent.bootstrap',
      });
    }

    await this.listSessions();

    return {
      ok: true,
      agentId,
      sessionKey,
      created: createResult,
      message: bootstrapMessage,
      messageResult,
    };
  }

  async startTaskRun(payload = {}) {
    if (!this._connected) {
      throw createAdapterError('provider not connected', 'CONNECTION_FAILED');
    }

    const runId = payload.runId || `openclaw-run-${++this._runCounter}`;
    const sessionKey = payload.sessionKey || resolveSessionKeyForRole({
      sessions: this._sessions,
      teamTemplate: payload.teamTemplate,
      roleId: payload.currentStage?.ownerRoleId,
      fallbackAgentId: payload.currentRun?.currentOwnerAgentId || null,
    });

    if (!sessionKey) {
      const error = createAdapterError('no session available for current stage owner', 'INVALID_ASSIGNMENT', { runId });
      this._emitProviderEvent('run.failed', {
        runId,
        stageId: payload.currentStage?.id,
        payload: {
          code: error.code,
          message: error.message,
        },
      });
      throw error;
    }

    const run = {
      runId,
      provider: this.getProviderId(),
      status: 'starting',
      taskTitle: payload.taskTitle || 'OpenClaw Workflow Run',
      currentStageId: payload.currentStage?.id || null,
      ownerRoleId: payload.currentStage?.ownerRoleId || null,
      sessionKey,
      timeline: [],
    };
    this._runs.set(runId, run);
    appendRunTimeline(run, {
      type: 'run.created',
      stageId: run.currentStageId,
      sessionKey,
    });

    this._emitProviderEvent('run.created', {
      runId,
      stageId: run.currentStageId,
      payload: {
        taskTitle: run.taskTitle,
        sessionKey,
      },
    });

    try {
      await this.sendMessage(sessionKey, buildStageMessage({
        action: 'start',
        taskTitle: run.taskTitle,
        workflowTemplate: payload.workflowTemplate,
        currentStage: payload.currentStage,
      }), {
        runId,
        stageId: run.currentStageId,
      });
      run.status = 'running';
      appendRunTimeline(run, {
        type: 'run.started',
        stageId: run.currentStageId,
        sessionKey,
      });
      this._emitProviderEvent('run.started', {
        runId,
        stageId: run.currentStageId,
        payload: {
          sessionKey,
        },
      });
      return { ...run, timeline: [...run.timeline] };
    } catch (error) {
      run.status = 'failed';
      appendRunTimeline(run, {
        type: 'run.failed',
        stageId: run.currentStageId,
        sessionKey,
        code: error.code || 'RUN_START_FAILED',
      });
      this._emitProviderEvent('run.failed', {
        runId,
        stageId: run.currentStageId,
        payload: {
          code: error.code || 'RUN_START_FAILED',
          message: error.message,
        },
      });
      throw error;
    }
  }

  async advanceStage(runId, stageId, signal = 'manual', payload = {}) {
    const run = this._runs.get(runId);
    if (!run) {
      throw createAdapterError(`unknown run: ${runId}`, 'STAGE_ADVANCE_FAILED', { runId, stageId });
    }

    run.currentStageId = stageId;
    run.ownerRoleId = payload.currentStage?.ownerRoleId || run.ownerRoleId;
    run.sessionKey = payload.sessionKey || resolveSessionKeyForRole({
      sessions: this._sessions,
      teamTemplate: payload.teamTemplate,
      roleId: run.ownerRoleId,
      fallbackAgentId: payload.currentRun?.currentOwnerAgentId || null,
    });

    if (!run.sessionKey) {
      const error = createAdapterError('no session available for current stage owner', 'INVALID_ASSIGNMENT', { runId, stageId });
      run.status = 'failed';
      this._emitProviderEvent('run.failed', {
        runId,
        stageId,
        payload: {
          code: error.code,
          message: error.message,
        },
      });
      throw error;
    }

    if (payload.currentRun?.status === 'completed' || payload.isTerminal) {
      run.status = 'completed';
      appendRunTimeline(run, {
        type: 'run.completed',
        stageId,
        sessionKey: run.sessionKey,
        signal,
      });
      this._emitProviderEvent('run.completed', {
        runId,
        stageId,
        payload: {
          signal,
          sessionKey: run.sessionKey,
        },
      });
      return { ...run, timeline: [...run.timeline] };
    }

    run.status = 'running';
    appendRunTimeline(run, {
      type: 'run.stage.changed',
      stageId,
      sessionKey: run.sessionKey,
      signal,
    });
    this._emitProviderEvent('run.stage.changed', {
      runId,
      stageId,
      payload: {
        signal,
        sessionKey: run.sessionKey,
      },
    });

    await this.sendMessage(run.sessionKey, buildStageMessage({
      action: 'advance',
      taskTitle: run.taskTitle,
      workflowTemplate: payload.workflowTemplate,
      currentStage: payload.currentStage,
      signal,
    }), {
      runId,
      stageId,
    });

    return { ...run, timeline: [...run.timeline] };
  }
}

export function createDataManager({ syncWorkflowProviderSnapshot, decorateAgents, liveConfig } = {}) {
  return {
    _adapter: null,
    _mode: 'live',
    _rawAgents: [],
    _rawSessions: [],
    _providerEvents: [],
    _providerRuns: new Map(),
    _activeWorkflowProviderRunId: null,
    _providerUnsubscribe: null,

    init(scene) {
      this._scene = scene;
      this._startLive();
    },

    _resetProviderRuntime() {
      this._providerEvents = [];
      this._providerRuns = new Map();
      this._activeWorkflowProviderRunId = null;
      this._providerUnsubscribe?.();
      this._providerUnsubscribe = null;
    },

    _recordProviderEvent(event) {
      this._providerEvents.push(event);
      if (this._providerEvents.length > 40) {
        this._providerEvents = this._providerEvents.slice(-40);
      }

      if (event.runId) {
        const previous = this._providerRuns.get(event.runId) || { runId: event.runId, provider: event.provider };
        const next = {
          ...previous,
          lastEventType: event.type,
          lastEventAt: event.ts,
          currentStageId: event.stageId ?? previous.currentStageId ?? null,
          sessionKey: event.sessionKey || event.payload?.sessionKey || previous.sessionKey || null,
        };

        if (event.type === 'run.created') next.status = 'starting';
        if (event.type === 'run.started' || event.type === 'run.stage.changed') next.status = 'running';
        if (event.type === 'run.completed') next.status = 'completed';
        if (event.type === 'run.failed') next.status = 'failed';
        if (event.payload?.taskTitle) next.taskTitle = event.payload.taskTitle;
        if (event.type === 'run.message') {
          next.lastMessage = event.payload?.text || previous.lastMessage || '';
          next.lastDirection = event.payload?.direction || previous.lastDirection || 'outbound';
        }

        this._providerRuns.set(event.runId, next);
        if (!this._activeWorkflowProviderRunId) {
          this._activeWorkflowProviderRunId = event.runId;
        }
      }
    },

    _startMock() {
      if (this._adapter) this._adapter.stop();
      this._resetProviderRuntime();
      this._adapter = new MockAdapter();
      this._mode = 'mock';
      this._rawAgents = this._adapter.getAgents();
      this._rawSessions = this._adapter.getSessions();
      this._bindEvents();
      this._scene?.syncAgents?.(this.getAgents());
      this._scene?.syncSessions?.(this._rawSessions);
      this._adapter.start();
      this._updateConnUI('mock', '本地模式');
      syncWorkflowProviderSnapshot?.();
    },

    _startLive() {
      if (this._adapter) this._adapter.stop();
      this._resetProviderRuntime();
      this._adapter = new OpenClawAdapter(liveConfig || DEFAULT_LIVE_CONFIG);
      this._mode = 'live';
      this._rawAgents = [];
      this._rawSessions = [];
      this._bindEvents();
      this._scene?.syncAgents?.([]);
      this._scene?.syncSessions?.([]);
      this._adapter.start();
      this._updateConnUI('connecting', '连接中…');
      syncWorkflowProviderSnapshot?.();
    },

    _bindEvents() {
      this._adapter.on('agents-updated', (agents) => {
        this._rawAgents = agents;
        syncWorkflowProviderSnapshot?.();
        this._scene.syncAgents(this.getAgents());
      });
      this._adapter.on('sessions-updated', (sessions) => {
        this._rawSessions = sessions;
        syncWorkflowProviderSnapshot?.();
        this._scene.syncSessions && this._scene.syncSessions(sessions);
      });

      const sessionToAgent = (sessionKey) => sessionKey?.split(':')?.[1] || 'main';
      this._adapter.on('agent-replying', ({ sessionKey }) => {
        this._scene.setAgentChatStatus?.(sessionToAgent(sessionKey), 'replying');
      });
      this._adapter.on('reply', ({ sessionKey, text }) => {
        this._scene.appendReply && this._scene.appendReply(text, sessionToAgent(sessionKey), sessionKey);
      });
      this._adapter.on('agent-running', ({ sessionKey }) => {
        const agentId = sessionToAgent(sessionKey);
        const agent = this._adapter.getAgents().find((item) => item.id === agentId);
        if (agent) {
          agent.status = 'working';
          this._rawAgents = this._adapter.getAgents();
          syncWorkflowProviderSnapshot?.();
          this._scene.syncAgents(this.getAgents());
        }
        this._scene.setAgentChatStatus?.(agentId, 'thinking');
      });
      this._adapter.on('agent-idle', ({ sessionKey }) => {
        const agentId = sessionToAgent(sessionKey);
        const agent = this._adapter.getAgents().find((item) => item.id === agentId);
        if (agent) {
          agent.status = 'idle';
          this._rawAgents = this._adapter.getAgents();
          syncWorkflowProviderSnapshot?.();
          this._scene.syncAgents(this.getAgents());
        }
        this._scene.setAgentChatStatus?.(agentId, null);
      });
      this._adapter.on('message', ({ fromId, text }) => {
        this._scene.triggerMessage(fromId, text);
      });
      this._adapter.on('status', ({ type }) => {
        const labels = { live: '已连接', connecting: '连接中…', error: '连接异常', idle: '未连接' };
        this._updateConnUI(type, labels[type] || type);
      });

      if (this._adapter.subscribeEvents) {
        this._providerUnsubscribe = this._adapter.subscribeEvents((event) => {
          this._recordProviderEvent(event);
          syncWorkflowProviderSnapshot?.();
        });
      }
    },

    reconnect() {
      if (this._adapter) this._adapter.stop();
      this._startLive();
    },

    getAgents() {
      const baseAgents = this._rawAgents.length
        ? this._rawAgents
        : (this._adapter ? this._adapter.getAgents() : []);

      return decorateAgents ? decorateAgents(baseAgents) : baseAgents;
    },

    getSessions() {
      return this._adapter?.getSessions ? this._adapter.getSessions() : [];
    },

    getAdapterContract() {
      return this._adapter;
    },

    getExecutionEvidence() {
      const activeRun = this._activeWorkflowProviderRunId
        ? this._providerRuns.get(this._activeWorkflowProviderRunId)
        : null;

      return {
        mode: this._mode,
        provider: this._adapter?.getProviderId?.() || this._mode,
        status: this._adapter?.getStatus?.() || 'idle',
        capabilities: this._adapter?.getCapabilities?.() || cloneCapabilities(),
        activeRun,
        recentEvents: [...this._providerEvents].slice(-8).reverse(),
      };
    },

    async sendMessage(sessionKey, text) {
      if (!this._adapter?.sendMessage) throw new Error('not connected');
      return this._adapter.sendMessage(sessionKey, text);
    },

    async startWorkflowProviderRun(workflowState) {
      if (!this._adapter?.startTaskRun) return null;
      const payload = buildWorkflowRunRequest(workflowState, this.getSessions());
      const run = await this._adapter.startTaskRun(payload);
      if (run?.runId) {
        this._activeWorkflowProviderRunId = run.runId;
        this._providerRuns.set(run.runId, run);
      }
      return run;
    },

    async advanceWorkflowProviderRun(workflowState, signal = 'manual') {
      if (!this._adapter?.advanceStage || !this._activeWorkflowProviderRunId) return null;
      const payload = buildWorkflowRunRequest(workflowState, this.getSessions());
      payload.isTerminal = workflowState?.currentRun?.status === 'completed';
      const run = await this._adapter.advanceStage(
        this._activeWorkflowProviderRunId,
        workflowState?.currentStage?.id || workflowState?.currentRun?.currentStageId || null,
        signal,
        payload,
      );
      if (run?.runId) {
        this._providerRuns.set(run.runId, run);
      }
      return run;
    },

    _updateConnUI(type, label) {
      if (typeof document === 'undefined') return;
      const dot = document.getElementById('conn-dot');
      const lbl = document.getElementById('conn-label');
      const btn = document.getElementById('btn-live');
      if (dot) { dot.className = ''; dot.classList.add(type); }
      if (lbl) lbl.textContent = label;
      if (btn) {
        if (type === 'connecting') {
          btn.textContent = '⏳ 连接中…';
          btn.classList.remove('active');
        } else if (type === 'live') {
          btn.textContent = '↻ 重连 OpenClaw';
          btn.classList.add('active');
        } else if (type === 'error') {
          btn.textContent = '↻ 重连 OpenClaw';
          btn.classList.remove('active');
        } else if (type === 'idle') {
          btn.textContent = '↻ 连接 OpenClaw';
          btn.classList.remove('active');
        }
      }
    },
  };
}
