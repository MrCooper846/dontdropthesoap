import { redirect } from "next/navigation";
import LegacyJoin from "@/components/LegacyJoin";
export default function Page() {
  if (process.env.SOAP_LEGACY === "true") return <LegacyJoin />;
  redirect("/play");
}
