export function createMonitorSceneApp({
  CONFIG,
  ROLE_COLORS,
  TileMap,
  AStar,
  Camera,
  Minimap,
  BubbleSystem,
  CommSystem,
  PlayerSprite,
  AgentEntity,
  GameLoop,
  workflowPanel,
  DataManager,
  AgentManager,
} = {}) {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = CONFIG.canvasWidth;
  canvas.height = CONFIG.canvasHeight;

  const tileMap = new TileMap(30, 22, CONFIG.tileSize);
  const astar = new AStar(tileMap);
  const camera = new Camera();

  const mapW = tileMap.width * CONFIG.tileSize;
  const mapH = tileMap.height * CONFIG.tileSize;

  const bubbleSystem = new BubbleSystem();
  const commSystem = new CommSystem();
  const minimap = new Minimap(tileMap, document.getElementById('minimap-canvas'));

  const player = {
    x: 15 * 32 + 16, y: 10 * 32 + 28,
    targetX: 15 * 32 + 16, targetY: 10 * 32 + 28,
    speed: 180,
    moving: false,
    sprite: new PlayerSprite(),
  };

  let agents = [];
  let selectedAgentId = null;
  let ghostMode = false;
  let globalTimer = 0;
  const keys = {};
  let inputBound = false;

  const Scene = {
    applyWorkflowState(state) {
      const run = state?.currentRun;
      const cue = state?.currentStageBehavior;
      const ownerId = run?.currentOwnerAgentId || null;

      for (const agent of agents) {
        if (!run || !cue) {
          agent.clearWorkflowCue?.();
          continue;
        }

        agent.setWorkflowCue?.({
          stageId: cue.stageId,
          stageLabel: cue.stageLabel,
          cueLabel: cue.cueLabel,
          accentColor: cue.accentColor,
          isOwner: agent.id === ownerId,
          blocked: run.status === 'blocked' && agent.id === ownerId,
        });
      }
    },

    syncAgents(dataList) {
      const dataById = new Map(dataList.map((d) => [d.id, d]));

      for (const data of dataList) {
        const existing = agents.find((a) => a.id === data.id);
        if (existing) {
          existing.syncData(data);
        } else {
          agents.push(new AgentEntity(data, tileMap, astar));
        }
      }
      agents = agents.filter((a) => dataById.has(a.id));

      document.getElementById('agent-count').textContent = `${agents.length} Agents`;
      updateAgentList();
      if (selectedAgentId) updateDetailCard(selectedAgentId);
    },

    triggerMessage(fromId, text) {
      const from = agents.find((a) => a.id === fromId);
      if (!from) return;
      const others = agents.filter((a) => a.id !== fromId);
      if (others.length === 0) {
        bubbleSystem.show(fromId, text, agents);
        return;
      }
      const to = others[Math.floor(Math.random() * others.length)];
      commSystem.trigger(fromId, to.id, text, agents, bubbleSystem);
    },

    syncSessions(sessions) {
      Scene._sessions = sessions;
      const el = document.getElementById('session-list-items');
      if (!el) return;
      if (!sessions.length) {
        el.innerHTML = '<p class="detail-empty" style="font-size:0.75rem;padding:8px">暂无会话</p>';
        return;
      }
      el.innerHTML = sessions.map((s) => `
        <div onclick="Scene.openChatBox('${s.key.replace(/'/g, "\\'")}','${s.label.replace(/'/g, "\\'")}')"
          style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);"
          onmouseover="this.style.background='rgba(59,130,246,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
          <span style="font-size:1rem;">${s.channelIcon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.78rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.label}</div>
            <div style="font-size:0.68rem;color:#64748b;">${s.status === 'running' ? '🟢 运行中' : '⚪ 空闲'}</div>
          </div>
          <span style="font-size:0.65rem;color:#3b82f6;">发消息 →</span>
        </div>
      `).join('');
    },

    setAgentChatStatus(agentId, status) {
      const entity = agents.find((a) => a.id === agentId || (agentId === 'main' && (a.isMain || a.id === 'main')));
      if (entity) entity.chatStatus = status;
    },

    appendReply(text) {
      const log = document.getElementById('chat-log');
      if (!log) return;
      const thinking = log.querySelector('.thinking');
      if (thinking) thinking.remove();
      Scene.__renderAssistantBubble(log, text, true);
      Scene._saveChatHistory();
    },

    __renderAssistantBubble(log, text, scroll) {
      const bubble = document.createElement('div');
      bubble.dataset.role = 'assistant';
      bubble.dataset.text = text;
      bubble.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';
      bubble.innerHTML = `
        <span style="font-size:1.1rem;flex-shrink:0;">🐕</span>
        <div style="background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.3);border-radius:8px 8px 8px 2px;padding:6px 10px;font-size:0.78rem;color:#e2e8f0;max-width:90%;white-space:pre-wrap;">${text.replace(/</g, '&lt;')}</div>
      `;
      log.appendChild(bubble);
      if (scroll) log.scrollTop = log.scrollHeight;
    },

    _appendUserMsg(text) {
      const log = document.getElementById('chat-log');
      if (!log) return;
      Scene.__renderUserBubble(log, text, true);
      const thinking = document.createElement('div');
      thinking.className = 'thinking';
      thinking.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';
      thinking.innerHTML = '<span style="font-size:1.1rem;">🐕</span><div style="color:#64748b;font-size:0.75rem;padding:4px 8px;">思考中…</div>';
      log.appendChild(thinking);
      log.scrollTop = log.scrollHeight;
      Scene._saveChatHistory();
    },

    __renderUserBubble(log, text, scroll) {
      const bubble = document.createElement('div');
      bubble.dataset.role = 'user';
      bubble.dataset.text = text;
      bubble.style.cssText = 'display:flex;gap:6px;align-items:flex-start;flex-direction:row-reverse;';
      bubble.innerHTML = `
        <span style="font-size:1.1rem;flex-shrink:0;">👤</span>
        <div style="background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.3);border-radius:8px 8px 2px 8px;padding:6px 10px;font-size:0.78rem;color:#e2e8f0;max-width:90%;white-space:pre-wrap;">${text.replace(/</g, '&lt;')}</div>
      `;
      log.appendChild(bubble);
      if (scroll) log.scrollTop = log.scrollHeight;
    },

    _activeChatKey: 'agent:main:main',
    _STORAGE_KEY: 'openclaw-rpg-chat-history',

    switchTab(tab) {
      document.querySelectorAll('.side-tab').forEach((btn, i) => {
        const names = ['chat', 'sessions', 'agents', 'builder'];
        btn.classList.toggle('active', names[i] === tab);
      });
      document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.toggle('active', pane.id === `tab-${tab}`);
      });
      if (tab === 'agents') AgentManager.renderList();
      if (tab === 'builder') workflowPanel.renderWorkflowBuilderPanels();
    },

    _loadChatHistory() {
      try {
        const saved = localStorage.getItem(Scene._STORAGE_KEY);
        if (!saved) return;
        const msgs = JSON.parse(saved);
        const log = document.getElementById('chat-log');
        if (!log) return;
        log.innerHTML = '';
        msgs.forEach((m) => {
          if (m.role === 'user') Scene.__renderUserBubble(log, m.text, false);
          else Scene.__renderAssistantBubble(log, m.text, false);
        });
        log.scrollTop = log.scrollHeight;
      } catch {}
    },

    _saveChatHistory() {
      try {
        const log = document.getElementById('chat-log');
        if (!log) return;
        const bubbles = log.querySelectorAll('[data-role]');
        const msgs = Array.from(bubbles).slice(-100).map((el) => ({
          role: el.dataset.role,
          text: el.dataset.text || '',
        }));
        localStorage.setItem(Scene._STORAGE_KEY, JSON.stringify(msgs));
      } catch {}
    },

    clearChat() {
      const log = document.getElementById('chat-log');
      if (log) log.innerHTML = '';
      try { localStorage.removeItem(Scene._STORAGE_KEY); } catch {}
    },

    openChatBox(sessionKey, label) {
      Scene._activeChatKey = sessionKey;
      document.getElementById('chat-session-label').textContent = label;
      document.getElementById('chat-status').textContent = '';
      document.getElementById('chat-input').value = '';
      Scene.switchTab('chat');
      document.getElementById('chat-input').focus();
    },

    closeChatBox() {
      Scene._activeChatKey = null;
    },

    async handleChatSend() {
      const key = Scene._activeChatKey;
      const text = document.getElementById('chat-input').value.trim();
      if (!key || !text) return;
      const status = document.getElementById('chat-status');
      const btn = document.getElementById('chat-send-btn');
      btn.disabled = true;
      btn.textContent = '发送中…';
      status.textContent = '';
      try {
        Scene._appendUserMsg(text);
        document.getElementById('chat-input').value = '';
        await DataManager.sendMessage(key, text);
        status.textContent = '';
      } catch (error) {
        status.textContent = `❌ ${error.message}`;
      } finally {
        btn.disabled = false;
        btn.textContent = '发送';
      }
    },
  };

  function selectAgent(id) {
    selectedAgentId = id;
    document.getElementById('selected-info').textContent = id || '无';
    updateDetailCard(id);
    updateAgentList();
  }

  function updateDetailCard(id) {
    const content = document.getElementById('detail-content');
    if (!id) { content.innerHTML = '<p class="detail-empty">点击 Agent 查看详情</p>'; return; }
    const a = agents.find((agent) => agent.id === id);
    if (!a) return;
    const color = (ROLE_COLORS[a.role] || ROLE_COLORS.default).primary;
    const stateLabel = {
      idle: '⚪ 空闲', walking: '🟡 前往工位',
      working: '🟢 工作中', resting: '🔵 休息中', wandering: '🟡 游走中',
    }[a.aiState] || '⚪ 空闲';
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:12px;height:12px;border-radius:50%;background:${color};"></div>
        <strong style="color:${color}">${a.name}</strong>
      </div>
      <div class="detail-row"><span>角色</span><span>${a.role.toUpperCase()}</span></div>
      <div class="detail-row"><span>状态</span><span>${stateLabel}</span></div>
      <div class="detail-row"><span>任务</span><span style="max-width:110px;text-align:right;font-size:0.75rem;">${a.taskText}</span></div>
      <div class="detail-row"><span>模型</span><span style="font-size:0.72rem;">${a.model}</span></div>
      <div class="detail-row"><span>运行时长</span><span>${a.uptime}</span></div>
      <div class="detail-row"><span>Tokens</span><span>${a.tokens}</span></div>
      <div class="detail-row"><span>位置</span><span>(${Math.round(a.x)}, ${Math.round(a.y)})</span></div>
    `;
  }

  function updateAgentList() {
    const list = document.getElementById('agent-list-items');
    if (!list) return;
    list.innerHTML = agents.map((a) => {
      const color = (ROLE_COLORS[a.role] || ROLE_COLORS.default).dot;
      const dotColor = a.aiState === 'working' ? '#27AE60'
        : (a.aiState === 'walking' || a.aiState === 'wandering') ? '#F39C12'
          : '#475569';
      const stateShort = { idle: '空闲', walking: '→工位', working: '工作', resting: '休息', wandering: '游走' };
      const sel = a.id === selectedAgentId ? ' selected' : '';
      return `
        <div class="agent-item${sel}" onclick="selectAgent('${a.id}')">
          <div class="agent-dot" style="background:${dotColor};"></div>
          <span class="agent-item-name" style="color:${color}">${a.name}</span>
          <span class="agent-item-status">${stateShort[a.aiState] || '空闲'}</span>
        </div>`;
    }).join('');
  }

  function canMoveTo(x, y) {
    if (y < CONFIG.minY) return false;
    const hw = (CONFIG.characterWidth - CONFIG.collisionPadding * 2) / 2;
    for (const p of [{ x: x - hw, y }, { x: x + hw, y }]) {
      if (!tileMap.isWalkable(Math.floor(p.x / CONFIG.tileSize), Math.floor(p.y / CONFIG.tileSize))) return false;
    }
    return true;
  }

  function canvasScreenPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (CONFIG.canvasWidth / rect.width),
      sy: (e.clientY - rect.top) * (CONFIG.canvasHeight / rect.height),
    };
  }

  function bindInputHandlers() {
    if (inputBound) return;
    inputBound = true;

    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      keys[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'g' || e.key === 'G') {
        ghostMode = !ghostMode;
        player.moving = false;
        const el = document.getElementById('ghost-status');
        if (el) el.textContent = ghostMode ? '👻 幽灵' : '🚶 正常';
      }
    });
    window.addEventListener('keyup', (e) => { keys[e.key] = false; });

    canvas.addEventListener('click', (e) => {
      const { sx, sy } = canvasScreenPos(e);
      const { x: wx, y: wy } = camera.screenToWorld(sx, sy);
      const clicked = agents.find((ag) => ag.hitTest(wx, wy));
      if (clicked) {
        selectAgent(clicked.id);
        const agentChatKeys = { main: 'agent:main:main', husky: 'agent:husky:main' };
        const agentChatNames = { main: '金毛 🐕', husky: '哈士奇 🐺' };
        const chatKey = agentChatKeys[clicked.id];
        if (chatKey) {
          const sessionKey = Scene._sessions?.find((s) => s.key === chatKey)?.key || chatKey;
          Scene.openChatBox(sessionKey, agentChatNames[clicked.id] || clicked.name);
        }
        return;
      }
      selectAgent(null);
      if (ghostMode || canMoveTo(wx, wy)) { player.targetX = wx; player.targetY = wy; player.moving = true; }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 2) {
        const { sx, sy } = canvasScreenPos(e);
        camera.startDrag(sx, sy);
        e.preventDefault();
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!camera.dragging) return;
      const { sx, sy } = canvasScreenPos(e);
      camera.moveDrag(sx, sy, mapW, mapH);
    });
    canvas.addEventListener('mouseup', (e) => { if (e.button === 1 || e.button === 2) camera.endDrag(); });
    canvas.addEventListener('mouseleave', () => camera.endDrag());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Scene.handleChatSend(); }
    });
  }

  function update(dt) {
    globalTimer += dt;

    const now = new Date();
    document.getElementById('time-info').textContent =
      `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    player.sprite.update(dt);
    let dx = 0; let dy = 0;
    if (keys.w || keys.ArrowUp) dy -= 1;
    if (keys.s || keys.ArrowDown) dy += 1;
    if (keys.a || keys.ArrowLeft) dx -= 1;
    if (keys.d || keys.ArrowRight) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      const nx = player.x + dx * player.speed * dt;
      const ny = player.y + dy * player.speed * dt;
      if (ghostMode) {
        player.x = Math.max(16, Math.min(mapW - 16, nx));
        player.y = Math.max(16, Math.min(mapH - 16, ny));
      } else {
        if (canMoveTo(nx, player.y)) player.x = nx;
        if (canMoveTo(player.x, ny)) player.y = ny;
      }
      player.moving = false;
    } else if (player.moving && !ghostMode) {
      const pdx = player.targetX - player.x;
      const pdy = player.targetY - player.y;
      const dist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (dist < 4) {
        player.x = player.targetX; player.y = player.targetY; player.moving = false;
      } else {
        const mx = (pdx / dist) * player.speed * dt;
        const my = (pdy / dist) * player.speed * dt;
        if (canMoveTo(player.x + mx, player.y + my)) { player.x += mx; player.y += my; }
        else if (canMoveTo(player.x + mx, player.y)) { player.x += mx; player.targetY = player.y; }
        else if (canMoveTo(player.x, player.y + my)) { player.y += my; player.targetX = player.x; }
        else { player.moving = false; }
      }
    }

    for (const ag of agents) ag.update(dt);
    commSystem.update(dt, agents, bubbleSystem);
    bubbleSystem.update(dt);

    document.getElementById('position-info').textContent = `(${Math.round(player.x)}, ${Math.round(player.y)})`;

    if (Math.round(globalTimer * 2) % 2 === 0) {
      updateAgentList();
      if (selectedAgentId) updateDetailCard(selectedAgentId);
    }
  }

  function render() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    camera.begin(ctx);
    tileMap.render(ctx, camera);

    if (player.moving) {
      ctx.save();
      ctx.fillStyle = 'rgba(52,152,219,0.25)';
      ctx.beginPath(); ctx.arc(player.targetX, player.targetY, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(52,152,219,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(player.x, player.y - 8); ctx.lineTo(player.targetX, player.targetY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    commSystem.render(ctx, agents);

    const renderables = [
      {
        y: player.y,
        fn: () => {
          ctx.save();
          if (ghostMode) ctx.globalAlpha = 0.45;
          ctx.fillStyle = ghostMode ? 'rgba(167,139,250,0.2)' : 'rgba(96,165,250,0.15)';
          ctx.beginPath(); ctx.ellipse(player.x, player.y, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.save();
          if (ghostMode) ctx.globalAlpha = 0.5;
          player.sprite.render(ctx, player.x, player.y);
          ctx.restore();
          ctx.save();
          if (ghostMode) ctx.globalAlpha = 0.6;
          ctx.font = 'bold 9px Monaco, monospace'; ctx.textAlign = 'center';
          const lbl = ghostMode ? '👻 You' : '👤 You';
          const lw = ctx.measureText(lbl).width + 8;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(player.x - lw / 2, player.y - 16 * CONFIG.pixelScale - 14, lw, 13);
          ctx.fillStyle = ghostMode ? '#a78bfa' : '#60a5fa';
          ctx.fillText(lbl, player.x, player.y - 16 * CONFIG.pixelScale - 5);
          ctx.restore();
        },
      },
      ...agents.map((ag) => ({
        y: ag.y,
        fn: () => {
          ctx.save();
          ctx.fillStyle = `${(ROLE_COLORS[ag.role] || ROLE_COLORS.default).primary}22`;
          ctx.beginPath(); ctx.ellipse(ag.x, ag.y, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ag.render(ctx, selectedAgentId);
        },
      })),
    ];
    renderables.sort((a, b) => a.y - b.y);
    for (const r of renderables) r.fn();

    bubbleSystem.render(ctx, agents);
    camera.end(ctx);
  }

  const gameLoop = new GameLoop(update, render);

  const game = {
    reset() {
      player.x = 15 * 32 + 16; player.y = 10 * 32 + 28;
      player.targetX = player.x; player.targetY = player.y;
      player.moving = false;
      camera.x = 0; camera.y = 0;
      this.setZoomLevel(1);
      selectAgent(null);
      workflowPanel.resetWorkflowRun();
    },
    togglePause() {
      gameLoop.paused = !gameLoop.paused;
      const pauseBtn = document.getElementById('btn-pause');
      if (pauseBtn) pauseBtn.textContent = gameLoop.paused ? '▶ 继续' : '⏸ 暂停';
    },
    setZoomLevel(z) {
      const zNum = parseFloat(z);
      camera.setZoom(zNum, mapW, mapH);
      document.getElementById('zoom-info').textContent = `${Math.round(zNum * 100)}%`;
      const sel = document.getElementById('zoom-select');
      if (sel) sel.value = String(zNum);
    },
    toggleDataSource() { DataManager.toggle(); },
    startWorkflowDemo() { workflowPanel.startWorkflowRun(); },
    advanceWorkflow() { workflowPanel.advanceWorkflowRun(); },
    say(fromId, toId) {
      const to = toId || (agents.find((a) => a.id !== fromId) || {}).id;
      if (to) commSystem.trigger(fromId, to, null, agents, bubbleSystem);
    },
  };

  function init() {
    bindInputHandlers();
    DataManager.init(Scene);
    Scene.syncAgents(DataManager.getAgents());
    Scene._loadChatHistory();
    workflowPanel.syncWorkflowProviderSnapshot();
    workflowPanel.syncWorkflowStatusUI();
    gameLoop.start();
    console.log('🎮 OpenClaw RPG Monitor 启动');
    console.log('  📡 切换 Live 模式：点击"📡 Mock 模式"按钮');
    console.log('  🔧 手动触发通信：game.say("leader-01", "fe-01")');
    console.log('  🗺  地图 20×15 (640×480)，5 Agent，A* 寻路');
  }

  return {
    Scene,
    game,
    gameLoop,
    player,
    camera,
    tileMap,
    minimap,
    bubbleSystem,
    commSystem,
    getAgents: () => agents,
    selectAgent,
    init,
  };
}
