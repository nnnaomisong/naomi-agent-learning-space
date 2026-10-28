# CMU 11-768 Context Management for Long-Context Agents ： Agent 的上下文管理

这一讲讲的是：agent 的对话越来越长，模型、服务器和 harness 各自怎么应对。工具输出截断、compaction 摘要、cache 标记这些 harness 层的做法，Pi 篇已经讲过，这里不再重复。本篇只讲 Pi 没涉及的部分：模型内部怎么读上下文、架构和训练怎么支撑长上下文、服务器怎么管缓存，再补几个 compaction 的新观点。

## 一、上下文是线性变长的，账单却是平方涨的

假设第一次调用的输入是 6K token，之后每一步多 5K。五次调用的输入分别是 6K、11K、16K、21K、26K，每次只多 5K，这是**linear**增长。

但 API 是无状态的，每次调用都要把整段历史重新发一遍，五次加起来一共处理了 80K。调用次数翻倍，累计量大约翻四倍，这是**quadratic**增长。就像每天多读一页书，但每天都从第一页重读。

## 二、模型怎么“读”上下文：Q、K、V 和 KV cache

先想一个问题：读到“小明把苹果给了妹妹，她很开心”这句话的“她”时，你怎么知道“她”指的是妹妹？你会回头扫一遍前面的词，找出最可能被“她”指代的那个。模型也是这样做的：处理每个 token 时，都会回头看前面的 token，从中挑出有用的信息。这个动作就叫**注意力（attention）**。

为了能“回头找”，每个 token 都会准备三个向量，可以用图书馆来类比：

- **Q（query）**：我要找什么，相当于你手里的检索需求。
- **K（key）**：我能被什么需求找到，相当于书脊上的标签。
- **V（value）**：被找到后交出去的内容，相当于书里的正文。

回到“她”的例子，模型是这样做的：

1. “她”拿出自己的 Q：我在找前面提到的一个女性。
2. 前面每个词亮出自己的 K：“小明”是男性名字，“苹果”是物品，“妹妹”是女性亲属。
3. 拿 Q 和每个 K 比一比，打出相关度。“妹妹”最高，比如占 80%；“小明”占 10%；其他词加起来占 10%。
4. 按这个比例读取各个词的 V，读到的主要是“妹妹”的内容。

读完之后，“她”的含义里就带上了“指的是妹妹”。K 和 V 之所以分开，是因为“凭什么被找到”和“找到后提供什么”不是一回事。就像书脊标签上写的是“数据库”，而你真正要读的是书里的正文。

知道了 Q、K、V，再来看模型处理一次调用时的两个阶段：

- **Prefill（预填充）**：整段 prompt 已知，可以并行计算。算出所有 token 的 K、V，存进 KV cache。输入越长，等到第一个字出现的时间（TTFT，time to first token）就越长。
- **Decode（解码）**：一次只生成一个 token，只能串行。新 token 的 K、V 也追加进 cache。每一步都要把整个 cache 从显存里读一遍，所以瓶颈在显存带宽（memory bandwidth）。

**为什么只缓存 K 和 V？** 因果掩码（causal mask）规定每个 token 只能看前面的内容，后来的 token 影响不到它，所以它的 Q、K、V 算出来就不会再变。每个 token 只会用自己的 Q 提问一次，算完就用不上了；但它的 K、V 还要被后面所有 token 反复查询。只用一次的不存，要反复用的才存。

下一次调用时，服务端会去找和新请求开头**完全一致**的最长缓存。匹配上的部分直接复用，只对新增内容做 prefill。前面那个平方增长的账单，就是这样被压回线性的。

## 三、能放进去，不等于能用好

“大海捞针”（needle in a haystack）实验的做法是：在一大堆无关文章里藏一句“旧金山最好的三明治在某某店”，然后问模型这家店在哪。实验会不断变换文章长度和藏的位置。结果是 GPT-4 在文章超过约 100K、而且这句话藏在前中段时，开始找不到。放在开头和结尾的内容记得比较清楚，夹在中间的最容易被漏掉，而且上下文越长越明显。这个现象叫中段遗忘（lost in the middle）。就像读完一本厚书，你记得开头和结局，中间几章却很模糊。

