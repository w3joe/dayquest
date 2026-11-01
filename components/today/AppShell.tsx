import Link from "next/link";
import PixelSprite from "./pixel";
import SoundToggle from "./SoundToggle";

const tabs = [{ href: "/", id: "try", label: "Try me" }, { href: "/demo", id: "demo", label: "Demo" }] as const;

export default function AppShell({ active, children }: { active: "try" | "demo"; children: React.ReactNode }) {
  return <div className="dq-app">
    <div className="dq-sky" aria-hidden="true"><PixelSprite name="cloud" size={6} className="dq-cloud dq-cloud-a" /><PixelSprite name="cloud" size={4} className="dq-cloud dq-cloud-b" /></div>
    <header className="dq-topbar"><Link href="/" className="dq-wordmark"><PixelSprite name="cat" size={2.5} className="dq-logo-sprite" /><span>dayquest</span></Link>
      <div className="dq-topbar-end"><nav className="dq-tabs" aria-label="Pages">{tabs.map(tab => <Link key={tab.id} href={tab.href} className={tab.id === active ? "is-active" : undefined} aria-current={tab.id === active ? "page" : undefined}>{tab.label}</Link>)}</nav><SoundToggle /></div></header>
    <main className="dq-main">{children}</main>
    <footer className="dq-footer"><PixelSprite name="flower" size={2} /><span>Share your day with someone you love</span><PixelSprite name="flower" size={2} /></footer>
  </div>;
}
