/**
 * Загрузка Yandex Maps JS API 2.1.
 *
 * Ключ — публичный браузерный, читается из переменной окружения сборки:
 *   VITE_YANDEX_MAPS_KEY (этот прототип, Vite)
 *   NEXT_PUBLIC_YANDEX_MAPS_KEY (Next.js-фронтенд в frontend/)
 * Получить: https://developer.tech.yandex.ru/services/
 *   → «JavaScript API и HTTP Геокодер» → создать проект → ключ.
 * ВАЖНО: в консоли ограничьте ключ по HTTP Referer вашими доменами —
 * браузерный ключ виден в коде страницы (см. .env.example).
 *
 * ПОРЯДОК КООРДИНАТ: Яндекс = [lat, lon] (совпадает с данными бэкенда).
 * Для справки: 2ГИС MapGL использует [lon, lat] — не перепутать при миграции.
 */

export const MAPS_KEY: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_YANDEX_MAPS_KEY || "").trim();

export const YMAPS_URL = `https://api-maps.yandex.ru/2.1/?apikey=${MAPS_KEY}&lang=ru_RU&load=package.full`;

let promise: Promise<any> | null = null;

/** Синглтон-загрузка SDK. Отказ сети/таймаут → reject (карта уйдёт в офлайн-режим). */
export function loadYmaps(): Promise<any> {
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const w = window as unknown as { ymaps?: { ready: (fn: () => void) => void } };
      if (w.ymaps?.ready) {
        w.ymaps.ready(() => resolve(w.ymaps));
        return;
      }
      const s = document.createElement("script");
      s.src = YMAPS_URL;
      s.async = true;
      const timer = window.setTimeout(() => reject(new Error("Yandex Maps: таймаут загрузки SDK (9s)")), 9000);
      s.onload = () => {
        const ww = window as unknown as { ymaps?: { ready: (fn: () => void) => void } };
        if (ww.ymaps?.ready) ww.ymaps.ready(() => { window.clearTimeout(timer); resolve(ww.ymaps); });
        else { window.clearTimeout(timer); reject(new Error("Yandex Maps: ymaps недоступен после загрузки")); }
      };
      s.onerror = () => { window.clearTimeout(timer); reject(new Error("Yandex Maps: SDK не загрузился")); };
      document.head.appendChild(s);
    }).catch((e) => { promise = null; throw e; });
  }
  return promise;
}
