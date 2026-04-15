import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { createDataManager } from '../src/monitor-data.js';
import { createWorkflowPanelController } from '../src/workflow-panel.js';
import { createRuntimeClasses } from '../src/rpg-runtime.js';
import { createEntityClasses } from '../src/rpg-entities.js';
import { createMonitorSceneApp } from '../src/rpg-scene.js';
import { createPhase3EvidenceDriver } from '../src/phase3-evidence.js';
import { CONFIG, ROLE_COLORS, WORKSTATIONS, AGENT_WORKSTATION } from '../src/rpg-config.js';
import { createAgentManager } from '../src/agent-manager.js';

const html = readFileSync(new URL('../openclaw-monitor-rpg.html', import.meta.url), 'utf8');

test('openclaw monitor inline script stays syntactically valid', async () => {
  const match = html.match(/<script(?:\s+type="module")?>([\s\S]*)<\/script>/);

  assert.ok(match, 'expected a primary inline script block');
  const isModule = /<script\s+type="module">/.test(match[0]);

  if (isModule) {
    const tmpDir = mkdtempSync(join(tmpdir(), 'openclaw-monitor-'));
    const entry = join(tmpDir, 'inline-script.mjs');
    writeFileSync(entry, match[1]);
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', entry], { stdio: 'pipe' }));
    return;
  }

  assert.doesNotThrow(() => new vm.Script(match[1]));
});

test('builder and layout controls are present in the monitor shell', () => {
  assert.match(html, /tab-builder/);
  assert.match(html, /btn-rpg-toggle/);
  assert.match(html, /builder-role-list/);
  assert.match(html, /builder-stage-list/);
  assert.match(html, /workflow-run-board/);
  assert.match(html, /workflow-cue-info/);
});

test('monitor shell references extracted stylesheet and data module', () => {
  assert.match(html, /src\/openclaw-monitor-rpg\.css/);
  assert.match(html, /src\/rpg-config\.js/);
  assert.match(html, /src\/agent-manager\.js/);
  assert.match(html, /src\/monitor-data\.js/);
  assert.match(html, /src\/workflow-panel\.js/);
  assert.match(html, /src\/rpg-runtime\.js/);
  assert.match(html, /src\/rpg-entities\.js/);
  assert.match(html, /src\/rpg-scene\.js/);
  assert.match(html, /src\/phase3-evidence\.js/);
});

test('extracted monitor modules expose their factory APIs', () => {
  assert.equal(typeof CONFIG, 'object');
  assert.equal(typeof ROLE_COLORS, 'object');
  assert.equal(typeof WORKSTATIONS, 'object');
  assert.equal(typeof AGENT_WORKSTATION, 'object');
  assert.equal(typeof createAgentManager, 'function');
  assert.equal(typeof createDataManager, 'function');
  assert.equal(typeof createWorkflowPanelController, 'function');
  assert.equal(typeof createRuntimeClasses, 'function');
  assert.equal(typeof createEntityClasses, 'function');
  assert.equal(typeof createMonitorSceneApp, 'function');
  assert.equal(typeof createPhase3EvidenceDriver, 'function');
});
