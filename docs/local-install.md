# 本地安装与维护

本页用于私有候选包。当前包的 `engines.dsh` 固定为 `0.2.2-rc.1`。macOS ARM64 本机 Web 和官方 Desktop 都有历史验收。最新 UI 的实机记录覆盖 Web，Desktop 的结果按候选包分别见[证据索引](evidence/README.md)。

## 安装与更新

1. 从已验收的源码按[构建与打包入口](../test/README.md#p1-包骨架)生成 tarball，并核对报告中的 SHA-256。
2. 使用目标宿主随附的 CLI 执行 `dsh plugin --profile web add /path/to/candidate.tgz`。官方 Desktop 使用自己的 `desktop` profile。更新时沿用原 `DSH_HOME` 与 profile，安装新版 tarball 后重启宿主。
3. 在本地专用 profile 按[联机候选步骤](../test/README.md#联机候选包)启用 `enableLiveOAuth`。进入「插件 → ChatGPT Plan」。首次点击「使用 ChatGPT 继续」，已有注册优先使用原账号行的「重新登录」。选中账号后可在模型选择器的「GPT 订阅」分组选择模型。
4. 要让 DSH 的网页搜索使用 ChatGPT，先启用「ChatGPT 网页搜索」再选为搜索提供方。关闭开关前也可点击「恢复默认搜索」。

## 数据流和用量

- 授权在系统浏览器完成。插件在 DSH 本地凭据存储中保留授权和注册映射。账号页展示可用显示名称和本地首字头像，注册 ID 在账号菜单中查看。
- ChatGPT 模型收到 DSH 为当前请求组装的对话上下文，包括所需的历史、工具结果和用户图片。单独调用网页搜索时只发送搜索查询。凭据与日志边界见[安全设计](security.md)。
- 模型、资格和额度取决于 ChatGPT 账号与工作区。选择 ChatGPT 模型后可打开[官方用量设置](https://chatgpt.com/settings/usage)。请求的用途和模型限制见[协议边界](architecture.md#4-请求与工具-codec)。

## 故障排查、退出和回退

- 目录为空时，确认插件已启用联机、原账号为当前账号且有订阅授权。授权失效时使用原账号行的「重新登录」。Web 页面提示本机鉴权时，通过 CLI 重新打开本次 Web 启动入口。
- 停止使用时，从账号菜单「退出登录」，按界面提示确认撤销状态。若远端撤销未确认，在 ChatGPT 设置中断开该应用。之后可从「插件」卸载，或在同一 profile 执行 `dsh plugin --profile web remove @local/dsh-chatgpt-siwc`。
- 更新后出现回归时，保留 profile 和凭据，使用之前已验收的 tarball 执行同一条 `add` 命令并重启。核对安装包摘要、插件状态和模型选择器。回退包须与宿主版本及已保存注册兼容。
