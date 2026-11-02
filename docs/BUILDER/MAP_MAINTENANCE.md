# 地图维护手册

> 适用版本：2026-10-31；实施原理与长期路线见 [地图实施方案](MAP_IMPLEMENTATION_PLAN.md)。

## 先记住三件事

1. 世界图 `world` 常驻。世界与国家共用同一组实体六边形块；13 国的 `nation.<slug>` 保留细格数据接口，国家视野显示对应专题。只有卡夏·欧尔莱特有暂定城市 L2，以对称细块和六边形基座呈现。
2. `data/maps/tiles.yaml` 是生成物，**不要手工编辑**。改变世界国界要改 `assets/map-sources/world-political.png`；改变国家层网格或来源要改 `data/maps/sources.yaml` 和 `data/maps/layers.yaml`，然后重新生成。
3. 地名、政治状态、地图颜色和地理边界是不同的数据。不能只改 CSS 颜色来“增加国家”，也不能把尚无资料的地形或城市自动猜出来。

## 文件速查

| 想改什么 | 编辑的权威文件 | 当前是否会直接显示 |
| --- | --- | --- |
| 世界海岸、国界、无人区形状 | `assets/map-sources/world-political.png`；新颜色同时登记 `data/maps/sources.yaml` | 运行 `npm run map:generate` 后显示 |
| 现存国家 L1 格数、父级归属、生成方式 | `data/maps/layers.yaml`、`data/maps/sources.yaml` | 重新生成后显示；两处网格必须相同 |
| 国家、大陆或特殊区域的名字、定位、状态 | `data/maps/areas.yaml` | 国家和大陆默认按实际陆地面积重心定位；可选 `label_anchor` 显式覆盖 |
| 国家标签的外文名与 SVG 图标 | `data/maps/areas.yaml` 中该国的 `foreign_label`、可选 `icon_ref`；图标文件放在 `static/` | 世界/国家视野在统一倍率显示 30px 徽记与名称，拥挤时先保留徽记；城市层隐藏 |
| 世界图上的地点标识 | `data/maps/locations.yaml`，以及已有内容实体的 `params.id` | 校验通过后显示；当前世界图支持此类标识 |
| 国家 L1 / 城市 L2 的地形、水系、道路与城区 | `data/maps/features.yaml` | 已支持归一化几何、示意起伏、河流、道路和中心对称城区；空接口不会生成内容 |
| 地图色彩、材质、边界与标签样式 | `assets/scripts/atlas/pixi-renderer.ts` 管配色、光照与边界；`assets/styles/pages/atlas-pixi.css` 管文字与控件 | 构建后显示；不改变区域归属 |
| 国家或地区百科内容 | `content/` 下相应实体 Markdown | 影响档案；地图通过稳定 `entity_id` 关联 |

现存国家包括：卡什莫兰、塔罗萨尔（无现行政权）、埃萨勒、伊琳沃克、莫尔索斯、德诺尼塞、赫芙伦特、卡俄斯、斯兰缇亚、塞壬、天照、殷、冈穹嘉卡。历史国家暂不加入现势地图。“环形空洞”已移除；不要重新在 `areas.yaml` 中登记它。

## 四种日常操作

### A. 修改现有国家的国界

1. 在 `assets/map-sources/world-political.png` 修改相应纯色范围。黑色/近黑色是海洋，白色是无人区；国家颜色对应 `data/maps/sources.yaml` 的 `world.regions`。
2. 若只是改变形状，不改国家 ID、`areas.yaml`、`layers.yaml`。若使用新 RGB，则同时更新 `world.regions` 的颜色，避免采样丢区。
3. 运行 `npm run map:generate`，再运行下文验证命令。检查邻国、岛屿、无人区与 L1 裁剪是否同步。所有国家 L1 都会随世界边界重建。

来源图外围白框不是无人区。当前 `sources.yaml` 使用独立的横向和纵向裁切比例，适配 4096 × 2048 原图；更换尺寸或边框后需核对裁切，避免把白框采样成南北两排假陆地。

### B. 修改或删除区域标签

在 `data/maps/areas.yaml` 查找稳定 `id`。修改 `label` 只改中文显示名；世界国家还需 `foreign_label`，可选 `icon_ref: "name.svg"`，对应非空文件位于 `static/name.svg`。目前 13 个现存国家都有图标；埃萨勒使用 `elsae.svg`，天照使用 `amaturasu.svg`，不要按国家 ID 推测文件名。若日后某国没有图标，省略 `icon_ref`，不要写空路径或占位 SVG。

