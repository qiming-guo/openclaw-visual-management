function buildBootstrapCommand(agentId) {
  return `openclaw agent --agent "${agentId}" --message "Bootstrap main session for ${agentId}. Reply with exactly: ${agentId} session ready."`;
}

function joinPath(base, leaf) {
  const normalizedBase = String(base || '').replace(/\/+$/, '');
  const normalizedLeaf = String(leaf || '').replace(/^\/+/, '');
  return normalizedBase ? `${normalizedBase}/${normalizedLeaf}` : normalizedLeaf;
}

export function slugifyAgentWorkspaceLeaf(name = '') {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\bagent\b$/u, '')
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'new-agent';
}

export function deriveAgentWorkspaceRoot(agentData = []) {
  const mainWorkspace = agentData.find((agent) => agent.id === 'main')?._raw?.workspace;
  if (mainWorkspace) return mainWorkspace;

  const firstWorkspace = agentData.find((agent) => agent._raw?.workspace)?._raw?.workspace;
  if (!firstWorkspace) return '/Users/chinny/.openclaw/workspace';

  const marker = '/workspace/';
  const markerIndex = firstWorkspace.indexOf(marker);
  if (markerIndex >= 0) {
    return `${firstWorkspace.slice(0, markerIndex)}${marker.slice(0, -1)}`;
  }

  return firstWorkspace.endsWith('/workspace')
    ? firstWorkspace
    : '/Users/chinny/.openclaw/workspace';
}

export function deriveDefaultAgentWorkspace(name = '', agentData = []) {
  const root = deriveAgentWorkspaceRoot(agentData);
  const leaf = slugifyAgentWorkspaceLeaf(name);
  return joinPath(root, leaf);
}

