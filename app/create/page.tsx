import { legacyDemoEnabled } from "@/lib/legacy-mode";
import { redirect } from "next/navigation";
import LegacyCreate from "@/components/LegacyCreate";
export default function Page() {
  if (legacyDemoEnabled()) return <LegacyCreate />;
  redirect("/play");
}
