"use client";

/**
 * Kehadiran admin di panel (siapa yang sedang membuka tab panel), lewat Supabase Realtime Presence.
 *
 * - Tidak disimpan ke database: begitu tab ditutup / koneksi putus, admin otomatis hilang dari daftar online.
 * - Satu orang dengan dua tab tetap dihitung satu (kunci presence = user id).
 * - Hanya untuk TAMPILAN (menandai "Offline"); tidak dipakai untuk keputusan keamanan.
 *
 * PanelShell memanggil `useAdminPresenceTracker` sekali; komponen lain cukup membaca `useOnlineAdmins`.
 */

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

const CHANNEL = "samaqu-admin-presence";
const EMPTY: ReadonlySet<string> = new Set();

let online: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function setOnline(next: ReadonlySet<string>) {
  online = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Set user id admin yang sedang online. Kosong kalau pelacak belum berjalan. */
export function useOnlineAdmins(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => online, () => EMPTY);
}

/** Mulai melacak kehadiran akun ini dan mendengarkan admin lain. `selfId` = user id akun yang login. */
export function useAdminPresenceTracker(selfId: string | null | undefined) {
  useEffect(() => {
    if (!selfId) return;
    const channel = supabase.channel(CHANNEL, { config: { presence: { key: selfId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
      setOnline(EMPTY);
    };
  }, [selfId]);
}