这对 agent 尤其致命。用户在第 10 轮说“不要删这个文件”，当时这句话在上下文末尾；到了第 80 轮，它已经被推到中段，模型就可能看漏，把文件删掉。

## 四、模型架构：平时看白板，偶尔查档案

普通注意力里，每个 token 都要和前面所有 token 比一遍。100 万 token 就是上万亿次比较，算不起。各家的思路是一样的：给每个 token 的比较次数设一个上限。方法分两类：

- **局部层**：便宜，但看不清远处。
- **全局层**：贵，但能把远处的原话找回来。

主流开源模型都把两者按 3:1 到 5:1 交替叠起来，叫混合架构（hybrid architecture）。

**局部层有两种做法。**

- **滑动窗口注意力（sliding window attention）**：只看最近几百个 token。相邻 token 的窗口有重叠，层数一叠，远处的信息可以接力传过来。但这像传话游戏，传不远，越传越模糊。
- **线性注意力（linear attention，也叫循环类模型）**：不再存下每个 token 的 K、V，而是把历史压进一块固定大小的“白板”。课上讲的几步改进，都是在教这块白板更会记：
  - 最初的线性注意力只写不擦，字叠字。
  - DeltaNet 写之前先看一眼，有旧内容就改写。
  - Gated DeltaNet 让字会自己慢慢褪色，很久没人提的内容就淡掉了。
  - KDA（Kimi Delta Attention）给白板分区：重要的事用马克笔写，琐碎的事用粉笔写。

  Qwen、GLM、Kimi 用的是后两种。Mamba 是同一类思路的另一个分支。

**全局层就是去档案室查原件。** 稠密注意力（dense attention）是每份文件都翻一遍。稀疏注意力（sparse attention）先快速扫一遍目录卡片，挑出最相关的几千份，只精读这些。它省的是计算，文件一份没扔。

**KV 压缩（KV compression）让每份档案占的地方更小。** 注意力里有很多个“头”（attention head），可以想成很多个关注点不同的读者，每个读者需要一套自己的档案。GQA（grouped-query attention） 让几个读者共用一套，MLA（multi-head latent attention） 把每套档案存成压缩包，用的时候再解压。

## 五、长上下文模型是怎么训练出来的

**长数据太少。** 128K token 差不多是一本书，但网上大部分文本只有几千 token。所以训练要逐步拉长：先用大量短文本打基础，再用长文档继续训练，最后用 agent 轨迹和合成任务做长适配。

把十篇短文拼成一条长序列（打包序列，packed sequences）能提高训练效率，但教不会长距离依赖（long-range dependency）。这就像把一百张无关的传单订成一本书，读完也没练过“记住第一页，用来理解最后一页”。

**位置外推（length extrapolation）。** RoPE（rotary position embedding，旋转位置编码） 用“钟表”给每个 token 标位置：快针区分近处，慢针区分远处。如果训练时只见过 4K，到了 32K，慢针就会走到从没见过的角度，模型会乱。

- **PI（position interpolation，位置插值）**：把整只钟按比例调慢，远处不再越界，但近处也变模糊了。
- **YaRN**：只调慢时针，秒针保持原速，远近都照顾到。

用 NoPE（no positional encoding，不加位置编码）的模型，比如 GLM 和 Kimi，根本没有这只钟，也就不需要这一步。

**上下文并行（context parallelism）。** 序列太长，一张卡装不下，就切成几段分给几张卡，再像围着圆桌传纸一样，把 K、V 一圈圈传下去。老师就遇到过这样的情况：网上没有 Gated DeltaNet 的并行实现。新架构好用，工具却常常跟不上。

## 六、服务器怎么管缓存

