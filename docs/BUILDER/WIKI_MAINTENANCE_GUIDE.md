# 世界观图书馆 Wiki 维护指南

> 适用对象：世界观策划、内容编辑、校对、前端、技术维护者，以及第一次接触本仓库的协作者。
>
> 目标：让参与者能够安全地新增、修改、检查和发布 Wiki 内容，同时避免破坏目录、链接和线上网站。

---

## 1. 先记住这五条规则

1. **只修改源文件，不直接修改 `public/`。**
2. **每个独立实体只有一份主档案。**
3. **独立实体必须有稳定 ID，创建后不要随意修改。**
4. **提交前先在本地打开页面并执行一次正式构建。**
5. **不确定归类、公开范围或设定内容时，先创建 Issue 或询问负责人。**

---

## 2. 仓库是如何工作的

本项目使用 Hugo 把 Markdown 文件生成为静态网站。

基本流程：

```text
content/ 中的 Markdown
+ layouts/ 中的页面模板
+ assets/ 中的样式和脚本
+ config/ 中的网站配置
↓
Hugo 构建
↓
public/ 静态网站
↓
GitHub Pages 发布
```

各目录职责：

| 目录 | 用途 | 普通内容编辑是否常改 |
|---|---|---|
| `content/` | 国家、人物、事件等正文 | 是 |
| `assets/` | CSS、JavaScript、界面资源 | 通常不改 |
| `layouts/` | Hugo 页面模板和组件 | 通常不改 |
| `config/` | 菜单、分类和网站配置 | 谨慎修改 |
| `data/` | 受控词表、全局数据、派生数据 | 按职责修改 |
| `archetypes/` | 新条目模板 | 技术或内容负责人维护 |
| `static/` | 原样复制的公共文件 | 偶尔修改 |
| `.github/workflows/` | 自动构建和部署 | 技术负责人维护 |
| `docs/` | 需求、规范和维护文档 | 按需修改 |
| `public/` | 自动生成的网站 | 禁止手工修改或提交 |

---

## 3. 开始工作前的准备

### 3.1 安装工具

最少需要：

- Git；
- Hugo；
- 一个文本编辑器，推荐 Visual Studio Code；
- GitHub 账号和仓库权限。

检查安装：

```bash
Git --version
hugo version
```

如果项目 README 指定了 Hugo 版本，以 README 或 CI 工作流中的版本为准。

### 3.2 下载仓库

第一次使用：

```bash
git clone <仓库地址>
cd <项目目录>
```

已有仓库时，开始工作前先更新：

```bash
git switch main
git pull
```

### 3.3 创建工作分支

不要直接在 `main` 上长期编辑。

```bash
git switch -c content/add-lanyuan-history
```

建议分支命名：

```text
content/add-人物名
content/update-国家名
fix/broken-link
fix/typo-条目名
feature/timeline
style/mobile-navigation
```

---

## 4. 本地预览

在项目根目录运行：

```bash
hugo server --buildDrafts --disableFastRender
```

浏览器打开终端显示的地址，通常是：

```text
http://localhost:1313/
```

修改 Markdown 后页面会自动刷新。

需要停止服务器时按：

```text
Ctrl + C
```

### 4.1 正式构建检查

提交前必须运行：

```bash
hugo build --gc --minify
```

要求：

- 命令成功结束；
- 没有 `ERROR`；
- 没有与本次修改有关的模板、链接或 Front Matter 警告；
- `public/` 由构建产生，但不加入 Git。

---

## 5. 内容目录怎么选

### 5.1 一级目录

当前常见目录：

```text
content/nations/       国家与政权
content/people/        人物
content/history/       历史时代与事件
content/concepts/      概念设定
content/regions/       地区与地理
content/organizations/ 组织
content/artifacts/     物品、技术、材料
content/ecology/       生态区、物种、疾病
content/records/       报告、信件、法令等文献
```