export function createAgentManager({ getDataManager } = {}) {
  const readDataManager = () => getDataManager?.() || null;

  const manager = {
    _mode: null,
    _editId: null,
    _workspaceTouched: false,
    _suggestedWorkspace: '',

    _syncCreateWorkspaceSuggestion(force = false) {
      if (this._mode !== 'create') return;
      const nameInput = document.getElementById('modal-name');
      const workspaceInput = document.getElementById('modal-workspace');
      const workspaceHint = document.getElementById('modal-workspace-hint');
      if (!nameInput || !workspaceInput) return;

      const nextWorkspace = deriveDefaultAgentWorkspace(
        nameInput.value,
        readDataManager()?._adapter?.getAgents?.() || [],
      );

      const shouldApply = force || !this._workspaceTouched || !workspaceInput.value.trim() || workspaceInput.value.trim() === this._suggestedWorkspace;
      this._suggestedWorkspace = nextWorkspace;
      if (workspaceHint) {
        workspaceHint.textContent = `未自定义路径时，将自动创建独立 workspace：${nextWorkspace}`;
      }
      if (shouldApply) {
        workspaceInput.value = nextWorkspace;
        this._workspaceTouched = false;
      }
    },

    _bindCreateFormBehavior() {
      const nameInput = document.getElementById('modal-name');
      const workspaceInput = document.getElementById('modal-workspace');
      if (!nameInput || !workspaceInput) return;

      nameInput.oninput = () => {
        this._syncCreateWorkspaceSuggestion(false);
      };
      workspaceInput.oninput = () => {
        this._workspaceTouched = workspaceInput.value.trim() !== this._suggestedWorkspace;
      };
    },

    renderList() {
      const el = document.getElementById('agent-manage-list');
      if (!el) return;
      const agentData = readDataManager()?._adapter?.getAgents?.() || [];
      if (!agentData.length) {
        el.innerHTML = '<p class="detail-empty" style="font-size:0.74rem;padding:4px 0;">无 Agent 数据（请切换到 Live 模式）</p>';
        return;
      }
      const roleColors = { leader: '#FFD700', frontend: '#3498DB', backend: '#27AE60', designer: '#E91E8C', qa: '#E74C3C', default: '#94a3b8' };
      el.innerHTML = agentData.map((a) => {
        const isProtected = a.id === 'main';
        const name = a.name || a.id;
        const dotColor = roleColors[a.role] || roleColors.default;
        return `
          <div class="agent-manage-item">
            <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></div>
            <div style="flex:1;min-width:0;">
              <div class="ama-name">${name.replace(/</g, '&lt;')}</div>
              <div class="ama-id">${a.id}</div>
            </div>
            <button class="ama-btn" style="background:rgba(59,130,246,0.2);color:#60a5fa;" onclick="AgentManager.showEdit('${a.id}')">编辑</button>
            ${isProtected ? '' : `<button class="ama-btn" style="background:rgba(239,68,68,0.2);color:#f87171;" onclick="AgentManager.confirmDelete('${a.id}','${name.replace(/'/g, "\\'")}')">删除</button>`}
          </div>`;
      }).join('');
    },

    showCreate() {
      this._mode = 'create';
      this._editId = null;
      this._workspaceTouched = false;
      document.getElementById('modal-title').textContent = '新增 Agent';
      document.getElementById('modal-submit-btn').textContent = '创建';
      document.getElementById('modal-name').value = '';
      document.getElementById('modal-workspace').value = '';
      document.getElementById('modal-workspace').placeholder = '/Users/chinny/.openclaw/workspace/ops';
      document.getElementById('modal-emoji').value = '';
      document.getElementById('modal-err').textContent = '';
      this._bindCreateFormBehavior();
      this._syncCreateWorkspaceSuggestion(true);
      document.getElementById('agent-modal-overlay').classList.add('open');
      document.getElementById('modal-name').focus();
    },

    showEdit(agentId) {
      const agentData = readDataManager()?._adapter?.getAgents?.() || [];
      const a = agentData.find((item) => item.id === agentId);
      if (!a) return;
      this._mode = 'edit';
      this._editId = agentId;
      document.getElementById('modal-title').textContent = `编辑 Agent：${a.id}`;
      document.getElementById('modal-submit-btn').textContent = '保存';
      document.getElementById('modal-name').value = a.name || '';
      document.getElementById('modal-workspace').value = a._raw?.workspace || '';
      document.getElementById('modal-workspace').placeholder = '/Users/chinny/.openclaw/workspace/ops';
      document.getElementById('modal-emoji').value = a._raw?.identity?.emoji || '';
      document.getElementById('modal-err').textContent = '';
      const workspaceHint = document.getElementById('modal-workspace-hint');
      if (workspaceHint) {
        workspaceHint.textContent = '未自定义路径时，将自动创建独立 workspace：/Users/chinny/.openclaw/workspace/<name>';
      }
      document.getElementById('modal-name').oninput = null;
      document.getElementById('modal-workspace').oninput = null;
      document.getElementById('agent-modal-overlay').classList.add('open');
      document.getElementById('modal-name').focus();
    },

    closeModal() {
      document.getElementById('agent-modal-overlay').classList.remove('open');
    },

    _showSuccess(message) {
      const errEl = document.getElementById('modal-err');
      const statusEl = document.getElementById('chat-status');
      if (errEl) {
        errEl.style.color = '#34d399';
        errEl.textContent = `✅ ${message}`;
      }
      if (statusEl) {
        statusEl.textContent = `✅ ${message}`;
      }
      setTimeout(() => {
        if (errEl && errEl.textContent === `✅ ${message}`) {
          errEl.textContent = '';
          errEl.style.color = '#f87171';
        }
      }, 2200);
    },

    async submit() {
      const dataManager = readDataManager();
      const adapter = dataManager?._adapter;
      const name = document.getElementById('modal-name').value.trim();
      const workspaceInput = document.getElementById('modal-workspace');
      const workspace = (workspaceInput?.value || '').trim() || deriveDefaultAgentWorkspace(name, adapter?.getAgents?.() || []);
      const emoji = document.getElementById('modal-emoji').value.trim();
      const errEl = document.getElementById('modal-err');
      const btn = document.getElementById('modal-submit-btn');

      if (!name) { errEl.textContent = '名称不能为空'; return; }
      if (this._mode === 'create' && !workspace) { errEl.textContent = 'Workspace 路径不能为空'; return; }
      if (workspaceInput && this._mode === 'create' && !workspaceInput.value.trim()) {
        workspaceInput.value = workspace;
      }

      btn.disabled = true;
      btn.textContent = '处理中…';
      errEl.textContent = '';

      let createdAgentId = null;
      let bootstrapError = null;

      try {
        const successMessage = this._mode === 'create' ? 'Agent 创建成功' : 'Agent 更新成功';
        if (this._mode === 'create') {
          const result = await this._rpc('agents.create', { name, workspace, ...(emoji ? { emoji } : {}) });
          createdAgentId = result?.agentId || null;

          if (createdAgentId && adapter?.bootstrapAgentMainSession) {
            btn.textContent = '初始化主会话…';
            try {
              await adapter.bootstrapAgentMainSession(createdAgentId);
            } catch (error) {
              bootstrapError = error;
            }
          }
        } else {
          const params = { agentId: this._editId, name };
          if (workspace) params.workspace = workspace;
          if (emoji) params.emoji = emoji;
          await this._rpc('agents.update', params);
        }

        await adapter?._fetchAll?.();
        this.renderList();
        this._showSuccess(successMessage);
        this.closeModal();

        if (bootstrapError && createdAgentId) {
          window.alert([
            'Agent 已创建，但主会话自动初始化失败。',
            '',
            `Agent ID: ${createdAgentId}`,
            `原因: ${bootstrapError.message}`,
            '',
            '你可以手动运行下面的命令补做 bootstrap：',
            buildBootstrapCommand(createdAgentId),
          ].join('\n'));
        }
      } catch (e) {
        errEl.style.color = '#f87171';
        errEl.textContent = `❌ ${e.message}`;
      } finally {
        btn.disabled = false;
        btn.textContent = this._mode === 'create' ? '创建' : '保存';
      }
    },

    confirmDelete(agentId, name) {
      if (!confirm(`确认删除 Agent「${name}」？\n\n此操作将移除 Agent 配置（不删除 workspace 文件）。`)) return;
      this._doDelete(agentId, name);
    },

    async _doDelete(agentId) {
      const dataManager = readDataManager();
      try {
        await this._rpc('agents.delete', { agentId, deleteFiles: false });
        await dataManager?._adapter?._fetchAll?.();
        this.renderList();
      } catch (e) {
        alert(`删除失败：${e.message}`);
      }
    },

    _rpc(method, params) {
      const dataManager = readDataManager();
      const adapter = dataManager?._adapter;
      if (!adapter || dataManager?._mode !== 'live') {
        return Promise.reject(new Error('请先切换到 Live 模式'));
      }
      return adapter._request(method, params);
    },
  };

  return manager;
}
