import { useState, useRef, useEffect } from 'react';
import styles from './MediaPlayer.module.scss';
import { FaPlay, FaPause } from 'react-icons/fa';

interface MediaPlayerProps {
  src: string;
  title: string;
}

export const MediaPlayer = ({ src, title }: MediaPlayerProps) => {
  // Ref för att direkt kunna styra audio-elementet
  const audioRef = useRef<HTMLAudioElement>(null);

  // States för att hålla koll på spelarens status
  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Hantera play/pause-klick
  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Hantera volymändring
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.volume = Number(e.target.value);
    }
  };

  // Hantera när man drar i tidslinjen
  const handleTimeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Number(e.target.value);
      setCurrentTime(Number(e.target.value));
    }
  };

  // Funktion för att formatera tid från sekunder till MM:SS
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Sätt initial state när ljudfilen har laddat metadata
    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    }

    // Uppdatera nuvarande tid när låten spelas
    const updateCurrentTime = () => setCurrentTime(audio.currentTime);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', updateCurrentTime);

    // Städa upp event listeners när komponenten försvinner
    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', updateCurrentTime);
    }
  }, []);

  return (
    <div className={styles.playerContainer}>
      {/* Osynlig audio-tagg, oförändrad */}
      <audio ref={audioRef} src={src} autoPlay onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      
      {/* VÄNSTER: Låtinformation */}
      <div className={styles.trackInfo}>
        <p className={styles.trackTitle}>{title}</p>
        {/* Här kan man i framtiden lägga till artistnamn etc. */}
      </div>

      {/* MITTEN: Huvudkontroller (knapp och tidslinje) */}
      <div className={styles.controls}>
        <button onClick={togglePlayPause} className={styles.playPauseButton}>
          {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} />}
        </button>
        <div className={styles.timeControls}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <input 
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleTimeSliderChange}
            className={styles.timelineSlider}
          />
          <span className={styles.time}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* HÖGER: Volym */}
      <div className={styles.volumeControl}>
        <input 
          type="range"
          min="0"
          max="1"
          step="0.01"
          onChange={handleVolumeChange}
          defaultValue="1"
          className={styles.volumeSlider}
        />
      </div>
    </div>
  );
};