如果仓库暂时还没有某个目录，先与负责人确认是否现在新增，不要把内容临时塞进不合适的分类。

### 5.2 普通实体：使用 `index.md`

适合人物、单个事件、概念、物品、物种等。

```text
content/people/per-luo-yan/
├── index.md
├── portrait.webp
└── gallery/
```

`index.md` 表示一个不能再拥有独立子页面的 Leaf Bundle，但可以带图片和附件。

### 5.3 大型实体：使用 `_index.md`

适合国家、大型地区、大型组织、历史时代等，需要多个子页面的实体。

```text
content/nations/nat-lanyuan/
├── _index.md
├── government.md
├── history.md
├── culture.md
└── media/
```

`_index.md` 是实体主页面，其余 `.md` 是组成页面。

### 5.4 不要随意移动实体文件

人物即使加入新组织，也仍放在 `people/`。

历史事件即使与某国高度相关，也仍放在 `history/events/`。

使用链接和关系表达归属，不要复制正文。

---

## 6. 新增一个普通条目

以下以人物为例。

### 6.1 建立目录

```text
content/people/per-example/index.md
```

目录名规则：

- 小写英文；
- 使用连字符；
- 不使用空格；
- 不使用中文；
- 不频繁修改。

示例：

```text
per-luo-yan
per-elen-voss
per-0017
```

### 6.2 复制最小模板

```markdown
---
title: "人物显示名称"
description: "40—120 个中文字符的简短摘要。"

keywords:
  - "正式名称"
  - "简称或别名"
  - "旧称或外文名"

cultures: []
eras: []
topics: []

params:
  id: "per.example"
  entity_kind: "person"

  library:
    catalog_no: "PER-0000"
    access_level: "public"
    reliability: "verified"
    last_reviewed: "2026-07-16"
---

## 生平

在这里填写正文。

## 主要活动

在这里填写正文。

## 评价与争议

在这里填写正文。
```

注意：页面一级标题由模板自动生成，正文从 `##` 开始。

### 6.3 稳定 ID 规则

常用前缀：

```text
nat. 国家
aut. 自治领或特殊政治实体
per. 人物
evt. 事件
era. 时代
reg. 地区
org. 组织
con. 概念
art. 物品
bio. 物种
rec. 文献
```

建议格式：

```text
类型.简短唯一名称
```

例如：

```text
per.luo-yan
evt.white-tide-0312
nat.lanyuan
```

创建后不要因为标题改名而修改 ID。

### 6.4 馆藏编号

馆藏编号是用户可见的世界内编号，可以按照项目规范分配，例如：

```text
PER-0001
NAT-0024
EVT-0312-004
CON-0042
```

稳定 ID 与馆藏编号不是同一个字段：

- 稳定 ID 用于系统关系；
- 馆藏编号用于展示和世界内叙事。

---

## 7. 新增一个大型实体

以下以国家为例。

### 7.1 建立结构

```text
content/nations/nat-example/
├── _index.md
├── government.md
├── history.md
├── society-and-culture.md
├── economy.md
└── media/
```

### 7.2 主页面 `_index.md`

主页面放：

- 摘要；
- 国家总体概览；
- 核心信息框字段；
- 最重要的说明；
- 指向子页面的入口。

### 7.3 子页面

子页面不应拥有新的国家实体 ID。

示例：

```yaml
params:
  entity_kind: "nation-subpage"
  parent_entity: "nat.example"
```

推荐固定子页面：

- `government.md`：政体与行政；
- `history.md`：国家历史叙述；
- `society-and-culture.md`：社会与文化；
- `economy.md`：经济；
- `military.md`：军事；
- `diplomacy.md`：外交；
- `geography.md`：地理与生态。

并非每个国家都必须创建全部页面。内容较少时可以先写在 `_index.md` 中。

---

## 8. Front Matter 字段说明

Front Matter 是 Markdown 文件开头 `---` 之间的 YAML。

### 8.1 常用字段

