import { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="fixed inset-0 z-10 flex gap-4 p-4 md:p-5">
      <div className="hidden md:flex md:w-[240px] md:flex-shrink-0 h-full rounded-2xl overflow-hidden bg-[#d7ecff]/95 border border-[#b6d8f6] shadow-[0_16px_42px_rgba(50,115,185,0.18)]">
        <Sidebar embedded />
      </div>
      <div className="flex-1 min-w-0 min-h-0 h-full rounded-2xl overflow-hidden bg-[#eaf5ff]/95 border border-[#c4dff7] shadow-[0_18px_45px_rgba(54,122,194,0.18)] flex flex-col">
        {children}
      </div>
    </div>
  );
}
