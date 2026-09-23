<div class="pi-hero pi-hero--single">
  <div class="pi-hero__main">
    <p class="pi-kicker">PI AGENT / LEARNING NOTE</p>
    <h1>Pi Agent<br><span>拆解</span></h1>
  </div>
</div>

## 拆解路线

先建立 Pi Agent 的整体地图，再沿着一次任务的完整流程向下追踪：理解执行循环如何推进，模型调用如何被统一，工具如何被定义和约束，消息与事件如何传递，上下文如何被组织与压缩，最后回到会话如何保存、恢复和继续执行。

## 目录

1. [Pi Agent三层架构](three-layer-architecture.md)
   梳理模型层、Agent Runtime 与编程工具层之间的职责边界和调用路径。

2. [Agent Loop从最简到叠加](agent-loop.md)
   从最简循环出发，逐层理解模型如何提出工具调用、工具结果如何回到上下文，以及消息队列和停止条件如何让循环继续或结束。

3. [从 `streamSimple()` 看懂 Pi Agent 的模型调用](model-call.md)
   顺着模型调用链路，理解 Pi 如何统一 Provider 路由、流式事件、Thinking Level、缓存和错误处理。
