import test from 'node:test';
import assert from 'node:assert/strict';

import { MockAdapter, OpenClawAdapter } from '../src/monitor-data.js';

function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function tick() {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('waitFor timeout'));
        return;
      }
      setTimeout(tick, 5);
    }

    tick();
  });
}

class FakeSocket {
  static OPEN = 1;

  constructor() {
    this.OPEN = FakeSocket.OPEN;
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    this.dynamicSessions = [];
    queueMicrotask(() => {
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({ type: 'event', event: 'connect.challenge' }),
      });
    });
  }

  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);

    switch (msg.method) {
      case 'connect':
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: { connected: true } }),
          });
        });
        break;
      case 'agents.list':
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: {
                agents: [
                  { id: 'main', model: { primary: 'openclaw/gpt-5.4' }, workspace: '/tmp/main' },
                  { id: 'husky', model: { primary: 'openclaw/gpt-5.4-mini' }, workspace: '/tmp/husky' },
                ],
              },
            }),
          });
        });
        break;
      case 'sessions.list':
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: {
                sessions: [
                  { key: 'agent:main:main', displayName: 'main', status: 'running', updatedAt: '2026-04-14T10:00:00.000Z', model: 'gpt-5.4' },
                  { key: 'agent:husky:main', displayName: 'husky', status: 'idle', updatedAt: '2026-04-14T10:01:00.000Z', model: 'gpt-5.4-mini' },
                  ...this.dynamicSessions,
                ],
              },
            }),
          });
        });
        break;
      case 'sessions.create':
        this.dynamicSessions.push({
          key: msg.params.key,
          displayName: 'main',
          status: 'idle',
          updatedAt: '2026-04-14T10:02:00.000Z',
          model: 'gpt-5.4-mini',
        });
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: {
                ok: true,
                key: msg.params.key,
                sessionId: 'created-session',
                entry: { sessionId: 'created-session' },
                runStarted: false,
              },
            }),
          });
        });
        break;
      case 'sessions.send':
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: {
                accepted: true,
                sessionKey: msg.params.key,
              },
            }),
          });
        });
        break;
      case 'sessions.messages.subscribe':
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: { subscribed: true },
            }),
          });
        });
        break;
      default:
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: {} }),
          });
        });
        break;
    }
  }

  emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function createWorkflowPayload({
  runId = 'run-1',
  stageId = 'discovery',
  stageLabel = '需求梳理',
  ownerRoleId = 'leader',
  signal = 'brief-approved',
  taskTitle = '实现 Phase 3 闭环',
  status = 'running',
  sessionKey = 'agent:main:main',
} = {}) {
  return {
    runId,
    taskTitle,
    sessionKey,
    currentRun: {
      id: runId,
      status,
      currentStageId: stageId,
      currentOwnerRoleId: ownerRoleId,
      currentOwnerAgentId: ownerRoleId === 'leader' ? 'main' : 'husky',
    },
    currentStage: {
      id: stageId,
      label: stageLabel,
      ownerRoleId,
      completionSignal: signal,
      rpg: {
        cueLabel: `${stageLabel} Cue`,
        bubbleText: `${stageLabel} 的执行说明`,
        handoffText: `${stageLabel} 完成后请继续交接`,
      },
    },
    workflowTemplate: {
      id: 'workflow-1',
      name: '默认研发流程',
      stages: [
        { id: 'discovery', label: '需求梳理', ownerRoleId: 'leader', completionSignal: 'brief-approved' },
        { id: 'design', label: 'UI 设计', ownerRoleId: 'frontend', completionSignal: 'design-ready' },
      ],
    },
    teamTemplate: {
      id: 'team-1',
      name: '默认团队',
      roles: [
        { id: 'leader', label: '负责人', assignedAgentId: 'main', assignedAgentName: '金毛 🐕' },
        { id: 'frontend', label: '前端', assignedAgentId: 'husky', assignedAgentName: '哈士奇 🐺' },
      ],
    },
  };
}