```yaml
title: "显示名称"
description: "简短摘要"
weight: 10
draft: false
aliases: []
keywords: []
cultures: []
eras: []
topics: []
```

说明：

- `title`：页面标题；
- `description`：卡片、搜索结果和网页摘要；
- `weight`：同一目录中的排序，数字越小越靠前；
- `draft`：是否为草稿；
- `aliases`：旧 URL；
- `keywords`：搜索别名；
- `cultures`：文化圈；
- `eras`：时代；
- `topics`：主题。

### 8.2 `draft`

```yaml
draft: true
```

草稿会在 `hugo server -D` 中显示，但正式网站不会发布。

准备上线时：

```yaml
draft: false
```

或删除该字段。

### 8.3 `description`

要求：

- 不复制标题；
- 尽量一到两句话；
- 说明“它是什么”和“为什么重要”；
- 不写大量剧透；
- 建议 40—120 个中文字符。

不推荐：

```yaml
description: "这是一个人物。"
```

推荐：

```yaml
description: "参与白潮调查并推动沿岸检疫制度改革的档案学者。"
```

### 8.4 日期

现实维护日期与世界内日期不要混用。

```yaml
lastmod: 2026-07-16
```

用于现实中的页面修订。

“新历312年”之类的世界内时间应写在正文或项目定义的 `chronology` 字段中，不要写进 Hugo 的 `date`。

### 8.5 YAML 缩进

只使用空格，不使用 Tab。

正确：

```yaml
params:
  id: "per.example"
  entity_kind: "person"
```

错误：

```yaml
params:
id: "per.example"
```

---

## 9. 如何写正文

### 9.1 标题层级

页面标题由 `title` 自动显示，因此正文从二级标题开始：

```markdown
## 生平

### 早年

### 调查时期

## 评价
```

不要再写：

```markdown
# 人物名称
```

### 9.2 段落

- 每个段落围绕一个主题；
- 避免连续数千字没有小标题；
- 大量列表应确认是否比叙述更清晰；
- 表格只用于真正需要横向对比的数据；
- 长篇原始资料应考虑放入 `records/`，实体页只做摘要和引用。

### 9.3 世界内观点与客观设定

需要区分：

- 项目团队确认的客观设定；
- 世界内人物的观点；
- 国家宣传；
- 不可靠文献；
- 尚有争议的推断。

建议使用明确措辞：

```text
现存档案一致认为……
联合体官方宣称……
该说法仅见于……
目前无法确认……
馆方将其可信度标记为 contested。
```

不要把不可靠叙述直接写成无条件事实。

---

## 10. 内部链接

### 10.1 推荐使用实体引用 Shortcode

```markdown
{{< entity-ref page="/people/per-luo-yan" >}}
```

自定义显示文字：

```markdown
{{< entity-ref
  page="/people/per-luo-yan"
  label="档案学者洛砚"
>}}
```

路径是 Hugo 逻辑页面路径：

- 不写 `.md`；
- 不写 `index.md`；
- 使用小写目录名；
- 以 `/` 开头。

### 10.2 不推荐硬编码线上地址

不要写：

```markdown
[洛砚](https://example.github.io/wiki/people/per-luo-yan/)
```

因为仓库名、域名或部署子路径变化后会失效。

### 10.3 发现损坏引用

如果页面出现：

```text
[未找到条目：/people/per-example]
```

检查：

1. 目标目录是否存在；
2. 是 `index.md` 还是 `_index.md`；
3. 大小写是否一致；
4. Shortcode 路径是否写了 `.md`；
5. 目标是否仍为草稿。

---

## 11. 分类与标签

### 11.1 当前常用分类

```yaml
cultures:
  - "岚原文化圈"

eras:
  - "新历时代"

topics:
  - "政体"
  - "贸易"
```

### 11.2 新增分类前

先在网站分类页或仓库内搜索是否已有相似词。

不要同时出现：

```text
军事
军队
军事组织
军方
```

除非它们确实具有不同定义。

