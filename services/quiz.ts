/**
 * services/quiz.ts — 百业问学服务封装（云函数：quiz）
 * V2.0：行业题库 / 闯关作答
 */
import { call, write } from './request';

/** 题目列表（按行业分页） */
export function quizList(industry: string, page = 1) {
  return call('quiz', { action: 'quiz.list', industry, page }, `quiz_${industry}_${page}`, 30000);
}

/** 创建题目 */
export function quizCreate(params: { question: string; choices: Array<{ label?: string; text: string }>; correctIndex: number; industry?: string; difficulty?: number; explanation?: string }) {
  return write('quiz', { action: 'quiz.create', ...params }, 'quiz', `create_${Date.now()}`);
}

/** 作答 */
export function quizAnswer(questionId: string, selectedIndex: number) {
  return write('quiz', { action: 'quiz.answer', questionId, selectedIndex }, 'quiz', `answer_${Date.now()}`);
}
