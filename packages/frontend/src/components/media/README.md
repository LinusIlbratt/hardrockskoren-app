# Musikspelaren – teknisk översikt

Den här mappen innehåller **MediaPlayer** (själva ljud- och kontroll-UI:t), **MiniPlayerBar** (spegel-UI när fullskärms-overlay är minimerad) och tillhörande stilar. Själva **sessionen** (öppna/stänga musik, bibliotek vs repertoar) styrs av `MusicPlayerOverlayContext` i `packages/frontend/src/context/`.

---

## Arkitektur: Context → Overlay → MediaPlayer

```text
MusicPlayerOverlayProvider (AppLayout)
  │
  ├── AppLayoutContent
  │     ├── Outlet (sidor)
  │     ├── Portal-mål (div.musicOverlayPortal)
  │     ├── MusicPlayerOverlayHost  ──► MusicPlayerOverlay (portal)
  │     │                                 └── RepertoireMusicPlayerPanel
  │     │                                       └── MediaPlayer (embedded, syncPlaybackToContext)
  │     └── MiniPlayerBar  ──► samma context + playbackApiRef (ingen egen <audio>)
  │
  └── (andra sidor kan anropa open / openLibraryPlayer)
```

- **`MusicPlayerOverlayProvider`** håller global session: vilken grupp, medlem/ledare, om fullskärm är öppen (`isOpen`), bibliotekskö (`libraryMaterials`), startintent för repertoar/spellista, samt **synkad uppspelningsmetadata** (titel, play/paus, tidslinje, repeat, volym, hastighet, köposition, aktivt `materialId`).
- **`MusicPlayerOverlayHost`** läser context och renderar **`MusicPlayerOverlay`** när det finns en aktiv session (`activeGroupName` + `activeViewer`). Overlayn portas till `mountEl` (layoutens div) eller `document.body`.
- **`MusicPlayerOverlay`** visar fullskärms-UI (scrim, fokusfälla, body scroll lock) och bäddar in **`RepertoireMusicPlayerPanel`**, som i sin tur monterar **`MediaPlayer`** med `variant="embedded"` och `syncPlaybackToContext`.
- När användaren **minimerar** (`closeOverlay`) sätts `isOpen: false` men sessionen och DOM för panelen kan finnas kvar – **`<audio>` fortsätter i den dolda MediaPlayer**. **`MiniPlayerBar`** visar då en kompakt spelare som **inte** duplicerar ljudet utan anropar **`playbackApiRef`** (imperativ API mot samma MediaPlayer-instans).

**Viktigt:** `MediaPlayer` använder `useOptionalMusicPlayerOverlay()`. Synk till context sker bara när prop **`syncPlaybackToContext`** är satt – annars påverkas inte miniplayern.

---

## State & props: `MediaPlayerPropsSingle` vs kö (`MediaPlayerPropsQueue`)

`MediaPlayerProps` är en **discriminated union**: antingen enkelspår eller kö. Runtime avgörs av **`isQueueProps`**: om `tracks` är en **icke-tom array** räknas det som köläge.

### Gemensamt (`MediaPlayerCommon`)

| Prop | Syfte |
|------|--------|
| `persistProgressKey?` | Nyckel till `sessionStorage` (prefix `hrk-media-progress:`) för att spara spårindex + tid. |
| `enableKeyboardShortcuts?` | Tangentbord (mellanslag, pilar, n/p i kö). Default `true`. |
| `syncPlaybackToContext?` | När `true`: pushar state till overlay-context + fyller `playbackApiRef` (miniplayer). |

### Enkelspår – `MediaPlayerPropsSingle`

```ts
interface MediaPlayerPropsSingle extends MediaPlayerCommon {
  src: string;
  title: string;
  materialId?: string;       // favorit / spellista
  tracks?: never;
  initialTrackIndex?: never;
  autoAdvanceToNext?: never;
  onTrackIndexChange?: never;
  variant?: 'fixed' | 'embedded';
}
```

- **`src` / `title`** (och valfritt **`materialId`**) används direkt.
- Fält som bara hör till kön är satta till **`never`** så att TypeScript hindrar blandning.

### Kö – `MediaPlayerPropsQueue`

```ts
interface MediaPlayerPropsQueue extends MediaPlayerCommon {
  src?: never;
  title?: never;
  materialId?: never;
  tracks: MediaPlayerTrack[];
  initialTrackIndex?: number;
  autoAdvanceToNext?: boolean;   // default beteende: true om >1 spår
  onTrackIndexChange?: (index: number) => void;
  variant?: 'fixed' | 'embedded';
}

interface MediaPlayerTrack {
  src: string;
  title: string;
  materialId?: string;   // per spår, för favorit/spellista
}
```

- **`queueMode`** = `isQueueProps(props)`.
- Aktuellt spår: `tracks[currentTrackIndex]` ger `audioSrc`, titel och `materialId`.

### Slå ihop till exporttypen

```ts
export type MediaPlayerProps = MediaPlayerPropsSingle | MediaPlayerPropsQueue;
```

---

## Ljud: `audioRef` och `onEnded` + repeat (`off` / `all` / `one`)

- **`audioRef`** pekar på ett **`<audio>`**-element. Vid byte av källa används `key={audioSrc}` så att elementet återmonteras vid spårbyte.
- **`onEnded`** kopplas till **`handleAudioEnded`** (inte bara repeat – även automatisk nästa spår i kö).

### Köläge (`queueMode && tracks.length`)

