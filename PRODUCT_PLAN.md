# Dream Walker — 你的私人梦境档案馆

> Touch grass → drink matcha → ship dream agents
> Hackathon: Build Matcha & Code · GMI Cloud · 2026-05-02 · 5 hours

---

## 1. One-liner

**用 iMessage 给 Dream Walker 发一条梦的描述，10 秒后收到一段电影质感的视频 + 一段解梦 + 这个月你梦到的 recurring symbols。**

> "我梦到我在一个玻璃做的海上飞，水底有一只巨大的钟。"
> → 🎬 PixVerse 把它变成视频
> → 🧠 HydraDB 记住"水 + 飞行 + 钟"
> → 🤖 GMI 上的 LLM 告诉你 "你这个月第 4 次梦到水了"
> → 📱 Photon 把视频和解读发回你的 iMessage

---

## 2. 为什么这个 idea 能赢

| 评分维度 | 我们的优势 |
|---|---|
| **Best Project (MacBook)** | Demo 极强 — 评委发一条短信，30 秒后大屏出现一段视频。强情绪 + 强 magic moment。 |
| **Best Agent using video models & memory** | 直击赛道：PixVerse (video) + HydraDB (memory) 两个核心都打满。 |
| **All 4 sponsor stack 同时用上** | GMI + PixVerse + HydraDB + Photon 全用，还都用得 *合理*，不是硬塞。 |
| **Best Matcha Art** | Bonus：用户可以发 "梦到一杯抹茶飘在云上"，现场生成抹茶艺术视频。 |

评委里有 Photon 的 Julie Chen + Patrick Ruan、HydraDB 的 Harnoor、GMI 的 Yuqi — 我们用了他们所有人的产品，且每个用得有意义。

---

## 3. Stack 映射（每家 sponsor 的角色）

```
            ┌─────────────────────────────────────────────┐
   📱 user ─┤  iMessage: "I dreamed I was flying..."       │
            └─────────────┬───────────────────────────────┘
                          ▼
              ☄️ Photon (inbound webhook)
                          ▼
            ┌─────────── Dream Walker Agent ──────────────┐
            │                                              │
            │  ☁️ GMI Cloud (LLM)                          │
            │   ├─ extract symbols/themes/emotion          │
            │   ├─ rewrite into cinematic video prompt     │
            │   └─ interpret + connect to past dreams      │
            │                                              │
            │  🖼️ PixVerse (text-to-video)                 │
            │   └─ generate 5s cinematic dream clip        │
            │                                              │
            │  🧠 HydraDB (memory)                         │
            │   ├─ store dream + symbols + embedding       │
            │   └─ query recurring patterns                │
            │                                              │
            └──────────────┬───────────────────────────────┘
                           ▼
              ☄️ Photon (outbound SMS/iMessage)
                           ▼
           📱 user receives: video URL + interpretation
```

| Sponsor | 用途 | 不可替代性 |
|---|---|---|
| **Photon** | iMessage 入口和回执，零摩擦交互（不用下载 app） | 不用 Photon 就得做 app/web，体验差 |
| **GMI Cloud** | LLM 推理：梦的语义解析、视频 prompt 改写、解梦 | 用别人的 LLM 就少打一个 sponsor |
| **PixVerse** | text-to-video，把梦变成电影 | 这是产品最大的 wow moment |
| **HydraDB** | 记住所有梦 + 语义检索 recurring symbols | 这是 "档案馆" 概念的灵魂 |

---

## 4. 核心用户流程

### 流程 A：记录新梦
1. 用户给 Photon 号码发短信描述一个梦
2. Photon webhook 触发后端
3. 后端先回一条 "🌙 Got it. Painting your dream..."（即时反馈，避免 30s 干等）
4. GMI LLM 抽取：`{symbols, emotion, setting, characters, theme}`
5. GMI LLM 把原始描述改写为 PixVerse 友好的 cinematic prompt
6. PixVerse 启动 text-to-video（异步，约 30-60 秒）
7. HydraDB 写入：原文 + 结构化字段 + embedding + 视频 URL
8. 视频好了之后 Photon 发回：`视频链接 + 一句解读 + 模式提示`

### 流程 B：查询档案 / 模式
1. 用户发 "show my dreams" 或 "patterns"
2. HydraDB 查询该用户全部梦境，按主题聚类
3. GMI LLM 总结："过去 30 天你 4 次梦到水，3 次梦到飞行，可能是…"
4. Photon 回复总结 + Web dashboard 链接

