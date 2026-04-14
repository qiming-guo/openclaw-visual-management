export function createEntityClasses({ CONFIG, ROLE_COLORS, WORKSTATIONS, AGENT_WORKSTATION }) {
class AgentSprite {
  constructor(role) {
    this.role = role;
    this.ps = CONFIG.pixelScale; // 像素尺寸
    this.colors = ROLE_COLORS[role] || ROLE_COLORS.default;
    this.frames = this._generateFrames();
    this.currentFrame = 0;
    this.animTimer = 0;
    this.animSpeed = 0.6;
    this.state = 'idle';
    this.facingLeft = false;
  }

  setState(state, facingLeft = false) {
    if (this.state !== state || this.facingLeft !== facingLeft) {
      this.state = state;
      this.facingLeft = facingLeft;
      this.currentFrame = 0;
      this.animTimer = 0;
      this.animSpeed = state === 'working' ? 0.25 : state.startsWith('walk') ? 0.12 : 0.6;
    }
  }

  update(dt) {
    this.animTimer += dt;
    const fs = this._frameSet();
    if (this.animTimer >= this.animSpeed) {
      this.animTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % fs.length;
    }
  }

  _frameSet() {
    const key = this.state.startsWith('walk')
      ? (this.facingLeft ? 'walk_left' : 'walk_right')
      : this.state;
    return this.frames[key] || this.frames.idle;
  }

  render(ctx, x, y) {
    const frame = this._frameSet()[this.currentFrame];
    const ps = this.ps;
    const ox = 12 * ps / 2;
    const oy = 16 * ps;
    ctx.save();
    if (this.facingLeft) {
      ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
    }
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 12; c++) {
        const color = frame[r][c];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(x - ox + c * ps), Math.round(y - oy + r * ps), ps, ps);
        }
      }
    }
    ctx.restore();
  }

  _generateFrames() {
    const C = this.colors;
    const skin = '#F4D03F', dark = '#2C3E50', black = '#1A1A2E';
    return {
      idle:       [this._buildIdle(C, skin, dark, black, false), this._buildIdle(C, skin, dark, black, true)],
      walk_right: [0,1,2,3].map(p => this._buildWalk(C, skin, dark, black, p)),
      walk_left:  [0,1,2,3].map(p => this._buildWalk(C, skin, dark, black, p)),
      working:    [this._buildWork(C, skin, dark, black, false), this._buildWork(C, skin, dark, black, true)],
    };
  }

  _buildIdle(C, skin, dark, black, alt) {
    const p = C.primary, s = C.secondary;
    const crown   = this.role === 'leader'   ? '#FFD700' : null;
    const glasses = this.role === 'frontend' ? dark      : null;
    const icon    = this.role === 'backend'  ? '#82E0AA' : null;
    const brush   = this.role === 'designer' ? '#E91E8C' : null;
    const magnify = this.role === 'qa'       ? '#E74C3C' : null;
    return [
      [null,null,null,crown,crown,crown,crown,crown,null,null,null,null],
      [null,null,null,null,skin,skin,skin,skin,null,null,null,null],
      [null,null,skin,skin,skin,skin,skin,skin,skin,skin,null,null],
      [null,skin,skin,dark,dark,skin,skin,dark,dark,skin,skin,null],
      glasses
        ? [null,skin,'#85C1E9','#85C1E9','#85C1E9',skin,skin,'#85C1E9','#85C1E9','#85C1E9',skin,null]
        : [null,skin,skin,skin,skin,skin,skin,skin,skin,skin,skin,null],
      [null,skin,skin,skin,skin,alt?'#E74C3C':skin,alt?'#E74C3C':skin,skin,skin,skin,skin,null],
      [null,skin,skin,skin,skin,skin,skin,skin,skin,skin,skin,null],
      [null,null,p,p,p,p,p,p,p,p,null,null],
      [null,p,p,p,p,p,p,p,p,p,p,null],
      icon    ? [null,p,p,p,'#82E0AA','#82E0AA','#82E0AA','#82E0AA',p,p,p,null]
      : brush   ? [null,p,p,p,'#E91E8C','#F8C8DC','#E91E8C',p,p,p,p,null]
      : magnify  ? [null,p,p,p,'#E74C3C','#FFCDD2','#E74C3C',p,p,p,p,null]
      :            [null,p,p,p,p,s,s,p,p,p,p,null],
      [null,p,s,s,s,s,s,s,s,s,p,null],
      [null,p,s,s,s,s,s,s,s,s,p,null],
      [null,null,dark,null,null,null,null,null,null,dark,null,null],
      [null,null,dark,null,null,null,null,null,null,dark,null,null],
      [null,null,black,null,null,null,null,null,null,black,null,null],
      [null,null,black,null,null,null,null,null,null,black,null,null],
    ];
  }

  _buildWalk(C, skin, dark, black, phase) {
    const lps = [
      {lL:1,lR:3,fL:1,fR:4},
      {lL:2,lR:2,fL:2,fR:2},
      {lL:3,lR:1,fL:4,fR:1},
      {lL:2,lR:2,fL:2,fR:2},
    ];
    const lp = lps[phase];
    const frame = this._buildIdle(C, skin, dark, black, phase % 2 === 0).map(r => [...r]);
    frame[12] = Array(12).fill(null); frame[12][lp.lL] = dark; frame[12][11-lp.lR] = dark;
    frame[13] = Array(12).fill(null); frame[13][lp.lL] = dark; frame[13][11-lp.lR] = dark;
    frame[14] = Array(12).fill(null); frame[14][lp.fL] = black; frame[14][11-lp.fR] = black;
    frame[15] = Array(12).fill(null); frame[15][lp.fL] = black; frame[15][11-lp.fR] = black;
    return frame;
  }

  _buildWork(C, skin, dark, black, alt) {
    const p = C.primary, s = C.secondary;
    const crown = this.role === 'leader' ? '#FFD700' : null;
    return [
      [null,null,null,crown,crown,crown,crown,crown,null,null,null,null],
      [null,null,null,null,skin,skin,skin,skin,null,null,null,null],
      [null,null,skin,skin,skin,skin,skin,skin,skin,skin,null,null],
      [null,skin,skin,dark,dark,skin,skin,dark,dark,skin,skin,null],
      [null,skin,skin,skin,skin,skin,skin,skin,skin,skin,skin,null],
      [null,skin,skin,skin,skin,'#E74C3C','#E74C3C',skin,skin,skin,skin,null],
      [null,skin,skin,skin,skin,skin,skin,skin,skin,skin,skin,null],
      [null,null,p,p,p,p,p,p,p,p,null,null],
      alt ? [p,p,p,p,p,p,p,p,p,p,p,p] : [null,p,p,p,p,p,p,p,p,p,p,null],
      [null,p,p,p,p,s,s,p,p,p,p,null],
      [null,p,s,s,s,s,s,s,s,s,p,null],
      [null,p,s,s,s,s,s,s,s,s,p,null],
      [null,null,dark,null,null,null,null,null,null,dark,null,null],
      [null,null,dark,null,null,null,null,null,null,dark,null,null],
      [null,null,black,null,null,null,null,null,null,black,null,null],
      [null,null,black,null,null,null,null,null,null,black,null,null],
    ];
  }
}

