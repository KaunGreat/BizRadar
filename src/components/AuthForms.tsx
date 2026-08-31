import { useState } from "react";
import { AuthError, enterDemoMode, login, register, type AuthSession } from "../auth";
import { IBolt, IEye, IEyeOff, ILock, IMail, IUser } from "./icons";

type Mode = "login" | "register";

function Field({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-line bg-bg2/60 px-3.5 py-2.5 transition focus-within:border-cy/60">
      <span className="text-dim">{icon}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-dim";

export function AuthForms({ onAuthed }: { onAuthed: (s: AuthSession) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; kind: "http" | "network" } | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const fail = (err: unknown) => {
    if (err instanceof AuthError) {
      setError({ text: err.message, kind: err.kind });
    } else {
      setError({ text: err instanceof Error ? err.message : "Что-то пошло не так", kind: "http" });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError({ text: "Введите корректный e-mail", kind: "http" });
      return;
    }
    if (password.length < 8) {
      setError({ text: "Пароль должен быть не короче 8 символов", kind: "http" });
      return;
    }

    setLoading(true);
    try {
      const session =
        mode === "login"
          ? await login(email, password)
          : await register(email, password, name.trim());
      onAuthed(session);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = () => {
    onAuthed(enterDemoMode(email || "demo@bizradar.local", name.trim() || undefined));
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* переключатель вход/регистрация */}
      <div className="mb-5 flex overflow-hidden rounded-lg border border-line">
        {(
          [
            ["login", "Вход"],
            ["register", "Регистрация"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex-1 py-2.5 font-display text-[12.5px] font-bold transition ${
              mode === m ? "bg-sig/15 text-sig" : "bg-bg1 text-mut hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3.5">
        {mode === "register" && (
          <Field icon={<IUser size={17} />}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              className={inputCls}
              autoComplete="name"
            />
          </Field>
        )}

        <Field icon={<IMail size={17} />}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            type="email"
            className={inputCls}
            autoComplete="email"
          />
        </Field>

        <Field icon={<ILock size={17} />}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            type={showPass ? "text" : "password"}
            className={inputCls}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            className="text-dim transition hover:text-cy"
            aria-label={showPass ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPass ? <IEyeOff size={17} /> : <IEye size={17} />}
          </button>
        </Field>

        {error && (
          <div
            className={`anim-rise rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
              error.kind === "network" ? "border-amb/40 bg-amb/[0.08] text-amb" : "border-cor/40 bg-cor/[0.08] text-cor"
            }`}
            role="alert"
          >
            {error.text}
            {error.kind === "network" && (
              <button
                type="button"
                onClick={enterDemo}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-amb/50 bg-amb/10 py-2 font-display text-[11.5px] font-bold text-amb transition hover:bg-amb/20 active:scale-[0.98]"
              >
                <IBolt size={14} /> Войти в демо-режим (без сервера)
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sig py-3 font-display text-[13px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="pulse-dot h-1.5 w-1.5 rounded-full bg-bg0"
                    style={{ animationDelay: `${d * 0.18}s` }}
                  />
                ))}
              </span>
              {mode === "login" ? "Входим…" : "Создаём аккаунт…"}
            </>
          ) : mode === "login" ? (
            "Войти"
          ) : (
            "Создать аккаунт"
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-dim">
        {mode === "login" ? (
          <>
            Нет аккаунта?{" "}
            <button type="button" onClick={() => switchMode("register")} className="font-semibold text-cy transition hover:text-sig">
              Зарегистрируйтесь
            </button>
          </>
        ) : (
          <>
            Уже с нами?{" "}
            <button type="button" onClick={() => switchMode("login")} className="font-semibold text-cy transition hover:text-sig">
              Войдите
            </button>
          </>
        )}
      </p>
    </div>
  );
}
