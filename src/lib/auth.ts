import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "cashier";

export async function requireStaffRole(allowedRoles?: StaffRole[]): Promise<StaffRole> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) redirect("/login?error=unavailable");

  if (!profile || (profile.role !== "owner" && profile.role !== "cashier")) {
    await supabase.auth.signOut();
    redirect("/login?error=not-staff");
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect("/");
  return profile.role;
}
