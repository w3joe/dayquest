import type { Metadata } from "next";
import Demo from "../../components/today/Demo";

export const metadata: Metadata = { title: "Demo · DayQuest" };

export default function DemoPage() {
  return <Demo />;
}
