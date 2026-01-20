# mcp-skill-tool

跨平台（macOS/Windows）MCP + Skill 管理工具：以 **repo 内统一 spec** 为单一事实来源，支持从/向以下宿主导入/应用配置，并支持开启/关闭：

- `antigravity`（Google Antigravity）
- `claude-code`（Anthropic Claude Code）
- `gemini-cli`（Google Gemini CLI）
- `codex`（Codex CLI）
- `opencode`（opencode.ai）

## 安装

```bash
npm i
npm run build
```

## 打包与分发（macOS/Windows 都适用）

本项目当前以 **npm CLI 包** 形式分发（最省事、跨平台）。

在本仓库目录打包：

```bash
npm pack
```

会生成 `mcp-skill-tool-<version>.tgz`，拷贝到另一台机器后全局安装：

```bash
npm i -g ./mcp-skill-tool-<version>.tgz
```

安装完成后直接运行：

```bash
mcp-skill-tool --help
```

开发机本地“安装/更新”最快方式（软链接）：

```bash
npm run build
npm link
mcp-skill-tool list
```

## 统一 spec

- 默认文件：`mcp-skill-tool.yaml`
- Skills 约定目录：`skills/<skill>/SKILL.md`（会在 `import` 时自动扫描并写入 spec）
- 仓库里提供示例：`mcp-skill-tool.example.yaml`（复制为 `mcp-skill-tool.yaml` 自用；已加入 `.gitignore`）

## 使用

初始化：

```bash
npm run dev -- init
```

从各工具默认路径加载查看（不需要 spec）：

```bash
npm run dev -- list
npm run dev -- list --host antigravity
```

把一个工具里的 MCP/skills 同步到其他工具（“添加给其他软件”，合并写入）：

```bash
# 先 dry-run 看看会写哪些文件
npm run dev -- sync --from antigravity --to opencode --mcp context7,chrome-devtools --dry-run

# 真正写入（会生成 *.bak.* 备份）
npm run dev -- sync --from antigravity --to opencode --mcp context7,chrome-devtools
```

只在目标软件里关闭（不改 spec；按目标软件的配置格式关闭/移除）：

```bash
# opencode：会写 mcp.<name>.enabled=false
npm run dev -- target-disable --host opencode --kind mcp --name context7

# antigravity/claude-code/gemini-cli/codex：会从对应配置里移除该 MCP server
npm run dev -- target-disable --host antigravity --kind mcp --name chrome-devtools --dry-run
```

只在目标软件里关闭 skill（通过把 skill 目录移动到 `.disabled/`，可手动挪回恢复）：

```bash
npm run dev -- target-disable --host antigravity --kind skill --name react-best-practices --scope user --dry-run
```

清理 spec 里的敏感值（转为 `${ENV_VAR}` 引用）：

```bash
npm run dev -- sanitize
```

开启/关闭：

```bash
npm run dev -- disable mcp context7
npm run dev -- enable mcp context7
```

应用（写文件前建议先 dry-run）：

```bash
npm run dev -- apply --dry-run
npm run dev -- apply
```

指定宿主（逗号分隔）：

```bash
npm run dev -- --hosts antigravity,opencode apply --dry-run
```

## 重要说明

- `apply` 会对目标文件创建 `*.bak.*` 备份。
- `import` 会尽量避免把密钥写进 repo：会把疑似密钥的值替换成 `${ENV_VAR}` 形式；已有 spec 可用 `sanitize` 再清理一次。
- `sync` 不依赖导入 spec：会实时读取源工具的配置，并合并写入到目标工具。
- 本项目当前实现的 skills 同步：Antigravity/Gemini/Claude（workspace/repo 侧）与 Codex（user 侧）。opencode 的 “agent/mode/plugin” 映射后续再补。
