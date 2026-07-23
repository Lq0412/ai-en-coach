"use client";

import { useEffect, useRef } from "react";

const comingSoonSelector = 'a[href="#coming-soon"]';

export default function ComingSoonDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function openComingSoonDialog(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element) ||
        !event.target.closest(comingSoonSelector)
      ) {
        return;
      }

      event.preventDefault();
      const dialog = dialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
    }

    document.addEventListener("click", openComingSoonDialog);
    return () => document.removeEventListener("click", openComingSoonDialog);
  }, []);

  return (
    <dialog
      className="coming-soon-modal"
      id="coming-soon"
      ref={dialogRef}
      aria-labelledby="coming-soon-title"
      aria-describedby="coming-soon-description"
    >
      <div className="coming-soon-panel">
        <p className="eyebrow">SpeakUp 首批体验</p>
        <h2 id="coming-soon-title">敬请期待</h2>
        <p id="coming-soon-description">产品体验正在打磨中，正式开放后即可进入对应功能。</p>
        <form method="dialog">
          <button className="button" type="submit" autoFocus>继续浏览</button>
        </form>
      </div>
    </dialog>
  );
}
