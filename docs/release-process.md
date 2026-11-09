# 发布流程

> 更新于 2026-11-05。

## Pull Request 校验

`.github/workflows/validate.yml` 会在 Pull Request 和手动触发时执行：

1. 固定 Node 22 与 Hugo Extended 0.155.3；
2. `npm ci`；
3. `npm run wiki:validate`；
4. `npm run quality:source`（媒体预算）；
5. `npm run wiki:prepare`；
6. 使用 `--cleanDestinationDir` 的 Hugo 构建；
7. 验证 Hugo 生成的正文检索索引；
8. `npm run quality:site`（渲染页面标题与本地资源/链接目标）；
9. `npm run test:browser`（Playwright + axe 的关键路径、正文检索和浏览器无障碍检查）。

PR 不应在上述错误级检查失败时合并。媒体总量/单文件超限和失效本地链接会阻止合并；空媒体与缺失图片替代文字当前仅报告警告，作为存量治理清单。Markdown lint、Lighthouse 和视觉回归门禁尚未配置。

## 部署

`.github/workflows/deploy-pages.yml` 在 `main` 推送或手动触发后，以与校验相同的依赖版本构建站点，将 `public/` 上传为 GitHub Pages artifact，再部署到 `github-pages` 环境。构建失败时不会产生新的部署 artifact，因此不会覆盖上一份成功发布的站点。

发布流程使用 `pages` 并发组，`cancel-in-progress: false`：后续推送不会取消正在运行的发布。部署 job 的总时限为 25 分钟，首次部署失败后等待 60 秒，再使用同一份构建产物重试一次；重试仍失败时，整个部署 job 保持失败状态。手动取消运行时不会继续重试。

25 分钟是两次尝试与冷却时间的总预算。**单次 Pages 部署最多等待 10 分钟**，`deploy-pages@v4` 源码会把更大的 `timeout` 截断为 `600000` 毫秒，不能通过提高该参数绕过平台上限。参见 [Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)与[部署动作实现](https://github.com/actions/deploy-pages/blob/v4/src/internal/deployment.js)。

## Pages 超时后的恢复

如果构建和浏览器测试已通过，部署日志却持续显示 `updating_pages`，最后出现 `Timeout reached, aborting!`，说明部署动作等待 Pages 发布结果超时。先查看 [GitHub Status](https://www.githubstatus.com/)，确认 Actions / Pages 是否存在服务故障；这类日志本身不表示 Hugo、地图代码或发布路径有误。

1. 服务恢复后，进入仓库 **Actions → Build and deploy Hugo Wiki → 失败的运行 → Re-run jobs → Re-run failed jobs**。若只有 `deploy` 失败，会复用已有 artifact，不必重新构建和测试站点。
2. 如果 artifact 已过期或被删除，在该工作流选择 **Run workflow**，使用 `main` 新开一轮完整构建与部署。
3. 工作流文件的修复需要提交并推送后，在新的运行中生效。重跑旧运行使用旧提交与旧工作流，不会自动采用后来修改的重试策略。参见[官方重跑说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)。
4. 两次部署都失败时，保留部署 ID、错误全文和发生时间。若是权限或内容错误，检查 `pages: write`、`id-token: write`、仓库 Pages 的 GitHub Actions 发布来源及 artifact；若仍是服务故障，等待恢复后再重跑，不反复推送无关代码。

部署动作在最终发布成功前就可能输出 `page_url`；应以 `deploy` job 成功为准，随后抽查线上页面，不能把出现网址视为部署完成。

## 发布前检查

1. 本地运行 `npm run wiki:build`；具备浏览器依赖时再运行 `npm run test:browser`（CI 始终执行）；
2. 确认工作区没有意外变更，尤其不要手改 `public/` 与 `data/generated/`；
3. PR 检查通过并完成内容审核；
4. 合并 `main` 后在 Actions 中确认部署成功；
5. 线上抽查首页、一个实体页、搜索页、时间线和 404 页。

## 回滚

当前回滚方式是将 `main` 回退到最近已验证提交，再由部署工作流重新发布。执行回滚时记录原因、目标提交 SHA、验证人和恢复时间；完成后复测核心页面和搜索。后续应通过分支保护和定期回滚演练强化该流程。
