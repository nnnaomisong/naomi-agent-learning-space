# Pi 的事件驱动系统

Pi 的事件驱动系统有两条通道：`session.subscribe` 和扩展系统的 `pi.on`。

`session.subscribe` 主要用来观察 Agent 的运行状态，例如更新 UI、记录日志和转发流式内容。Agent 通知 listener 之后就会继续运行，不会读取它的返回值。`pi.on` 则接在关键处理节点上，Agent 会等待 handler 完成，并根据返回值拦截工具、修改上下文或改写工具结果。下面先看 Pi 会产生哪些事件，再看这些事件怎样进入两条通道。

## Agent Core 会产生哪些基础事件

Pi 在 Agent Core 中定义了 10 种基础 `AgentEvent`。这些事件分布在 Agent、Turn、Message 和 Tool Execution 四层运行结构中：

```text
Agent
├── agent_start
└── agent_end

Turn
├── turn_start
└── turn_end

Message
├── message_start
├── message_update
└── message_end

Tool Execution
├── tool_execution_start
├── tool_execution_update
└── tool_execution_end
```

这 10 种事件不是彼此独立的状态，而是四层互相嵌套的生命周期。

最外层的 `agent_start` 和 `agent_end` 表示一次 Agent 运行的开始与结束。一次运行中可以包含多个 Turn，每个 Turn 使用 `turn_start` 和 `turn_end` 标出边界。Turn 可以简单理解为模型生成一次 assistant 响应，并完成这条响应中要求执行的工具调用。

Message 层记录消息的产生过程。`message_start` 表示一条消息开始，`message_end` 表示这条消息已经完成。如果是模型正在流式生成的 assistant 消息，中间还会反复出现 `message_update`，每次携带一部分新增内容。用户消息和工具结果通常已经是完整内容，因此不需要逐段更新。

Tool Execution 层只在模型要求调用工具时出现。`tool_execution_start` 表示工具已经开始运行，`tool_execution_update` 携带执行过程中的部分结果，例如命令行工具不断产生的新输出，`tool_execution_end` 则给出最终结果以及是否出错。

所以，一次包含工具调用的运行过程可能是这样的：

```text
agent_start
└── turn_start
    ├── message_start
    ├── message_update × N
    ├── message_end
    ├── tool_execution_start
    ├── tool_execution_update × N
    ├── tool_execution_end
    └── turn_end
└── 下一次 turn_start ...
agent_end
```

