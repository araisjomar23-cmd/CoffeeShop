import type { ReactNode, SVGProps } from "react";

type IconName = "plus" | "orders" | "sales" | "logout" | "download" | "printer" | "check" | "clock" | "refresh" | "left" | "right" | "cancel";

const paths: Record<IconName, ReactNode> = {
  cancel: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h3" /></>,
  sales: <><path d="M4 4v16h16M8 16v-4m4 4V8m4 8V5" /></>,
  logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M10 12h11m-4-4 4 4-4 4" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM17 11h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3" /></>,
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
};

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
