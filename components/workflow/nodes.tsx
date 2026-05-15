"use client";
import React, { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Globe, FileSearch, PenTool, Wand2, Image as ImageIcon, Camera, Inbox, Activity, Loader2, Check, AlertTriangle, MinusCircle, HelpCircle, Code2, Share2, Languages, AlignLeft, Volume2, Database, Users } from "lucide-react";
import { NodeData, ROLE_META } from "./types";

function statusIcon(status: NodeData["status"]) {
  switch (status) {
    case "running": return <Loader2 className="w-3 h-3 animate-spin" />;
    case "done":    return <Check className="w-3 h-3" />;
    case "error":   return <AlertTriangle className="w-3 h-3" />;
    case "skipped": return <MinusCircle className="w-3 h-3" />;
    default:        return <span className="w-1.5 h-1.5 rounded-full bg-current" />;
  }
}

function statusColor(status: NodeData["status"]) {
  switch (status) {
    case "running": return "#ff8b6e";
    case "done":    return "#34d399";
    case "error":   return "#f87171";
    case "skipped": return "#5a5a6a";
    default:        return "#8b8b9a";
  }
}

function roleIcon(role: NodeData["role"]) {
  switch (role) {
    case "input":     return <Inbox className="w-4 h-4" />;
    case "crawl":     return <Globe className="w-4 h-4" />;
    case "extract":   return <FileSearch className="w-4 h-4" />;
    case "write":     return <PenTool className="w-4 h-4" />;
    case "refine":    return <Wand2 className="w-4 h-4" />;
    case "image":     return <ImageIcon className="w-4 h-4" />;
    case "video":     return <Camera className="w-4 h-4" />;
    case "compare":   return <Activity className="w-4 h-4" />;
    case "output":    return <Check className="w-4 h-4" />;
    case "faq":       return <HelpCircle className="w-4 h-4" />;
    case "schema":    return <Code2 className="w-4 h-4" />;
    case "social":    return <Share2 className="w-4 h-4" />;
    case "translate": return <Languages className="w-4 h-4" />;
    case "summarize": return <AlignLeft className="w-4 h-4" />;
    case "tts":       return <Volume2 className="w-4 h-4" />;
    case "publish":   return <Database className="w-4 h-4" />;
  }
}

type PipelineNodeProps = NodeProps<Node<NodeData>>;

function PipelineNodeImpl({ data, selected }: PipelineNodeProps) {
  const meta = ROLE_META[data.role];
  const isInput = data.role === "input";
  const isOutput = data.role === "output";
  const running = data.status === "running";

  return (
    <div
      className="relative rounded-2xl backdrop-blur-md"
      style={{
        background: "var(--color-bg-1)",
        border: `1px solid ${selected ? meta.color : "var(--color-line)"}`,
        boxShadow: running
          ? `0 0 0 2px ${meta.ring}, 0 12px 32px -12px ${meta.color}`
          : selected
            ? `0 0 0 2px ${meta.ring}`
            : "none",
        minWidth: 240,
        maxWidth: 280,
        transition: "box-shadow 200ms ease",
      }}
    >
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 10, height: 10, background: meta.color, border: "2px solid var(--color-bg-0)",
          }}
        />
      )}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 10, height: 10, background: meta.color, border: "2px solid var(--color-bg-0)",
          }}
        />
      )}

      <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--color-line)]">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: meta.bg, border: `1px solid ${meta.ring}`, color: meta.color }}
        >
          {roleIcon(data.role)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{data.label}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[color:var(--color-fg-2)]">{meta.tagline}</div>
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest"
          style={{ color: statusColor(data.status), background: "var(--color-bg-2)", border: "1px solid var(--color-line)" }}
        >
          {statusIcon(data.status)}
          {data.status}
        </div>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {data.teamId ? (
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ background: meta.bg, border: `1px solid ${meta.ring}` }}
            >
              <Users className="w-3 h-3" style={{ color: meta.color }} />
            </div>
            <div className="text-[11px] font-mono text-[color:var(--color-fg-1)] truncate">
              Team: {(data.teamName as string) || `#${data.teamId}`}
            </div>
          </div>
        ) : data.model ? (
          <div className="text-[11px] font-mono text-[color:var(--color-fg-1)] truncate" title={data.model as string}>
            {data.model as string}
          </div>
        ) : null}
        {data.meta && (
          <div className="text-[11px] text-[color:var(--color-fg-2)]">{data.meta as string}</div>
        )}
        {data.errorMsg && (
          <div className="text-[11px] text-red-300 leading-snug">{data.errorMsg as string}</div>
        )}
      </div>
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeImpl);