class PlayerSprite extends AgentSprite {
  constructor() { super('leader'); }
}

// ─── Agent 实体（状态机 + 寻路）──────────────────────────────────────

class AgentEntity {
  constructor(data, mapRef, astarRef) {
    this._map   = mapRef;
    this._astar = astarRef;

    this.id     = data.id;
    this.name   = data.name;
    this.role   = data.role;
    this.status = data.status;
    this.taskText = data.task;
    this.model  = data.model;
    this.uptime = data.uptime;
    this.tokens = data.tokens;

    this.sprite = new AgentSprite(data.role);

    // 初始位置：先查 agent→workstation 映射，再查坐标
    const wsKey = AGENT_WORKSTATION[data.id] || data.id;
    const ws = WORKSTATIONS[wsKey];
    if (ws) {
      this.x = ws.x; this.y = ws.y;
    } else {
      this.x = 3 * 32 + 16 + Math.random() * 14 * 32;
      this.y = 3 * 32 + 28 + Math.random() * 8 * 32;
    }

    // 状态机：idle | walking | working | resting | wandering
    this.aiState    = 'idle';
    this.stateTimer = 1 + Math.random() * 3;
    this.path       = [];
    this.speed      = 80 + Math.random() * 40;
    this.wobbleX    = 0;
    this.wobbleTimer = Math.random() * Math.PI * 2;
    this._walkGoal  = null;

    // 聊天状态：null | 'thinking' | 'replying'
    this.chatStatus = null;
    this.workflowCue = null;
    this._workflowCueKey = '';

    this.sprite.setState('idle');
  }