| `repeatMode` | Beteende när spåret tar slut |
|--------------|------------------------------|
| **`one`** | Sätter `currentTime = 0` och `play()` på **samma** spår (loop ett spår). |
| **`all`** | Om flera spår: `setCurrentTrackIndex` till nästa, eller **0** från sista spåret. Om **ett** spår: loop som `one` (nollställ + spela). |
| **`off`** | Om `autoAdvance` och inte sista spåret → nästa index. Annars stannar index kvar (inget loop av hela listan). |

### Enkelspår (inte kö)

- **`one`** eller **`all`**: när låten tar slut → `currentTime = 0` och `play()` igen.
- **`off`**: ingen repeat (standard webbläsarbeteende).

Övrigt: **`goToNext`** / **`goToPrevious`** påverkar bara **köläge**; repeat **`all`** låter manuell "nästa" från sista spåret hoppa till index 0.

---

## Integrationer: favoriter och spellista

### `useFavorites`

- **`MediaPlayer`** och **`MiniPlayerBar`** anropar **`useFavorites()`** från `@/hooks/useFavorites`.
- Hooken laddar favoritmaterial-ID:n via **`musicService.getFavorites()`** och exponerar **`favoriteMaterialIds`** samt **`toggleFavoriteOptimistic(materialId)`** (optimistisk UI, rollback vid fel).
- **Hjärtat** i UI visas bara om **`currentMaterialId`** finns:
  - **Enkelspår:** `props.materialId`.
  - **Kö:** `tracks[currentTrackIndex]?.materialId`.

### `AddToPlaylistModal`

- Öppnas från knappen "Lägg till i spellista" när `materialId` finns.
- **`MediaPlayer`** håller lokal state **`showPlaylistModal`** och skickar **`materialId={currentMaterialId}`** när modalen är öppen.
- Modalen använder **`usePlaylists`**, **`musicService.addPlaylistItem`**, och kan skapa ny spellista – samma mönster som i **`MiniPlayerBar`** (egen `playlistModalOpen` + **`activeMaterialId`** från context).

Ingen av dessa hookar/modaler är kopplade till **själva** uppspelningsmotorn; de är **sidoeffekter** kring aktuellt material-ID.

---

## Context-synk och miniplayer (`syncPlaybackToContext`)

När `syncPlaybackToContext === true` och context finns:

- **`setActiveTrack`**, **`setIsPlaying`**, **`setPlaybackProgress`**, **`setRepeatMode`**, **`setVolume`**, **`setPlaybackRate`**, **`setQueueMeta`**, **`setActiveMaterialId`** uppdateras från MediaPlayer via `useEffect`.
- **`playbackApiRef`** fylls med **`MusicPlaybackApi`**: `togglePlayPause`, `goPrevious`, `goNext`, `cycleRepeat`, `seek`, `setPlaybackRate`, `setVolume`.
- **`useMusicPlayerPlaybackProgress()`** läser en **intern progress store** (`useSyncExternalStore`) så att tidslinjen kan uppdateras ofta **utan** att hela trädet som använder `useMusicPlayerOverlay` renderas om varje frame.

**MiniPlayerBar** använder `playbackApiRef.current` för kontroller och `useMusicPlayerPlaybackProgress()` för tidslinje – samma beteende som den inbäddade spelaren, men utan second `<audio>`.

---

## Övriga filer med koppling till musikspelaren

| Plats | Roll |
|-------|------|
| `context/MusicPlayerOverlayContext.tsx` | Provider, `open` / `openLibraryPlayer`, session, refs, progress store. |
| `components/music/MusicPlayerOverlay.tsx` | Fullskärm + portal; **`MusicPlayerOverlayHost`** för AppLayout. |
| `pages/member/RepertoireMusicPlayerPanel.tsx` | Bygger `playerQueue` som `MediaPlayerTrack[]`, monterar **`MediaPlayer`** med kö + `syncPlaybackToContext`. |
| `components/layout/AppLayout.tsx` | Wrappar med provider, portal, **`MusicPlayerOverlayHost`**, **`MiniPlayerBar`**. |
| `hooks/useFavorites.ts` | Favoriter mot music-api. |
| `hooks/usePlaylists.ts` | Spellistor (används av `AddToPlaylistModal`). |
| `components/music/AddToPlaylistModal.tsx` | Lägg material i spellista. |
| `utils/recentPlayback.ts` | Typer för `OpenMusicOptions`, resume m.m. (används av `open()`). |
| `pages/member/MusicDeepLinkHandler.tsx`, `RecentlyPlayedWidget.tsx`, `MemberRepertoireMaterialPage.tsx`, `LeaderDashboard.tsx` | Öppnar eller påverkar overlay via context. |
| `pages/PracticePage.tsx`, `pages/admin/AdminRepertoireMaterialPage.tsx` | **Enkel** `MediaPlayer` utan overlay-synk (ingen `syncPlaybackToContext`). |

---

## Snabb checklista vid nya UI-funktioner

- Ska funktionen styra **ljudet**? → Utöka **`MusicPlaybackApi`** och implementationen i **`MediaPlayer`** + ev. **`MiniPlayerBar`**.
- Ska state synkas till minibar? → Uppdatera context + **`useEffect`**-kedjan i **`MediaPlayer`** när `syncPlaybackToContext`.
- Påverkar det **endast** fullskärmspanelen? → **`RepertoireMusicPlayerPanel`** eller overlay-lager.
- Undvik **dubbel** `<audio>`: miniplayern ska alltid gå via **`playbackApiRef`**.
