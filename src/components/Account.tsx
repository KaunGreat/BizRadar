import type { AuthSession } from "../auth";
import { logout } from "../auth";
import { formatDate } from "../projects";
import { History } from "./History";
import { IKey, ILogout, IMail, IUser } from "./icons";

export function Account({
  session,
  onLoggedOut,
  onToast,
  onOpenNiche,
  onGoRadar,
}: {
  session: AuthSession;
  onLoggedOut: () => void;
  onToast: (msg: string) => void;
  onOpenNiche: (nicheId: string) => void;
  onGoRadar: () => void;
}) {
  const { user, demo } = session;
  const initials = (user.name || user.email).trim().slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await logout();
    onLoggedOut();
    onToast("Вы вышли из аккаунта");
  };

  return (
    <div className="space-y-6">
      {/* ---------- профиль ---------- */}
      <div className="panel anim-rise relative overflow-hidden rounded-xl p-5">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          {/* аватар */}
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 font-display text-xl font-bold"
            style={{ borderColor: "#3ce6a4", background: "rgba(60,230,164,0.12)", color: "#3ce6a4" }}
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold">{user.name || "Без имени"}</h2>
              <span className="rounded border border-cy/45 bg-cy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cy">
                {user.role === "admin" ? "админ" : "пользователь"}
              </span>
              {demo && (
                <span className="rounded border border-vio/45 bg-vio/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vio">
                  demo · без бэкенда
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-mut">
              <span className="inline-flex items-center gap-1.5">
                <IMail size={14} className="text-dim" /> {user.email}
              </span>
              {user.created_at && (
                <span className="inline-flex items-center gap-1.5">
                  <IUser size={14} className="text-dim" /> с нами с {formatDate(user.created_at)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <IKey size={14} className="text-dim" /> JWT · сессия активна
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-[12.5px] font-bold text-mut transition hover:border-cor/50 hover:text-cor active:scale-[0.98]"
          >
            <ILogout size={16} /> Выйти
          </button>
        </div>
      </div>

      {/* ---------- мои анализы ---------- */}
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-sig" style={{ boxShadow: "0 0 8px rgba(60,230,164,0.6)" }} />
          <h3 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-mut">Мои анализы</h3>
          <span className="text-[11px] text-dim">видны только вам · открываются без повторного сканирования</span>
        </div>
        <History onToast={onToast} onOpenNiche={onOpenNiche} onGoRadar={onGoRadar} />
      </div>
    </div>
  );
}
