# 验收标准

P0 已执行[隔离 seam 与协议 fixture](evidence/p0-offline-2026-11-11.md)。[P2 证据](evidence/p2-offline-2026-11-11.md)记录合成 OAuth、凭据、目录和设置页的观察范围。按[测试入口](../test/README.md)复跑，按[证据模板](evidence/README.md)逐项记为 pass、fail、blocked 或 not-run。mandatory 用例全部通过后才进入发布判定。

[P2 双宿主报告](evidence/p2-host-2026-11-11.md)记录离线包的实际安装和设置页观察。L5、U1、R1 的真实账号部分仍待验。

[P3 首轮证据](evidence/p3-offline-2026-11-11.md)记录 Responses 适配器在发布版 DSH LLM route 上的合成观察。[P3 隔离宿主证据](evidence/p3-native-2026-11-11.md)补充原生审批、文件沙箱、宿主重试及 JSONL 会话恢复，覆盖 T4、L3 和 L4 的本轮场景。

[P3 离线验收矩阵](evidence/p3-acceptance-2026-11-11.md)记录 W1–W6、T1–T4、L1–L4 的同包复跑结果，以及 Web、Desktop 与真实账号的后续验收边界。

## 自动化与协议（mandatory）

| ID | 场景／操作 | 可观察通过条件 |
|---|---|---|
| A1 | 首次注册与后续登录 | 首次 dynamic ID＋真实 name＋稳定 host；issued ID 用于换 token/aud/后续复用；重启 host ID 不变 |
| A2 | state/nonce/PKCE/issuer/aud/JWKS/expiry 异常及 callback 重放 | 每项独立失败；无凭据提交、无推理；监听 socket 和 timer 关闭 |
| A3 | 只授身份、缺 direct scope、错误 resource/workspace | 可解释的非 ready 状态；模型请求不发出；不默认其他 token 或 backend-api |
| A4 | 两进程同时发现过期，真实 backing 下刷新 | 仅一次有效轮转；第二进程重读新记录；无丢写；网络／落盘异常不分发未提交 token |
| A5 | refresh 与 logout、切账号、卸载竞争 | 退出后无 grant 复活、旧账号请求和目录失效；异步提交校验 generation |
| A6 | 拒绝登录、超时、取消、重复 begin、端口占用 | 状态准确、资源释放、无隐藏重试；下一次合法登录可正常开始 |
| C1 | 官方 models[] fixture 与未知字段 | slug/display_name/visibility 正确映射；只显示 list、保留服务器排序；不错误依赖 data[]；不伪造模型 ID／context |
| C2 | 空目录、hidden／不可用模型、401/403/429、过期缓存 | 行为按官方 visibility 语义；无跨账号缓存；区分 auth、准入、quota、rate limit |
| C3 | 登录／登出／账号切换更新目录 | GUI 重载完整 listModels；logged-out 无可用模型；无 token 返回 Client |
| W1 | 最终 HTTP 请求捕获（可用替身传输） | public origin、正确路径与 Bearer 授权，使用 DSH `attributionHeaders()`；OAuth app/host 参数另由 A1 核对；store:false、stream:true，SDK 自动 retry 关闭 |
| W2 | 温度、maxTokens、stop 等不支持控制 | 出网前明确 unsupported；默认不注入禁用字段；不静默忽略显式配置 |
| W3 | 多轮／压缩 history、developer 更新、工具结果 | 发送当前完整上下文且顺序语义正确；无 previous_response_id、system input、隐藏额外提示或丢历史 |
| W4 | EOF、failed、incomplete、malformed、HTTP 200 后中断 | 仅 response.completed 认作成功；每个 attempt 一个终态；部分工具不进入执行队列 |
| W5 | 交错 delta／多个 tools／重复终态与未知事件 | block index 稳定；JSON／ID 对应准确；无重复 usage/finish；未知影响语义事件安全失败 |
| W6 | usage 有／缺／含 cache/reasoning／失败已消耗 | 宿主字段准确且不重复计数；未知不伪装精确零或美元费用 |
| T1 | 多个 namespace function tools 与工具结果 | wire 分组合法；返回逆映射为原 DSH 名称／call ID；结果正确进入下一次请求 |
| T2 | 长名、碰撞、未知 namespace、重复 call ID、畸形参数 | 可逆映射无碰撞；越权／畸形请求在执行前失败，不被任意路由 |
| T3 | 动态增删与 deferred 工具 history | 当前可见工具与历史关联分别正确；已移除工具不重新获得可执行权限 |
| T4 | 工具审批拒绝／允许、sandbox 拒绝 | 拒绝时零执行；允许时执行一次；模型层不运行工具或绕过 DSH 策略 |
| L1 | 深冻结输入、并发不同模型、配置更新／HMR | 无原地 mutation、串 header 或身份；已 prepare 请求使用捕获 registration/快照 |
| L2 | 用户 stop／iterator.return／超时／卸载 | 上游 HTTP/刷新/目录可取消；无悬挂 socket/listener/timer，无第二成功 finish |
| L3 | DSH retry 触发及 SDK 关闭 retry | 每个 attempt 对应一次 inference HTTP；重试发生在宿主 durable 边界，无重复工具副作用 |
| L4 | restart/resume/fork 与 reasoning replay | 从已提交 session＋版本化 envelope 重建；无内存独占历史；无 token 混入 replay；未知版本行为明确 |
| S1 | canary token/code/verifier 进入全部错误路径 | Client、settings、session、日志、telemetry、命令行、打包产物中均无 canary |
| S2 | 跳转和自定义 origin 攻击 | Authorization 不跨 origin 泄漏；只访问受信官方 auth/resource；验证 TLS |
| S3 | record 写失败、权限错误、畸形 payload、schema 迁移 | 不破坏其他 owner；不误报 ready；恢复／重登录指引明确 |
| S4 | 本地登出＋远程撤销成功／未知／失败 | 本地 token 必定清理且保留 account/client 映射及 host ID；远端结果诚实区分，不能用本地删除冒充远端撤销 |

