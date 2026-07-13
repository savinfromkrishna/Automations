"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import VideoEditor from "../../../../../components/youtube/VideoEditor";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200">
      <header className="border-b border-white/5 bg-black/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/youtube"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft size={14} /> Back to projects
          </Link>
          <p className="text-xs text-slate-500">Video Editor</p>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <VideoEditor projectId={id} />
      </main>
    </div>
  );
}