test('MockAdapter exposes deterministic contract hooks for workflow runs', async () => {
  const adapter = new MockAdapter();
  const events = [];
  adapter.subscribeEvents((event) => events.push(event));
  adapter.start();

  assert.equal(adapter.getStatus(), 'mock');
  assert.equal((await adapter.listAgents()).length >= 5, true);
  assert.equal((await adapter.listSessions()).length >= 5, true);

  const run = await adapter.startTaskRun(createWorkflowPayload());
  assert.equal(run.status, 'running');
  assert.equal(run.currentStageId, 'discovery');
  assert.equal(run.sessionKey, 'agent:main:main');

  const advanced = await adapter.advanceStage(
    run.runId,
    'design',
    'manual',
    createWorkflowPayload({
      runId: run.runId,
      stageId: 'design',
      stageLabel: 'UI 设计',
      ownerRoleId: 'frontend',
      signal: 'design-ready',
      sessionKey: 'agent:fe-01:main',
    }),
  );

  assert.equal(advanced.currentStageId, 'design');
  assert.equal(events.some((event) => event.type === 'run.created'), true);
  assert.equal(events.some((event) => event.type === 'run.started'), true);
  assert.equal(events.some((event) => event.type === 'run.stage.changed'), true);
  assert.equal(events.some((event) => event.type === 'run.message'), true);

  adapter.stop();
});

test('OpenClawAdapter startTaskRun falls back to canonical agent session keys before session discovery', async () => {
  const adapter = new OpenClawAdapter();
  adapter._connected = true;
  adapter._sessions = [];
  const sent = [];
  adapter.sendMessage = async (sessionKey, text) => {
    sent.push({ sessionKey, text });
    return { accepted: true };
  };

  const run = await adapter.startTaskRun(createWorkflowPayload());

  assert.equal(run.sessionKey, 'agent:main:main');
  assert.equal(run.status, 'running');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sessionKey, 'agent:main:main');
});

test('OpenClawAdapter bootstrapAgentMainSession creates a main session and warmup message', async () => {
  let socket = null;
  const adapter = new OpenClawAdapter({
    createSocket: () => {
      socket = new FakeSocket();
      return socket;
    },
  });

  adapter.start();
  await waitFor(() => adapter.getStatus() === 'live');

  const result = await adapter.bootstrapAgentMainSession('design-agent', { displayName: 'Design Agent', message: 'bootstrap probe' });

  assert.equal(result.sessionKey, 'agent:design-agent:main');
  assert.equal(socket.sent.some((entry) => entry.method === 'sessions.create' && entry.params.key === 'agent:design-agent:main'), true);
  assert.equal(socket.sent.some((entry) => entry.method === 'sessions.send' && entry.params.key === 'agent:design-agent:main'), true);
  assert.equal(adapter.getSessions().some((session) => session.key === 'agent:design-agent:main'), true);

  adapter.stop();
});

test('OpenClawAdapter infers role and display name from created agent metadata', () => {
  const adapter = new OpenClawAdapter();

  const design = adapter._mapAgent({
    id: 'design-agent',
    name: 'Design Agent',
    identity: { name: 'Design Agent', emoji: '🎨' },
    workspace: '/tmp/designer',
    model: { primary: 'openclaw/gpt-5.4' },
  });
  const frontend = adapter._mapAgent({
    id: 'fe-agent',
    name: 'FE Agent',
    identity: { name: 'FE Agent', emoji: '🖥️' },
    workspace: '/tmp/frontend',
    model: { primary: 'openclaw/gpt-5.4' },
  });
  const qa = adapter._mapAgent({
    id: 'qa-agent',
    name: 'QA Agent',
    identity: { name: 'QA Agent', emoji: '✅' },
    workspace: '/tmp/qa',
    model: { primary: 'openclaw/gpt-5.4' },
  });

  assert.equal(design.name, 'Design Agent');
  assert.equal(design.emoji, '🎨');
  assert.equal(design.role, 'designer');
  assert.equal(frontend.role, 'frontend');
  assert.equal(qa.role, 'qa');
});

