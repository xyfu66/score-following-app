import React from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

interface CustomAudioPlayerProps {
  audioPath: string;
  startScrolling: () => void;
}

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ audioPath, startScrolling }) => {
  return (
    <div>
      <AudioPlayer
        src={audioPath}
        showSkipControls={false}
        showJumpControls={false}
        showDownloadProgress={false}
        onPlay={startScrolling}
      />
    </div>
  );
};

export default CustomAudioPlayer;