### 11.3 修改分类名

分类名会影响多个页面和 URL。不要只改一个条目。

正确流程：

1. 搜索全仓库旧分类；
2. 与世界观负责人确认新名称；
3. 一次性替换全部使用位置；
4. 本地检查分类页；
5. 在 Pull Request 中说明迁移原因。

---

## 12. 图片和附件

### 12.1 与条目相关的图片放在条目目录

```text
content/people/per-example/
├── index.md
├── portrait.webp
└── gallery/
    ├── uniform.webp
    └── field-record.webp
```

Markdown：

```markdown
![洛砚的调查团时期肖像](portrait.webp)
```

### 12.2 文件命名

- 小写英文；
- 使用连字符；
- 不使用空格；
- 名称表达内容；
- 不使用 `最终版2最新真的最终.psd`。

推荐：

```text
portrait.webp
north-rift-map.webp
lanyuan-emblem.svg
```

### 12.3 格式

- 照片、插画：WebP 或 AVIF；
- 图标、国旗、徽章、简化地图：SVG；
- 需要透明且不适合 SVG：PNG；
- 不把 PSD、CLIP、AI 工程文件放进公开发布目录；
- 视频和超大高清源文件放到独立素材库。

### 12.4 替代文本

所有图片都需要替代文本。

不推荐：

```markdown
![](portrait.webp)
```

推荐：

```markdown
![洛砚身穿北岸调查团制服的半身肖像](portrait.webp)
```

装饰性图片是否使用空替代文本，应由前端和可访问性规范统一处理。

---

## 13. 馆员注与世界内文档效果

使用馆员注：

```markdown
{{< archive-note title="馆员注" >}}
该材料的原始编号已经损坏，当前编号由第二次整理工作重新分配。
{{< /archive-note >}}
```

使用原则：

- 用于资料来源、损坏状态、争议和整理说明；
- 不要用来承载正文中唯一的重要事实；
- 不要在每个段落都使用；
- 图书馆叙事不能掩盖真实维护信息。

---

## 14. 修改现有条目

### 14.1 修改前

- 阅读完整条目；
- 搜索其他页面是否引用该事实；
- 确认修改属于文字校对、资料补充还是设定变更；
- 设定变更应先得到负责人确认。

### 14.2 修改标题

如果只是显示名改变：

```yaml
title: "新名称"
```

通常不要改：

```yaml
params:
  id: "原有稳定 ID"
```

如果 URL 也要修改：

1. 移动目录；
2. 在 Front Matter 中添加旧路径 `aliases`；
3. 更新所有内部引用路径；
4. 本地检查旧 URL 是否跳转；
5. 在 Pull Request 中特别说明。

示例：

```yaml
aliases:
  - "/people/old-name/"
```

### 14.3 删除条目

不要直接删除后提交。

先确认：

- 是否仍被其他页面引用；
- 是否应该改为历史条目或弃用状态；
- 是否需要保留跳转；
- 是否涉及已公开内容的撤回。

删除流程：

1. 全仓库搜索稳定 ID 和路径；
2. 修复所有引用；
3. 确认图片和附件是否仍被使用；
4. 添加必要的替代页面或跳转；
5. 在 Pull Request 中列出删除原因和影响。

---

## 15. 搜索维护

当前搜索通常会索引：

- 标题；
- description；
- keywords；
- 正文；
- 稳定 ID；
- 馆藏编号。

让条目更容易被找到：

- 在 `keywords` 中加入简称、旧称和外文名；
- description 写清条目性质；
- 正文第一次出现专有名词时写全称；
- 不堆砌与条目无关的关键词；
- 馆藏编号保持唯一。

提交前可测试：

```text
/search/?q=条目名称
/search/?q=馆藏编号
/search/?q=旧称
```

如果搜索页一直显示“正在读取索引”，检查本地：

```text
http://localhost:1313/index.json
```

---

## 16. Git 提交与 Pull Request

### 16.1 查看修改