test('OpenClawAdapter maps main sessions with agent metadata for cleaner UI grouping', () => {
  const adapter = new OpenClawAdapter();

  const mainSession = adapter._mapSessionEntry({
    key: 'agent:ops-agent:main',
    displayName: 'main',
    status: 'done',
    updatedAt: 1776230000000,
    model: 'ark-code-latest',
  });
  const historySession = adapter._mapSessionEntry({
    key: 'agent:main:dreaming-narrative-light-1',
    displayName: 'dreaming-narrative-light-1',
    status: 'done',
    updatedAt: 1776230000001,
    model: 'ark-code-latest',
  });

  assert.equal(mainSession.agentId, 'ops-agent');
  assert.equal(mainSession.agentLabel, 'Ops Agent');
  assert.equal(mainSession.agentAvatar, null);
  assert.equal(mainSession.isAgentMainSession, true);
  assert.equal(mainSession.sessionLabel, '主会话');
  assert.equal(historySession.agentId, 'main');
  assert.equal(historySession.isHistoricalSession, true);
  assert.equal(historySession.sortPriority, 1);
});

test('OpenClawAdapter still emits agent updates when session polling fails', async () => {
  const adapter = new OpenClawAdapter();
  const agentEvents = [];
  const providerEvents = [];
  adapter.on('agents-updated', (agents) => agentEvents.push(agents));
  adapter.subscribeEvents((event) => providerEvents.push(event));
  adapter._connected = true;
  adapter._request = async (method) => {
    if (method === 'agents.list') {
      return {
        agents: [
          { id: 'main', model: { primary: 'openclaw/gpt-5.4' }, workspace: '/tmp/main' },
          { id: 'husky', model: { primary: 'openclaw/gpt-5.4-mini' }, workspace: '/tmp/husky' },
        ],
      };
    }
    if (method === 'sessions.list') {
      const error = new Error('sessions unavailable');
      error.code = 'EVENT_STREAM_ERROR';
      throw error;
    }
    return {};
  };

  await adapter._fetchAll();

  assert.equal(adapter.getAgents().length, 2);
  assert.equal(agentEvents.length, 1);
  assert.equal(providerEvents.some((event) => event.type === 'agents.updated'), true);
  assert.equal(providerEvents.some((event) => event.type === 'run.failed' && event.payload?.scope === 'sessions.list'), true);
});

test('OpenClawAdapter maps websocket RPCs into provider contract events', async () => {
  let socket = null;
  const adapter = new OpenClawAdapter({
    createSocket: () => {
      socket = new FakeSocket();
      return socket;
    },
  });
  const events = [];
  adapter.subscribeEvents((event) => events.push(event));

  adapter.start();

  await waitFor(() => adapter.getStatus() === 'live');
  await waitFor(() => adapter.getAgents().length === 2 && adapter.getSessions().length === 2);

  const run = await adapter.startTaskRun(createWorkflowPayload());
  assert.equal(run.status, 'running');
  assert.equal(run.sessionKey, 'agent:main:main');

  const outboundMessagesAfterStart = socket.sent.filter((entry) => entry.method === 'sessions.send');
  assert.equal(outboundMessagesAfterStart.length, 1);
  assert.match(outboundMessagesAfterStart[0].params.message, /当前阶段：需求梳理/);

  const advanced = await adapter.advanceStage(
    run.runId,
    'design',
    'manual',
    createWorkflowPayload({
      runId: run.runId,
      stageId: 'design',
      stageLabel: 'UI 设计',
      ownerRoleId: 'frontend',
      signal: 'design-ready',
      sessionKey: 'agent:husky:main',
    }),
  );

  assert.equal(advanced.currentStageId, 'design');
  const outboundMessagesAfterAdvance = socket.sent.filter((entry) => entry.method === 'sessions.send');
  assert.equal(outboundMessagesAfterAdvance.length, 2);
  assert.match(outboundMessagesAfterAdvance[1].params.message, /切换到阶段：UI 设计/);

  socket.emit({
    type: 'event',
    event: 'chat',
    payload: {
      state: 'final',
      sessionKey: 'agent:husky:main',
      message: {
        role: 'assistant',
        content: 'UI 设计已完成，准备进入下一阶段。',
      },
    },
  });

  await waitFor(() => events.some((event) => event.type === 'run.message' && event.payload?.direction === 'inbound'));
  assert.equal(events.some((event) => event.type === 'agents.updated'), true);
  assert.equal(events.some((event) => event.type === 'sessions.updated'), true);
  assert.equal(events.some((event) => event.type === 'run.created'), true);
  assert.equal(events.some((event) => event.type === 'run.started'), true);
  assert.equal(events.some((event) => event.type === 'run.stage.changed'), true);

  adapter.stop();
});