默认不填写 `label_anchor`：国家采用生成国土的面积重心，大陆采用区域多边形内实际陆地的重心。岛屿或凹形海岸使重心落海时，选择距重心最近的陆地格；跨世界接缝的区域先展开环绕再计算。边界更新后中心自动同步。确需美术手调时才填写可选 `label_anchor: [col, row]`，整数格号必须在所属区域内。屏幕定位对准国家图标或区域主名称的中心，附属说明和按钮留白不参与地理定位；首都仍以设定点为准，文字显示在其右侧。

删除一个纯多边形特殊区域，可删除该区域记录；如被其他配置或拓扑关系引用，要同步移除引用。删除一个国家不能仅删除 `areas.yaml` 条目：还必须先决定其世界像素归属、移除相关 L1 地图/来源/专题接口、整理拓扑与实体链接，再重新生成并校验。无意中留下未归属陆地或断裂国界会造成错误。

### C. 添加或修改世界地点标识

编辑 `data/maps/locations.yaml` 中的 `world` 地点。每条记录需有稳定 `loc.<slug>`、现存内容实体的 `entity_id`、名称、`kind`、`position: {x, y}` 和派生 `col/row`。世界网格为 136 × 60：`col = round(x × 135)`、`row = round(y × 59)`；世界横向环绕，建议 `0 ≤ x < 1`、`0 ≤ y ≤ 1`，对应瓦片必须是陆地。移动位置时同时更新 `position` 与 `col/row`。删除标识时删掉对应地点记录，并检查是否有城市详图或其他数据引用它；删除地图标识**不会**自动删除百科实体。

可用 `kind`：`capital`、`city`、`region`、`ruin`、`landmark`。世界图上的地点目前是定位标识，并非整片城区。需要城市面积时请走 L2 城区流程，不要把一个点误当成城市轮廓。

### D. 新增国家或国家内政区/标识

新增国家涉及政治参考图颜色、内容实体、`sources.yaml` 颜色与 `derive_from_parent`、`layers.yaml` 地图、`areas.yaml` 世界和国家区域、`features.yaml` 空接口及测试，建议按下节的资料单委托 AI/开发者实施，避免漏掉父子引用。已有 13 国的国家层无需再创建。

国家和城市专题要素使用下述契约；每个要素只出现在所属地图层。现有政区数据仍为空，不应依据地形或示意街区自动推断行政边界。城市 L2 仍需要城区父瓦片范围和 L1/L2 共同边界，目前仅卡夏·欧尔莱特有试点。

## 专题数据契约

每张详图保留 `administrative_regions`、`terrain`、`waterways`、`routes`、`settlements` 五个数组。要素必须具有全局唯一 `id`、`kind`、`label`、`description`、`source` 和 `geometry_status: provisional | verified`；已有百科记录通过可选 `entity_id` 关联。`label_position: [x,y]` 可选，不设置时仅绘制图形并保留目录入口。

所有坐标均属于本张地图的连续归一化空间，`x` 向东、`y` 向南，范围 0–1；它们不是格号、屏幕像素或现实经纬度。位置由 `pointOnMap` 转为地图坐标，不四舍五入到六边形。

| 分类 | kind / geometry | 参数 |
| --- | --- | --- |
| 地形 | `plain`、`upland`、`hill`、`low-hills` / `ellipse` | `center`、`radius`；`elevation.level` 为 0–6 的整数层级；可选 `core_level` 不低于外圈，`core_ratio` 为 0–1 内圈半径比例；不是米 |
| 河流 | `river` / `polyline` | `points` 按流向排列；当前样板 `flow_direction: southwest-to-northeast`，具体源头和河口未定义 |
| 道路 | `road`、`rail` / `polyline` | `points`；专题数据不自动代表正式路网 |
| 政区 | `district` / `polygon` | 预留契约：`points` 至少三个点；当前无已确认实例，尚未接入 Pixi 绘制 |
| 地点 | `point` / `point` | 预留契约：`position`；当前标识由 `locations.yaml` 提供，专题点尚未接入 Pixi 绘制 |
| 城市布局 | `concentric-city` / `ellipse` | `center`、`radius`；`layout.rings` 递增，`spokes` 为 4–24 的偶数，`seed` 为整数 |

参照现有记录新增要素。地形只使用平整顶面和整数台阶，不添加连续高度函数、噪声、模糊山影或随机块高。当前基础厚度为 6 个艺术单位，每个地形层级增加 5 个单位；它们在 `blocks.mjs` 定义，不代表现实海拔。河道经过的块体降低为不逆流上升的分层河床。`relief.height` 和 `roughness` 已删除，校验会拒绝旧字段。

