<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `learning_roadmap.json` | 最后更新: 2026-08-19 01:55:29

[~][X+] 1. ZHarness 学习计划
├── [x][Y+] 1-1. 跑通开发环境
│   ├── [x][Y+] 1-1-1. 安装依赖与核心检查
│   ├── [x][Y+] 1-1-2. 运行 headless 任务
│   └── [x][Y+] 1-1-3. 运行 Web UI demo
├── [x][Y+] 1-2. 掌握架构总览
│   ├── [x][Y+] 1-2-1. 读 docs/architecture.md
│   ├── [x][Y+] 1-2-2. 读 README 与仓库布局
│   └── [x][Y+] 1-2-3. 理解一切皆插件哲学
├── [x][Y+] 1-3. 建立 Cordis 心智模型
│   ├── [x][Y+] 1-3-1. 完成 cordis-tutorial 7 课
│   ├── [x][Y+] 1-3-2. 掌握 effects 与事件模型
│   └── [x][Y+] 1-3-3. 理解服务与配置机制
├── [x][Y+] 1-4. 按包精读核心代码
│   ├── [x][Y+] 1-4-1. 精读 packages/core 产品 API
│   ├── [x][Y+] 1-4-2. 精读一个能力包 (fs/skill/llm)
│   └── [x][Y+] 1-4-3. 用测试反向理解行为契约
├── [x][Y+] 1-5. 动手扩展与验证
│   ├── [x][Y+] 1-5-1. 按 cookbook 加一个 tool
│   ├── [x][Y+] 1-5-2. 理解 provider/Consumer 扩展点
│   └── [x][Y+] 1-5-3. 对比 upstream 验证 fork 状态
└── [~][Y+] 1-6. ZHarness 使用期：从学习转入构建
    ├── [x][Y+] 1-6-1. 真实 LLM 端到端验证：DEEPSEEK_API_KEY 跑通完整 agent loop
    ├── [x][Y+] 1-6-2. llm 能力包按需精读：遇到 llm 行为问题时带出
    ├── [x][Y+] 1-6-3. 技术方案调研分析 agent
    └── [~][Y+] 1-6-4. 技术调研 Agent 可信实验闭环与团队产品化

### 当前施工：1-6-4-3. 版本化 keyless corpus、盲测 Judge 与人工 rubric

10 个中英质量 case × 3 repetitions × 2 arms 与独立 reliability fault corpus 已入库；盲测 Judge 接口已实现，人工 rubric 及基线阈值仍待固化。

**决策：**
- Q: 人工 rubric 与 Judge 校准如何形成可执行门禁？ → 引入三个不可追改资产：rubric set、逐 case 人工 annotation set、逐报告 Judge calibration set；manifest 的每个 quality case 必须解析到 rubric 和人工真值，Judge 校准通过后才允许进入质量基线。 (第一版校准固定 10 个双语样本；比较四个 evidence 分、rubricScore、recommendationAcceptable 与 keyRisksOmitted。校准阈值属于立即执行的协议硬门禁，30 样本后的统计 SLO 仍另行冻结。)
- Q: 推荐结论如何避免被单一标准答案绑死？ → 人工 annotation 保存可接受 recommendation fingerprint 集合并允许显式 abstain，不要求唯一推荐；Judge 结果增加 recommendationAcceptable 布尔事实。 (决策有多个合理答案时，以团队约束下的可接受集合评估，不用字符串相等替代判断。)
<!-- ROADMAP_SECTION_END -->
