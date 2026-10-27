---
title: Pi Agent 拆解
---

<div class="pi-hero pi-hero--single">
  <div class="pi-hero__main">
    <p class="pi-kicker">PI AGENT / LEARNING NOTE</p>
    <h1>Pi Agent<br><span>拆解</span></h1>
  </div>
</div>

## 拆解路线

先建立 Pi Agent 的整体地图，再沿着一次任务的完整流程向下追踪：理解执行循环如何推进，模型调用如何被统一，工具如何被定义和约束，消息与事件如何传递，上下文如何被组织与压缩，最后回到会话如何保存、恢复和继续执行。

## 整体结构

<div class="pi-chapters">
  <a class="pi-chapter" href="three-layer-architecture/">
    <span class="pi-chapter__no">01</span>
    <span class="pi-chapter__body">
      <strong>Pi Agent三层架构</strong>
      <span>梳理模型层、Agent Runtime 与编程工具层之间的职责边界和调用路径。</span>
    </span>
  </a>
</div>

## 执行链路

<div class="pi-chapters">
  <a class="pi-chapter" href="agent-loop/">
    <span class="pi-chapter__no">02</span>
    <span class="pi-chapter__body">
      <strong>Agent Loop从最简到叠加</strong>
      <span>从最简循环出发，逐层理解模型如何提出工具调用、工具结果如何回到上下文，以及消息队列和停止条件如何让循环继续或结束。</span>
    </span>
  </a>
  <a class="pi-chapter" href="pi-agent-model-call-blog/">
    <span class="pi-chapter__no">03</span>
    <span class="pi-chapter__body">
      <strong>从 <code>streamSimple()</code> 看懂 Pi Agent 的模型调用</strong>
      <span>顺着模型调用链路，理解 Pi 如何统一 Provider 路由、流式事件、Thinking Level、缓存和错误处理。</span>
    </span>
  </a>
  <a class="pi-chapter" href="tool-call/">
    <span class="pi-chapter__no">04</span>
    <span class="pi-chapter__body">
      <strong>Pi Agent 工具调用到底发生了什么？</strong>
      <span>从 <code>ToolCall</code> 出发，拆解参数验证、前后置 Hook、工具执行、结果回写，以及顺序与并行调用背后的保护设计。</span>
    </span>
  </a>
</div>

## 消息与事件

<div class="pi-chapters">
  <a class="pi-chapter" href="message-flow/">
    <span class="pi-chapter__no">05</span>
    <span class="pi-chapter__body">
      <strong>消息在 Pi 中的传递</strong>
      <span>沿着一次 <code>!ls -la</code> 的完整路径，理解 Agent 内部消息、LLM 标准消息、上下文转换与工具结果回写如何串成循环。</span>
    </span>
  </a>
  <a class="pi-chapter" href="event-driven-system/">
    <span class="pi-chapter__no">06</span>
    <span class="pi-chapter__body">
      <strong>Pi 的事件驱动系统</strong>
      <span>对比 <code>session.subscribe</code> 与 <code>pi.on</code> 两条事件通道，理解运行状态如何被观察，以及扩展如何在关键节点拦截和改写流程。</span>
    </span>
  </a>
</div>

## 上下文与会话

<div class="pi-chapters">
  <a class="pi-chapter" href="context-engineering/">
    <span class="pi-chapter__no">07</span>
    <span class="pi-chapter__body">
      <strong>从完整链路理解 pi Agent 的上下文工程</strong>
      <span>沿着一次任务的完整链路，理解系统提示词组装、工具输出截断、上下文压缩与分支摘要如何组织模型能看到的材料。</span>
    </span>
  </a>
  <a class="pi-chapter" href="compaction/">
    <span class="pi-chapter__no">08</span>
    <span class="pi-chapter__body">
      <strong>Pi Agent 的上下文压缩：给长对话整理一份工作笔记</strong>
      <span>结合源码，理解上下文压缩的触发条件、历史消息切分、摘要生成与更新，以及压缩后如何重建上下文并保留文件索引。</span>
    </span>
  </a>
  <a class="pi-chapter" href="session-storage-and-recovery/">
    <span class="pi-chapter__no">09</span>
    <span class="pi-chapter__body">
      <strong>Pi Agent 的会话管理：一本可以换路线的工作笔记</strong>
      <span>结合源码，理解 JSONL 会话存储、树形历史与分支切换，以及恢复时如何沿当前路线重建消息、运行设置和压缩后的上下文。</span>
    </span>
  </a>
</div>
