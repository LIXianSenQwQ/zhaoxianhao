/**
 * services/quiz.ts — 百业问学服务封装（云函数：quiz）
 * V2.0：行业题库 / 闯关作答
 */
import { call, write, read } from './request';

/** 题目列表（按行业分页） */
export function quizList(industry: string, page = 1) {
  return read('quiz', { action: 'quiz.list', industry, page }, `quiz_${industry}_${page}`, 30000);
}

/** 创建题目（族人出题 → PENDING，审核后上架） */
export function quizCreate(params: {
  question: string;
  choices: Array<{ label?: string; text: string }>;
  correctIndex: number;
  industry?: string;
  difficulty?: number;
  explanation?: string;
}) {
  return write('quiz', { action: 'quiz.create', ...params }, 'quiz', `create_${Date.now()}`);
}

/** 待审题目（EDITOR+） */
export function quizPending(page = 1) {
  return call('quiz', { action: 'quiz.pending', page }, { timeout: 30000 });
}

/** 审核通过（EDITOR+） */
export function quizApprove(questionId: string) {
  return write('quiz', { action: 'quiz.approve', questionId }, 'quiz', `review_${questionId}`);
}

/** 审核驳回（EDITOR+） */
export function quizReject(questionId: string) {
  return write('quiz', { action: 'quiz.reject', questionId }, 'quiz', `review_${questionId}`);
}

/** 作答（仅 ACTIVE；每用户每题一次） */
export function quizAnswer(questionId: string, selectedIndex: number) {
  return write('quiz', { action: 'quiz.answer', questionId, selectedIndex }, 'quiz', `answer_${Date.now()}`);
}