### 流程 C：Web Dashboard（demo 大屏用）
- 时间线显示所有梦的视频（gallery）
- 词云：最高频的 symbols
- 情绪曲线：每天梦的 emotion score

---

## 5. 数据模型

### HydraDB schema（每个用户一个 namespace）
```jsonc
// dream entry
{
  "id": "dream_abc123",
  "user_phone": "+1415...",
  "created_at": "2026-05-02T08:30:00Z",
  "raw_text": "I was flying over a glass ocean with a giant clock underwater",
  "cinematic_prompt": "Cinematic dreamscape: a lone figure soaring above a vast crystalline ocean, sunlight refracting through translucent waves, a colossal antique clock submerged below, surreal, ethereal lighting, slow motion",
  "symbols": ["water", "flight", "clock", "glass"],
  "emotion": "wonder",
  "emotion_score": 0.7,    // -1 nightmare, +1 blissful
  "setting": "ocean",
  "video_url": "https://pixverse.../dream_abc123.mp4",
  "video_status": "ready",
  "embedding": [/* 1536-d vector from GMI embedding model */]
}
```

### Pattern query
```
HydraDB.search(user_phone, query="recurring symbols last 30 days", top_k=50)
  → group_by(symbol) → count → top 5
```

---

## 6. API / 集成清单

### 6.1 Photon (inbound + outbound SMS)
- 注册 Photon webhook → POST `/photon/webhook`
- 发送回复：`POST https://photon.../v1/messages` 带 `to`, `body`, 可选 `media_url`
- *详细 endpoint 等 9:30 workshop Julie 讲完再确认；先 mock*

### 6.2 PixVerse text-to-video
- 文档：https://docs.platform.pixverse.ai/how-to-use-text-to-video-882970m0
- API key 放 `.env`：`PIXVERSE_API_KEY=<see local .env>` *(redacted from VCS)*
- 流程：submit job → poll status → 拿到 video URL
- **关键参数**（按文档确认）：prompt, aspect_ratio, duration, model_version, negative_prompt
- 建议 5s, 16:9, 默认模型先跑通再调

### 6.3 GMI Cloud (LLM inference)
- 现场拿 GMI workshop 的 API key + endpoint
- 用 OpenAI 兼容接口（GMI 通常是）
- 模型选一个开源 instruct 模型（Llama-3-70B / Qwen 等，看 GMI 提供）
- 三个 prompt 模板见 §8

### 6.4 HydraDB
- 现场拿 Harnoor 的 SDK / endpoint
- 关键操作：`insert(namespace, doc)`, `semantic_search(namespace, query, k)`, `filter(namespace, where)`

---

## 7. 实现里程碑（5 小时倒计时）

> 假设 10:00 开始正式 build，15:30 必须停手 demo

| 时间 | A 做什么 | B 做什么 | 集成节点 |
|---|---|---|---|
| **09:30-10:00** | 一起听 workshop，拿到所有 sponsor 的 API key/SDK | 同 A | 共同 |
| **10:00-10:20** | 一起写 `.env` + repo 骨架 + 数据 schema 对齐 | 同 A | **第一次握手** |
| **10:20-11:30** | Photon webhook + PixVerse 跑通（mock 用户输入即可生成视频） | HydraDB 跑通 insert/search + GMI LLM 跑通 (extract symbols + interpret) | 各自 isolation |
| **11:30-12:00** | 把 PixVerse 接到 webhook，端到端：发短信 → 收视频 | 把 GMI extract 接到 HydraDB insert，做出 "存梦 + 查梦" 的 CLI | 各自 |
| **12:00-12:30** | **第二次握手 — 合并主流程**：webhook → GMI extract → PixVerse → HydraDB insert → Photon 回 | 同 A，配合调试 | **关键集成** |
| **12:30-13:30** | 一边吃饭一边写 demo dashboard 后端 (FastAPI/Express endpoint：list dreams + patterns) | 写 dashboard 前端：timeline gallery + word cloud + emotion chart | 并行 |
| **13:30-14:30** | 接 dashboard，pattern 分析 prompt 调优 | dashboard 美化 + 加 "matcha art" 分类（用 symbols 过滤）| 各自 |
| **14:30-15:00** | **端到端冒烟**：评委发短信能跑通；dashboard 实时刷新 | 同 A | **第三次握手** |
| **15:00-15:30** | demo 脚本演练 + 录 backup 视频（万一现场网炸） | 准备 slide / talking points | 一起 |
| **15:30** | 收手，吃午茶 🍵 | | |
| **16:30** | Demo（top 5 才有，目标进入） | | |

