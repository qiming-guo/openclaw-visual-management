export function createRuntimeClasses({ CONFIG, ROLE_COLORS }) {
  class AStar {
    constructor(tileMap) { this.map = tileMap; }

    findPath(startPixelX, startPixelY, goalPixelX, goalPixelY) {
      const ts = this.map.tileSize;
      const sx = Math.floor(startPixelX / ts);
      const sy = Math.floor(startPixelY / ts);
      const gx = Math.floor(goalPixelX / ts);
      const gy = Math.floor(goalPixelY / ts);

      if (!this.map.isWalkable(gx, gy)) return null;
      if (sx === gx && sy === gy) return [];

      const key = (x, y) => `${x},${y}`;
      const open = new Map();
      const closed = new Set();
      const gScore = new Map();
      const fScore = new Map();
      const parent = new Map();
      const h = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

      gScore.set(key(sx, sy), 0);
      fScore.set(key(sx, sy), h(sx, sy));
      open.set(key(sx, sy), { x: sx, y: sy });

      const dirs = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
      ];

      let iters = 0;
      while (open.size > 0 && iters++ < 2000) {
        let bestKey = null; let bestF = Infinity;
        for (const [k] of open) {
          const f = fScore.get(k) ?? Infinity;
          if (f < bestF) { bestF = f; bestKey = k; }
        }

        const cur = open.get(bestKey);
        open.delete(bestKey);

        if (cur.x === gx && cur.y === gy) {
          const path = [];
          let k = bestKey;
          while (parent.has(k)) {
            const [nx, ny] = k.split(',').map(Number);
            path.unshift({ x: nx * ts + ts / 2, y: ny * ts + ts - 4 });
            k = parent.get(k);
          }
          return path;
        }

        closed.add(bestKey);

        for (const { dx, dy } of dirs) {
          const nx = cur.x + dx; const ny = cur.y + dy;
          const nk = key(nx, ny);
          if (closed.has(nk) || !this.map.isWalkable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0) {
            if (!this.map.isWalkable(cur.x + dx, cur.y) || !this.map.isWalkable(cur.x, cur.y + dy)) continue;
          }
          const tentG = (gScore.get(bestKey) ?? Infinity) + (dx !== 0 && dy !== 0 ? 1.414 : 1);
          if (tentG < (gScore.get(nk) ?? Infinity)) {
            parent.set(nk, bestKey);
            gScore.set(nk, tentG);
            fScore.set(nk, tentG + h(nx, ny));
            open.set(nk, { x: nx, y: ny });
          }
        }
      }
      return null;
    }
  }

  class GameLoop {
    constructor(updateFn, renderFn) {
      this.updateFn = updateFn;
      this.renderFn = renderFn;
      this.lastTime = 0;
      this.deltaTime = 0;
      this.fps = 0;
      this.frameCount = 0;
      this.fpsTimer = 0;
      this.running = false;
      this.paused = false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this._loop.bind(this));
    }

    stop() { this.running = false; }

    _loop(now) {
      if (!this.running) return;
      this.deltaTime = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.frameCount++;
      this.fpsTimer += this.deltaTime;
      if (this.fpsTimer >= 1.0) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsTimer = 0;
        document.getElementById('fps-info').textContent = this.fps;
      }
      if (!this.paused) this.updateFn(this.deltaTime);
      this.renderFn();
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  class Camera {
    constructor() {
      this.x = 0; this.y = 0;
      this.zoom = 1.0;
      this.dragging = false;
      this.dragStartX = 0; this.dragStartY = 0;
      this.dragCamStartX = 0; this.dragCamStartY = 0;
    }

    begin(ctx) {
      ctx.save();
      ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom, -this.y * this.zoom);
    }

    end(ctx) { ctx.restore(); }

    screenToWorld(sx, sy) {
      return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
    }

    setZoom(z, mapW, mapH) {
      const pivotSx = CONFIG.canvasWidth / 2;
      const pivotSy = CONFIG.canvasHeight / 2;
      const worldPX = pivotSx / this.zoom + this.x;
      const worldPY = pivotSy / this.zoom + this.y;
      this.zoom = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, z));
      this.x = worldPX - pivotSx / this.zoom;
      this.y = worldPY - pivotSy / this.zoom;
      this._clamp(mapW, mapH);
    }

    _clamp(mapW, mapH) {
      const viewW = CONFIG.canvasWidth / this.zoom;
      const viewH = CONFIG.canvasHeight / this.zoom;
      if (mapW <= viewW) this.x = -(viewW - mapW) / 2;
      else this.x = Math.max(0, Math.min(this.x, mapW - viewW));
      if (mapH <= viewH) this.y = -(viewH - mapH) / 2;
      else this.y = Math.max(0, Math.min(this.y, mapH - viewH));
    }

    startDrag(sx, sy) {
      this.dragging = true;
      this.dragStartX = sx; this.dragStartY = sy;
      this.dragCamStartX = this.x; this.dragCamStartY = this.y;
    }

    moveDrag(sx, sy, mapW, mapH) {
      if (!this.dragging) return;
      this.x = this.dragCamStartX - (sx - this.dragStartX) / this.zoom;
      this.y = this.dragCamStartY - (sy - this.dragStartY) / this.zoom;
      this._clamp(mapW, mapH);
    }

    endDrag() { this.dragging = false; }
  }

  class Minimap {
    constructor(mapRef, minimapCanvas) {
      this.map = mapRef;
      this.canvas = minimapCanvas;
      this.ctx = minimapCanvas.getContext('2d');
      this._prerender();
    }

    _prerender() {
      const { width: mw, height: mh } = this.canvas;
      const tw = mw / this.map.width;
      const th = mh / this.map.height;
      const mc = this.ctx;
      mc.fillStyle = '#1a1a2e';
      mc.fillRect(0, 0, mw, mh);
      const tileColors = ['#2C3E50', '#566573', '#8B6914', '#7B241C', '#196F3D'];
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          mc.fillStyle = tileColors[this.map.map[y][x]] || '#2C3E50';
          mc.fillRect(x * tw, y * th, tw, th);
        }
      }
      this._base = mc.getImageData(0, 0, mw, mh);
    }

    render(agentList, playerObj, cam, mapW, mapH) {
      const { width: mw, height: mh } = this.canvas;
      const mc = this.ctx;
      mc.putImageData(this._base, 0, 0);
      const vx = (cam.x / mapW) * mw;
      const vy = (cam.y / mapH) * mh;
      const vw = (CONFIG.canvasWidth / cam.zoom / mapW) * mw;
      const vh = (CONFIG.canvasHeight / cam.zoom / mapH) * mh;
      mc.strokeStyle = 'rgba(255,255,255,0.5)';
      mc.lineWidth = 1;
      mc.strokeRect(vx, vy, vw, vh);
      for (const ag of agentList) {
        mc.fillStyle = (ROLE_COLORS[ag.role] || ROLE_COLORS.default).primary;
        mc.beginPath();
        mc.arc((ag.x / mapW) * mw, (ag.y / mapH) * mh, 2, 0, Math.PI * 2);
        mc.fill();
      }
      mc.fillStyle = '#60a5fa';
      mc.beginPath();
      mc.arc((playerObj.x / mapW) * mw, (playerObj.y / mapH) * mh, 2.5, 0, Math.PI * 2);
      mc.fill();
    }
  }

  class BubbleSystem {
    constructor() { this.bubbles = []; }

    show(agentId, text, duration = 3.5) {
      this.bubbles = this.bubbles.filter((b) => b.agentId !== agentId);
      this.bubbles.push({ agentId, text, duration, elapsed: 0, alpha: 0, lines: [] });
    }

    update(dt) {
      for (const b of this.bubbles) {
        b.elapsed += dt;
        if (b.elapsed < 0.3) b.alpha = b.elapsed / 0.3;
        else if (b.elapsed > b.duration - 0.4) b.alpha = Math.max(0, (b.duration - b.elapsed) / 0.4);
        else b.alpha = 1;
      }
      this.bubbles = this.bubbles.filter((b) => b.elapsed < b.duration);
    }

    render(ctx, agentList) {
      for (const b of this.bubbles) {
        const ag = agentList.find((a) => a.id === b.agentId);
        if (!ag) continue;
        const maxW = 130; const padding = 6; const lineH = 12; const fontSize = 10;
        if (b.lines.length === 0) {
          ctx.font = `${fontSize}px 'Monaco', monospace`;
          let line = '';
          for (const ch of b.text.split('')) {
            const test = line + ch;
            if (ctx.measureText(test).width > maxW - padding * 2) { b.lines.push(line); line = ch; }
            else line = test;
          }
          if (line) b.lines.push(line);
        }
        ctx.font = `${fontSize}px 'Monaco', monospace`;
        const textW = Math.min(maxW, Math.max(...b.lines.map((l) => ctx.measureText(l).width)) + padding * 2);
        const boxH = b.lines.length * lineH + padding * 2 + 6;
        const bx = ag.x - textW / 2;
        const by = ag.y - 16 * CONFIG.pixelScale - boxH - 18;
        const color = (ROLE_COLORS[ag.role] || ROLE_COLORS.default).primary;
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.fillStyle = 'rgba(15,15,35,0.92)';
        this._roundRect(ctx, bx, by, textW, boxH - 6, 6); ctx.fill();
        ctx.strokeStyle = `${color}cc`; ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by, textW, boxH - 6, 6); ctx.stroke();
        ctx.fillStyle = 'rgba(15,15,35,0.92)';
        ctx.beginPath();
        ctx.moveTo(ag.x - 5, by + boxH - 6); ctx.lineTo(ag.x + 5, by + boxH - 6); ctx.lineTo(ag.x, by + boxH);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `${color}cc`; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ag.x - 5, by + boxH - 6); ctx.lineTo(ag.x, by + boxH); ctx.lineTo(ag.x + 5, by + boxH - 6);
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left';
        b.lines.forEach((line, i) => ctx.fillText(line, bx + padding, by + padding + fontSize + i * lineH));
        ctx.restore();
      }
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  class CommSystem {
    constructor() {
      this.connections = [];
      this.eventTimer = 4 + Math.random() * 4;
      this.messages = {
        leader: ['架构方案已更新', '拉通一下进度', '顶层设计确认', '需要对齐一下'],
        frontend: ['组件开发完成', '样式已调整', '等待 API 接口', 'UI review 请查看'],
        backend: ['接口已就绪', '数据库迁移完成', '性能优化中', 'API 文档更新'],
        designer: ['设计稿已交付', '配色方案确认', '组件库更新', '图标已导出'],
        qa: ['测试用例编写中', '发现 2 个 bug', '回归测试通过', '性能测试完成'],
      };
    }

    trigger(fromId, toId, text, agentList, bubbleSystem) {
      const from = agentList.find((a) => a.id === fromId);
      const to = agentList.find((a) => a.id === toId);
      if (!from || !to || fromId === toId) return;
      const msgs = this.messages[from.role] || ['处理中…'];
      const msg = text || msgs[Math.floor(Math.random() * msgs.length)];
      bubbleSystem.show(fromId, msg, 3.5);
      const numP = 5 + Math.floor(Math.random() * 4);
      this.connections.push({
        fromId, toId,
        elapsed: 0, duration: 2.5,
        color: (ROLE_COLORS[from.role] || ROLE_COLORS.default).primary,
        particles: Array.from({ length: numP }, (_, i) => ({
          progress: -(i * 0.15),
          speed: 0.4 + Math.random() * 0.3,
          size: 2 + Math.random() * 2,
        })),
      });
    }

    update(dt, agentList, bubbleSystem) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0 && agentList.length >= 2) {
        this.eventTimer = 3 + Math.random() * 5;
        const idx1 = Math.floor(Math.random() * agentList.length);
        let idx2 = Math.floor(Math.random() * (agentList.length - 1));
        if (idx2 >= idx1) idx2++;
        this.trigger(agentList[idx1].id, agentList[idx2].id, null, agentList, bubbleSystem);
      }
      for (const conn of this.connections) {
        conn.elapsed += dt;
        for (const p of conn.particles) { if (p.progress < 1) p.progress += p.speed * dt; }
      }
      this.connections = this.connections.filter((c) => c.elapsed < c.duration);
    }

    render(ctx, agentList) {
      for (const conn of this.connections) {
        const from = agentList.find((a) => a.id === conn.fromId);
        const to = agentList.find((a) => a.id === conn.toId);
        if (!from || !to) continue;
        const fx = from.x; const fy = from.y - 16 * CONFIG.pixelScale * 0.5;
        const tx = to.x; const ty = to.y - 16 * CONFIG.pixelScale * 0.5;
        const fadeIn = Math.min(1, conn.elapsed / 0.3);
        const fadeOut = Math.max(0, (conn.duration - conn.elapsed) / 0.5);
        const alpha = Math.min(fadeIn, fadeOut);
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = conn.color; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
        const mx = (fx + tx) / 2; const my = (fy + ty) / 2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(15,15,35,0.85)';
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = conn.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e2e8f0';
        ctx.fillText('💬', mx, my + 3);
        ctx.globalAlpha = alpha;
        for (const p of conn.particles) {
          if (p.progress <= 0 || p.progress > 1) continue;
          const px2 = fx + (tx - fx) * p.progress;
          const py2 = fy + (ty - fy) * p.progress;
          const glow = ctx.createRadialGradient(px2, py2, 0, px2, py2, p.size * 2.5);
          glow.addColorStop(0, `${conn.color}ff`); glow.addColorStop(1, `${conn.color}00`);
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(px2, py2, p.size * 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px2, py2, p.size * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  return { AStar, GameLoop, Camera, Minimap, BubbleSystem, CommSystem };
}
