import {Composition} from 'remotion';
import {GovBotShowcase} from './GovBotShowcase';

export const RemotionRoot = () => {
  return (
    <Composition
      id="GovBotShowcase"
      component={GovBotShowcase}
      durationInFrames={360}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
