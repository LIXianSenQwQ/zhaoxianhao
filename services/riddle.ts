/**
 * services/riddle.ts — 家族灯谜会服务封装（云函数：riddle）
 * V2.0：题库 / 作答（合规版，无现金奖池）
 */
import { call, write } from './request';

/** 灯谜列表（分页） */
export function riddleList(page = 1) {
  return call('riddle', { action: 'riddle.list', page }, `riddle_list_${page}`, 30000);
}

/** 创建灯谜（需要内容审核权限） */
export function riddleCreate(params: { question: string; answer?: string; hint?: string; category?: string; difficulty?: number }) {
  return write('riddle', { action: 'riddle.create', ...params }, 'riddle', `create_${Date.now()}`);
}

/** 作答 */
export function riddleAnswer(riddleId: string, guess: string) {
  return write('riddle', { action: 'riddle.answer', riddleId, guess }, 'riddle', `answer_${Date.now()}`);
}
