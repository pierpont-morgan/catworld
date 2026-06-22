# 猫表帧索引（cat.png 动作 → 帧号）

> 固定参照表。下次对话直接读这个文件，不用再识别图片。
> 机器可读版同目录 `cat-sheet-index.json`。

- **图**：`public/assets/cat.png`（896×4608），带文字标签版 `src/assets/cat/white cat with text.png`（同布局）。
- **网格**：14 列 × 72 行，每帧 64×64。**帧号 = 行×14 + 列**。
- 共 66 行有内容（行 0–65），行 66–71 空白。

## ⚠ 左右标注不可靠（重要）

带文字图上的 **left/right 标注和实际朝向不一致**——源素材本身朝向就乱（这是已修过的 bug）。
**不是整张统一反**：走路行反了（表写 right 实际朝左），跑步行没反（表 right 就是朝右）。
- manifest.ts 已接入的行：下表 **真实朝向** 列是核对过的、可信。
- 标 `?` 的未接入行：接之前**肉眼看一眼帧朝哪边**，别照抄表上文字。

## 已接入游戏（manifest.ts）

| 行 | 帧号 | 表上文字 | 真实朝向 | manifest 动画 |
|----|------|----------|----------|---------------|
| 2  | 28–33  | Walk down  | 下 | cat-idle-down / cat-walk-down |
| 3  | 42–47  | Walk up    | 上 | cat-idle-up / cat-walk-up |
| 4  | 56–61  | Walk right | **左** | cat-idle-left / cat-walk-left |
| 5  | 70–75  | Walk left  | **右** | cat-idle-right / cat-walk-right |
| 8  | 112–115 | Run down  | 下 | cat-run-down |
| 9  | 126–129 | Run up    | 上 | cat-run-up |
| 10 | 140–144 | Run right | 右 | cat-run-right |
| 11 | 154–158 | Run left  | 左 | cat-run-left |
| 29 | 406–416 | Right paw swipe (stand, front) | 下 | cat-attack2-down（连招第2下/右爪）|
| 30 | 420–430 | Left paw swipe (stand, front)  | 下 | cat-attack-down（连招第1下/左爪）|
| 31 | 434–438 | Paw swipe (stand, back)        | 上 | cat-attack-up / cat-attack2-up |
| 32 | 448–458 | Left paw swipe (stand, left)   | 左 | cat-attack-left |
| 33 | 462–472 | Right paw swipe (stand, left)  | 左 | cat-attack2-left |
| 34 | 476–486 | Left paw swipe (stand, right)  | 右 | cat-attack-right |
| 35 | 490–500 | Right paw swipe (stand, right) | 右 | cat-attack2-right |
| 62 | 868–870 | Jump (back)  | 上 | cat-jump-up（右键飞扑）|
| 63 | 882–886 | Jump (left)  | 左 | cat-jump-left |
| 64 | 896–900 | Jump (right) | 右 | cat-jump-right |

## 未接入（可后续接的素材）

