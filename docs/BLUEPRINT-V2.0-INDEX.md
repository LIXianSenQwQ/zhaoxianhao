# V2.0 开发蓝图 · 结构化索引（BLUEPRINT-V2.0-INDEX）

> 本文档是《「好诚事家风」家谱系统开发框架最终细节（V2.0 五大模块版）》的仓库内结构化索引。
> 完整原文由族务对接人持有，与旧文档不一致处**以蓝图原文为准**。开发时按本索引 + 原文执行。
> **基线收口原则**：每期结束把增量回写蓝图与本索引，保持文档即事实。

## 1. 定案速查

| 项 | 定案 |
|---|---|
| 首发 | 微信小程序（uni-app Vue3 + TS + Vite）→ 二期 App → 三期 Web 门户 |
| 后端 | 微信云开发 CloudBase（云函数 Node 18+ / 文档库 / 云存储） |
| 状态管理 | Pinia（user/family/genealogy/points/calendar/notify/atmosphere/profile） |
| 族谱渲染 | 自研 Canvas 2D 分层布局（不依赖 G6） |
| 即时通讯 | 腾讯云 IM（不自研） |
| 图片/视频（V1.1） | 数据万象 CI / 媒体处理 MPS |
| 天气（V1.1） | 和风天气 + 腾讯位置服务（3h 缓存） |
| 农历（V1.1） | lunar-javascript 离线库（1900–2100） |
| 短信（V1.1） | 腾讯云短信（协助改密/敏感操作验证） |
| 交付节奏 | 9–10 周 MVP + 6 周 V1.1 + 10 周 V2.0 |

## 2. 首页设计要点（第〇部分）

- 着色：`--home-bg #FAF8F2` / 晨光渐变（165deg：#FDFCF8→#F5F1E6→#EDF2EC）/ 琉璃金渐变点睛 / 朱砂 #B03A2E 唯一主操作 / 青瓷 #7FA8A0 点缀
- 纪律：单屏彩色点缀 ≤3 处；卡片浮白 + `0 2px 12px rgba(38,34,30,0.06)`；禁止页面手写阴影
- 结构：问候区（120px 晨光渐变）→ 快捷条 5 键 → 今日要事卡流（朱砂边条仪式卡置顶）→ 家族速览（横滑 72px）→ 五键导航
- 白事素色自动切换；首屏可交互 ≤1.5s；骨架屏 ≤300ms；数据走 `atmosphere.today() + notify.digest() + weather.current()`（V1.1）

## 3. 集合清单（42）

- **MVP 核心 21**：users / members / relations / generations / branches / entry_records / documents / media / events / worship_logs / ceremonies / chat_groups / plaza_posts / calendar_items / notifications / points_accounts / points_logs / tasks+task_records / audit_logs / authorizations / settings
- **V1.1 +9**：avatars / intro_videos / albums / album_photos / photo_tags / greeting_cards / family_mottos / generation_poems / time_capsules（+辅助 weather_cities / almanac_ext）
- **V2.0 +12**：local_contents / content_categories / search_index / news_items / news_sources / user_interests / news_favorites / family_moments / moment_interactions / clan_notices / game_records / home_avatars+home_worlds

## 4. 云函数清单（23）

- **MVP 13**：auth / member / relation / entry / doc / event / ceremony / points / task / notify / upload / admin / atmosphere
- **V1.1 +4**：profile（头像/视频/问候语/家训/字辈）· album（相册/批量/标签/备份）· weather（天气/AQI）· calendar（老皇历）
- **V2.0 +6**：content（本地内容）· news（聚合/推荐/离线）· moment（家族动态/公告）· game（合规版五玩法）· home（虚拟家园）· secscan（内容安全统一入口）

## 5. 接口要点（MVP 关键 + V1.1 17 个 + V2.0 六函数）

