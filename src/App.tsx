import { useRadio } from "./hooks/useRadio";
import { JoinScreen } from "./components/JoinScreen";
import { ChannelScreen } from "./components/ChannelScreen";

export default function App() {
  const { state, join, leave, pressPTT, releasePTT } = useRadio();

  if (state.screen === "join") {
    return (
      <JoinScreen
        joining={state.joining}
        joinError={state.joinError}
        onJoin={(name, channel, accessCode) => {
          void join(name, channel, accessCode);
        }}
      />
    );
  }

  return (
    <ChannelScreen
      state={state}
      sessionId={state.sessionId}
      onPressStart={() => {
        void pressPTT();
      }}
      onPressEnd={releasePTT}
      onLeave={leave}
    />
  );
}