| 行 | 帧号 | 帧数 | 表上文字 | 备注 |
|----|------|------|----------|------|
| 0  | 0–3      | 4  | （无标签）        | 走路上方多余姿势 |
| 1  | 14–17    | 4  | （无标签）        | 多余姿势 |
| 6  | 84–97    | 14 | （无标签）        | 走/跑之间的 14 帧动画 |
| 7  | 98–100   | 3  | （无标签）        | 3 帧动画 |
| 12 | 168–175  | 8  | Lick paw sit front  | 舔爪·坐 |
| 13 | 182–189  | 8  | Lick paw lie front  | 舔爪·趴 |
| 14 | 196–198  | 3  | Meow sit front      | 喵·坐 |
| 15 | 210–212  | 3  | Meow lie front      | 喵·趴 |
| 16 | 224–226  | 3  | Meow stand front    | 喵·站 |
| 17 | 238–245  | 8  | Scratch (sit, left)  | 挠痒·L/R 待核 |
| 18 | 252–259  | 8  | Scratch (sit, right) | 挠痒·L/R 待核 |
| 19 | 266–270  | 5  | Tail wag (sit, front)  | 摇尾 |
| 20 | 280–284  | 5  | Tail wag (sit, back)   | 摇尾 |
| 21 | 294–298  | 5  | Tail wag (sit, left)   | 摇尾·L/R 待核 |
| 22 | 308–312  | 5  | Tail wag (sit, right)  | 摇尾·L/R 待核 |
| 23 | 322–326  | 5  | Tail wag (stand, front)| 摇尾 |
| 24 | 336–340  | 5  | Tail wag (stand, back) | 摇尾 |
| 25 | 350–354  | 5  | Tail wag (stand, left) | 摇尾·L/R 待核 |
| 26 | 364–368  | 5  | Tail wag (stand, right)| 摇尾·L/R 待核 |
| 27 | 378–380  | 3  | Tail wag (lie, left)   | 摇尾·L/R 待核 |
| 28 | 392–394  | 3  | Tail wag (lie, right)  | 摇尾·L/R 待核 |
| 36 | 504–514  | 11 | Right paw swipe (sit, front)  | 坐姿挥爪 |
| 37 | 518–528  | 11 | Left paw swipe (sit, front)   | 坐姿挥爪 |
| 38 | 532–536  | 5  | Paw swipe (sit, back)         | 坐姿挥爪·背 |
| 39 | 546–556  | 11 | Left paw swipe (sit, left)    | L/R 待核 |
| 40 | 560–570  | 11 | Right paw swipe (sit, left)   | L/R 待核 |
| 41 | 574–584  | 11 | Left paw swipe (sit, right)   | L/R 待核 |
| 42 | 588–598  | 11 | Right paw swipe (sit, right)  | L/R 待核 |
| 43 | 602–608  | 7  | Yawn (sit, front)   | 打哈欠 |
| 44 | 616–617  | 2  | Sleep 1 (left, front)  | 睡觉 |
| 45 | 630–631  | 2  | Sleep 1 (right, front) | 睡觉 |
| 46 | 644–645  | 2  | Sleep 1 (left, back)   | 睡觉 |
| 47 | 658–659  | 2  | Sleep 1 (right, back)  | 睡觉 |
| 48 | 672–673  | 2  | Sleep 2 (left, front)  | 睡觉 |
| 49 | 686–687  | 2  | Sleep 2 (right, front) | 睡觉 |
| 50 | 700–701  | 2  | Sleep 3 (left, front)  | 睡觉 |
| 51 | 714–715  | 2  | Sleep 3 (right, front) | 睡觉 |
| 52 | 728–729  | 2  | Sleep 4 (left, front)  | 睡觉 |
| 53 | 742–743  | 2  | Sleep 4 (right, front) | 睡觉 |
| 54 | 756–757  | 2  | Sleep 5 (left, front)  | 睡觉 |
| 55 | 770–771  | 2  | Sleep 5 (right, front) | 睡觉 |
| 56 | 784–793  | 10 | Eat food (stand, front)| 吃东西·可接吃鱼 |
| 57 | 798–805  | 8  | Eat food (stand, back) | 吃东西 |
| 58 | 812–821  | 10 | Eat food (stand, left) | 吃东西·L/R 待核 |
| 59 | 826–835  | 10 | Eat food (stand, right)| 吃东西·L/R 待核 |
| 60 | 840–841  | 2  | Hiss (front, left)  | 哈气·L/R 待核 |
| 61 | 854–855  | 2  | Hiss (front, right) | 哈气·L/R 待核 |
| 65 | 910–913  | 4  | On hind legs        | 后腿站立 |

## 帧号速算

`第 N 行第 C 列的帧号 = N*14 + C`（C 从 0 开始）。例：行 56 第 0 列 = 784。
某行的连续帧 = `[行*14 + 起列 .. 行*14 + 止列]`，起止列见上表“帧号”。
