"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import ImageZoom, { type ZoomMedia } from "@/components/ImageZoom";
import { renderRichText } from "@/components/chat/shared";
import type { ChatLog } from "./types";
import { formatTime, statusOfLog } from "./utils";
import StatusBadge from "./StatusBadge";
import ToolBadge from "./ToolBadge";

export default function MessageBubble({
  log,
  onAddToFaq,
  adding,
}: {
  log: ChatLog;
  onAddToFaq: (id: string) => void;
  adding: boolean;
}) {
  const status = statusOfLog(log);
  const images = log.question_images || [];
  const answerImages = log.answer_images || [];
  const hasQuestion = Boolean(log.question?.trim()) || images.length > 0;
  const tools = [...new Set(log.tools_used || [])];
  const [zoom, setZoom] = useState<{ media: ZoomMedia[]; index: number; alt: string } | null>(null);

  const openZoom = (urls: string[], index: number, alt: string) => {
    setZoom({ media: urls.map((src) => ({ src, type: "image" as const })), index, alt });
  };

  return (
    <div className="space-y-3">
      {hasQuestion ? (
        <div className="flex max-w-[78%] items-start gap-2">
          <div
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "#EEE9DF", color: "#6B6A64" }}
          >
            C
          </div>
          <div className="min-w-0">
            <div
              className="rounded-2xl border bg-white px-3.5 py-2.5"
              style={{ borderColor: "#E7E6E1" }}
            >
              {images.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {images.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => openZoom(images, index, "Lampiran customer")}
                      className="cursor-zoom-in"
                      aria-label="Perbesar lampiran customer"
                    >
                      <img
                        src={url}
                        alt="Lampiran customer"
                        className="h-16 w-16 rounded-lg object-cover"
                        style={{ border: "1px solid #E7E6E1" }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
              <p
                className="whitespace-pre-wrap break-words text-sm leading-relaxed"
                style={{ color: "#141414" }}
              >
                {log.question?.trim() || "(gambar)"}
              </p>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "#6B6A64" }}>
              Customer · {formatTime(log.created_at)}
            </p>
          </div>
        </div>
      ) : null}

      {log.answer || log.error ? (
        <div className="flex justify-end">
          <div className="min-w-0 max-w-[78%]">
            {tools.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                {tools.map((tool) => (
                  <ToolBadge key={tool} tool={tool} />
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl px-4 py-3" style={{ background: "#141414", color: "#fff" }}>
              <div className="break-words text-sm leading-relaxed">
                {log.answer ? (
                  renderRichText(log.answer)
                ) : (
                  <span className="opacity-80">Tidak ada jawaban.</span>
                )}
              </div>
              {answerImages.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {answerImages.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => openZoom(answerImages, index, "Foto dari asisten")}
                      className="cursor-zoom-in"
                      aria-label="Perbesar foto dari asisten"
                    >
                      <img
                        src={url}
                        alt="Foto dari asisten"
                        className="h-24 w-24 rounded-lg object-cover"
                        style={{ border: "1px solid rgba(255,255,255,0.25)" }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
              {log.error ? (
                <p className="mt-2 break-words text-[11px]" style={{ color: "#FCA5A5" }}>
                  {log.error}
                </p>
              ) : null}
            </div>

            <div
              className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px]"
              style={{ color: "#6B6A64" }}
            >
              <span>Asisten AI · {formatTime(log.created_at)}</span>
              {status !== "answered" ? <StatusBadge status={status} small /> : null}
            </div>

            {log.question && log.answer ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAddToFaq(log.id)}
                  disabled={adding}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold disabled:opacity-50"
                  style={{ border: "1px dashed #C8A45D", color: "#8A5A12", background: "transparent" }}
                >
                  {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Knowledge AI
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ImageZoom
        media={zoom?.media ?? []}
        initialIndex={zoom?.index ?? 0}
        alt={zoom?.alt ?? ""}
        isOpen={Boolean(zoom)}
        onClose={() => setZoom(null)}
      />
    </div>
  );
}
