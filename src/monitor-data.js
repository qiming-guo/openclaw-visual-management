export class DataAdapter {
  constructor() {
    this._listeners = {};
  }

  start() {}

  stop() {}

  getAgents() { return []; }

  getSessions() { return []; }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }
}

export class MockAdapter extends DataAdapter {
  constructor() {
    super();
    this._agents = [
      { id: 'leader-01', name: 'Arch Lead', role: 'leader', status: 'working', task: '设计系统架构', model: 'claude-opus-4-6', uptime: '2h 34m', tokens: '128k' },
      { id: 'fe-01', name: 'FE Agent', role: 'frontend', status: 'idle', task: '等待任务', model: 'claude-sonnet-4-6', uptime: '1h 12m', tokens: '45k' },
      { id: 'be-01', name: 'BE Agent', role: 'backend', status: 'working', task: '实现 API 接口', model: 'claude-sonnet-4-6', uptime: '3h 05m', tokens: '210k' },
      { id: 'design-01', name: 'Design Agent', role: 'designer', status: 'working', task: '生成 UI 组件', model: 'claude-haiku-4-5', uptime: '45m', tokens: '22k' },
      { id: 'qa-01', name: 'QA Agent', role: 'qa', status: 'idle', task: '等待测试任务', model: 'claude-haiku-4-5', uptime: '58m', tokens: '31k' },
    ];
    this._timer = null;
  }

  getAgents() { return [...this._agents]; }

  start() {
    this._emit('status', { type: 'mock' });
    this._timer = setInterval(() => {
      const idx = Math.floor(Math.random() * this._agents.length);
      this._agents[idx] = {
        ...this._agents[idx],
        status: this._agents[idx].status === 'working' ? 'idle' : 'working',
      };
      this._emit('agents-updated', this.getAgents());
    }, 8000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

export class OpenClawAdapter extends DataAdapter {
  constructor(options = {}) {
    super();
    this._url = options.url || 'ws://127.0.0.1:18789';
    this._token = options.token || '';
    this._ws = null;
    this._reqId = 0;
    this._pending = new Map();
    this._agents = [];
    this._sessions = [];
    this._pollTimer = null;
    this._reconnectTimer = null;
    this._connected = false;
  }

  getSessions() { return [...this._sessions]; }

  getAgents() { return [...this._agents]; }

  start() {
    this._connect();
  }

  stop() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._ws) { this._ws.close(); this._ws = null; }
    this._connected = false;
  }

  _connect() {
    this._emit('status', { type: 'connecting' });

    try {
      this._ws = new WebSocket(this._url);
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
      this._emit('status', { type: 'error' });
      this._reconnectTimer = setTimeout(() => this._connect(), 5000);
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
          this._emit('status', { type: 'live' });
          this._startPolling();
        } else {
          this._emit('status', { type: 'error' });
          console.warn('[OpenClawAdapter] connect 失败:', msg.error?.message);
        }
        return;
      }

      const pending = this._pending.get(msg.id);
      if (pending) {
        this._pending.delete(msg.id);
        if (msg.ok) pending.resolve(msg.payload);
        else pending.reject(new Error(msg.error?.message || 'RPC error'));
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

  _onError(error) {
    this._connected = false;
    this._emit('status', { type: 'error' });
    console.warn('[OpenClawAdapter] 连接失败:', error);
  }

  _request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      const id = `rpg-req-${++this._reqId}`;
      this._pending.set(id, { resolve, reject });
      this._send({ type: 'req', id, method, params });
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('timeout'));
        }
      }, 5000);
    });
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
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
    const id = `rpg-sub-${sessionKey.replace(/[^a-z0-9]/gi, '_')}`;
    this._send({ type: 'req', id, method: 'sessions.messages.subscribe', params: { key: sessionKey } });
  }

  async _fetchAll() {
    try {
      const agentsResult = await this._request('agents.list', {});
      const agents = agentsResult?.agents || [];
      this._agents = agents.map((agent) => this._mapAgent(agent));

      const sessResult = await this._request('sessions.list', {});
      this._sessions = (sessResult?.sessions || []).map((session) => this._mapSessionEntry(session));

      const running = this._sessions.some((session) => session.status === 'running');
      if (this._agents[0]) this._agents[0].status = running ? 'working' : 'idle';

      this._emit('agents-updated', this.getAgents());
      this._emit('sessions-updated', this.getSessions());
    } catch (error) {
      console.warn('[OpenClawAdapter] 拉取失败:', error.message);
    }
  }

  _mapAgent(agent) {
    const isMain = agent.id === 'main';
    const nameMap = { main: '金毛 🐕', husky: '哈士奇 🐺' };
    const roleMap = { main: 'leader', husky: 'frontend' };
    return {
      id: agent.id,
      name: nameMap[agent.id] || agent.id,
      role: roleMap[agent.id] || 'backend',
      status: 'idle',
      task: '待机中',
      model: agent.model?.primary?.split('/').pop() || '—',
      uptime: '—',
      tokens: '—',
      isMain,
      _raw: agent,
    };
  }

  _mapSessionEntry(session) {
    const key = session.key || '';
    let label = session.displayName || key.split(':').pop() || key;
    if (label.includes('@im.wechat')) label = '微信用户 💬';
    else if (label === 'heartbeat') label = '心跳 💓';
    else if (label.length > 20) label = `${label.slice(0, 18)}…`;

    const channel = session.lastChannel || session.origin?.provider || '';
    const channelIcon = channel.includes('weixin') ? '💬' : channel === 'heartbeat' ? '💓' : '🖥️';

    return {
      key,
      label,
      channelIcon,
      status: session.status || 'done',
      updatedAt: session.updatedAt,
      model: session.model || '—',
    };
  }

  async sendMessage(sessionKey, text) {
    const key = `rpg-send-${Date.now()}`;
    return this._request('sessions.send', {
      key: sessionKey,
      message: text,
      idempotencyKey: key,
    });
  }
}

