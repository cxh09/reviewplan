<script setup>
import { useRouter } from 'vue-router'
import { HomeIcon } from 'tdesign-icons-vue-next'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <t-card :bordered="false" class="not-found__card">
      <div class="not-found__code">404</div>
      <h2 class="not-found__title">页面不存在</h2>
      <p class="not-found__desc">你访问的地址已被移除或从未存在过。</p>
      <t-button theme="primary" @click="router.replace('/home')">
        <template #icon><HomeIcon /></template>
        返回首页
      </t-button>
    </t-card>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.not-found__card {
  width: 100%;
  max-width: 480px;
  padding: 48px 32px;
  text-align: center;
}

.not-found__code {
  font-size: 108px;
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(135deg, #0052d9, #00a870);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.not-found__title {
  margin: 20px 0 8px;
  font-size: 30px;
  font-weight: 600;
}

.not-found__desc {
  margin: 0 0 24px;
  font-size: 21px;
  color: var(--td-text-color-secondary);
}
</style>
