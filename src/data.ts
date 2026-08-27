export type Category = "Питание" | "Красота" | "Дети" | "Ритейл" | "Сервис" | "Здоровье";
export const CATEGORIES_LIST: Category[] = ["Питание", "Красота", "Дети", "Ритейл", "Сервис", "Здоровье"];

export const CATEGORY_COLOR: Record<Category, string> = {
  Питание: "#3ce6a4",
  Красота: "#a78bfa",
  Дети: "#ffc24b",
  Ритейл: "#4cc9f0",
  Сервис: "#ff8a5c",
  Здоровье: "#5ce6c0",
};

export interface Competitor {
  id: number;
  name: string;
  x: number;
  y: number;
  rating: number;
}

export interface Niche {
  id: string;
  title: string;
  category: Category;
  score: number;
  delta: number;
  monthly: number;
  margin: number;
  startup: number;
  avgCheck: number;
  survival: number;
  demand: number[];
  tags: string[];
  insight: string;
  breakdown: { demand: number; competition: number; margin: number; entry: number; trend: number };
  competitors: Competitor[];
}

export interface City {
  name: string;
  k: number;
}

export const CITIES: City[] = [
  { name: "Томск", k: 1 },
  { name: "Новосибирск", k: 1.25 },
  { name: "Москва", k: 1.9 },
];

export const DISTRICTS = [
  { name: "Центр", x: 405, y: 290 },
  { name: "Северный", x: 320, y: 110 },
  { name: "Академический", x: 630, y: 150 },
  { name: "Восточный", x: 660, y: 345 },
  { name: "Южный", x: 310, y: 475 },
  { name: "Заречный", x: 145, y: 300 },
];

