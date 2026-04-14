export function createAgentManager({ getDataManager } = {}) {
  const readDataManager = () => getDataManager?.() || null;

  return {
    _mode: null,
    _editId: null,

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
      const dataManager = readDataManager();
      this._mode = 'create';
      this._editId = null;
      document.getElementById('modal-title').textContent = '新增 Agent';
      document.getElementById('modal-submit-btn').textContent = '创建';
      document.getElementById('modal-name').value = '';
      document.getElementById('modal-workspace').value = dataManager?._adapter?.getAgents?.()?.[0]?._raw?.workspace || '/Users/chinny/.openclaw/workspace';
      document.getElementById('modal-emoji').value = '';
      document.getElementById('modal-err').textContent = '';
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
      document.getElementById('modal-emoji').value = a._raw?.identity?.emoji || '';
      document.getElementById('modal-err').textContent = '';
      document.getElementById('agent-modal-overlay').classList.add('open');
      document.getElementById('modal-name').focus();
    },

    closeModal() {
      document.getElementById('agent-modal-overlay').classList.remove('open');
    },

    async submit() {
      const dataManager = readDataManager();
      const name = document.getElementById('modal-name').value.trim();
      const workspace = document.getElementById('modal-workspace').value.trim();
      const emoji = document.getElementById('modal-emoji').value.trim();
      const errEl = document.getElementById('modal-err');
      const btn = document.getElementById('modal-submit-btn');

      if (!name) { errEl.textContent = '名称不能为空'; return; }
      if (this._mode === 'create' && !workspace) { errEl.textContent = 'Workspace 路径不能为空'; return; }

      btn.disabled = true;
      btn.textContent = '处理中…';
      errEl.textContent = '';

      try {
        if (this._mode === 'create') {
          await this._rpc('agents.create', { name, workspace, ...(emoji ? { emoji } : {}) });
        } else {
          const params = { agentId: this._editId, name };
          if (workspace) params.workspace = workspace;
          await this._rpc('agents.update', params);
        }
        this.closeModal();
        await dataManager?._adapter?._fetchAll?.();
        this.renderList();
      } catch (e) {
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
}
