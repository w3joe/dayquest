import { notFound } from "next/navigation";
import { DemoDayViewer } from "@/components/day/DemoDayViewer";
import { DEMO_MODE } from "@/lib/demo";

/** The hardcoded demo day (prebuilt scenes, no manifest fetch). */
export default function DemoDayPage() {
  if (!DEMO_MODE) notFound();
  return <DemoDayViewer />;
}
