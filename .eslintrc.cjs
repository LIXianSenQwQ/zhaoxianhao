/**
 * ESLint 配置（.eslintrc.cjs - CommonJS 格式避免 package.json type 冲突）
 * 质量门禁：error 级必须修复才可合入 dev；warn 级记录到评审会跟进
 * 注：本沙箱无法 npm install，正式开发机运行 npx eslint . 验证
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  globals: {
    wx: 'readonly',
    uni: 'readonly',
    uniCloud: 'readonly',
    getCurrentPages: 'readonly',
    getApp: 'readonly'
  },
  rules: {
    // ── 质量门禁 error 级 ──
    'no-console': ['error', { allow: ['warn', 'error'] }],        // 业务代码禁 console.log（性能/安全）
    'no-debugger': 'error',
    'eqeqeq': ['error', 'always'],                                 // 禁松散等号
    'no-var': 'error',
    'prefer-const': 'error',
    'vue/no-unused-components': 'error',
    'vue/no-v-html': 'error',                                      // XSS 防线（家谱内容来自用户录入）
    '@typescript-eslint/no-explicit-any': 'warn',                  // any 逐步清零
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'complexity': ['warn', { max: 15 }],                           // 圈复杂度门禁（目标 ≤15）
    'max-depth': ['warn', { max: 4 }],                             // 嵌套深度
    'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }]
  },
  overrides: [
    {
      // 云函数：Node 环境，console.error/warn 放开
      files: ['cloud/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
      env: { node: true, es2022: true },
      rules: { 'no-console': 'off' }
    },
    {
      // 测试文件放宽
      files: ['tests/**/*.js'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' }
    }
  ],
  ignorePatterns: ['node_modules/', 'unpackage/', 'dist/', 'cloud/**/common/']
};
