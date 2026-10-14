import { redirect } from "next/navigation";
import LegacyHome from "@/components/LegacyHome";
export default function Home() {
  if (process.env.SOAP_LEGACY === "true") return <LegacyHome />;
  redirect("/play");
}
