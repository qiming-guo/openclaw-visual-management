# OpenClaw Visual Management

一个基于浏览器的可视化多 Agent 监控与工作流演示项目。当前项目以 RPG 风格地图为主界面，把 Agent 状态、会话、流程阶段、Builder 配置和运行反馈整合到一个轻量级前端里，便于演示、调试和后续产品化演进。

## 项目目标

这个项目当前主要服务于两类场景：

1. **可视化监控**
   - 以 RPG 地图的方式展示 Agent 的位置、状态、对话气泡和协作关系。
2. **工作流 / 团队 Builder 演示**
   - 在 UI 中配置团队角色、流程阶段、RPG cue，并直接启动一个可见的多阶段工作流。

当前实现同时支持：
- **Mock 模式**：本地演示、无后端依赖
- **Live 模式**：连接 OpenClaw Gateway，读取 agent / session 数据并发送消息

---

## 核心功能

### 1. RPG 风格 Agent 监控
- 地图、工位、会议区、设备区等像素风场景
- Agent 小人状态展示：空闲、工作、行走、游走、休息
- 对话气泡、协作连线、运行提示
- 摄像机缩放、拖拽、键盘移动、幽灵模式

### 2. Builder / Workflow 面板
- Team Builder：编辑角色、图标、能力标签、绑定 Agent
- Workflow Builder：编辑阶段、owner、完成信号、RPG cue、交接语
- Run Snapshot：查看当前阶段、owner、状态、进度
- Run Board：查看运行状态和阶段历史

### 3. 数据源切换
- 默认启动为 Mock 模式
- 可以切换到 OpenClaw Live 模式
- Live 模式支持：
  - Agent 列表同步
  - Session 列表同步
  - Chat 发送/接收
  - Agent 运行状态反馈

### 4. 模块化前端结构
经过重构后，项目已经不再依赖一个超大 HTML 文件，而是拆成按职责分层的模块，便于后续继续扩展和维护。

---

## 项目结构

```text
.
├── openclaw-monitor-rpg.html      # 页面壳 / 启动入口
├── README.md
├── LICENSE
├── .gitignore
├── src/
│   ├── openclaw-monitor-rpg.css   # 页面样式
│   ├── rpg-config.js              # 运行配置、颜色、工位映射
│   ├── agent-manager.js           # Agent 管理 UI 与 RPC 操作
│   ├── monitor-data.js            # Mock / Live adapter 与 DataManager
│   ├── workflow-core.js           # Workflow 领域模型与状态引擎
│   ├── workflow-panel.js          # Builder / Workflow UI 编排
│   ├── rpg-runtime.js             # AStar / GameLoop / Camera / Bubble / Comm / Minimap
│   ├── rpg-entities.js            # TileMap / Sprite / AgentEntity
│   └── rpg-scene.js               # Scene、输入事件、update/render、bootstrap orchestration
└── tests/
    ├── openclaw-monitor-syntax.test.mjs
    └── workflow-core.test.mjs
```

---

## 运行方式

### 方式一：本地预览（推荐）
由于项目使用了浏览器 ESM 模块导入，**不要直接双击 HTML 文件** 打开，建议使用本地静态服务器。

在项目根目录运行：

```bash
python3 -m http.server 4173
```

然后在浏览器里打开：

```text
http://127.0.0.1:4173/openclaw-monitor-rpg.html
```

### 启动后的默认行为
- 默认进入 **Mock 模式**
- 页面会展示 5 个默认 Agent
- 可以直接点击：
  - `🧩 启动流程`
  - `➡️ 下一阶段`
  - `🧱 Builder` 标签页查看和编辑团队 / 工作流配置

---

## Live 模式使用方法

页面顶部有：

- `🔌 连接 OpenClaw`

点击后会尝试连接 OpenClaw Gateway。

### 当前实现说明
当前 Live 模式通过前端模块中的配置连接 Gateway，代码位于：

- `src/monitor-data.js`
- 以及入口文件中传入的 `liveConfig`

当前会使用这些能力：
- `agents.list`
- `sessions.list`
- `sessions.send`
- WebSocket 事件监听（如 chat / agent 状态）

### 注意
如果本地没有可用的 OpenClaw Gateway，建议继续使用 Mock 模式进行 UI 演示与开发。

---

## 使用说明

### 地图操作
- 移动：`W / A / S / D` 或方向键
- 缩放：顶部缩放选择器
- 视角拖拽：鼠标中键或右键拖拽
- 幽灵模式：按 `G`

### 流程操作
- `🧩 启动流程`：启动一轮 workflow demo
- `➡️ 下一阶段`：推进到下一个阶段
- `🔄 重置`：重置场景和流程状态

### Chat / Session
- 侧边栏切到 `💬 聊天` / `📋 会话`
- 可以查看 session 列表
- 可以向当前选中会话发送消息

### Agent 管理
- 侧边栏切到 `🤖 Agents`
- 可对 Agent 进行新增、编辑、删除（Live 模式下可用）

### Builder
- 切到 `🧱 Builder`
- 可编辑：
  - 团队名称
  - 角色信息与绑定关系
  - 流程名称
  - 阶段配置
  - RPG cue 与交接语

---

## 开发说明

### 当前技术特点
- 原生 HTML + CSS + JavaScript ESM
- 无前端框架
- 无构建步骤
- 无额外 npm 依赖
- 适合快速演示、重构和概念验证

### 推荐开发流程
1. 使用本地静态服务器运行页面
2. 修改 `src/` 下对应模块
3. 用浏览器手动验证页面效果
4. 运行测试确认没有回归

---

## 测试

### 运行全部测试
```bash
node --test tests/*.test.mjs
```

### 当前测试覆盖
- 主页面内联模块脚本语法有效
- 页面壳是否引用了拆分出的模块
- workflow-core 的模型和状态机行为
- 默认团队模板与阶段推进逻辑
- owner 重绑定逻辑
- RPG cue / stage behavior 解析

---

## 已知限制

1. **当前更偏演示与前端原型**
   - 不是完整的生产级调度系统
2. **Builder 配置当前主要是内存态**
   - 刷新页面后不会自动持久化
3. **Live 模式依赖可用的 OpenClaw Gateway**
4. **部分真实后端闭环能力仍在继续建设中**

---

## 后续方向

当前代码结构已经支持继续沿这些方向演进：

- 真实 backend adapter 闭环
- Builder 配置持久化
- 更细粒度模块测试
- 进一步增强 RPG 行为与流程映射
- 更正式的产品化工作流配置体验

---

## 许可证

本项目使用仓库根目录中的 `LICENSE`。