## 宿主与实机（mandatory，需授权）

| ID | 场景 | 可观察通过条件 |
|---|---|---|
| L5 | 本地 Web 与官方 Desktop 各自在隔离 profile 安装并运行 | 模型可选可提交，模型切换与重启恢复可观察。记录有无 context 时的行为，以及 title 和 compaction 的停用或显式路由。报告真实安装载体、版本与限制 |
| B1 | 与原 OpenAI/DeepSeek provider 共存、重名、禁用／卸载 | 无 registry 覆写；冲突清楚；其他 provider 前后均可用；重启生效状态准确 |
| U1 | 两个宿主的插件详情设置、官方 UX 与多个保存注册 | 插件管理页的对应详情可进入设置。Continue with ChatGPT、首次 plan 确认、Using ChatGPT plan、Manage usage 和限额指引可观察。同 email 的不同 client 保持独立。新注册通过验证且有推理权限后才能成为活动注册 |
| B2 | 实际 packed bundle 与语言资源 | 相同包摘要贯穿 pack/install；入口/patch/locales/icon 齐全；中文／英文无模板 fallback |
| R1 | 真实 eligible 账号、自身 app 登录与 catalog | 展示真实 app；实际 scope/resource 合格；模型目录属于当前 workspace，凭据不外泄 |
| R2 | 真实文本→工具审批→执行→模型完成 | response.completed 与 DSH settlement 对应；至少一轮工具结果回传；真实订阅授权而非 API key 或旧 Codex 凭据 |
| R3 | 实机 stop、token refresh、重启续接、logout | 单独记录全部结果；退出后不能再用旧授权，重登录可恢复；远端撤销另记 |

## 完成判定与阻断

- P0 报告可同时有“静态可行”与“账号验证未执行”，不升级成生产可用。
- 研究文档完成、实现完成、自动化通过、宿主加载、GUI 观察、真实推理和发布是独立状态。
- 任何准入不明、identity/aud/nonce 未验证、刷新 race、秘密泄漏、工具越权、无 completed 被当成功、会话不可恢复，均为 release blocker。
- 上游 preview 未支持的功能以明确 unsupported 关闭，不借用其他 app 身份或换非公开 endpoint 消除阻断。
- 当前目录文档验收：内部相对链接有目标、manifest 与实际包内容一致、计划与验收编号一致、事实可追溯。使用合成凭据。真实宿主结果另行记录。
