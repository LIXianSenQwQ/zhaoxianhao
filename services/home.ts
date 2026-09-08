/**
 * services/home.ts — 虚拟家园服务封装（云函数：home）
 * V2.0 F9/F10：家园初始化/布局/成长/互访
 */
import { call, write, read } from './request';

/** 初始化/获取家园（幂等） */
export function worldInit() {
  return read('home', { action: 'world.init' }, `home_world_${Date.now().toString(36)}`, 30000);
}

/** 查询家园布局（可指定他人） */
export function worldGet(targetOpenid?: string) {
  return read('home', { action: 'world.get', targetOpenid }, `home_get_${targetOpenid || 'self'}`, 30000);
}

/** 放置建筑（云函数内 engine 校验落位与解锁） */
export function worldPlace(type: string, x: number, y: number) {
  return write('home', { action: 'world.place', type, x, y }, 'home', `place_${type}_${Date.now()}`);
}

/** 结算经验（自动升级） */
export function worldGrow(gain: number) {
  return write('home', { action: 'world.grow', gain }, 'home', `grow_${Date.now()}`);
}

/** 访问他人家园（每日 ≤20 次频控） */
export function worldVisit(targetOpenid: string) {
  return write('home', { action: 'world.visit', targetOpenid }, 'home', `visit_${Date.now()}`);
}

/** 点赞家园 */
export function worldLike(targetOpenid: string) {
  return write('home', { action: 'world.like', targetOpenid }, 'home', `like_${Date.now()}`);
}

/** 设置家园可见性 SELF/FAMILY/CLAN */
export function worldSetPrivacy(privacy: 'SELF' | 'FAMILY' | 'CLAN') {
  return write('home', { action: 'world.setPrivacy', privacy }, 'home', `privacy_${Date.now()}`);
}

/** 创建虚拟角色 */
export function avatarCreate(name: string, face?: Record<string, any>, outfit?: any[]) {
  return write('home', { action: 'avatar.create', name, face, outfit }, 'home', `av_create_${Date.now()}`);
}

/** 查询虚拟角色 */
export function avatarGet() {
  return read('home', { action: 'avatar.get' }, 'home_avatar', 30000);
}

/** 更新虚拟角色 */
export function avatarUpdate(params: { name?: string; face?: Record<string, any>; outfit?: any[]; title?: string }) {
  return write('home', { action: 'avatar.update', ...params }, 'home', `av_upd_${Date.now()}`);
}