```bash
git status
git diff
```

确认没有误提交：

- `public/`；
- 编辑器临时文件；
- 大型源文件；
- 密钥或账号；
- 与任务无关的内容。

### 16.2 提交

```bash
git add content/people/per-example/
git commit -m "Add person entry for Example"
```

提交信息建议：

```text
Add nation entry for Lanyuan
Update White Tide chronology
Fix broken reference in Luo Yan entry
Revise North Rift ecology description
```

### 16.3 推送

```bash
git push -u origin content/add-example
```

然后在 GitHub 创建 Pull Request。

### 16.4 Pull Request 应说明

- 改了什么；
- 为什么修改；
- 是否涉及设定变更；
- 是否新增或修改稳定 ID；
- 是否更改 URL 或分类；
- 本地检查了哪些页面；
- 是否包含新图片；
- 是否存在需要负责人决定的问题。

---

## 17. 审核清单

### 17.1 内容审核

- [ ] 标题和摘要准确；
- [ ] 设定与其他页面一致；
- [ ] 世界内观点与客观事实区分清楚；
- [ ] 没有不应公开的剧情或内部备注；
- [ ] 分类合理；
- [ ] 关键词包含必要别名；
- [ ] 语病、错字和标点已检查。

### 17.2 结构审核

- [ ] 文件放在正确目录；
- [ ] `index.md` 与 `_index.md` 使用正确；
- [ ] 独立实体有稳定 ID；
- [ ] ID 和馆藏编号没有重复；
- [ ] 子页面没有误创建第二个实体 ID；
- [ ] 内部链接可点击；
- [ ] 没有硬编码线上域名。

### 17.3 技术审核

- [ ] `hugo build --gc --minify` 成功；
- [ ] 页面在桌面端正常；
- [ ] 页面在手机宽度正常；
- [ ] 图片路径和替代文本正确；
- [ ] 搜索能够找到新条目；
- [ ] 没有提交 `public/`；
- [ ] GitHub Actions 检查通过。

---

## 18. 合并和发布

Pull Request 通过审核后合并到 `main`。

GitHub Actions 会自动：

```text
检出 main
→ 安装 Hugo
→ 构建网站
→ 上传静态产物
→ 部署 GitHub Pages
```

发布后需要抽查：

- 首页；
- 本次新增或修改的页面；
- 至少一个内部链接；
- 搜索结果；
- 手机端；
- 图片和 CSS 是否正常。

不要因为本地正常就跳过线上检查。GitHub Pages 的子路径和大小写规则可能与本地系统不同。

---

## 19. 回滚错误发布

如果线上出现严重问题：

1. 不直接在 GitHub 网页上大范围临时修改；
2. 找到导致问题的合并提交；
3. 使用 `git revert` 创建反向提交；
4. 提交 Pull Request 或按紧急流程合并；
5. 等待 GitHub Actions 重新部署；
6. 记录问题原因。

示例：

```bash
git switch main
git pull
git switch -c fix/revert-broken-release
git revert <提交哈希>
git push -u origin fix/revert-broken-release
```

除非技术负责人明确决定，不要用强制推送改写主分支历史。

---

## 20. 常见问题

### 页面列表中有条目，但点开是空白

检查是否存在空的专用模板：

```text
layouts/people/page.html
layouts/nations/page.html
```

零字节模板会覆盖通用模板。未使用的空模板应删除。

### 页面 404

检查：

- 文件是否在正确目录；
- 文件是 `index.md` 还是 `_index.md`；
- URL 与目录大小写是否一致；
- 是否仍为草稿；
- 链接是否错误地写入 `.md`。

### 本地正常，GitHub Pages 404

通常是大小写或硬编码根路径问题。

统一使用小写目录名，并使用 Hugo 生成的链接或 `entity-ref`。

### 正文不显示

检查 Front Matter 是否正确结束：

```markdown
---
title: "示例"
---

正文。
```

### 构建报 YAML 错误

