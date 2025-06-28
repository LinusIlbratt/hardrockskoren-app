import { useState, useRef, useEffect } from 'react';
import styles from './MediaPlayer.module.scss';
import { FaPlay, FaPause, FaVolumeUp, FaChevronDown, FaChevronUp } from 'react-icons/fa';

interface MediaPlayerProps {
  src: string;
  title: string;
}

export const MediaPlayer = ({ src, title }: MediaPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);

  // Effekt som ser till att spelaren alltid visas när en ny låt väljs
  useEffect(() => {
    setIsPlayerVisible(true);
  }, [src]);

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
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    }
    const updateCurrentTime = () => setCurrentTime(audio.currentTime);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', updateCurrentTime);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', updateCurrentTime);
    }
  }, []);

  // Bygg klassnamnen dynamiskt för att visa/dölja
  const playerClasses = `${styles.playerContainer} ${!isPlayerVisible ? styles.hidden : ''}`;

  return (
    <div className={playerClasses}>
      <audio ref={audioRef} src={src} autoPlay onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      
      <div className={styles.nowPlayingInfo}>
        <span className={styles.nowPlayingLabel}>Nu spelas:</span>
        <span className={styles.trackTitle}>{title}</span>
      </div>

      <div className={styles.mainControls}>
        <button onClick={togglePlayPause} className={styles.playPauseButton}>
          {isPlaying ? <FaPause size={16} /> : <FaPlay size={16} />}
        </button>
      </div>

      <div className={styles.seekBarContainer}>
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

      <div className={styles.volumeControl}>
        <FaVolumeUp size={16} className={styles.volumeIcon}/>
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
      
      <button 
        className={styles.toggleButton} 
        onClick={() => setIsPlayerVisible(!isPlayerVisible)}
        aria-label={isPlayerVisible ? "Dölj spelare" : "Visa spelare"}
      >
        {isPlayerVisible ? <FaChevronDown size={16} /> : <FaChevronUp size={16} />}
      </button>
    </div>
  );
};