import { Episode0001Composition } from "./episodes/Episode0001.tsx";
import { Episode0002Composition } from "./episodes/Episode0002.tsx";

export const RemotionRoot = () => {
  return (
    <>
      <Episode0001Composition />
      <Episode0002Composition />
    </>
  );
};