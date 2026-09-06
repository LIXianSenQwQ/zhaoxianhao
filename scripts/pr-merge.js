#!/usr/bin/env node
/**
 * scripts/pr-merge.js — PR 合并辅助脚本
 * 目的：合并前跑「目标分支存在 → base 与远端一致 → 本地 verify 全绿 → squash 建议」
 *       避免脏 PR 合入 dev/main。
 *
 * 用法：
 *   node scripts/pr-merge.js --base dev --head feature/R25-compliance [--push]
 *   node scripts/pr-merge.js --base dev --head fix/xxx --message "fix(R25): ..." --push
 *
 * 实现说明：为避免子进程管道捕获的兼容问题（部分受限环境 EPERM），
 *   命令输出统一落临时文件后读取（shell 文件重定向，不经 stdio 管道）。
 *   合并动作始终由 GitHub PR 完成，本脚本仅做校验与建议。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function sh(cmd) {
  const tmp = path.join(os.tmpdir(), `prm_${process.pid}_${Date.now()}.out`);
  try {
    execSync(`${cmd} > "${tmp}" 2>&1`, { stdio: 'ignore', shell: true });
    const out = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8').trim() : '';
    fs.unlinkSync(tmp);
    return { ok: true, out };
  } catch (e) {
    const out = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8').trim() : '';
    fs.unlinkSync(tmp);
    return { ok: false, out, code: e.status };
  }
}

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
const base = arg('base') || 'dev';
const head = arg('head');
const message = arg('message');
const push = args.includes('--push');
const skipVerify = args.includes('--skip-verify');

if (!head) {
  console.error('用法: node scripts/pr-merge.js --base dev --head feature/xxx [--message "..."] [--push] [--skip-verify]');
  process.exit(1);
}

let failed = false;
const step = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
};

console.log(`\n=== PR 合并前检查：${head} → ${base} ===\n`);

// 1) head 分支存在
const headCheck = sh(`git rev-parse --verify ${head}`);
step(headCheck.ok, `分支 ${head} 存在${headCheck.ok ? `（${headCheck.out.split('\n')[0]}）` : ''}`);

// 2) base 分支存在
const baseCheck = sh(`git rev-parse --verify ${base}`);
step(baseCheck.ok, `本地分支 ${base} 存在`);

// 3) base 与远端一致性（有 remote 才检查）
const remote = sh('git remote -v');
if (remote.ok && remote.out.trim()) {
  const remoteSha = sh(`git ls-remote origin refs/heads/${base}`);
  if (remoteSha.ok && remoteSha.out.trim()) {
    const rsha = remoteSha.out.split(/\s+/)[0];
    const lsha = baseCheck.out.split('\n')[0];
    step(!!rsha && rsha === lsha, `${base} 与远端一致${rsha && lsha && rsha !== lsha ? '（先 git pull origin ' + base + '）' : ''}`);
  } else {
    console.log('⚠ 远端查询失败，跳过一致性检查');
  }
} else {
  console.log('⚠ 未配置 git remote，跳过远端一致性检查');
}

// 4) 本地 verify 门禁
if (!skipVerify) {
  console.log('\n运行 npm run verify ...（请耐心等待）');
  const v = sh('npm run verify');
  const ok = v.ok && !/fail\s+[1-9]|✖|fail\s*:?\s*[1-9]|\berrors?: *[1-9]/i.test(v.out);
  step(ok, '本地 verify 通过（tests + lint + check:functions）');
  if (!ok) console.log((v.out.split('\n').slice(-12)).join('\n'));
} else {
  console.log('⚠ 已跳过本地 verify（--skip-verify）');
}

// 5) 合并建议
console.log('\n=== 合并建议 ===');
console.log('GitHub PR 采用 Squash Merge，建议提交信息：');
const topic = head.replace(/^feature\//i, '').replace(/^fix\//i, '').replace(/^docs\//i, '');
const suggest = message || `feat(${topic}): 描述你的改动`;
console.log(`  ${suggest}`);
if (push) {
  console.log(`\npush 命令：git push -u origin ${head}`);
  console.log('然后打开 GitHub → New Pull Request → 选 base 与 head → Squash 合并。');
}

console.log(failed ? '\n✗ 存在未通过项，请修复后重试。\n' : '\n✓ 检查通过，可以发起 PR。\n');
process.exit(failed ? 1 : 0);
