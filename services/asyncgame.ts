/**
 * services/asyncgame.ts — 异步对弈（一手传书）服务封装（云函数：asyncgame）
 * F7：非实时匹配 · 每步 24h 内有效 · 家族棋王榜（记分板见 scoreboard-engine）
 */
import { call, write, read } from './request';

/** 发起挑战（红方，指定被挑战的族人成员 id） */
export function asyncCreate(params: { blackMemberId: string; redMemberId?: string; redName?: string }) {
  return write('asyncgame', { action: 'game.create', ...params }, 'asyncgame', `create_${Date.now()}`);
}

/** 我的对局（待应战/进行中/已结束） */
export function asyncList() {
  return read('asyncgame', { action: 'game.list' }, 'asyncgame_list', 15000);
}

/** 单局详情（棋盘/走法日志/回合/截止） */
export function asyncState(gameId: string) {
  return read('asyncgame', { action: 'game.state', gameId }, `asyncgame_state_${gameId}`, 15000);
}

/** 应战（黑方） */
export function asyncAccept(gameId: string) {
  return write('asyncgame', { action: 'game.accept', gameId }, 'asyncgame', `accept_${gameId}_${Date.now()}`);
}

/** 走子 */
export function asyncMove(gameId: string, from: { row: number; col: number }, to: { row: number; col: number }) {
  return write('asyncgame', { action: 'game.move', gameId, from, to }, 'asyncgame', `move_${gameId}_${Date.now()}`);
}

/** 认输 */
export function asyncResign(gameId: string) {
  return write('asyncgame', { action: 'game.resign', gameId }, 'asyncgame', `resign_${gameId}_${Date.now()}`);
}