  setWorkflowCue(cue) {
    const cueKey = cue ? `${cue.stageId}:${cue.isOwner ? 'owner' : 'member'}:${cue.blocked ? 'blocked' : 'ok'}` : '';
    if (cueKey === this._workflowCueKey) return;

    this._workflowCueKey = cueKey;
    this.workflowCue = cue || null;

    if (cue?.isOwner && (this.aiState === 'idle' || this.aiState === 'resting' || this.aiState === 'wandering')) {
      this._goToWorkstation();
      this.stateTimer = Math.min(this.stateTimer, 0.25);
    }
  }

  clearWorkflowCue() {
    this.workflowCue = null;
    this._workflowCueKey = '';
  }

  _workflowBadgeText() {
    if (!this.workflowCue) return null;
    if (this.workflowCue.blocked) return '⛔ 阻塞';
    if (this.workflowCue.isOwner) return `🧩 ${this.workflowCue.cueLabel}`;
    return `⏳ ${this.workflowCue.stageLabel}`;
  }

  syncData(data) {
    this.name   = data.name;
    this.role   = data.role;
    this.status = data.status;
    this.taskText = data.task;
    this.model  = data.model;
    this.uptime = data.uptime;
    this.tokens = data.tokens;
    // 状态驱动行为：真实 working → 尽快去工位
    if (data.status === 'working' && this.aiState === 'idle') {
      this.stateTimer = 0; // 触发立即行动
    }
  }

  update(dt) {
    this.sprite.update(dt);
    this.stateTimer -= dt;

    switch (this.aiState) {
      case 'idle':
        if (this.stateTimer <= 0) this._goToWorkstation();
        break;
      case 'walking':
        this._followPath(dt);
        break;
      case 'working':
        this.wobbleTimer += dt * 8;
        this.wobbleX = Math.sin(this.wobbleTimer) * 0.8;
        if (this.stateTimer <= 0) this._startRest();
        break;
      case 'resting':
        if (this.stateTimer <= 0) this._startWander();
        break;
      case 'wandering':
        this._followPath(dt);
        break;
    }

    this.status = this.aiState === 'working' ? 'working' : 'idle';
  }

  _goToWorkstation() {
    const wsKey = AGENT_WORKSTATION[this.id] || this.id;
    const ws = WORKSTATIONS[wsKey];
    if (!ws) { this._startIdle(3); return; }
    const path = this._astar.findPath(this.x, this.y, ws.x, ws.y);
    if (path && path.length > 0) {
      this.path = path;
      this.aiState = 'walking';
      this.sprite.setState('walk_right');
      this._walkGoal = 'workstation';
    } else {
      this._startWork();
    }
  }

  _startWander() {
    const ts = CONFIG.tileSize;
    for (let i = 0; i < 30; i++) {
      const tx = 1 + Math.floor(Math.random() * (this._map.width - 2));
      const ty = 1 + Math.floor(Math.random() * (this._map.height - 2));
      if (!this._map.isWalkable(tx, ty)) continue;
      const gx = tx * ts + ts / 2;
      const gy = ty * ts + ts - 4;
      const path = this._astar.findPath(this.x, this.y, gx, gy);
      if (path && path.length > 0) {
        this.path = path;
        this.aiState = 'wandering';
        this.sprite.setState('walk_right');
        this._walkGoal = 'wander';
        return;
      }
    }
    this._startIdle(2);
  }

  _startWork() {
    this.aiState = 'working';
    this.stateTimer = 5 + Math.random() * 10;
    this.wobbleX = 0;
    this.sprite.setState('working');
  }

