<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { fetchYoyooMe, loginWithYoyoo } from "@/api/auth";

const router = useRouter();

const email = ref("");
const password = ref("");
const loading = ref(false);
const errorMsg = ref("");

(async () => {
  try {
    await fetchYoyooMe();
    router.replace("/agentic/chat");
  } catch { }
})();

async function handleLogin() {
  if (!email.value.trim() || !password.value) {
    errorMsg.value = "请输入邮箱和密码";
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    await loginWithYoyoo(email.value.trim(), password.value);
    router.replace("/agentic/chat");
  } catch (err: any) {
    if (err.status === 429 || err.status === 503) {
      errorMsg.value = "尝试次数过多，请稍后再试";
    } else {
      errorMsg.value = "邮箱或密码不正确";
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-logo">
        <img src="/logo.png" alt="BeatyClaw 数字员工" width="80" height="80" />
      </div>
      <h1 class="login-title">BeatyClaw 数字员工</h1>
      <p class="login-desc">登录你的 AI 工作台</p>

      <form class="login-form" @submit.prevent="handleLogin">
        <input
          v-model="email"
          type="email"
          class="login-input"
          placeholder="邮箱"
          autocomplete="email"
          autofocus
        />
        <input
          v-model="password"
          type="password"
          class="login-input"
          placeholder="密码"
          autocomplete="current-password"
          @keyup.enter="handleLogin"
        />

        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "..." : "登录" }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.login-view {
  height: calc(100 * var(--vh));
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-primary;
}

.login-card {
  width: 480px;
  max-width: calc(100vw - 32px);
  padding: 56px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: $bg-card;
  text-align: center;

  @media (max-width: $breakpoint-mobile) {
    padding: 32px 24px;
  }
}

.login-logo {
  margin-bottom: 24px;

  img {
    border-radius: 50%;
    object-fit: cover;
  }
}

.login-title {
  font-size: 26px;
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 10px;
}

.login-desc {
  font-size: 14px;
  color: $text-muted;
  margin: 0 0 32px;
  line-height: 1.6;
}

.login-method-toggle {
  display: flex;
  margin-bottom: 24px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  overflow: hidden;

  .toggle-btn {
    flex: 1;
    padding: 10px;
    border: none;
    background: transparent;
    color: $text-muted;
    font-size: 13px;
    cursor: pointer;
    transition: all $transition-fast;

    &.active {
      background: $text-primary;
      color: var(--text-on-accent);
    }

    &:not(.active):hover {
      background: rgba(var(--accent-primary-rgb), 0.06);
    }
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 15px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  transition: border-color $transition-fast;
  box-sizing: border-box;
  font-family: $font-code;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: $accent-primary;
  }
}

.login-error {
  font-size: 13px;
  color: $error;
  text-align: left;
}

.login-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: $radius-sm;
  background: $text-primary;
  color: var(--text-on-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
