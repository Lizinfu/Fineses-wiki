# 读者留言（Giscus）配置

图书馆的「读者留言」页面使用 [Giscus](https://giscus.app/) 承载评论。评论实际保存于本仓库的 GitHub Discussions；本项目不保存读者账号、评论内容或访问凭据。

## 一次性启用步骤

1. 在 GitHub 仓库 **Settings → General → Features** 启用 **Discussions**。
2. 进入仓库 **Discussions → Categories**，创建类别「读者留言」。
3. 在 [giscus.app](https://giscus.app/) 选择仓库 `Lizinfu/Fineses-wiki`，并安装/授权 giscus GitHub App。
4. 选择「读者留言」类别；映射方式选择 **Specific discussion number / term**，term 填写 `library-reader-messages`。
5. 将生成的 `repo-id` 和 `category-id` 写入 `data/library/comments.yaml`，并把 `enabled` 改为 `true`。
6. 推送并部署后，访问 `/library/messages/`。Giscus 会创建或连接对应 Discussion。

## 日常管理

- 评论者必须使用 GitHub 账号；未登录读者仍可阅读公开留言。
- 在 GitHub Discussions 中可删除、锁定、置顶或转移留言。
- 留言不等同于正式设定或已核验资料；请不要把用户留言迁入公开条目前当作事实。
- 关闭功能时，将 `enabled` 改为 `false`。页面会显示静态准备提示和 Discussions 备用链接。

## 验收

1. 已填 ID 并部署后，`/library/messages/` 显示 Giscus 输入框和既有评论。
2. 使用非维护者 GitHub 账号发布一条测试留言，刷新页面后仍可读取。
3. 在 Discussions 后台删除或锁定测试留言，确认网页同步反映。
4. 确认其他页面未加载 `giscus.app/client.js`，且 Pagefind 不索引动态评论。

## 主题同步

留言区外框已套用站点的工业档案风（切角面板、accent 色条、等宽标签），并随站内主题切换自动保持浅色/深色一致。`assets/scripts/library-comments.ts` 会在 giscus 挂载后及站内主题切换时，通过 giscus 的 `setConfig` 消息把 `light`/`dark` 同步到 iframe。`data/library/comments.yaml` 中的 `theme` 仅作为无 JavaScript 时的静态降级值。

## 首页公告弹窗

首页（`/`）会展示一条来自 `data/library/announcement.yaml` 的公告弹窗，使用原生 `<dialog>` 实现：可关闭、按公告 `id` 记录（`localStorage`），修改 `id` 即可让已关闭的读者再次看到新公告。将 `enabled` 设为 `false` 可关闭弹窗；无 JavaScript 时会降级为页面内静态提示条。