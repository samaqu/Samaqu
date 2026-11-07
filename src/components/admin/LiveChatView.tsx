"use client";

import { useState } from "react";
import ChatLogsView from "@/components/admin/ChatLogsView";
import { ChatSection } from "@/components/admin/SettingsSections";

/**
 * Menu admin "Live Chat" — satu tempat untuk urusan asisten AI:
 * - Percakapan: daftar log chat pelanggan (cari pertanyaan yang belum terjawab)
 * - Pengaturan: aktif/nonaktif, API key, model, sapaan, knowledge tambahan
 */

export default function LiveChatView() {
  const [tab, setTab] = useState<"percakapan" | "pengaturan">("percakapan");

  const tabs: { id: "percakapan" | "pengaturan"; label: string }[] = [
    { id: "percakapan", label: "Percakapan" },
    { id: "pengaturan", label: "Pengaturan" },
  ];

  return (
    <section className="flex h-[calc(100dvh-120px)] min-h-0 flex-col gap-3 lg:h-[calc(100dvh-144px)]">
      <div className="inline-flex shrink-0 gap-1 p-1 rounded-xl" style={{ background: "var(--sub)", border: "1px solid var(--bd)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
            style={
              tab === t.id
                ? { background: "var(--fg)", color: "#fff" }
                : { color: "var(--fg2)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "percakapan" ? <ChatLogsView /> : <ChatSection />}
      </div>
    </section>
  );
}
