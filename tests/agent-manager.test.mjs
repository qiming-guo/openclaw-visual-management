import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveAgentWorkspaceRoot,
  deriveDefaultAgentWorkspace,
  slugifyAgentWorkspaceLeaf,
} from '../src/agent-manager.js';

test('slugifyAgentWorkspaceLeaf removes trailing agent suffix for readable defaults', () => {
  assert.equal(slugifyAgentWorkspaceLeaf('Ops Agent'), 'ops');
  assert.equal(slugifyAgentWorkspaceLeaf('Design Agent'), 'design');
  assert.equal(slugifyAgentWorkspaceLeaf(''), 'new-agent');
});

test('deriveAgentWorkspaceRoot prefers main workspace as the isolation root', () => {
  const root = deriveAgentWorkspaceRoot([
    { id: 'ops-agent', _raw: { workspace: '/Users/chinny/.openclaw/workspace/ops' } },
    { id: 'main', _raw: { workspace: '/Users/chinny/.openclaw/workspace' } },
  ]);

  assert.equal(root, '/Users/chinny/.openclaw/workspace');
});

test('deriveDefaultAgentWorkspace generates isolated workspace paths for new agents', () => {
  const workspace = deriveDefaultAgentWorkspace('Ops Agent', [
    { id: 'main', _raw: { workspace: '/Users/chinny/.openclaw/workspace' } },
  ]);

  assert.equal(workspace, '/Users/chinny/.openclaw/workspace/ops');
});