检查：

- 缩进；
- 冒号后是否有空格；
- 引号是否闭合；
- 列表是否正确写成 `-`；
- 是否使用 Tab。

### 分类页没有条目

Front Matter 使用复数字段：

```yaml
cultures:
eras:
topics:
```

不要写成：

```yaml
culture:
era:
topic:
```

### 修改后网页没有变化

尝试：

1. 停止 Hugo；
2. 删除 `public/`；
3. 重新运行 `hugo server --disableFastRender`；
4. 浏览器强制刷新；
5. 检查是否编辑了正确分支和文件。

---

## 21. 什么时候必须找负责人

遇到以下情况不要自行决定：

- 一个条目似乎同时属于两个实体类型；
- 需要修改稳定 ID；
- 需要合并或拆分已有实体；
- 发现两个页面互相矛盾；
- 资料可能包含未公开剧情；
- 需要更改一级导航；
- 需要新增 Taxonomy 或关系类型；
- 需要改变 URL 结构；
- 需要添加第三方脚本；
- 需要提交非常大的媒体文件；
- 需要删除已经公开的重要条目。

在 GitHub 创建 Issue，并附上：

- 相关页面；
- 发现的问题；
- 可选方案；
- 预期影响。

---

## 22. 定期维护任务

### 每次提交

- 本地预览；
- 正式构建；
- 检查链接、图片和搜索；
- 更新 `last_reviewed` 或 `lastmod`；
- 提交 Pull Request。

### 每月或每个版本

- 检查损坏内部链接；
- 检查重复 ID 和馆藏编号；
- 检查孤立条目；
- 清理未使用图片；
- 检查新增分类是否重复；
- 抽查手机端；
- 检查 GitHub Actions 依赖更新；
- 检查仓库和发布产物体积。

### 每个大版本

- 审核信息架构；
- 审核公开与内部内容边界；
- 更新需求文件；
- 更新 Front Matter 模板；
- 为 Schema 变化提供迁移说明；
- 进行搜索测试集和可访问性测试；
- 验证回滚流程。

---

## 23. 快速操作清单

### 新增条目

```text
1. 更新 main
2. 创建分支
3. 选择正确目录
4. 创建 index.md 或 _index.md
5. 填写 Front Matter
6. 写正文并建立内部链接
7. 本地预览
8. 正式构建
9. 提交并创建 Pull Request
10. 合并后线上抽查
```

### 修改条目

```text
1. 判断是否为设定变更
2. 搜索相关引用
3. 修改正文或字段
4. 不改稳定 ID
5. 检查分类和搜索
6. 本地构建
7. Pull Request 审核
```

### 删除或移动条目

```text
1. 先获得负责人确认
2. 搜索 ID、路径和引用
3. 保留 aliases 或替代页面
4. 修复所有链接
5. 清理媒体
6. 线上检查旧地址
```

---

## 24. 最小 Front Matter 备忘

### 普通实体

```yaml
---
title: "显示标题"
description: "简短摘要"
keywords: []
cultures: []
eras: []
topics: []

params:
  id: "per.example"
  entity_kind: "person"

  library:
    catalog_no: "PER-0000"
    access_level: "public"
    reliability: "verified"
    last_reviewed: "2026-07-16"
---
```

### 大型实体子页面

```yaml
---
title: "某国：政体与行政"
description: "本页摘要。"
weight: 10
keywords: []
topics: []

params:
  entity_kind: "nation-subpage"
  parent_entity: "nat.example"
---
```

---

## 25. 维护完成的判断标准

一次维护任务只有在以下条件全部满足时才算完成：

- 内容正确并得到必要审核；
- 文件位置和字段正确；
- 本地页面可访问；
- 内部链接正常；
- 搜索可找到条目；
- 手机端没有阻断问题；
- 正式构建成功；
- GitHub Actions 成功；
- 线上页面已经抽查；
- 必要的需求或维护文档已经同步更新。