const NAMES = [
  "Вкусно — и точка", "Шоколадница", "Додо Пицца", "Кантата", "Хлебник", "Суши Wok",
  "Пятёрочка", "Магнит", "Красное & Белое", "Чижик", "Мираторг", "ВкусВилл",
  "Л'Этуаль", "Подружка", "Рив Гош", "Улыбка радуги", "Четыре лапы", "Бетховен",
  "Английский сад", "Чемпионика", "Бэби Клуб", "Kids Lab", "Скороход", "Фиксики",
  "Дента-Люкс", "Инвитро", "Гемотест", "Клиника Фомина", "Аптека 24", "Здоровье+",
  "Автосервис Вираж", "Химчистка №1", "РемонтПро", "Мойка Блеск", "Шиномонтаж 24", "IT-Ремонт",
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 800;
const H = 560;

function genCompetitors(nicheId: string, base: number): Competitor[] {
  const rnd = mulberry(hashStr(nicheId));
  const count = base + Math.floor(rnd() * 7);
  const out: Competitor[] = [];
  for (let i = 0; i < count; i++) {
    const d = DISTRICTS[Math.floor(rnd() * DISTRICTS.length)];
    out.push({
      id: i,
      name: NAMES[Math.floor(rnd() * NAMES.length)] + " №" + (1 + Math.floor(rnd() * 30)),
      x: Math.round(Math.max(24, Math.min(W - 24, d.x + (rnd() - 0.5) * 170))),
      y: Math.round(Math.max(24, Math.min(H - 24, d.y + (rnd() - 0.5) * 130))),
      rating: Math.round((3.2 + rnd() * 1.7) * 10) / 10,
    });
  }
  return out;
}

const wave = (start: number, amp: number, trend: number, wobble: number): number[] =>
  Array.from({ length: 12 }, (_, i) =>
    Math.max(4, Math.round(start + trend * i + amp * Math.sin(i / 1.7 + wobble) + (i % 3 === 0 ? amp * 0.25 : 0)))
  );

interface NicheDef {
  id: string;
  title: string;
  category: Category;
  score: number;
  delta: number;
  monthly: number;
  margin: number;
  startup: number;
  avgCheck: number;
  tags: string[];
  insight: string;
  b: [number, number, number, number, number];
  comp: number;
  d: [number, number, number, number];
}

const DEFS: NicheDef[] = [
  {
    id: "coffee", title: "Кофейня «кофе с собой»", category: "Питание", score: 84, delta: 6,
    monthly: 420_000, margin: 62, startup: 1_400_000, avgCheck: 290,
    tags: ["высокий трафик", "низкий порог входа"], comp: 16,
    d: [52, 9, 0.9, 0.4], b: [82, 58, 88, 84, 78],
    insight: "Спрос на кофе с собой в Томске растёт 6-й квартал подряд, но плотность точек в центре уже 8 на 100 тыс. жителей. Окно возможностей — спальные районы у новых ЖК: конкуренция ниже втрое, а аренда — на 40%. Рекомендую формат 8–12 м² с окном выдачи: окупаемость 11–14 месяцев при чеке от 280 ₽.",
  },
  {
    id: "coffee_house", title: "Кофейня полного цикла", category: "Питание", score: 57, delta: -2,
    monthly: 610_000, margin: 45, startup: 4_800_000, avgCheck: 640, comp: 9,
    d: [60, 12, 0.1, 2.2], tags: ["высокие вложения", "атмосфера"],
    b: [64, 60, 55, 42, 48],
    insight: "Полноформатная кофейня требует вложений от 4,5 млн ₽ и окупается 26+ месяцев — для первого бизнеса рискованно. Выигрывают точки с уникальной концепцией: спешелти-обжарка, коворкинг-зона. Рассмотрите гибрид: кофе с собой + 6 посадочных мест.",
  },
  {
    id: "pizzeria", title: "Пиццерия с доставкой", category: "Питание", score: 69, delta: 3,
    monthly: 780_000, margin: 48, startup: 3_200_000, avgCheck: 890, comp: 13,
    d: [70, 10, 0.5, 1.1], tags: ["доставка", "семейный сегмент"],
    b: [74, 52, 62, 55, 66],
    insight: "Доставка еды показывает стабильный рост, но в нише сильны федеральные сети с маркетинговыми бюджетами. Ваша фора — локальность: радиус 3 км, время доставки до 40 минут и комбо для семей. Средний чек 890 ₽ держит маржу около 48%.",
  },
  {
    id: "shawarma", title: "Шаурма / стрит-фуд", category: "Питание", score: 78, delta: 4,
    monthly: 350_000, margin: 58, startup: 900_000, avgCheck: 260, comp: 18,
    d: [48, 11, 0.6, 3.0], tags: ["быстрый старт", "трафик точек"],
    b: [78, 44, 80, 90, 70],
    insight: "Минимальные вложения (от 800 тыс ₽) и быстрая окупаемость 7–9 месяцев делают стрит-фуд идеальной первой нишей. Ключевой риск — санитарные проверки и сезонность зимой. Ищите точки у транспортных узлов с трафиком от 500 чел/час.",
  },
  {
    id: "nails", title: "Маникюрная студия", category: "Красота", score: 81, delta: 7,
    monthly: 380_000, margin: 66, startup: 1_100_000, avgCheck: 1450, comp: 15,
    d: [55, 8, 1.1, 1.6], tags: ["женская аудитория", "запись онлайн"],
    b: [84, 56, 86, 78, 82],
    insight: "Бьюти-услуги восстанавливаются быстрее рынка: запись на маникюр в Томске растёт на 7 п. за квартал. Дефицит — мастера в спальных районах. Модель «коворкинг для мастеров» снижает ФОТ и риски: мастера платят за место, вы — за бренд и трафик.",
  },
  {
    id: "barber", title: "Барбершоп", category: "Красота", score: 72, delta: 2,
    monthly: 410_000, margin: 55, startup: 1_900_000, avgCheck: 1100, comp: 11,
    d: [58, 7, 0.4, 2.4], tags: ["мужской сегмент", "абонементы"],
    b: [72, 62, 70, 68, 64],
    insight: "Рынок мужских стрижек насыщен в центре, но пустует в районах новостроек. Абонементная модель («безлимит за 2490 ₽/мес») даёт предсказуемую выручку — удерживает до 68% клиентов на горизонте полугода.",
  },
  {
    id: "lashes", title: "Студия наращивания ресниц", category: "Красота", score: 74, delta: 9,
    monthly: 300_000, margin: 70, startup: 700_000, avgCheck: 1900, comp: 12,
    d: [50, 9, 1.3, 0.8], tags: ["максимальная динамика", "домашний формат"],
    b: [76, 60, 90, 82, 88],
    insight: "Самая быстрая динамика в бьюти-сегменте: +9 п. за квартал. Высокая маржа (до 70%) и старт от 600 тыс ₽. Слабое место — зависимость от 1–2 мастеров: закладывайте обучение стажёров с первого месяца.",
  },
  {
    id: "solarium", title: "Солярий", category: "Красота", score: 46, delta: -6,
    monthly: 240_000, margin: 50, startup: 1_600_000, avgCheck: 700, comp: 6,
    d: [44, 14, -0.9, 2.8], tags: ["сезонность", "убывающий тренд"],
    b: [52, 70, 58, 50, 24],
    insight: "Тренд на осознанность и отказ от УФ-загара сокращает рынок на 6 п. за квартал. Низкая конкуренция — не сигнал, а следствие уходящего спроса. Вход только при диверсификации: + аппаратная косметология или автозагар.",
  },
  {
    id: "kids_center", title: "Детский развивающий центр", category: "Дети", score: 76, delta: 5,
    monthly: 460_000, margin: 42, startup: 2_400_000, avgCheck: 800, comp: 8,
    d: [62, 6, 0.7, 1.9], tags: ["абонементы", "лицензия"],
    b: [80, 68, 52, 58, 74],
    insight: "Родители экономят на себе, но не на детях: сегмент устойчив к кризисам. Требует образовательной лицензии (2–4 месяца оформления) и сильного педагога-методиста. Абонементная модель сглаживает каникулярные провалы выручки.",
  },
  {
    id: "robotics", title: "Кружок робототехники", category: "Дети", score: 83, delta: 11,
    monthly: 390_000, margin: 58, startup: 1_700_000, avgCheck: 650, comp: 5,
    d: [46, 7, 1.5, 0.6], tags: ["максимальная динамика", "госсубсидии"],
    b: [82, 82, 74, 72, 92],
    insight: "Лидер динамики радара: +11 п. за квартал на фоне спроса на IT-образование и госпрограмм «Кванториум». Конкурентов в городе — единицы. Возможен B2G-контракт со школами: это до 40% выручки при нулевых затратах на аренду.",
  },
  {
    id: "kindergarten", title: "Частный детский сад", category: "Дети", score: 61, delta: 1,
    monthly: 900_000, margin: 30, startup: 6_500_000, avgCheck: 22_000, comp: 7,
    d: [68, 5, 0.2, 2.6], tags: ["долгий старт", "СанПиН"],
    b: [72, 66, 38, 34, 56],
    insight: "Очередь в муниципальные сады создаёт стабильный спрос, но порог входа высок: требования СанПиН, лицензия, вложения от 6 млн ₽. Окупаемость 30+ месяцев — ниша для опытных операторов, не для первого бизнеса.",
  },
  {
    id: "clothes", title: "Магазин одежды", category: "Ритейл", score: 44, delta: -4,
    monthly: 520_000, margin: 40, startup: 2_800_000, avgCheck: 2400, comp: 21,
    d: [72, 8, -0.7, 1.4], tags: ["маркетплейс-конкуренция", "стоки"],
    b: [48, 34, 52, 46, 30],
    insight: "Wildberries и Ozon забрали базовый ассортимент: офлайн-магазины одежды закрываются быстрее, чем открываются. Выживают узкие форматы: локальные бренды, секонд-люкс, детская одежда с примеркой. Без уникального ассортимента вход не рекомендуется.",
  },
  {
    id: "cosmetics", title: "Магазин косметики", category: "Ритейл", score: 63, delta: 3,
    monthly: 480_000, margin: 46, startup: 2_100_000, avgCheck: 1300, comp: 14,
    d: [64, 8, 0.5, 0.9], tags: ["сети-конкуренты", "подарочный спрос"],
    b: [66, 50, 60, 54, 58],
    insight: "Федеральные сети («Л'Этуаль», «Подружка») держат центр, но азиатская и нишевая косметика — свободная полка. Драйвер — корейские бренды и подарочные наборы (+35% в ноябре-декабре). Маржа 46% при грамотной матрице.",
  },
  {
    id: "pet", title: "Зоомагазин", category: "Ритейл", score: 77, delta: 8,
    monthly: 430_000, margin: 38, startup: 1_500_000, avgCheck: 1150, comp: 10,
    d: [58, 7, 1.0, 2.0], tags: ["повторные покупки", "корма"],
    b: [78, 66, 56, 70, 84],
    insight: "Количество домашних животных растёт 8-й год подряд, а корма — товар регулярного спроса: клиент возвращается каждые 3–4 недели. Формат «магазин у дома» + подписка на корм даёт LTV в 4–5 раз выше разовой покупки. Онлайн-заказ с самовывозом обязателен.",
  },
  {
    id: "auto", title: "Автосервис", category: "Сервис", score: 70, delta: 2,
    monthly: 680_000, margin: 44, startup: 3_600_000, avgCheck: 5200, comp: 17,
    d: [74, 6, 0.4, 3.4], tags: ["старение автопарка", "кадры"],
    b: [74, 54, 60, 48, 62],
    insight: "Средний возраст автопарка — 15 лет: спрос на ремонт структурно растёт. Узкое место — механики: закладывайте фонд мотивации выше рынка. Специализация (подвеска, электрика) бьёт универсалов по марже на 12–15 п.",
  },
  {
    id: "cleaning", title: "Клининг", category: "Сервис", score: 79, delta: 10,
    monthly: 360_000, margin: 52, startup: 800_000, avgCheck: 3800, comp: 9,
    d: [42, 9, 1.4, 1.2], tags: ["B2B-контракты", "низкий старт"],
    b: [76, 72, 66, 88, 86],
    insight: "B2B-клининг после ухода части федеральных игроков освободил до 30% рынка в регионах. Старт от 700 тыс ₽: оборудование + 2 бригады. Один контракт с ЖК или офисом = 150–250 тыс ₽/мес стабильной выручки. Динамика +10 п. за квартал.",
  },
  {
    id: "dental", title: "Стоматологический кабинет", category: "Здоровье", score: 66, delta: 1,
    monthly: 1_150_000, margin: 35, startup: 7_200_000, avgCheck: 6800, comp: 19,
    d: [76, 5, 0.3, 2.1], tags: ["лицензия", "дорогой старт"],
    b: [82, 48, 44, 26, 58],
    insight: "Спрос на стоматологию неэластичен и растёт вместе со старением населения, но вход — от 7 млн ₽ и лицензирование 3–6 месяцев. Конкуренция в центре высокая; перспективны новые районы с молодой аудиторией и детская стоматология.",
  },
  {
    id: "pharmacy", title: "Аптека", category: "Здоровье", score: 52, delta: -1,
    monthly: 590_000, margin: 25, startup: 3_400_000, avgCheck: 850, comp: 22,
    d: [78, 6, -0.2, 0.2], tags: ["фармлицензия", "сетевое давление"],
    b: [70, 38, 30, 44, 46],
    insight: "Рынок консолидирован: топ-5 сетей контролируют 70% оборота, независимые аптеки уходят. Маржа ограничена regulation (~25%). Возможен вход в формате аптечного пункта при медцентре или нишевая специализация (ортопедия, парафармацевтика).",
  },
];

export const NICHES: Niche[] = DEFS.map((d) => ({
  id: d.id,
  title: d.title,
  category: d.category,
  score: d.score,
  delta: d.delta,
  monthly: d.monthly,
  margin: d.margin,
  startup: d.startup,
  avgCheck: d.avgCheck,
  survival: Math.min(94, Math.round(30 + d.score * 0.62)),
  demand: wave(d.d[0], d.d[1], d.d[2], d.d[3]),
  tags: d.tags,
  insight: d.insight,
  breakdown: { demand: d.b[0], competition: d.b[1], margin: d.b[2], entry: d.b[3], trend: d.b[4] },
  competitors: genCompetitors(d.id, d.comp),
}));

/* ---------- партнёры маркетплейса ---------- */
export type PartnerKind = "bank" | "franchise" | "contractor";

export interface Partner {
  id: string;
  kind: PartnerKind;
  name: string;
  tag: string;
  offer: string;
  metric: string;
  color: string;
}

export const PARTNER_GROUPS: { key: PartnerKind; label: string; desc: string; items: Partner[] }[] = [
  {
    key: "bank",
    label: "Банки · CPA",
    desc: "Оплата за целевого клиента, открывшего РКО или кредит на запуск",
    items: [
      { id: "b1", kind: "bank", name: "СберБизнес", tag: "РКО", offer: "Открытие расчётного счёта для новых ИП за 1 день + 3 мес обслуживания бесплатно", metric: "CPA 3 200 ₽", color: "#3ce6a4" },
      { id: "b2", kind: "bank", name: "Т-Банк Старт", tag: "РКО", offer: "РКО без визита в офис, бесплатные платежи первые 90 дней", metric: "CPA 2 800 ₽", color: "#ffc24b" },
      { id: "b3", kind: "bank", name: "Альфа-Франшиза", tag: "кредит", offer: "Кредит на запуск бизнеса до 7,5 млн ₽ по скорингу BizRadar", metric: "CPA 1,8% суммы", color: "#ff6d6d" },
      { id: "b4", kind: "bank", name: "Точка", tag: "РКО", offer: "Банк для предпринимателей: бухгалтерия и эквайринг в одном окне", metric: "CPA 3 500 ₽", color: "#a78bfa" },
    ],
  },
  {
    key: "franchise",
    label: "Франшизы · API",
    desc: "SaaS-доступ к скорингу территорий и тепловым картам спроса",
    items: [
      { id: "f1", kind: "franchise", name: "«Додо Пицца»", tag: "питание", offer: "Скоринг локаций под пиццерию: трафик, конкуренты, доставка", metric: "API 25 000 ₽/мес", color: "#ff8a5c" },
      { id: "f2", kind: "franchise", name: "«Чижик»", tag: "ритейл", offer: "Тепловые карты спроса для магазинов у дома в городах 100к+", metric: "API 18 000 ₽/мес", color: "#ffc24b" },
      { id: "f3", kind: "franchise", name: "TOPGUN Barbershop", tag: "красота", offer: "Анализ ёмкости района под барбершоп по данным OSM", metric: "API 12 000 ₽/мес", color: "#4cc9f0" },
      { id: "f4", kind: "franchise", name: "«Чемпионика»", tag: "дети", offer: "Демография + платёжеспособность для детских школ футбола", metric: "API 15 000 ₽/мес", color: "#3ce6a4" },
    ],
  },
  {
    key: "contractor",
    label: "Подрядчики",
    desc: "Проверенные исполнители запуска со скидкой для пользователей радара",
    items: [
      { id: "c1", kind: "contractor", name: "Регистратор.ру", tag: "ИП/ООО", offer: "Регистрация ИП под ключ с выбором ОКВЭД под вашу нишу", metric: "скидка 20%", color: "#4cc9f0" },
      { id: "c2", kind: "contractor", name: "АрендаПро", tag: "помещения", offer: "Подбор помещений с проверкой трафика по данным радара", metric: "комиссия 0 ₽", color: "#3ce6a4" },
      { id: "c3", kind: "contractor", name: "СБИС Бухгалтерия", tag: "учёт", offer: "Онлайн-бухгалтерия для УСН: первый квартал бесплатно", metric: "3 мес 0 ₽", color: "#a78bfa" },
      { id: "c4", kind: "contractor", name: "БрендМастер", tag: "маркетинг", offer: "Айдентика и запуск рекламы с бюджетом от 15 000 ₽", metric: "скидка 15%", color: "#ff8a5c" },
    ],
  },
];

/* ---------- платформа ---------- */
export const ROADMAP_DONE = [
  "Продуктовая стратегия: модули Scout, Matcher, Finance, Marketplace",
  "Рабочий бэкенд — модульный монолит на FastAPI",
  "Парсер конкурентов через Overpass API (OSM): бесплатно, без ключей",
  "Кэш снимков рынка MarketSnapshot с TTL 7 дней",
  "Эвристика скоринга выживаемости v1",
  "Интеграция GigaChat с fallback на заглушку (backend/services/ai_service.py)",
  "Фронтенд-дашборд: прототип (этот интерфейс) + Next.js-версия в frontend/",
  "Продакшн-упаковка: монорепо backend/frontend, Docker Compose + Caddy, авто-HTTPS",
  "Модуль Matcher: подбор локаций — сетка ~500 м, скоринг ячеек, кэш 7 дней",
  "Региональная статистика Росстата: пакетный загрузчик → БД, чтение без сети, fallback на справочник",
];

export const ROADMAP_NEXT = [
  "Деплой на VPS и E2E-прогон GigaChat с боевым ключом",
  "ЕМИСС-API в загрузчике вместо ручного CSV + cron-обновление датасетов",
  "Скоринг-слой лидов для банков (вероятность старта бизнеса, 60 дней)",
];

export const STACK = [
  "Python 3.11", "FastAPI", "SQLite → PostgreSQL", "gigachat SDK", "Overpass API",
  "Next.js", "Tailwind", "Leaflet", "Docker Compose", "GigaChat / YandexGPT",
];

export const FLYWHEEL = [
  "Бесплатный анализ ниш",
  "Растут данные о намерениях",
  "CPA-лиды банкам и скоринг",
  "Покупаем больше данных",
  "Точность радара выше",
  "Больше пользователей",
];

export const ENDPOINTS = [
  { method: "GET", path: "/api/niches", desc: "список ниш со скорингом" },
  { method: "GET", path: "/api/niches/{id}/score", desc: "детальный скоринг и под-баллы" },
  { method: "GET", path: "/api/competitors?niche&city", desc: "точки конкурентов (Overpass API)" },
  { method: "GET", path: "/api/market-snapshot", desc: "снимок рынка (кэш, TTL 7 дней)" },
  { method: "POST", path: "/api/report", desc: "бизнес-отчёт: GigaChat с fallback на заглушку" },
  { method: "POST", path: "/api/v1/match-locations", desc: "Matcher: сетка 500 м, скор ячеек, топ-локации (кэш 7 дней)" },
  { method: "GET", path: "/api/v1/match-locations/cities", desc: "города в покрытии Matcher'а" },
  { method: "GET", path: "/api/regions", desc: "демография из БД (загрузчик Росстат/ЕМИСС): source + as_of, fallback на справочник" },
];

/* Демо-срез GET /api/regions (форма ответа один в один).
   Два состояния: db — после загрузки датасетов, fb — пустая БД (fallback). */
export interface RegionDemo {
  key: string;
  region: string;
  level: "city" | "subject";
  proxyNote?: string;
  db: { population: number; avg_income: number; as_of: string; source: string };
  fb: { population: number; avg_income: number; as_of: string; source: string };
}

export const REGIONS_DEMO: RegionDemo[] = [
  {
    key: "tomsk", region: "Томск", level: "city",
    proxyNote: "доход — уровень субъекта (Томская область)",
    db: { population: 557_000, avg_income: 50_300, as_of: "2025-01-01", source: "rosstat-opendata + прокси субъекта" },
    fb: { population: 556_400, avg_income: 48_500, as_of: "2024-01-01", source: "static-fallback" },
  },
  {
    key: "novosibirsk", region: "Новосибирск", level: "city",
    proxyNote: "доход — уровень субъекта (Новосибирская область)",
    db: { population: 1_634_800, avg_income: 54_100, as_of: "2025-01-01", source: "rosstat-opendata + прокси субъекта" },
    fb: { population: 1_633_900, avg_income: 52_000, as_of: "2024-01-01", source: "static-fallback" },
  },
  {
    key: "moskva", region: "Москва", level: "city",
    db: { population: 13_150_000, avg_income: 101_500, as_of: "2025-01-01", source: "rosstat-opendata + emisss-57039" },
    fb: { population: 13_104_200, avg_income: 97_000, as_of: "2024-01-01", source: "static-fallback" },
  },
  {
    key: "kazan", region: "Казань", level: "city",
    proxyNote: "доход — уровень субъекта (Республика Татарстан)",
    db: { population: 1_320_700, avg_income: 61_400, as_of: "2025-01-01", source: "rosstat-opendata + прокси субъекта" },
    fb: { population: 1_308_700, avg_income: 56_000, as_of: "2024-01-01", source: "static-fallback" },
  },
];

/* ---------- форматирование ---------- */
export const fmtMoney = (v: number): string => Math.round(v).toLocaleString("ru-RU") + " ₽";

export const fmtNum = (v: number): string => v.toLocaleString("ru-RU");

export const fmtShort = (v: number): string =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(1).replace(".", ",") + " млн" : v >= 1_000 ? Math.round(v / 1_000) + " тыс" : String(Math.round(v));

export const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const scoreColor = (s: number): string => (s >= 75 ? "#3ce6a4" : s >= 55 ? "#ffc24b" : "#ff6d6d");

export const scoreLabel = (s: number): string =>
  s >= 80 ? "Горячая ниша" : s >= 70 ? "Привлекательная" : s >= 55 ? "Спорная, есть условия" : "Высокий риск";
