"use client";

import { useRef, useState, type KeyboardEvent } from "react";

type DemoFeature = {
  index: string;
  title: string;
  copy: string;
  image: string;
  alt: string;
  status: string;
  href: string;
  action: string;
};

export default function InterviewDemo({ features }: { features: DemoFeature[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = features[activeIndex];

  function selectByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + features.length) % features.length;
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={`demo-sequence demo-tone-${activeIndex + 1}`}>
      <div className="demo-step-list" role="tablist" aria-label="SpeakUp 陪伴一次真实任务的四个阶段">
        {features.map((feature, index) => (
          <button
            className="demo-step"
            id={`demo-step-${feature.index}`}
            key={feature.index}
            type="button"
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            aria-controls="demo-stage"
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => selectByKey(event, index)}
          >
            <span><b>{feature.index}</b><em>{feature.status}</em></span>
            <strong>{feature.title}</strong>
            <small aria-hidden={activeIndex !== index}>{feature.copy}</small>
          </button>
        ))}
      </div>

      <article
        className="demo-stage"
        id="demo-stage"
        role="tabpanel"
        aria-labelledby={`demo-step-${active.index}`}
      >
        <header>
          <span>{active.index} / {String(features.length).padStart(2, '0')}</span>
          <em>{active.status}</em>
          <a href={active.href}>
            {active.action} <span aria-hidden="true">↗</span>
          </a>
        </header>
        <div className="demo-stage-frame">
          <img src={active.image} alt={active.alt} />
        </div>
      </article>
    </div>
  );
}
