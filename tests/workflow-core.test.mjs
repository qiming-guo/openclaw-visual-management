import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WorkflowEngine,
  createDefaultTeamTemplate,
  createDefaultWorkflowTemplate,
  decorateAgentsForRun,
  normalizeProviderSnapshot,
  resolveStageBehavior,
} from '../src/workflow-core.js';

const sampleAgents = [
  { id: 'leader-01', name: 'Lead', role: 'leader', status: 'idle', task: '待机中', model: 'm1', uptime: '1m', tokens: '1k' },
  { id: 'design-01', name: 'Design', role: 'designer', status: 'idle', task: '待机中', model: 'm1', uptime: '1m', tokens: '1k' },
  { id: 'fe-01', name: 'FE', role: 'frontend', status: 'idle', task: '待机中', model: 'm1', uptime: '1m', tokens: '1k' },
  { id: 'be-01', name: 'BE', role: 'backend', status: 'idle', task: '待机中', model: 'm1', uptime: '1m', tokens: '1k' },
  { id: 'qa-01', name: 'QA', role: 'qa', status: 'idle', task: '待机中', model: 'm1', uptime: '1m', tokens: '1k' },
];

test('normalizeProviderSnapshot keeps provider-tagged agent data', () => {
  const snapshot = normalizeProviderSnapshot({
    provider: 'mock',
    agents: sampleAgents,
    sessions: [{ key: 'agent:leader-01:main', label: 'Lead', status: 'running' }],
  });

  assert.equal(snapshot.provider, 'mock');
  assert.equal(snapshot.agents[0].provider, 'mock');
  assert.equal(snapshot.sessions[0].provider, 'mock');
});

test('createDefaultTeamTemplate assigns first matching agents by role', () => {
  const snapshot = normalizeProviderSnapshot({ provider: 'mock', agents: sampleAgents });
  const team = createDefaultTeamTemplate(snapshot.agents);

  const leaderRole = team.roles.find((role) => role.id === 'leader');
  const qaRole = team.roles.find((role) => role.id === 'qa');

  assert.equal(leaderRole.assignedAgentId, 'leader-01');
  assert.equal(qaRole.assignedAgentId, 'qa-01');
});

test('workflow engine starts a run and advances through stages', () => {
  const snapshot = normalizeProviderSnapshot({ provider: 'mock', agents: sampleAgents });
  const engine = new WorkflowEngine({
    teamTemplate: createDefaultTeamTemplate(snapshot.agents),
    workflowTemplate: createDefaultWorkflowTemplate(),
  });

  engine.syncProviderSnapshot(snapshot);
  const run = engine.startRun('实现网页应用');

  assert.equal(run.status, 'running');
  assert.equal(run.currentStageId, 'discovery');
  assert.equal(run.currentOwnerAgentId, 'leader-01');

  engine.advanceStage();
  const nextState = engine.getState();

  assert.equal(nextState.currentRun.status, 'running');
  assert.equal(nextState.currentRun.currentStageId, 'design');
  assert.equal(nextState.currentRun.currentOwnerAgentId, 'design-01');
  assert.ok(nextState.currentRun.history.some((item) => item.type === 'run.handoff'));
});

test('workflow engine blocks when the next stage lacks a mapped agent', () => {
  const partialAgents = normalizeProviderSnapshot({
    provider: 'live',
    agents: sampleAgents.filter((agent) => ['leader', 'frontend'].includes(agent.role)),
  });

  const engine = new WorkflowEngine({
    teamTemplate: createDefaultTeamTemplate(partialAgents.agents),
    workflowTemplate: createDefaultWorkflowTemplate(),
  });

  engine.syncProviderSnapshot(partialAgents);
  engine.startRun('局部协作任务');
  engine.advanceStage();

  assert.equal(engine.getState().currentRun.status, 'blocked');
  assert.match(engine.getState().currentRun.blockReason, /缺少可用 Agent/);
});

test('decorateAgentsForRun overlays owner status and task labels', () => {
  const snapshot = normalizeProviderSnapshot({ provider: 'mock', agents: sampleAgents });
  const engine = new WorkflowEngine({
    teamTemplate: createDefaultTeamTemplate(snapshot.agents),
    workflowTemplate: createDefaultWorkflowTemplate(),
  });

  engine.syncProviderSnapshot(snapshot);
  engine.startRun('演示任务');
  const decorated = decorateAgentsForRun(sampleAgents, engine.getState());

  const owner = decorated.find((agent) => agent.id === 'leader-01');
  const follower = decorated.find((agent) => agent.id === 'fe-01');

  assert.equal(owner.status, 'working');
  assert.match(owner.task, /需求梳理/);
  assert.equal(follower.status, 'idle');
  assert.match(follower.task, /待命/);
});

test('workflow engine reassigns current owner after team template edits', () => {
  const snapshot = normalizeProviderSnapshot({ provider: 'mock', agents: sampleAgents });
  const engine = new WorkflowEngine({
    teamTemplate: createDefaultTeamTemplate(snapshot.agents),
    workflowTemplate: createDefaultWorkflowTemplate(),
  });

  engine.syncProviderSnapshot(snapshot);
  engine.startRun('重新绑定 owner');
  engine.advanceStage();

  const currentTeam = engine.getState().teamTemplate;
  const nextRoles = currentTeam.roles.map((role) => (
    role.id === 'designer'
      ? { ...role, assignedAgentId: 'qa-01', assignedAgentName: 'QA' }
      : role
  ));

  engine.setTeamTemplate({
    id: currentTeam.id,
    name: currentTeam.name,
    roles: nextRoles,
  });

  const state = engine.getState();
  assert.equal(state.currentRun.currentStageId, 'design');
  assert.equal(state.currentRun.currentOwnerAgentId, 'qa-01');
});

test('resolveStageBehavior keeps RPG cue metadata and assigned owner name', () => {
  const snapshot = normalizeProviderSnapshot({ provider: 'mock', agents: sampleAgents });
  const team = createDefaultTeamTemplate(snapshot.agents);
  const workflow = createDefaultWorkflowTemplate();
  const designStage = workflow.stages.find((stage) => stage.id === 'design');

  const behavior = resolveStageBehavior(designStage, team);

  assert.equal(behavior.ownerRoleId, 'designer');
  assert.equal(behavior.assignedAgentName, 'Design');
  assert.match(behavior.cueLabel, /设计/);
  assert.match(behavior.bubbleText, /界面|设计/);
});
