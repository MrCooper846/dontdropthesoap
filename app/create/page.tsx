import { redirect } from "next/navigation";
import LegacyCreate from "@/components/LegacyCreate";
export default function Page() {
  if (process.env.SOAP_LEGACY === "true") return <LegacyCreate />;
  redirect("/play");
}