  _startRest() {
    this.aiState = 'resting';
    this.stateTimer = 2 + Math.random() * 4;
    this.wobbleX = 0;
    this.sprite.setState('idle');
  }

  _startIdle(duration) {
    this.aiState = 'idle';
    this.stateTimer = duration || (3 + Math.random() * 5);
    this.wobbleX = 0;
    this.sprite.setState('idle');
  }

  _followPath(dt) {
    if (this.path.length === 0) {
      if (this._walkGoal === 'workstation') this._startWork();
      else this._startRest();
      return;
    }
    const target = this.path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.sprite.setState('walk_right', dx < -1);
    if (dist < 4) {
      this.x = target.x; this.y = target.y;
      this.path.shift();
    } else {
      const step = this.speed * dt;
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  render(ctx, selectedId) {
    const rx = Math.round(this.x + this.wobbleX);
    const ry = Math.round(this.y);
    const ps = CONFIG.pixelScale;
    const colors = ROLE_COLORS[this.role] || ROLE_COLORS.default;

    // 选中光晕
    if (selectedId === this.id) {
      ctx.save();
      ctx.shadowColor = colors.primary;
      ctx.shadowBlur = 18;
      ctx.fillStyle = colors.primary + '22';
      ctx.fillRect(rx - 12*ps/2, ry - 16*ps, 12*ps, 16*ps);
      ctx.restore();
    }

    if (this.workflowCue) {
      const pulse = 0.45 + 0.25 * Math.sin(Date.now() / 220);
      ctx.save();
      ctx.strokeStyle = this.workflowCue.blocked ? '#ef4444' : (this.workflowCue.accentColor || colors.primary);
      ctx.lineWidth = this.workflowCue.isOwner ? 3 : 1.5;
      ctx.globalAlpha = this.workflowCue.isOwner ? pulse + 0.25 : 0.35;
      ctx.beginPath();
      ctx.ellipse(rx, ry + 2, this.workflowCue.isOwner ? 22 : 18, this.workflowCue.isOwner ? 10 : 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.sprite.render(ctx, rx, ry);

    // 名称标签
    ctx.save();
    ctx.font = `bold 9px 'Monaco', monospace`;
    ctx.textAlign = 'center';
    const lw = ctx.measureText(this.name).width + 8;
    const ly = ry - 16*ps - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(rx - lw/2, ly, lw, 13);
    ctx.fillStyle = colors.primary;
    ctx.fillText(this.name, rx, ly + 9);
    ctx.restore();

    const workflowBadge = this._workflowBadgeText();
    if (workflowBadge) {
      ctx.save();
      ctx.font = `bold 8px 'Monaco', monospace`;
      ctx.textAlign = 'center';
      const badgeW = ctx.measureText(workflowBadge).width + 10;
      const badgeY = ly - (this.chatStatus ? 30 : 16);
      ctx.fillStyle = this.workflowCue?.blocked ? 'rgba(239,68,68,0.9)' : 'rgba(59,130,246,0.9)';
      ctx.beginPath();
      ctx.roundRect?.(rx - badgeW/2, badgeY, badgeW, 12, 4) ?? ctx.fillRect(rx - badgeW/2, badgeY, badgeW, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(workflowBadge, rx, badgeY + 9);
      ctx.restore();
    }

    // 聊天状态浮标（在名称上方）
    if (this.chatStatus) {
      const t = Date.now();
      const dots = '.'.repeat(Math.floor(t / 400) % 4);
      const statusText = this.chatStatus === 'thinking'
        ? `💭 思考中${dots}`
        : `✍️ 回复中${dots}`;
      ctx.save();
      ctx.font = `bold 8px 'Monaco', monospace`;
      ctx.textAlign = 'center';
      const sw = ctx.measureText(statusText).width + 10;
      const sy2 = ly - 16;
      // 动态呼吸透明度
      const alpha = 0.7 + 0.3 * Math.sin(t / 300);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.chatStatus === 'thinking' ? 'rgba(99,102,241,0.85)' : 'rgba(34,197,94,0.85)';
      ctx.beginPath();
      ctx.roundRect?.(rx - sw/2, sy2, sw, 12, 4) ?? ctx.fillRect(rx - sw/2, sy2, sw, 12);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.fillText(statusText, rx, sy2 + 9);
      ctx.restore();
    }

    // 状态指示灯
    const bx = rx + 16, by = ry - 16*ps - 4;
    if (this.aiState === 'working') {
      ctx.save();
      ctx.fillStyle = '#27AE60';
      ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI*2); ctx.fill();
      const pulse = (Math.sin(Date.now() / 280) + 1) / 2;
      ctx.fillStyle = 'rgba(39,174,96,0.3)';
      ctx.beginPath(); ctx.arc(bx, by, 4 + pulse*5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    } else if (this.aiState === 'walking' || this.aiState === 'wandering') {
      ctx.save();
      ctx.fillStyle = '#F39C12';
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  hitTest(px, py) {
    const ps = CONFIG.pixelScale;
    const hw = 12*ps/2, hh = 16*ps;
    return px >= this.x - hw && px <= this.x + hw &&
           py >= this.y - hh && py <= this.y;
  }
}

// ─── 瓦片地图（20×15，640×480）──────────────────────────────────────

class TileMap {
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this._defineTiles();
    this._buildMap();
  }

  _defineTiles() {
    // Helper: draw pixel detail
    const px = (ctx, x, y, ts) => {};
    this.tiles = [
      // 0: 地板（深色地板砖，带接缝）
      { walkable: true, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = '#263545'; ctx.fillRect(x+1, y+1, ts-2, ts-2);
        // 砖缝
        ctx.fillStyle = '#182230'; ctx.fillRect(x, y, ts, 1); ctx.fillRect(x, y, 1, ts);
        // 高光点
        ctx.fillStyle = '#2e3f54'; ctx.fillRect(x+6, y+6, 3, 3);
      }},
      // 1: 墙（砖块纹理）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#4a5568'; ctx.fillRect(x, y, ts, ts);
        // 砖块行
        const row = Math.floor(y / ts) % 2;
        const brickH = 10, brickW = 16;
        ctx.fillStyle = '#374151';
        for (let by = 2; by < ts-2; by += brickH+1) {
          const offset = (by/11 % 2 === 0) ? (row * 8) : 0;
          for (let bx = -offset; bx < ts; bx += brickW+1) {
            ctx.fillRect(x+bx+1, y+by+1, brickW-1, brickH-1);
          }
        }
        // 顶部高光
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x, y, ts, 2);
      }},
      // 2: 开发桌（带显示器）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 桌面
        ctx.fillStyle = '#7d5a2a'; ctx.fillRect(x+2, y+16, ts-4, ts-18);
        ctx.fillStyle = '#9b7a3a'; ctx.fillRect(x+3, y+17, ts-6, 4);
        // 显示器
        ctx.fillStyle = '#111827'; ctx.fillRect(x+6, y+4, 20, 13);
        ctx.fillStyle = '#1e40af'; ctx.fillRect(x+7, y+5, 18, 11);
        // 屏幕光
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(x+8, y+6, 6, 2);
        ctx.fillStyle = '#60a5fa'; ctx.fillRect(x+8, y+9, 10, 1);
        ctx.fillStyle = '#93c5fd'; ctx.fillRect(x+8, y+11, 8, 1);
        // 显示器支架
        ctx.fillStyle = '#374151'; ctx.fillRect(x+14, y+17, 4, 2);
        // 键盘
        ctx.fillStyle = '#374151'; ctx.fillRect(x+8, y+20, 16, 5);
        ctx.fillStyle = '#4b5563'; ctx.fillRect(x+9, y+21, 14, 3);
        // 鼠标
        ctx.fillStyle = '#4b5563'; ctx.fillRect(x+24, y+21, 4, 5);
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x+25, y+22, 2, 2);
      }},
      // 3: 会议桌（深红木纹）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = '#6b2020'; ctx.fillRect(x+1, y+1, ts-2, ts-2);
        ctx.fillStyle = '#7f2828'; ctx.fillRect(x+2, y+2, ts-4, ts-4);
        // 木纹
        ctx.fillStyle = '#8b3030'; ctx.fillRect(x+4, y+6, ts-8, 2);
        ctx.fillStyle = '#8b3030'; ctx.fillRect(x+4, y+14, ts-8, 2);
        ctx.fillStyle = '#8b3030'; ctx.fillRect(x+4, y+22, ts-8, 2);
        // 高光
        ctx.fillStyle = '#c44040'; ctx.fillRect(x+2, y+2, ts-4, 2);
      }},
      // 4: 植物（绿植）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 花盆
        ctx.fillStyle = '#92400e'; ctx.fillRect(x+9, y+22, 14, 8);
        ctx.fillStyle = '#b45309'; ctx.fillRect(x+10, y+23, 12, 6);
        // 叶子层
        ctx.fillStyle = '#166534'; ctx.fillRect(x+6, y+14, 20, 10);
        ctx.fillStyle = '#15803d'; ctx.fillRect(x+8, y+10, 16, 10);
        ctx.fillStyle = '#16a34a'; ctx.fillRect(x+10, y+6, 12, 10);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(x+12, y+4, 8, 8);
        // 高光
        ctx.fillStyle = '#4ade80'; ctx.fillRect(x+14, y+5, 3, 3);
      }},
      // 5: 书架（带书）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 框架
        ctx.fillStyle = '#92400e'; ctx.fillRect(x+2, y+1, ts-4, ts-2);
        ctx.fillStyle = '#78350f'; ctx.fillRect(x+3, y+2, ts-6, ts-4);
        // 书本（颜色各异）
        const books = ['#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#be185d'];
        books.forEach((c, i) => {
          ctx.fillStyle = c; ctx.fillRect(x+4+i*4, y+4, 3, 10);
          ctx.fillStyle = '#fff'; ctx.fillRect(x+4+i*4, y+4, 3, 1);
        });
        // 第二排书
        const books2 = ['#0284c7','#ea580c','#15803d','#9333ea','#e11d48'];
        books2.forEach((c, i) => {
          ctx.fillStyle = c; ctx.fillRect(x+4+i*4, y+17, 3, 10);
        });
        // 隔板
        ctx.fillStyle = '#92400e'; ctx.fillRect(x+2, y+15, ts-4, 2);
        ctx.fillStyle = '#92400e'; ctx.fillRect(x+2, y+27, ts-4, 2);
      }},
      // 6: 服务器/机柜
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 机箱
        ctx.fillStyle = '#374151'; ctx.fillRect(x+4, y+2, ts-8, ts-4);
        ctx.fillStyle = '#4b5563'; ctx.fillRect(x+5, y+3, ts-10, ts-6);
        // LED 指示灯
        [[0,'#22c55e'],[1,'#22c55e'],[2,'#3b82f6'],[3,'#f59e0b'],[4,'#22c55e'],
         [5,'#22c55e'],[6,'#10b981'],[7,'#ef4444']].forEach(([i, c]) => {
          ctx.fillStyle = c; ctx.fillRect(x+6, y+5+i*3, 3, 2);
        });
        // 插槽线
        ctx.fillStyle = '#1f2937';
        for (let i = 0; i < 8; i++) ctx.fillRect(x+10, y+4+i*3, ts-15, 1);
        // 散热口
        ctx.fillStyle = '#374151'; ctx.fillRect(x+5, y+26, ts-10, 4);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = '#1f2937'; ctx.fillRect(x+7+i*4, y+27, 2, 2); }
      }},
      // 7: 咖啡机
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 机体
        ctx.fillStyle = '#1f2937'; ctx.fillRect(x+6, y+6, 20, 22);
        ctx.fillStyle = '#374151'; ctx.fillRect(x+7, y+7, 18, 20);
        // 显示屏
        ctx.fillStyle = '#0f172a'; ctx.fillRect(x+10, y+9, 12, 6);
        ctx.fillStyle = '#0d9488'; ctx.fillRect(x+11, y+10, 10, 4);
        ctx.fillStyle = '#2dd4bf'; ctx.fillRect(x+12, y+11, 4, 2);
        // 按钮
        ctx.fillStyle = '#22c55e'; ctx.fillRect(x+10, y+17, 4, 3);
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(x+16, y+17, 4, 3);
        // 杯子托盘
        ctx.fillStyle = '#374151'; ctx.fillRect(x+8, y+26, 16, 2);
        // 杯子
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(x+13, y+22, 6, 4);
        ctx.fillStyle = '#7c3aed'; ctx.fillRect(x+14, y+23, 4, 2);
      }},
      // 8: 窗户（墙上）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#4a5568'; ctx.fillRect(x, y, ts, ts);
        // 窗框
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x+3, y+3, ts-6, ts-6);
        // 玻璃（外景：蓝天）
        ctx.fillStyle = '#1e3a5f'; ctx.fillRect(x+4, y+4, ts-8, ts-8);
        ctx.fillStyle = '#2563eb'; ctx.fillRect(x+4, y+4, ts-8, 8);
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(x+4, y+5, ts-8, 5);
        // 云
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x+6, y+6, 6, 3); ctx.fillRect(x+8, y+5, 4, 2);
        // 十字窗格
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x+15, y+4, 2, ts-8); ctx.fillRect(x+4, y+15, ts-8, 2);
      }},
      // 9: 白板（空白）
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 白板框
        ctx.fillStyle = '#374151'; ctx.fillRect(x+2, y+2, ts-4, ts-4);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(x+3, y+3, ts-6, ts-6);
        // 板书内容
        ctx.fillStyle = '#1e40af'; ctx.fillRect(x+5, y+7, 12, 1); // 蓝字
        ctx.fillStyle = '#1e40af'; ctx.fillRect(x+5, y+11, 8, 1);
        ctx.fillStyle = '#dc2626'; ctx.fillRect(x+15, y+9, 8, 1); // 红字
        ctx.fillStyle = '#15803d'; ctx.fillRect(x+5, y+15, 14, 1); // 绿字
        ctx.fillStyle = '#1e40af'; ctx.fillRect(x+5, y+19, 10, 1);
        // 磁性笔槽
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x+3, y+ts-6, ts-6, 3);
      }},
      // 10: 沙发/休息区
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 沙发座垫
        ctx.fillStyle = '#44403c'; ctx.fillRect(x+2, y+14, ts-4, ts-16);
        ctx.fillStyle = '#57534e'; ctx.fillRect(x+3, y+15, ts-6, ts-18);
        // 靠背
        ctx.fillStyle = '#44403c'; ctx.fillRect(x+2, y+8, ts-4, 8);
        ctx.fillStyle = '#57534e'; ctx.fillRect(x+3, y+9, ts-6, 6);
        // 扶手
        ctx.fillStyle = '#44403c'; ctx.fillRect(x+2, y+10, 5, 16);
        ctx.fillStyle = '#44403c'; ctx.fillRect(x+ts-7, y+10, 5, 16);
        // 抱枕
        ctx.fillStyle = '#7c3aed'; ctx.fillRect(x+8, y+12, 6, 8);
        ctx.fillStyle = '#9333ea'; ctx.fillRect(x+9, y+13, 4, 6);
        // 腿
        ctx.fillStyle = '#292524'; ctx.fillRect(x+4, y+ts-5, 4, 4); ctx.fillRect(x+ts-8, y+ts-5, 4, 4);
      }},
      // 11: 地毯（会议区用）
      { walkable: true, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1a2535'; ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = '#1e3050'; ctx.fillRect(x+1, y+1, ts-2, ts-2);
        // 花纹
        ctx.fillStyle = '#2d4a7a'; ctx.fillRect(x+4, y+4, ts-8, ts-8);
        ctx.fillStyle = '#1e3050'; ctx.fillRect(x+8, y+8, ts-16, ts-16);
        ctx.fillStyle = '#3b6199'; ctx.fillRect(x+6, y+6, 2, 2); ctx.fillRect(x+ts-8, y+6, 2, 2);
        ctx.fillStyle = '#3b6199'; ctx.fillRect(x+6, y+ts-8, 2, 2); ctx.fillRect(x+ts-8, y+ts-8, 2, 2);
      }},
      // 12: 走廊/过道（略亮地板）
      { walkable: true, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#243040'; ctx.fillRect(x, y, ts, ts);
        ctx.fillStyle = '#2c3b50'; ctx.fillRect(x+1, y+1, ts-2, ts-2);
        ctx.fillStyle = '#1c2838'; ctx.fillRect(x, y, ts, 1); ctx.fillRect(x, y, 1, ts);
        ctx.fillStyle = '#344560'; ctx.fillRect(x+12, y+12, 8, 8);
      }},
      // 13: 台灯/落地灯
      { walkable: false, render: (ctx, x, y, ts) => {
        ctx.fillStyle = '#1e2a38'; ctx.fillRect(x, y, ts, ts);
        // 灯罩
        ctx.fillStyle = '#b45309'; ctx.fillRect(x+8, y+4, 16, 8);
        ctx.fillStyle = '#d97706'; ctx.fillRect(x+10, y+5, 12, 6);
        // 灯光（发光效果）
        ctx.fillStyle = 'rgba(251,191,36,0.25)'; ctx.fillRect(x+6, y+10, 20, 10);
        ctx.fillStyle = 'rgba(251,191,36,0.1)'; ctx.fillRect(x+4, y+18, 24, 8);
        // 灯杆
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x+15, y+12, 2, 14);
        // 底座
        ctx.fillStyle = '#374151'; ctx.fillRect(x+10, y+26, 12, 4);
        ctx.fillStyle = '#4b5563'; ctx.fillRect(x+11, y+27, 10, 2);
      }},
    ];
  }

  _buildMap() {
    // 地图 30×22 (960×704)
    // 图例: W=墙 F=地板 D=开发桌 M=会议桌 P=植物 S=书架 V=服务器 C=咖啡机 N=窗户 B=白板 O=沙发 R=地毯 L=走廊 T=台灯
    const W=1, F=0, D=2, M=3, P=4, S=5, V=6, C=7, N=8, B=9, O=10, R=11, L=12, T=13;
    this.map = [
      //  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], // 0
      [W, S, S, W, N, W, N, W, N, W, F, F, F, F, F, F, W, N, W, N, W, N, W, F, F, F, F, F, F, W], // 1
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 2
      [W, F, F, F, F, D, F, F, D, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 3
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, D, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 4
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 5
      [W, F, F, W, W, W, W, W, W, W, W, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 6
      [W, F, F, W, R, R, R, R, R, R, R, W, F, F, F, F, F, F, F, F, F, F, F, B, B, F, V, V, F, W], // 7
      [W, F, F, W, R, M, M, M, M, M, R, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, V, V, F, W], // 8
      [W, F, F, W, R, M, F, F, F, M, R, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 9
      [W, F, F, W, R, M, F, F, F, M, R, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 10
      [W, F, F, W, R, M, M, M, M, M, R, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 11
      [W, F, F, W, R, R, R, R, R, R, R, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, P, W], // 12
      [W, F, F, W, W, W, F, W, W, W, W, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 13
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 14
      [W, F, F, F, F, D, F, F, D, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 15
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 16
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 17
      [W, O, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, C, F, T, F, P, F, W], // 18
      [W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W], // 19
      [W, S, S, W, N, W, N, W, N, W, F, F, F, F, F, F, W, N, W, N, W, N, W, F, F, F, F, F, F, W], // 20
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], // 21
    ];
  }

  isWalkable(tx, ty) {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return false;
    return this.tiles[this.map[ty][tx]].walkable;
  }

  render(ctx, cam) {
    const ts = this.tileSize;
    const startX = cam ? Math.max(0, Math.floor(cam.x / ts) - 1) : 0;
    const startY = cam ? Math.max(0, Math.floor(cam.y / ts) - 1) : 0;
    const viewW  = cam ? CONFIG.canvasWidth  / cam.zoom : CONFIG.canvasWidth;
    const viewH  = cam ? CONFIG.canvasHeight / cam.zoom : CONFIG.canvasHeight;
    const endX   = cam ? Math.min(this.width,  Math.ceil((cam.x + viewW) / ts) + 1) : this.width;
    const endY   = cam ? Math.min(this.height, Math.ceil((cam.y + viewH) / ts) + 1) : this.height;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        this.tiles[this.map[y][x]].render(ctx, x*ts, y*ts, ts);
      }
    }
  }
}

  return { AgentSprite, PlayerSprite, AgentEntity, TileMap };
}
