# Naomi 的 Agent 学习空间

**在线阅读：[https://nnnaomisong.github.io/naomi-agent-learning-space/](https://nnnaomisong.github.io/naomi-agent-learning-space/)**

记录我学习 AI Agent 的过程：一边拆解 Pi Agent 源码，一边整理 CMU 11-768 AI Agents 课程笔记，把概念、调用链路和实现细节放在一起理解。

## 内容导航

### Pi Agent 源码拆解

沿着一次任务的完整流程，从整体架构走到执行循环、模型与工具调用，再理解消息、事件、上下文和会话如何协作。

| 主题 | 主要内容 |
| --- | --- |
| [三层架构](docs/pi-agent/three-layer-architecture.md) | 模型层、Agent Runtime 与编程工具层的职责和调用关系 |
| [Agent Loop](docs/pi-agent/agent-loop.md) | 执行循环、工具结果回写、消息队列与停止条件 |
| [模型调用](docs/pi-agent/pi-agent-model-call-blog.md) | 从 `streamSimple()` 理解 Provider 路由、流式事件与错误处理 |
| [工具调用](docs/pi-agent/tool-call.md) | 参数验证、Hook、工具执行，以及顺序与并行调用 |
| [消息传递](docs/pi-agent/message-flow.md) | Agent 内部消息、LLM 消息与上下文转换 |
| [事件驱动系统](docs/pi-agent/event-driven-system.md) | `session.subscribe`、`pi.on` 与扩展对执行流程的介入 |
| [上下文工程](docs/pi-agent/context-engineering.md) | 系统提示词、工具输出截断、上下文压缩与分支摘要 |
| [上下文压缩](docs/pi-agent/compaction.md) | 触发条件、历史切分、摘要更新与上下文重建 |
| [会话管理](docs/pi-agent/session-storage-and-recovery.md) | JSONL 存储、树形历史、分支切换与会话恢复 |

建议从[拆解路线](docs/pi-agent/index.md)开始，按表格顺序阅读，也可以直接进入感兴趣的主题。

### CMU 课程笔记

以 CMU 11-768 AI Agents（2026）为线索，对照 Pi Agent 的实现，补充课程中更一般的设计思路和研究方法。

| 主题 | 主要内容 |
| --- | --- |
| [工具调用](docs/cmu/tool-use.md) | CodeAct、约束解码、XGrammar、REST API 与 MCP，以及工具调用评测 |
| [上下文管理](docs/cmu/context-management.md) | KV cache、中段遗忘、混合注意力、缓存复用与上下文压缩评测 |

课程笔记入口：[CMU 课程笔记](docs/cmu/index.md)。

## 站点实现

站点使用 **MkDocs + Material for MkDocs** 构建，以 Markdown 编写笔记，支持全文搜索、代码高亮和 Mermaid 流程图，并通过 GitHub Actions 部署到 GitHub Pages。

```text
.
├── docs/
│   ├── index.md            # 站点首页
│   ├── pi-agent/           # Pi Agent 源码拆解
│   ├── cmu/                # CMU 课程笔记
│   ├── stylesheets/        # 自定义样式
│   └── javascripts/        # Mermaid 初始化脚本
├── mkdocs.yml             # 站点配置与导航
├── requirements.txt       # Python 依赖
└── .github/workflows/
    └── deploy.yml         # 构建与部署工作流
```

## 本地预览

准备 Python 3 环境后，克隆仓库并安装依赖：

```bash
git clone https://github.com/nnnaomisong/naomi-agent-learning-space.git
cd naomi-agent-learning-space

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

python -m mkdocs serve
```

启动后访问 [http://127.0.0.1:8000/](http://127.0.0.1:8000/) 预览站点。上面的虚拟环境激活命令适用于 macOS / Linux；Windows PowerShell 使用 `.\.venv\Scripts\Activate.ps1`。

构建并检查文档：

```bash
python -m mkdocs build --strict --site-dir site
```

## 更新与部署

1. 在 `docs/` 下新增或修改 Markdown 笔记。
2. 新增页面时，在 `mkdocs.yml` 的 `nav` 中补充导航。
3. 本地预览并通过严格构建检查后，将修改推送到 `main` 分支。

仓库中的 [GitHub Actions 工作流](.github/workflows/deploy.yml) 会自动构建并发布站点，也支持在 Actions 页面手动触发部署。