export function createDataManager({ syncWorkflowProviderSnapshot, decorateAgents, liveConfig } = {}) {
  return {
    _adapter: null,
    _mode: 'mock',
    _rawAgents: [],
    _rawSessions: [],

    init(scene) {
      this._scene = scene;
      this._startMock();
    },

    _startMock() {
      if (this._adapter) this._adapter.stop();
      this._adapter = new MockAdapter();
      this._mode = 'mock';
      this._rawAgents = this._adapter.getAgents();
      this._rawSessions = [];
      this._bindEvents();
      this._adapter.start();
      this._updateConnUI('mock', '本地模式');
      syncWorkflowProviderSnapshot?.();
    },

    _startLive() {
      if (this._adapter) this._adapter.stop();
      this._adapter = new OpenClawAdapter(liveConfig || {
        url: 'ws://127.0.0.1:18789',
        token: 'fcbd02f22ef8e29b1b8713a5ff4af25915e0df8ca959cfb5',
      });
      this._mode = 'live';
      this._rawAgents = [];
      this._rawSessions = [];
      this._bindEvents();
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
        this._scene.appendReply && this._scene.appendReply(text, sessionToAgent(sessionKey));
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
        const labels = { mock: '本地模式', live: '已连接', connecting: '连接中…', error: '断开' };
        this._updateConnUI(type, labels[type] || type);
      });
    },

    toggle() {
      if (this._mode === 'mock') {
        this._startLive();
        document.getElementById('btn-live').textContent = '🔌 断开连接';
        document.getElementById('btn-live').classList.add('active');
      } else {
        this._startMock();
        document.getElementById('btn-live').textContent = '🔌 连接 OpenClaw';
        document.getElementById('btn-live').classList.remove('active');
      }
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

    async sendMessage(sessionKey, text) {
      if (!this._adapter?.sendMessage) throw new Error('not connected');
      return this._adapter.sendMessage(sessionKey, text);
    },

    _updateConnUI(type, label) {
      const dot = document.getElementById('conn-dot');
      const lbl = document.getElementById('conn-label');
      const btn = document.getElementById('btn-live');
      if (dot) { dot.className = ''; dot.classList.add(type); }
      if (lbl) lbl.textContent = label;
      if (btn) {
        if (type === 'live') {
          btn.textContent = '🔌 断开连接';
          btn.classList.add('active');
        } else if (type === 'mock') {
          btn.textContent = '🔌 连接 OpenClaw';
          btn.classList.remove('active');
        } else if (type === 'error') {
          btn.textContent = '🔌 重新连接';
          btn.classList.remove('active');
        }
      }
    },
  };
}
