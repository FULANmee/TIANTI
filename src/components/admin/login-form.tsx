"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: formData.get("email"),
      password: formData.get("password")
    };

    startTransition(async () => {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "登录失败，请检查账号或密码。");
        return;
      }

      window.location.href = "/admin";
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="ui-kicker">Editor Sign In</p>
        <h2 className="text-4xl tracking-[-0.04em] text-[var(--foreground)]">编辑账号登录</h2>
        <p className="text-sm leading-7 ui-subtle">使用已有编辑账号进入后台。登录成功后会直接回到工作台总览。</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="ui-field-label"><span>邮箱</span><input name="email" type="email" autoComplete="email" className="ui-input" /></label>
        <label className="ui-field-label"><span>密码</span><input name="password" type="password" autoComplete="current-password" className="ui-input" /></label>
        {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <button disabled={pending} className="ui-button-primary w-full text-sm">
          {pending ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
