import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const make =
  (children: ReactNode) =>
  ({ size = 18, ...rest }: P) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );

export const IRadar = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12 18.4 5.6" />
    <circle cx="15.2" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
  </>
);
export const IMap = make(
  <>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </>
);
export const ICalc = make(
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01" />
  </>
);
export const IStore = make(
  <>
    <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
    <path d="M3.5 6 5.5 3h13L20.5 6c.9 1.2.1 4-2.4 4-1.5 0-2.3-.9-2.6-1.8C15.2 9.1 14.4 10 13 10s-2.2-.9-2.5-1.8C10.2 9.1 9.4 10 7.9 10c-2.5 0-3.3-2.8-2.4-4Z" />
    <path d="M9.5 20v-5h5v5" />
  </>
);
export const IChip = make(
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M10 10h4v4h-4zM12 2v3M12 19v3M2 12h3M19 12h3M6 2.5V6M18 2.5V6M6 18v3.5M18 18v3.5" />
  </>
);
export const ISearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
export const IX = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IRefresh = make(
  <>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 5v6h-6" />
  </>
);
export const ICopy = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);
export const ICheck = make(<path d="m4.5 12.5 5 5 10-11" />);
export const IChevD = make(<path d="m6 9 6 6 6-6" />);
export const ITrendUp = make(
  <>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </>
);
export const ITrendDown = make(
  <>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M21 11v6h-6" />
  </>
);
export const IUsers = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" />
    <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.6 15.4c1.6.8 2.6 2.3 2.9 4.6" />
  </>
);
export const IBuilding = make(
  <>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M16 9h3a1 1 0 0 1 1 1v11M2 21h20" />
    <path d="M8 7h2M8 11h2M8 15h2M12 7h1M12 11h1M12 15h1" />
  </>
);
export const IBolt = make(<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />);
export const IClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>
);
export const ILayers = make(
  <>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </>
);
export const IArrowR = make(<path d="M4 12h16m-6-6 6 6-6 6" />);
export const IPin = make(
  <>
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </>
);
export const ITarget = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </>
);
export const IWallet = make(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <path d="M16 12h.01M3 9h18" />
  </>
);
export const IStar = make(
  <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6L12 16.9 6.6 19.7l1.1-6L3.2 9.4l6.1-.8L12 3Z" />
);
export const ICpu = make(
  <>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </>
);
export const IPlay = make(<path d="M7 4.5 19 12 7 19.5v-15Z" />);
export const IInfo = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>
);
export const IDoc = make(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </>
);
export const IPlus = make(<path d="M12 5v14M5 12h14" />);
export const IFilter = make(<path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />);
export const ICompass = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>
);
export const IFlame = make(
  <path d="M12 3s1 2.5 1 4.5c2 1 4 3.4 4 6.5a5.5 5.5 0 0 1-11 0c0-2.5 1.4-4.6 3-6 .4 1.2 1 2 2 2.5C10.5 8 11 5 12 3Z" />
);
