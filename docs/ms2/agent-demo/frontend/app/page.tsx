import { LiveConversationHost } from "./components/live-conversation-host";

export default function Home() {
  const agentAPI =
    process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8080";
  const featureEnabled = ["1", "true"].includes(
    (process.env.NEXT_PUBLIC_LIVEKIT_VOICE_ENABLED ?? "").toLowerCase(),
  );
  const prototypeURL =
    `/prototype/pages/prototype.html?api_base=${encodeURIComponent(agentAPI)}` +
    `&live_voice=${featureEnabled ? "1" : "0"}`;

  return (
    <LiveConversationHost
      agentAPI={agentAPI}
      featureEnabled={featureEnabled}
      prototypeURL={prototypeURL}
    />
  );
}