- **PagedAttention（vLLM）**：解决 KV 在显存里怎么存放。做法像酒店分房：不要求一个团订一整层连续的房间，来一个人分一间，前台用登记表记下谁住哪。显存几乎不浪费，一张卡就能同时服务更多用户。
- **RadixAttention（SGLang）**：解决怎么找到可以复用的 KV。所有缓存过的对话都组织成一棵前缀树（radix tree），就像输入法的联想词，开头相同的部分只存一份。显存满了，就删掉最久没用的叶子。
- **缓存感知路由（cache-aware routing）**：服务器有很多台时，请求尽量发给存着你前缀的那台。但也要看排队情况，不能都挤到一台上。

缓存命中率（cache hit rate）能到 90%–95% 就算正常。对写 harness 的人来说，核心规则只有一条：**开头必须一字不差**。下面几个坑都会让缓存失效：

- 在 system prompt 里写入当前时间。需要时间的话，放在最后一条消息里。
- 工具列表的顺序变来变去。
- 中途频繁切换模型。KV 是模型专属的，换个模型就得从头算。

## 七、Compaction 的几个新观点

- **判断标准**：压缩好不好，不看摘要写得好不好读，而看压缩后 agent 接下来的做法有没有变。
- **锚点（anchor）原样保留**：用户的目标和约束直接复制，不交给模型用自己的话改写。
- **小心漂移（drift）**：每次压缩都是在上一次摘要的基础上重写，误差会一点点累积。“用 CUDA 12.4”先变成“12.x”，再变成“较新的版本”，最后彻底消失。就像复印件再复印。
- **评测要看真实使用**：OpenHands 的压缩算法在基准测试上分数没掉。但上线后，它忘了自己提过 PR，同一个功能重复提了 5 次；还把对话中途的用户指令压丢了。

## 小结

| 层 | 解决什么 | 一句话记住 |
| --- | --- | --- |
| 架构 | 长上下文算不起 | 平时看白板，偶尔查档案 |
| 训练 | 模型没练过往远处看 | 先短后长，调好位置钟表 |
| 服务器缓存 | 重复计算太贵 | 开头一字不差就能复用 |
| Compaction | 窗口装不下 | 锚点不动，用行为来评测 |

要注意，缓存解决的是钱和速度，并没有缩短模型要看的内容。对话照样会把窗口撑满，照样会中段遗忘，所以最后还得靠 compaction。

## 参考资料

- Graham Neubig，CMU 11-768 AI Agents（2026）第 3 讲 *Context Management for Long-Context Agents*：课程幻灯片和讲课逐字稿。文中的 OpenHands 数据和案例都来自这一讲。
- 课上引用的论文和工作，按本文出现的顺序排列：
  - Zhong et al., OSDI 2024. *DistServe*（prefill 和 decode 的划分）。
  - Kamradt, 2023. GPT-4 Needle in a Haystack 测试。
  - Liu et al., 2023. *Lost in the Middle: How Language Models Use Long Contexts*。
  - Beltagy et al., 2020. *Longformer*（滑动窗口、固定模式稀疏注意力）。
  - Katharopoulos et al., ICML 2020. *Transformers are RNNs*（线性注意力）。
  - Schlag et al., ICML 2021. *Linear Transformers Are Secretly Fast Weight Programmers*（DeltaNet）。
  - Yang et al., 2024. *Gated Delta Networks*。
  - Kimi Team, 2025. *Kimi Linear*（KDA）。
  - DeepSeek, 2025. DeepSeek Sparse Attention。
  - Ainslie et al., 2023. *GQA*。
  - DeepSeek-AI, 2024. *DeepSeek-V2*（MLA）。
  - Su et al. *RoFormer*（RoPE）。
  - Kazemnejad et al., NeurIPS 2023. NoPE 的长度泛化。
  - Chen et al., 2023. *Position Interpolation*。
  - Peng et al., ICLR 2024. *YaRN*。
  - Liu et al., 2023. *Ring Attention*（上下文并行）。
  - Kwon et al., SOSP 2023. *PagedAttention*（vLLM）。
  - Zheng et al., 2023. *SGLang*（RadixAttention）。