这些事件把 Agent 内部正在发生的事情整理成一条可以被外部读取的运行轨迹。源码中的 [`AgentEvent` 联合类型](https://github.com/earendil-works/pi/blob/main/packages/agent/src/types.ts#L443-L465)规定了每种事件的名称和需要携带的数据。

## 通道 A `session.subscribe`：观察 Agent 的运行状态

公开的 Session 监听器类型很简单：

```ts
type AgentSessionEventListener =
    (event: AgentSessionEvent) => void;
```

`AgentSession._emit()` 的实现也只是遍历已经注册的监听器：

```ts
private _emit(event: AgentSessionEvent): void {
    for (const listener of this._eventListeners) {
        listener(event);
    }
}
```

它会调用 listener，但不会读取 listener 的返回值。如果传入的是异步函数，返回的 Promise 也不会进入 Agent 的控制流程。因此，下面这种写法可以记录工具执行结果，却不能改变工具是否执行：

```ts
session.subscribe((event) => {
    if (event.type === "tool_execution_end") {
        console.log(
            `${event.toolName}: ${event.isError ? "失败" : "成功"}`
        );
    }
});
```

`subscribe()` 会返回一个取消订阅函数。某个页面、连接或临时任务不再需要监听时，调用这个函数就能移除对应的 listener，避免同一段逻辑被重复执行。

这条通道适合流式界面、日志、SSE 转发和用量统计。Agent 只负责发出“工具执行结束”这个事件，至于终端显示一行文字，还是服务器把事件推给浏览器，都由监听器决定。

如果监听器里有异步写库或网络请求，需要自己处理错误。Agent 不会等待这项工作，也不会接住被忽略 Promise 中的异常。

通道 A 收到的也不只有 Agent Core 定义的 10 种事件。到了 AgentSession 这一层，还会加入 `queue_update`、`compaction_start`、`compaction_end`、`auto_retry_start` 等与产品运行状态有关的事件。它们不描述模型生成了哪条消息，而是告诉 UI 或外部程序：队列变了、系统正在压缩上下文，或者一次自动重试开始了。完整类型可以在 [`AgentSessionEvent`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts#L167-L211) 中看到。

这里还有几个名称相近的结束事件需要区分。`message_end` 只说明一条消息结束，一次任务中可能出现多次；`agent_end` 表示一次底层 Agent 运行结束，但之后还可能发生自动重试、上下文压缩或队列处理。如果产品需要在整次任务完成后关闭 SSE、恢复输入框或写入最终状态，更适合监听 `agent_settled`。它表示相关的自动处理已经全部结束。

## 通道 B `pi.on`：在流程中设置检查点

`pi.on` 属于扩展系统，所以这段代码要写在 Pi 加载的 extension 里。扩展启动时拿到 `pi` 对象，再用 `pi.on("事件名", handler)` 注册自己关心的处理节点。

注册时，`pi.on` 会把 handler 按事件名保存到每个扩展自己的 Map 中。省略取消注册等细节后，主要逻辑是：

```ts
const list = extension.handlers.get(event) ?? [];
list.push(handler);
extension.handlers.set(event, list);
```

事件发生时，`ExtensionRunner` 会找到对应的 handlers，再按扩展和注册顺序逐个执行。这里使用了 `await`，所以上一个 handler 没完成，下一个不会开始。

几个常用的干预位置可以先这样理解：

| 事件 | 触发位置 | handler 可以做什么 |
| --- | --- | --- |
| `input` | 用户输入进入系统后 | 处理或改写输入 |
| `before_agent_start` | Agent 正式运行前 | 调整提示词或加入消息 |
| `context` | 每次调用模型前 | 修改发给模型的消息 |
| `tool_call` | 工具执行前 | 检查并阻止工具调用 |
| `tool_result` | 工具执行后 | 修改交回给模型的工具结果 |

这些事件是 Pi 在对应位置主动触发的扩展 Hook。它们不是前面 10 种基础 `AgentEvent`，因此 `session.subscribe` 收不到。

扩展事件大致有三种处理方式：

- 通知型事件会等待 handler 完成，但不使用返回值。
- 决策型事件会等待并读取返回值，例如 `tool_call` 可以返回 `block`。
- Transform 型事件会把前一个 handler 的修改交给后一个继续处理，例如 `context` 和 `tool_result`。

## 一个事件在两条通道里怎样接上

对于前面 10 种共享的基础事件，AgentSession 的 `_handleAgentEvent()` 会先等待扩展通道 B，再通知公开通道 A：

```ts
await this._emitExtensionEvent(event); // 通道 B
this._emit(event);                     // 通道 A
```

基础事件先进入通道 B，并不是让扩展决定它能不能继续，而是让扩展也收到这条运行消息。这样，扩展就能知道 Agent 何时开始、消息是否还在生成、工具何时执行结束。随后，通道 A 会把同一条消息通知给 UI、日志和其他 Session 外部代码。两条通道收到的内容可能完全相同，只是通知的对象不同。

不过，并不是 Pi 中的所有事件都会沿着 `B → A` 走。按照事件产生的位置，可以分成三种情况：

| 事件类型 | 经过的通道 | 例子 |
|---|---|---|
| Agent Core 产生的基础生命周期事件 | 先 B，后 A | `agent_start`、`message_update`、`tool_execution_end` |
| 扩展专用的 Hook | 只走 B | `input`、`context`、`tool_call`、`tool_result` |
| 部分 AgentSession 自己产生的通知 | 只走 A | `queue_update`、`entry_appended` |

上面的两行代码解释的是第一种情况：同一个基础事件先让 B 的扩展处理，完成后再通知 A。它不是 B 处理完以后产生了一个新的 A 事件，也不是只有 B 放行，事件才会进入 A。后两种事件只走一条通道，是因为框架在对应位置只调用了那条通道的派发方法。换句话说，事件走哪条路，不由事件名称自动决定，而由产生事件的那段源码决定。[`_handleAgentEvent()` 的源码](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts#L925-L950)可以看到基础事件的派发顺序。

## 一次工具调用（多个事件）怎样穿过两条通道

假设模型准备调用一个危险的 `delete_table` 工具。

工具还没有执行时，Pi 会进入 `beforeToolCall`，再调用 `ExtensionRunner.emitToolCall()`。扩展可以在这里注册检查逻辑：

```ts
export default function guardExtension(pi) {
    pi.on("tool_call", async (event) => {
        if (event.toolName === "delete_table") {
            return {
                block: true,
                reason: "不允许删除生产环境的数据表"
            };
        }
    });
}
```

`emitToolCall()` 会等待每个 handler。如果某个 handler 返回 `block: true`，它会立即返回，不再执行后面的 handler，工具也不会启动。源码中的[工具 Hook 接线](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts#L548-L607)和 [`emitToolCall()` 的短路逻辑](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/runner.ts#L1094-L1110)就是这样实现的。

`tool_call` handler 外层没有普通通知事件使用的错误隔离。如果安全检查扩展抛出异常，错误会打断正常的放行路径，工具不会在检查失败后继续执行。可以把它理解成门禁系统：无法确认权限时，门保持关闭。

如果扩展没有拦截，放行结果会返回 Agent Core，由 Agent Core 真正调用工具。这里不是“从 B 进入 A，再由 A 调用工具”，因为通道 A 只负责接收通知，不负责执行。完整过程可以写成：

```text
模型提出工具调用
    ↓
通道 B：tool_call 检查是否允许执行
    ├── 拦截：工具不执行
    └── 放行：Agent Core 调用工具
                    ↓
             产生工具执行事件
                    ↓
        先通知通道 B，再通知通道 A
```

工具开始运行后，会依次产生：

```text
tool_execution_start
tool_execution_update × N
tool_execution_end
```

这些是共享的生命周期事件。每个事件都会先交给通道 B 的扩展监听器，再交给通道 A 的 `session.subscribe` 监听器。此时工具已经开始执行，通道 A 可以更新 UI 或记录日志，但监听器再返回 `{ block: true }` 也没有作用。

因此，名字相近的两个事件处在不同的位置：

```text
tool_call
= 执行前的检查点，可以阻止执行

tool_execution_start
= 工具开始后的状态通知，只能观察
```

## 做自己的 Agent 时，通常不用修改 Agent Loop

事件名决定“什么时候可以介入”，handler 决定“到了这里具体做什么”。

要给 Agent 增加日志，可以订阅 `tool_execution_end`；要限制危险工具，可以给 `tool_call` 注册 handler；要在模型请求前加入课程资料或项目说明，可以使用 `context`。这些逻辑都放在 Agent Loop 外部。

判断应该使用哪条通道，只需要先问一个问题：

> 这段代码需要改变 Agent 接下来要做的事吗？

如果只想知道发生了什么，用 `session.subscribe`。如果需要拦截、改写或做出决定，用扩展里的 `pi.on`。

核心流程负责提供稳定的运行步骤和插入位置，具体 Agent 要表现成什么样，可以由外部扩展补上。这也是 Pi 事件驱动系统在实际开发中最有用的地方。

## 源码参考

- [Pi 官方仓库](https://github.com/earendil-works/pi)
- [Agent 基础事件类型](https://github.com/earendil-works/pi/blob/main/packages/agent/src/types.ts#L443-L465)
- [AgentSession 的事件分发](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts#L925-L950)
- [扩展注册实现](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts#L250-L266)
- [ExtensionRunner 派发逻辑](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/runner.ts#L958-L984)
