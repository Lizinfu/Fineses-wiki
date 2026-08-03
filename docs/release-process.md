# 发布流程

## Pull Request 校验

`.github/workflows/validate.yml` 会在 Pull Request 和手动触发时执行：

1. 固定 Node 22 与 Hugo Extended 0.155.3；
2. `npm ci`；
3. `npm run wiki:validate`；
4. `npm run quality:source`（媒体预算）；
5. `npm run wiki:prepare`；
6. 使用 `--cleanDestinationDir` 的 Hugo 构建；
7. Pagefind 建索引；
8. 验证 Pagefind bundle；
9. `npm run quality:site`（渲染页面标题与本地资源/链接目标）。
10. `npm run test:browser`（Playwright + axe 的关键路径和浏览器无障碍检查）。

PR 不应在上述错误级检查失败时合并。媒体总量/单文件超限和失效本地链接会阻止合并；空媒体与缺失图片替代文字当前仅报告警告，作为存量治理清单。Markdown lint、Lighthouse 和视觉回归门禁尚未配置。

## 部署

`.github/workflows/deploy-pages.yml` 在 `main` 推送或手动触发后，以与校验相同的依赖版本构建站点，将 `public/` 上传为 GitHub Pages artifact，再部署到 `github-pages` 环境。构建失败时不会产生新的部署 artifact，因此不会覆盖上一份成功发布的站点。

## 发布前检查

1. 本地运行 `npm run wiki:build`；具备浏览器依赖时再运行 `npm run test:browser`（CI 始终执行）；
2. 确认工作区没有意外变更，尤其不要手改 `public/` 与 `data/generated/`；
3. PR 检查通过并完成内容审核；
4. 合并 `main` 后在 Actions 中确认部署成功；
5. 线上抽查首页、一个实体页、搜索页、时间线和 404 页。

## 回滚

当前回滚方式是将 `main` 回退到最近已验证提交，再由部署工作流重新发布。执行回滚时记录原因、目标提交 SHA、验证人和恢复时间；完成后复测核心页面和搜索。后续应通过分支保护和定期回滚演练强化该流程。
