export default function Home() {
  const agentAPI =
    process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8080";
  const prototypeURL = `/prototype/pages/prototype.html?api_base=${encodeURIComponent(agentAPI)}`;

  return (
    <main className="prototype-host">
      <iframe
        allow="microphone; autoplay"
        className="prototype-frame"
        src={prototypeURL}
        title="SpeakUp 产品原型"
      />
    </main>
  );
}
