import { notFound } from "next/navigation";
import MediaProbe from "../../../components/MediaProbe";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MediaProbe />;
}