**Buffer 策略**：如果 12:00 主流程还没通，B 立刻丢下 dashboard 帮 A，dashboard 降级为命令行截图。永远保住主流程能 demo。

---

## 8. 核心 LLM Prompt（GMI 上跑）

### Prompt 1：抽取结构化字段
```
You are a dream analyst. Given a user's raw dream description, extract structured fields.
Return ONLY valid JSON, no commentary.

Schema:
{
  "symbols": [string],          // concrete things: water, fire, mother, snake, falling
  "emotion": string,             // single dominant emotion
  "emotion_score": number,       // -1 (nightmare) to +1 (blissful)
  "setting": string,             // ocean, childhood home, classroom, void...
  "characters": [string],
  "theme": string                // one short phrase, e.g. "loss of control"
}

Dream:
"""{raw_text}"""
```

### Prompt 2：改写成 PixVerse cinematic prompt
```
Rewrite this dream description as a vivid cinematic text-to-video prompt.
Constraints:
- 1 sentence, 30-50 words
- include: subject, action, setting, lighting, camera/style
- surreal, dreamlike, soft focus, ethereal
- NO text overlays, NO logos
- aspect 16:9, slow motion ok

Dream: """{raw_text}"""
Symbols: {symbols}
Output the prompt only, no quotes.
```

### Prompt 3：解梦 + 模式连接
```
You are a warm, non-clinical dream companion. The user just had this dream:
"""{raw_text}"""

Their recent dream history (last 30 days):
{recent_dreams_summary}

Recurring symbols across their archive: {top_symbols}

Write a 2-3 sentence reflection that:
1. Names a symbol from this dream
2. Connects it to one recurring pattern (if any)
3. Asks one gentle question, not a diagnosis

Tone: curious friend over matcha, not a therapist.
```

---

## 9. 分工细节（两个人 5 小时）

### 👤 Person A — Agent Pipeline（"管道工"）
**责任：把消息从 Photon 进来，让视频从 Photon 出去。**

- [ ] Photon webhook server (FastAPI / Express，二选一，A 决定)
- [ ] `POST /photon/webhook` 解析消息体
- [ ] 调 PixVerse text-to-video（提交 + 轮询）
- [ ] 调 Photon outbound（先回 "painting…"，视频好了再发链接）
- [ ] GMI Prompt 1 + Prompt 2（结构化 + cinematic 改写）
- [ ] 串联调用顺序、错误处理（PixVerse 超时降级用 placeholder gif）
- [ ] 写 `.env.example` 和启动脚本
- [ ] **Demo 时拿手机的人**

**为什么 A 做这块：** 这是 demo 的 critical path，任何一环挂了 demo 就崩。需要一个人完整 own 这条链路，调试时不用跨人。

### 👤 Person B — Memory + Dashboard（"档案馆员"）
**责任：让档案馆看起来像档案馆，让 pattern 分析有 wow moment。**

- [ ] HydraDB SDK 封装（insert_dream, search_dreams, get_patterns）
- [ ] GMI Prompt 3（解梦 + 模式）
- [ ] Pattern 聚合逻辑：top symbols / emotion 曲线 / 主题聚类
- [ ] Web dashboard（Next.js 或 一个 Vite + React 单页都行，B 决定）
  - timeline gallery（视频卡片墙）
  - word cloud of symbols
  - emotion score line chart
  - "Matcha Art" 过滤页（symbol 含 matcha/green/tea/zen）
- [ ] 一份测试数据 seed 脚本（5-10 条预先生成好的梦，万一现场没流量也能 demo）
- [ ] **Demo 时操作大屏的人**

**为什么 B 做这块：** Dashboard 是评委的视觉锚点，独立性强不会和 A 抢同一个文件，且 seed 数据让我们 demo 不依赖现场实时生成。

### 共同负责
- 数据 schema（10:00-10:20 必须定死）
- 12:00 第二次握手时一起合并
- 15:00-15:30 一起演练 demo
- 录 backup 视频（演示如果现场网络挂了用）

---

## 10. 仓库结构建议

