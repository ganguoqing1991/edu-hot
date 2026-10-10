// 可选模块。它们只对 AI 行业有意义：做别的行业时两项都设为 false，或者按 docs/customize.md 整块删掉。
// 关掉以后：导航里不再出现入口，对应的定时任务不再运行，页面与接口返回 404。

export const FEATURES = {
  /** 模型榜：AI 行业专用（汇总公开评测算共识排名）。教育行业用不上，关掉。 */
  leaderboard: false,
  /** Codex 重置监控：AI 行业专用（盯 OpenAI Codex 的额度重置公告）。教育行业用不上，关掉。 */
  codexResetMonitor: false,
} as const;
