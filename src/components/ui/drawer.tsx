"use client";

import {
  DialogRoot,
  DialogPositioner,
  DialogContent,
  DialogCloseTrigger,
  DialogTitle,
} from "@ark-ui/react/dialog";
import { createContext, useContext, ReactNode } from "react";
import s from "./mobile-drawer.module.css";

interface DrawerCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const MobileDrawerCtx = createContext<DrawerCtx>({
  open: false,
  setOpen: () => {},
});

interface MobileDrawerProps {
  children: ReactNode;
  title?: string;
}

export function MobileDrawer({ children, title = "SAMAQU" }: MobileDrawerProps) {
  const { open, setOpen } = useContext(MobileDrawerCtx);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      modal
      lazyMount
      unmountOnExit
      finalFocusEl={() => document.querySelector<HTMLElement>('button[aria-label="Buka menu"]')}
    >
      <DialogPositioner className={s.positioner}>
        <DialogContent className={s.content}>
          <div className={s.header}>
            <DialogTitle className={s.title}>{title}</DialogTitle>
            <DialogCloseTrigger className={s.close} aria-label="Tutup menu" autoFocus>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </DialogCloseTrigger>
          </div>

          <div className={s.body}>{children}</div>
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  );
}