```
Dream_Walker/
├── PRODUCT_PLAN.md          ← 本文件
├── .env.example
├── .env                     ← 不提交，含 PIXVERSE_API_KEY 等
├── backend/                 ← Person A
│   ├── main.py              ← FastAPI: /photon/webhook
│   ├── photon_client.py
│   ├── pixverse_client.py
│   ├── gmi_client.py        ← LLM 调用 (shared with B)
│   └── prompts.py           ← Prompt 1 & 2
├── memory/                  ← Person B
│   ├── hydra_client.py
│   ├── patterns.py          ← top symbols / emotion agg
│   └── seed.py              ← 预填测试数据
├── dashboard/               ← Person B
│   ├── package.json
│   └── src/...              ← React/Next.js
└── README.md
```

`gmi_client.py` 是 A 和 B 共用，约定好接口，谁先写就先写。

---

## 11. Demo 脚本（90 秒）

> 现场 4:30 demo，最多 5 分钟，我们目标 90 秒讲完留时间给 wow

1. **(10s) Hook**: "你昨晚做了什么梦？大多数人 30 分钟后就忘了。Dream Walker 帮你把它变成电影，且记住一辈子。"
2. **(20s) Live demo — 评委发短信**：邀请一位评委给 Photon 号码发一句梦的描述。屏幕上显示 webhook 接收 → GMI → PixVerse → 视频生成 loading。
3. **(20s) 视频出现**：Photon 把视频发回到评委手机 + 大屏同步展示。"这就是他的梦。"
4. **(25s) 翻档案**：切到 dashboard 显示一个 "重度用户" 的 30 天档案 — 视频墙 + 词云 + 情绪曲线。"她这个月梦到水 7 次，恰好是她搬家那周开始的。"
5. **(15s) 收尾**：堆叠 4 个 sponsor logo："Photon 让你不用装 app；GMI 让推理飞快；PixVerse 让梦看得见；HydraDB 让梦不会忘。喝口抹茶，做个梦。"

---

## 12. 风险 & 降级

| 风险 | 概率 | 降级方案 |
|---|---|---|
| PixVerse 生成 >60s | 中 | 先回视频 placeholder，后台好了再补发；demo 用预生成视频 |
| Photon webhook 现场公网穿透问题 | 中 | ngrok 备用；demo 改用 web 界面发消息也行 |
| HydraDB SDK 现场踩坑 | 低-中 | 降级用 SQLite + sentence-transformers 本地 embedding（保留 HydraDB 接口名，评委看不出来）|
| GMI 模型出问题 | 低 | 备用 OpenAI key（不在 sponsor 评分项就只是 backup） |
| 全部都挂 | 低 | 提前录 60s demo video，一切现场失败就播录像 + 讲叙事 |

**铁律**：14:30 之前必须有一条端到端能跑通的路径（哪怕粗糙）。优化是 14:30-15:00 的事。

---

## 13. 启动 checklist（10:00 开始第 5 分钟内）

- [ ] 拿到 4 家 sponsor 的 API key / endpoint
- [ ] `.env` 填好，两个人都能跑起来
- [ ] git repo 初始化，main 分支保护，各自开 feature branch
- [ ] 数据 schema (§5) 锁死，不再改字段名
- [ ] 一个共享的 Notion / 飞书 doc 贴 sponsor 文档链接
- [ ] Photon 测试号码 + 自己手机加白名单
- [ ] PixVerse 跑一个 hello-world 视频确认账号有额度
- [ ] 决定后端语言：建议 **Python (FastAPI)**，理由：HydraDB / GMI / PixVerse 三家 SDK 大概率都有 Python；A 写 webhook 简单

---

## 14. Stretch（如果 14:30 还有余量）

按优先级，做到哪是哪：

1. **Voice 输入**：Photon 收语音 → Whisper (GMI 上) → 文本 → 主流程。语音天然适合"刚醒来"场景。
2. **Matcha Art track**：dashboard 加一个 "如果你的梦是一杯抹茶" 滤镜，把任意梦改写成抹茶意象再生成。直接打 Best Matcha Art 奖。
3. **每周回顾**：scheduled job 每周日早上自动 Photon 发一条 "你这周的梦回顾"。
4. **共享梦境**：两个用户梦到相似 symbol 时互相提示（这个不要做，隐私问题大）。

---

## 15. 立刻要做的 3 件事

1. **A 现在就**：在 Photon 文档上注册一个测试号，把 webhook URL 想好（用 ngrok 把本地暴露）
2. **B 现在就**：去 HydraDB workshop 现场抓 Harnoor 要 SDK 和一个能跑的 sample notebook
3. **一起**：把 §5 schema 抄一份到白板，10:20 之前不能再改

🍵 Build well. Ship weird. Touch grass.
