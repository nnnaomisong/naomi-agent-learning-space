# 从 `streamSimple()` 看懂 Pi Agent 的模型调用

前面看 Agent Loop 时，我一直觉得“调用模型”应该很简单：把对话发给 LLM，拿到回复，再决定继续调用工具还是结束。代码看起来也只有一行：

```ts
const stream = streamSimple(model, context, { reasoning: "high" });
```

但继续看 Pi 的 `packages/ai` 后，我才发现，真正复杂的不是 Agent Loop，而是下面这一层“模型适配”。Claude、GPT、Gemini 等 Provider 的消息格式、流式返回、thinking 参数、缓存方式都不一样。如果这些差异全部塞进 Agent Loop，核心循环很快就会变成大量 `if provider === ...`。

Pi 的做法是把这些差异隔离起来，让 Agent Loop 永远只面对自己的统一接口。

## 1. 整体调用链

```text
Agent Loop
   ↓
streamSimple()
   ↓  处理 reasoning、maxTokens 等便捷配置
stream()
   ↓  根据 model.api 找到对应 Provider
provider.stream()
   ↓  Pi 格式 → Provider API 格式
真实模型 API
   ↓  Provider 私有流 → Pi 统一事件
AssistantMessageEventStream
   ↓
Agent Loop：for await (...) 消费事件
```

其中 `streamSimple()` 是上层常用的便捷入口，`stream()` 更接近统一路由入口，而真正负责某一家 API 翻译工作的，是 Provider 自己的 `stream()`。

## 2. 统一的不是实现，而是协议

Pi 没有要求所有 Provider 继承同一个巨大基类，而是定义了 `StreamFunction` 这样的函数类型。它的核心可以理解成：

```ts
(model, context, options?) => AssistantMessageEventStream
```

也就是说，Provider 内部可以完全不同：OpenAI 可以用 SDK，其他 Provider 可以自己处理 SSE，只要最后都接收统一输入，并返回统一事件流即可。

这和 Java 里的 interface 很像：我不关心你内部怎么实现，只关心你对外是不是遵守同一个 contract。

## 3. 为什么 Agent Loop 看不到 Provider 差异？

因为 Pi 又定义了一套统一事件协议。模型输出主要被整理成：

```text
start
text_start → text_delta → text_end
thinking_start → thinking_delta → thinking_end
toolcall_start → toolcall_delta → toolcall_end
done / error
```

所以 Agent Loop 只需要：

```ts
for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      // 更新文字
      break;
    case "toolcall_end":
      // 得到完整工具调用
      break;
    case "done":
      // 本轮模型调用结束
      break;
    case "error":
      // 统一处理错误
      break;
  }
}
```

Anthropic 原本叫什么事件、OpenAI 的 chunk 长什么样，都已经在 translator 里被翻译掉了。Agent Loop 只认识 Pi 自己的事件。

事件里的 `partial` 也很重要。它表示当前 assistant message 已经生成到什么状态。Agent Loop 不需要自己把 text、thinking、tool call 的增量一点点拼起来，而是可以直接用当前 `partial` 更新最后一条 assistant message。

## 4. Provider translator 真正在做什么？

可以把一个 translator 的工作拆成五步：创建 client、把 Pi 的 `context` 转成 Provider 请求、发送请求、读取流式响应、再把响应转回 Pi event。真正麻烦的是第二步和第四步，因为这两处最容易遇到“方言差异”。

比如同样是一条用户消息，有的 API 用 `content`，有的用 `parts`；同样是流式回复，有的 SDK 已经给出结构化 chunk，有的则需要自己解析 SSE。Pi 并不要求这些实现统一，只要求 translator 最后都交出 `AssistantMessageEventStream`。所以 `provider.stream()` 可以理解成整个第三层真正干活的双向翻译器。

## 5. `streamSimple()` 为什么比 `stream()` 更方便？

不同 Provider 对“多想一点”的参数设计不同。上层如果直接操作原生 API，就必须知道每家的具体字段。

Pi 把它统一成自己的 ThinkingLevel。上层只要写：

```ts
reasoning: "high"
```

具体模型再通过自己的映射表转换成真正的 Provider 参数；如果当前模型不支持这个档位，还可以通过 `clampThinkingLevel()` 回退到可用级别。

缓存也是同一个思路。Pi 对上层只暴露：

```ts
"none" | "short" | "long"
```

至于底层到底是 `cache_control`、`cachePoint`，还是其他机制，由 Provider 自己处理。这里我觉得最值得记住的一句话是：**上层统一语义，底层分散实现。**

## 6. 错误也被翻译成统一事件

模型调用可能因为网络、API、认证或用户主动取消而失败。Pi 的 Provider 实现不会让这些运行阶段错误直接把 Agent Loop 的控制流打断，而是把它们整理成 `error` event，并把 `stopReason` 统一成 `error` 或 `aborted`。

这样 Agent Loop 看到的始终是一条事件流：

```text
正常：start → ... → done
失败：start → ... → error
```

成功和失败都走同一套协议，上层逻辑就会简单很多。

## 7. 新模型为什么不需要改 Agent Loop？

如果以后接入一个新的 API，主要工作不是改 Agent Loop，而是增加新的 Provider adapter：

```text
Pi Context
   ↓
新 Provider translator
   ↓
新模型 API
   ↓
新 Provider translator
   ↓
AssistantMessageEventStream
```

只要新的 translator 遵守 `StreamFunction` 和统一事件协议，Agent Loop 仍然只需要消费同一种 event stream。

现在再看最开始那一行：

```ts
streamSimple(model, context)
```

**也就是说** Agent Loop 只负责说“用这个模型处理这段对话”，模型抽象层负责处理“到底怎么和这个 Provider 说话”。

这也是我觉得 Pi 这部分最值得学习的地方：真正好的抽象，不是让所有实现变得一样，而是让核心逻辑不需要知道它们哪里不一样。

## 参考源码

- [Pi `compat.ts`：模型调用入口与 Provider 路由](https://github.com/earendil-works/pi/blob/main/packages/ai/src/compat.ts)
- [Pi `types.ts`：`StreamFunction`、统一事件、ThinkingLevel、CacheRetention](https://github.com/earendil-works/pi/blob/main/packages/ai/src/types.ts)
- [Pi `agent-loop.ts`：Agent Loop 如何消费事件流并更新 `partial`](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)
- [Pi `openai-completions.ts`：Provider 的请求、流式解析与错误事件](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/openai-completions.ts)
- [Pi 新增 LLM Provider 指南](https://github.com/earendil-works/pi/blob/main/.pi/skills/add-llm-provider.md)