- MVP：auth.login/certify/grantAuth · member.tree/getDetail/search · relation.calc/edit · entry.submit/audit/importExcel · doc.upload/list/get · event.* · ceremony.worship/remindScan · points.get/award · task.today/checkin · notify.list/read/digest/broadcast · atmosphere.today · admin.auditList/publish/seal/featureFlag
- V1.1：profile.saveAvatar（CI≤200KB/WEBP）· saveIntroVideo（MPS≤60s）· greeting.save/schedule · motto.submit/approve/recommend · generation.list/locate · album.save/uploadBatch（≤20 张）/tag · weather.current/switchCity · calendar.almanac · auth.setDelegates(≤3)/revokeDelegate/assistResetRequest/assistResetConfirm/setReversePassword/verifyReverse · capsule.create/check/log
- V2.0：content（上传≤2GB 分片/三级分类/搜索/备份）· news（5 源聚合/推荐三路召回/收藏/离线≤50MB/推送三档）· moment（发布/时间线热度/评论二级回复/@提及/公告置顶）· game（棋谱研习/一手传书/记分板/灯谜/问学/梨园小筑）· home（捏脸/成长长卷/家园布置/任务/互访）· secscan（msgSecCheck 统一入口）

## 6. 核心算法（第七章）

- 族谱树：五世视图（上2代下2代同辈全取）→ 家庭单元布局 → 子树宽度递归 → 视口裁剪 + 离屏缓冲；>300 节点降级方块视图；500 节点首帧 <800ms
- 称谓：双向 BFS + 称谓矩阵 (n,m,性别,长幼,姻亲)，矩阵存 settings
- 五服：n≤5 分五级（斩衰/齐衰/大功/小功/缌麻），n>5 同宗
- 隐私：privacyCheck 统一中间件 + V1.1 visibilityCheck 三级（PRIVATE/PUBLIC/GROUP）并行取严格侧
- 积分：流水先插（幂等键 bizType+bizId+userId）→ 事务更新账户
- 节气氛围：atmosphere.today 返回 moodTheme 端点色 + greeting + homeCards；白事素色覆盖
- 老皇历：lunar-javascript 本地计算 + 郝氏定制宜忌（settings.almanacExt）
- 新闻推荐：兴趣 0.5 + 热度 0.3 + 家族 0.2 召回 → score 打分（时效/权威/已读惩罚）→ 多样性控制
- 动态热度：log10(赞+评×2+享×3+1) + 牛顿冷却半衰期 24h

## 7. 合规红线（附录 C，开发前必读）

| 红线 | 禁止 |
|---|---|
| 棋牌 | 扑克对局逻辑 / 棋类实时联机匹配 / 小游戏类目内嵌 |
| 涉赌 | 虚拟货币兑换法币 / 退分退币 / 开箱抽奖 / 下注 |
| 内购 | 游戏与家园零内购，奖励只来自家族行为 |
| 新闻 | 不自建采编不爬源 / 时政不缓存正文（只外链）/ 全量过安全检测 |
| 未成年 | 少年模式游戏 ≤30 分钟/日 / 屏蔽娱乐八卦 |
| 替代路径 | 棋谱研习室（单机+打谱）/ 牌局记分板（工具非游戏）/ 灯谜会 / 百业问学 / 梨园小筑 / 异步对弈（一手传书） |

## 8. 排期（对照）

| 期 | 周 | 关键里程碑 |
|---|---|---|
| MVP | W1–W10 | 环境骨架→登录认证→世系引擎→族谱树→人物称谓→智能入谱→谱库+首页→互动祭祀→积分联调→验收上线 |
| V1.1 | E1–E6 | 头像+三级可见性→视频+相册→天气+问候+家训→字辈+老皇历→委托+改密+反向密码+百年胶囊→安全审查灰度 |
| V2.0 | F1–F10 | 合规签字+开关+plaza 迁移→本地内容→搜索备份+新闻源→推荐推送+secscan→家族动态→动态公告+棋类→围棋+记分板→灯谜问学+经营→家园角色成长→任务互访+集成测试 |

## 9. 迭代架构（第七部分）

- 功能开关：settings 集合 key=featureFlag，全局/按房支/按用户百分比三级粒度，`admin.featureFlag` 维护，关闭时入口不出现
- 版本兼容：users/members 带 schemaVersion，迁移脚本幂等可重跑，写操作统一收口云函数
- 热插拔：业务域独立分包，路由由配置生成，首页卡流由 atmosphere.today 驱动
- 灰度回滚：内测→5%→20%→全量，崩溃率 >1% 或关键指标降 10% 即回滚