城市保持 180° 中心对称；街区、绿地和建筑只作示意，不创建虚构的独立百科实体。地形、河道与城市内部布局改变不需要重新生成 `tiles.yaml`。当前城市模型的展示大小由 `features.yaml` 的城区椭圆控制；改变父级逻辑范围或地图坐标比例时仍需调整 `sources.yaml` 并运行 `map:generate`。展示基座不是正式城区边界。

Pixi 绘制在 `assets/scripts/atlas/pixi-renderer.ts`，逻辑坐标在 `atlas/space.mjs`，块体高度、顶面/侧面与拾取在 `atlas/blocks.mjs`，相机和标签在 `atlas/app.ts`；层级规则与对称城区在 `atlas/terrain.mjs`，界面在 `assets/styles/pages/atlas-pixi.css`。旧 SVG 渲染器不恢复平行实现。`npm run test:maps` 检查平整块面、厚度、分层河床、城市对称、升高后拾取和坐标契约，已纳入 `wiki:validate`。

## 本地美术参考

`assets/map-references/ultimate_reference.png` 与 `tactical-sandbox-reference.png` 是本地参考，目录已进入 `.gitignore`。不要放回 `static/`，不要用 `resources.Get` 引入，不依赖这些文件构建。运行时由数据和 PixiJS Graphics 块体构成，不加载参考图或高度纹理。

## 给 AI/开发者的资料单

维护者可直接编辑一份 Markdown 资料单并交给 AI，例如 `docs/map-requests/<stable-id>.md`（该目录可按需创建；资料单不会被网站自动读取）。建议采用以下内容，无法确认的字段写“未知”，不要猜：

```text
操作：新增 / 修改 / 删除
对象：国家 / 政区 / 地形 / 水系 / 路线 / 地点 / 城区
稳定 ID（已有对象必填）：
中文显示名：
所属地图与父级区域：
百科实体 ID 或档案路径：
位置或边界：参考图路径、坐标、相邻关系或文字描述
缩放层级：世界 / 国家 / 城市
资料来源与确定性：已确认 / 暂定 / 未知
需要保留的旧关系或链接：
期望显示方式：颜色覆盖 / 边界 / 线 / 标签 / 图标
明确不能推断的部分：
```

交付时要求 AI/开发者：只改与该对象有关的源文件，不手改 `tiles.yaml`；必要时生成瓦片；补校验和浏览器测试；回报哪些部分只是暂定推断、哪些因资料不足而未显示。即使只给文字设定，也应先建立“已知/未知”的边界，不自动虚构地理事实。

## 验证和发布

修改参考图、生成配置或国家网格后先运行：

```powershell
npm run map:generate
```

仅改名称、地点、CSS 或档案内容时通常不用重生瓦片。随后依次运行：

```powershell
npm run wiki:validate
npm run wiki:build
$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:browser
```

最后人工检查桌面与窄屏：点击目标国家是否仍在世界页原位放大、边界是否无错位、邻国和海洋是否可见、不同缩放级别是否只显示适合的标签、深浅主题是否清楚。若国家或城区形状改动，特别检查跨国相邻处和世界左右环绕接缝。构建通过不等于地理内容已核实。

## PixiJS 地图检查

运行 `npm run typecheck:atlas` 检查类型。地理坐标先由 `blocks.mjs` 升到块面，再通过 `space.mjs` 相机投影；点击按可见顶面/侧面拾取后回到逻辑归属。不要单独给地图 DOM 施加 CSS 缩放。默认斜俯视为 0.78；“块面描边”只控制边线，“地形层级”关闭后仍保留基础块体厚度。资料面板位于目录；无 WebGL2 时保留目录和档案链接。

标签禁用通用按钮的 transform 过渡，直接跟随相机；否则拖动、缩放和资料聚焦过程中会产生视觉滞后。检查居中时应比较图标/主名称本体与区域中心，不能只比较整个标签框。

国界约为 1.8px，选中国家约为 2.6px，并位于国家地形上方。不要仅增加世界单位线宽，否则缩小时仍然看不清。国家图标统一在倍率 0.28 后显示，当前聚焦国家也不例外；发生文字碰撞时先收起名称，保留徽记与名称提示。徽记仍可能因越界或真实图标碰撞隐藏，目录入口始终保留。

`layers.yaml` 不再保留旧 SVG 的 `context`、`chunk_size`、`appearance`、独立相机参数及显示 `gap`；`areas.yaml` 不再使用旧 CSS 的 `style_token`。逻辑网格、父子配准和陆地数量预算继续验证，旧国家页地址继续跳转到统一地图。
