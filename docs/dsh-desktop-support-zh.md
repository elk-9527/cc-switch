# DeepSeek Harness 桌面版

CC Switch 保留单一 `dsh` 应用入口，同时支持 Web 和 Desktop 原生配置。供应商共存，模型通过 DSH 原生菜单选择；添加、编辑供应商不会切换默认模型。

## 使用

1. 在「应用」页启用 **DeepSeek Harness**。
2. 打开「设置 → 应用配置 → DeepSeek Harness」，把管理配置集改为 **Desktop** 并保存。
3. 数据目录留空时使用 CC Switch 进程继承的 `DSH_HOME`，未设置时使用 `~/.dsh`；也可以显式选择数据目录。
4. 添加供应商、Key 和模型，再添加到 DSH。DSH 原生模型菜单可以选择新模型。

缺少 `dsh` CLI 不再意味着桌面版未安装。Windows 通过卸载注册表和标准安装目录定位桌面程序，优先读取桌面运行时的准确版本。桌面版的打开和卸载使用原生可执行入口；更新在桌面版中处理，不会通过 npm 另装一套 CLI。

## 数据和兼容性

- 新增设备设置 `dshConfigDir?: string` 和 `dshProfile?: "web" | "desktop"`；旧设置缺少配置集字段时仍为 `web`。
- 供应商和 MCP 使用 `profiles/<配置集>/cordis.patch.yml`。切换目标只刷新数据库和界面中的原生状态，不复制供应商、不同步旧 MCP 开关，也不创建另一配置集的文件。
- Skills、全局 `AGENTS.md`、凭据和会话位于共同的数据目录，随数据目录设置变化。供应商档案延续现有可添加模板的行为；是否已添加以当前目标的原生配置为准。
- 新 Key 引用采用 `CC_SWITCH_DSH_WEB_<供应商>` 或 `CC_SWITCH_DSH_DESKTOP_<供应商>`；未更改 Key 时保留原生引用，已有旧引用仍可读取。移除供应商不删除可能被其他配置复用的凭据。
- 官方登录和第三方插件供应商继续由 DSH 管理。保留它们的原生节点、账号记录和默认模型，不转换成 pi-ai 自定义供应商。

## 常用功能

供应商支持预设、自定义、编辑、复制、排序及从原生配置添加/移除。支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 三种协议。连通检测只探测配置地址是否可达，不验证 Key、模型或推理服务。

MCP 继续支持 stdio 和 Streamable HTTP，新增节点使用 DSH 原生 `insert` 补丁。切换目标时以事务更新 DSH 的 MCP 启用状态，不改其他应用的开关，也不覆盖同名但配置不同的服务器。

Skills 和提示词沿用既有管理流程。会话支持阅读、搜索和导出；会话菜单提供桌面版入口，继续会话和删除仍通过 DSH 原生界面处理。

## 用量统计

导入原生 `sessions/<项目>/<会话>/session.vN.jsonl[.zstd]`，接入现有自动/手动同步、请求列表、模型统计和费用回填。只选择每个会话的最高日志版本，按 message id 去重分叉前缀；支持拼接 zstd 帧，未写完的尾帧留待刷新。

Tokens 按新增输入、输出、缓存读取和缓存写入的原生口径入库。保留原始模型及去除路由前缀后的计价模型，未知价格可以在补充定价后回填。每个文件和解压结果限制为 128 MiB，不跟随会话目录链接。

导入器基于 [PR #8771](https://github.com/farion1231/cc-switch/pull/8771) 的提交 `36bd710237bdd05afc6d43193abcf01429e1a648` 适配，复用已有 `dsh` 类型和图标。它不要求本地代理，也不抓取请求正文。

## 备份与恢复

修改原生供应商或 MCP 前保存私有快照，存放在 CC Switch 数据目录的 `backups/dsh`，遵循现有备份保留数量。可在 DSH 应用配置区恢复，或在备份存储管理中查看和清理。

恢复仅接受当前目标的快照，验证配置和相关凭据自写入后没有再变化，并持有原生文件锁。文件发生后续修改时拒绝恢复，避免覆盖 DSH 或其他程序的新配置。数据库保存失败时回滚原生配置与凭据。

本功能保持原生直连，不包含代理接管和自动故障转移。不会自动重启桌面版或重载 VS Code。

## 原生兼容验证

`scripts/validate-dsh-native.mjs` 使用官方 `@deepseek-ai/dsh-app-boot` 和 `@deepseek-ai/dsh-llm-pi-ai` 执行真实补丁合成、配置校验、插件注册和模型目录读取。测试通过内存中的 Host 服务提供虚拟凭据，不读取用户 Key，也不发推理请求。

Rust 集成测试 `dsh_exports_native_runtime_acceptance_fixture` 导出供应商/MCP 新增、修改、移除三阶段的实际文件内容。验证方法：

```powershell
cargo test --test dsh_commands -- --test-threads=1
node scripts/validate-dsh-native.mjs <官方包的node_modules目录> <隔离测试home>/dsh-native-acceptance.json
```
