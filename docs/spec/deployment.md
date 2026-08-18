# 部署流程

## 用户确认的发布规则

- 用户说“部署”时，默认目标是 **Preview**，不是 Production。
- 先完成必要验证，将当前功能分支的相关改动提交并推送到 GitHub；由 Vercel 的 Git 集成自动创建 Preview deployment。
- 将 Preview 地址交给用户检查。用户未明确确认 Preview 验收通过前，不得合并或推送 `main`。
- 用户确认没有问题并明确要求正式上线后，才把已验收分支合并到 `main` 并推送；由 Vercel 自动创建 Production deployment。
- 常规发布不得绕过 GitHub 流程直接运行 `vercel --prod`。只有用户明确要求绕过自动部署流程，或正在处理自动部署故障且已获得授权时，才可直接操作 Vercel Production。

## 分支约定

- 功能开发分支使用 `codex/` 前缀，除非用户指定其他分支名。
- Preview 与 Production 必须尽量对应同一份已验收提交，避免在合并到 `main` 时夹带未经 Preview 检查的改动。

## Preview 环境变量

- 连接真实 Neon Preview 数据库的功能分支必须设置 `TIANTI_CONTENT_MODE=database`；若没有显式设置但存在 `DATABASE_URL`，应用也会默认使用数据库模式，避免 Serverless 实例间丢失 mock 会话。
- `codex/5.1` 与 `codex/5.3` 的 Vercel Preview 使用分支限定的 `TIANTI_PREVIEW_V5_1_MIGRATIONS=1`；`codex/5.1` 另有分支限定的 `TIANTI_CONTENT_MODE=database`。这些变量不影响 Production。
- 不要把 Production 数据库或 R2 密钥复制到临时 Preview；Preview migration gate 会校验 Neon 分支并拒绝 Production branch。
