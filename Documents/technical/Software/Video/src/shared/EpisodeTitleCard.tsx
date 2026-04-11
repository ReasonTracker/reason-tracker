type EpisodeTitleCardProps = {
  title: string;
};

export const EpisodeTitleCard = ({ title }: EpisodeTitleCardProps) => {
  return <h1 className="rt-episode-title">{title}</h1>;
};