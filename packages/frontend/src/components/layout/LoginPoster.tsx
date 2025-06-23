import styles from './LoginPoster.module.scss';
import posterImage from '@/assets/images/hrk-skull-poster.webp';

export const LoginPoster = () => {
    return (
        <section className={styles.page}>
            <figure className={styles.poster}>
                {/* STEG B: Använd den importerade bilden i src-attributet */}
                <img src={posterImage} alt="Poster för Hårdrockskören" />
            </figure>
        </section>
    )
}