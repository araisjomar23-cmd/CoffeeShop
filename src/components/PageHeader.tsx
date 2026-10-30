import StaffNav from "@/components/StaffNav";
import type { StaffRole } from "@/lib/auth";

export default function PageHeader({ current, role, title, description }: {
  current: "order" | "kitchen" | "sales";
  role: StaffRole;
  title: string;
  description: string;
}) {
  return <header className="cafe-header">
    <StaffNav current={current} role={role} />
    <div className="cafe-page-intro">
      <p className="cafe-eyebrow">{current === "order" ? "Made with care, served with a smile" : current === "kitchen" ? "Behind the counter" : "A little insight into your day"}</p>
      <h1>{title}</h1>
      <p className="cafe-description">{description}</p>
    </div>
  </header>;
}
