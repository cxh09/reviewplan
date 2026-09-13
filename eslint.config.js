import js from '@eslint/js'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'server/node_modules/**',
      'server/data/**',
      'public/**',
      'dev.log',
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  // 关掉与 Prettier 冲突的格式类规则，格式化交给 Prettier
  prettierConfig,
  {
    files: ['**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // 现有组件是 App / HomeView 这类单词名，不强求多单词命名
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // 服务端跑在 Node 环境
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
]
