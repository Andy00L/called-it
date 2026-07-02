# 3 idées de soumission : TxODDS World Cup Hackathon, track Consumer and Fan Experiences

Recherche menée le 2 juillet 2026. Fondée sur : lecture directe de la doc TxLINE (spec OpenAPI complète, exemples streaming et validation on-chain), l'historique des gagnants de hackathons Solana (Colosseum Radar, Cypherpunk), le prior art grand public (Amazon Prime Vision), et la guidance démo de Colosseum.

## Ce que la recherche a établi

### L'API TxLINE (vérifié de première main dans la spec OpenAPI)

- **Livraison** : REST + streaming **SSE** (`GET /api/odds/stream`, `GET /api/scores/stream`), heartbeats, gzip. Devnet : `txline-dev.txodds.com`.
- **Cotes** : par bookmaker ET consensus. Champ `Pct` = **StablePrice, probabilités implicites dé-margées** (3 décimales) sur chaque marché (`SuperOddsType`, `MarketParameters`, `MarketPeriod`, `InRunning`). Historique par tranches de 5 minutes.
- **Feed soccer, bien plus riche que "scores"** : buts, cartons, corners par période; `dataSoccer` (Action, GoalType, Minutes, PlayerId, substitutions, Penalty, VAR); **possession en %** et `possessionType` (SafePossession, AttackPossession, DangerPossession, HighDangerPossession); **pré-signaux** `possibleEvent` (but, penalty, corner, carton, VAR imminents); **lineups avec noms des joueurs**. Historique complet d'un match via `/api/scores/historical/{fixtureId}`.
- **Preuves on-chain** : racines de Merkle quotidiennes publiées sur Solana (programme **Txoracle**, PDA `daily_scores_roots`). `validateStat()` en `.view()` (gratuit, lecture seule) prouve un prédicat sur une ou deux stats (ex. "corners équipe 1 > corners équipe 2 en 2e mi-temps"). Endpoints de preuve fournis pour fixtures, odds et stats.
- **Accès gratuit World Cup** : Service Level 1 (délai 60 s) et **Service Level 12 (temps réel, mainnet uniquement)**. Wallet Solana obligatoire pour tous les tiers : la souscription est on-chain, l'API token s'active en signant la transaction.

### Le paysage (recherche web, partiellement vérifié)

- Les tracks consumer des hackathons Solana récents ont été gagnés par des produits **social + marchés** : Pregame (betting P2P, Radar), Capitola (agrégateur de prediction markets, Cypherpunk), Fora (group chat + marchés, top 3). Les "feeds sportifs améliorés" ne gagnent pas.
- **Amazon Prime Vision / Path to Victory** (NFL) : prior art mainstream d'un flux de visionnage enrichi par probabilités. Personne ne le fait pour le foot en produit autonome grand public.
- TxODDS productise déjà le mouvement de cotes comme signal (Market Moves Feed, index "oci") : l'angle "le marché comme narration" est aligné avec la vision du sponsor.
- Guidance Colosseum : vidéo courte (3 min max recommandé), **la narration bat la production**; échecs courants : dépassement du temps, visuels tape-à-l'oeil sans substance, buzzwords.
- Les 3 idées de départ du brief (sweepstake, pundit bot, hi-lo) sont ce que les 4 concurrents actuels ont le plus probablement construit. Pour gagner : soit transcender un template, soit être orthogonal.

### Les 3 armes transversales (à intégrer quelle que soit l'idée)

1. **Time Machine (mode replay)** : les juges évaluent APRÈS la finale, sans aucun match live. Les endpoints historiques (cotes par tranche de 5 min, historique complet des scores) permettent de rejouer n'importe quel match "comme en direct". Les concurrents livreront des apps mortes au moment du judging; nous, les juges pourront VIVRE le produit en live sur la finale. Avantage énorme sur les critères Real-Time Responsiveness et Completeness. (Sportradar vend des API de simulation exactement pour ça : le besoin est réel.)
2. **Wallet invisible** : la souscription TxLINE on-chain se fait côté serveur (notre backend détient le wallet). Le fan n'installe rien. Solana reste au coeur (auth des données, preuves, receipts) sans friction d'onboarding. Critère Fan Accessibility.
3. **Démo filmée pendant de vrais matchs avant le 19 juillet**, montage narratif de 3 à 4 min : problème, produit en live, comment TxLINE alimente tout, preuve on-chain à l'écran.

---

## Idée 1 : CALLED IT (recommandée)

**Pitch** : le jeu gratuit de micro-pronostics en direct où chaque "call" est coté par le vrai marché mondial et où chaque victoire est prouvable on-chain. Le Hi-Lo du brief, transcendé trois crans au-dessus.

**Boucle core** : pendant un match live, l'app propose des calls à fenêtre courte : "corner dans les 10 prochaines minutes", "but avant la mi-temps", "le favori passe sous 50 % de proba avant la 80e". Le nombre de points gagnés est **inversement proportionnel à la probabilité StablePrice à l'instant du call** : caller un but de l'outsider à 12 % rapporte gros, suivre le troupeau rapporte peu. Streaks, ligues privées entre amis, leaderboard des 104 matchs. Après le match : le **receipt**, une carte partageable "j'ai callé X à la 67e quand le marché n'y croyait qu'à 12 %", vérifiable on-chain.

**Pourquoi ça tabasse** :
- C'est le pattern qui gagne les tracks consumer Solana (social + marchés) transposé en free-to-play légal (pas d'argent réel misé, donc pas de mur gambling, conforme à la note légale du brief).
- Le scoring par le marché est impossible sans TxLINE : aucune app de pronostics existante (Superbru, FotMob predictor, fantasy) ne cote dynamiquement chaque pick à la seconde. Les cotes ne sont pas décoratives, elles SONT la mécanique.
- Le règlement prouvable est la feature signature de TxLINE que personne d'autre n'utilisera : les picks sont horodatés et engagés on-chain (hash), le règlement s'exécute contre `validateStat()` et les racines Merkle du programme Txoracle. Le sponsor voit son audit trail devenir un produit consumer.
- Réplique exactement la "receipt culture" des réseaux (screenshots de paris, "j'avais raison") mais avec une preuve cryptographique au lieu d'un screenshot truquable.

**Intégration TxLINE** : `odds/stream` (pricing dynamique des calls), `scores/stream` (résolution des événements), `scores/stat-validation` + `validateStat()` (règlement prouvable), `scores/historical` + `odds/updates/{interval}` (Time Machine). Solana : commitments horodatés des picks, vérification Txoracle, receipts optionnels en NFT compressés, souscription API on-chain.

**Monétisation** : freemium (ligues privées avancées, cosmétiques, calls simultanés multiples), pools de prix sponsorisés par des marques (le sponsor paie, le jeu reste gratuit), white-label B2B pour médias et opérateurs qui veulent une couche d'engagement sans licence de jeu.

**Démo (4 min)** : 30 s le problème (les group chats pendant les matchs, les screenshots de "j'avais dit"); 2 min un vrai match filmé en live avec 3 téléphones côte à côte, un call osé, le but tombe, le receipt se génère avec l'explorer Solana visible; 1 min Time Machine : "vous, les juges, pouvez rejouer la finale et jouer vous-mêmes"; 30 s stack et monétisation.

**Scope 2,5 semaines (solo)** : Next.js mobile-first + backend Node qui relaie les streams SSE et gère le pricing; règlement via les endpoints de validation fournis (pas de programme Solana custom à écrire : Txoracle existe, les commitments peuvent passer par Memo + racine Merkle périodique). Risques : ergonomie du timing des calls (mitigé par des fenêtres larges), compréhension fine des clés de stats (goals, cartons, corners confirmées dans la spec).

---

## Idée 2 : PULSE

**Pitch** : le second écran qui montre ce que le marché mondial ressent, seconde par seconde. Le battement de coeur émotionnel des 104 matchs, pour des fans qui ne parient pas.

**Boucle core** : pendant un match, un "coeur" bat au rythme des probabilités de victoire (StablePrice) qui bougent en continu. L'app détecte automatiquement les **chocs** (les bascules de probabilité les plus violentes du tournoi), génère des cartes de moment partageables ("87e : le marché vient de basculer de 22 points en 40 secondes, plus gros choc du Mondial"), calcule un **indice d'excitation** par match (prior art académique : Game Excitement Index), et affiche la grille des matchs simultanés classée par drama en cours : "où faut-il zapper MAINTENANT". Une ligne d'IA explique chaque choc : "les sharps ont bougé avant la confirmation VAR, le marché avait senti le penalty".

**Pourquoi ça tabasse** :
- Prior art mainstream prouvé (Amazon Prime Vision, Path to Victory) mais personne ne le fait pour le foot en produit autonome et gratuit. FotMob et OneFootball montrent des stats; aucun ne montre l'émotion du marché.
- C'est LA donnée différenciante de TxLINE (consensus dé-margé incluant les sharp books absents des feeds occidentaux) rendue lisible pour un fan lambda.
- L'objection "feed repackagé" est tuée par trois choses qui n'existent nulle part : la détection de chocs, le zapping inter-matchs par drama, et les moments prouvables (chaque choc est ancré via les preuves Merkle : le moment est vérifiable, pas inventé a posteriori).
- Pendant la phase de groupes (matchs simultanés), le multi-match est un usage quotidien évident.

**Intégration TxLINE** : `odds/stream` en SL12 temps réel (le produit entier vit dessus), `scores/stream` pour contextualiser chaque choc (but, carton, VAR), historique 5 min pour les timelines émotionnelles et le Time Machine. Solana : preuves Merkle sur les moments partagés, souscription on-chain.

**Monétisation** : widget embeddable B2B (médias, streamers, watch parties paient pour l'overlay), premium multi-match et alertes, API de moments pour créateurs de contenu.

**Démo (3 min)** : split-screen match TV + Pulse qui réagit AVANT le commentateur; la séquence signature "le marché a senti le penalty avant l'arbitre"; la grille de zapping un jour à 4 matchs; Time Machine pour les juges.

**Scope 2,5 semaines** : le plus faisable des trois en solo (pas de règlement de jeu, pas d'audio). Risques : produit plus passif (rétention), à contrer par le zapping et le partage; dépendance à la qualité visuelle (le coeur battant doit être magnifique).

---

## Idée 3 : MARKET MIC

**Pitch** : le co-commentateur IA qui commente le match que la TV ne montre pas : celui qui se joue dans la tête du marché mondial. Audio en direct, dans ta langue. Le Pundit Bot du brief, transcendé.

**Boucle core** : tu choisis ton match et ta langue, tu poses le téléphone à côté de la TV, une voix IA persona ("l'oreille du marché") commente en continu : les événements (buts, cartons, VAR, avec les vrais noms des joueurs via les lineups du feed), ce que le marché en pense (bascules de probabilités), et de l'**anticipation** grâce aux pré-signaux du feed (HighDangerPossession, possible penalty, possible VAR) : la voix peut dire "attention, séquence dangereuse côté droit" avant que ça arrive à la TV. Résumé à la mi-temps, "l'histoire du marché" en podcast de 2 min après le match. Web + Telegram (notes vocales).

**Pourquoi ça tabasse** :
- Le Pundit Bot texte est l'idée la plus attendue des concurrents; l'audio continu temps réel avec anticipation est une autre catégorie de produit.
- Les pré-signaux (`possibleEvent`, `possessionType`) sont une capacité du feed que quasi personne ne remarquera : ils permettent un commentaire ANTICIPATOIRE, chose que même les commentateurs TV n'ont pas.
- Le TTS rapporte des points bonus explicitement mentionnés dans le brief.
- Cas d'usage réels : fans qui regardent en langue étrangère, malvoyants, radios locales sans droits de commentaire.

**Intégration TxLINE** : `scores/stream` (événements riches dataSoccer + possession + pré-signaux + lineups), `odds/stream` (le narratif marché), historique pour les récaps et le Time Machine (rejouer la finale commentée). Solana : souscription on-chain; option "citations vérifiables" (chaque fait énoncé est ancré via preuve Merkle).

**Monétisation** : premium voix et langues, clips audio auto-générés pour créateurs, B2B radios et streamers.

**Démo (3 à 4 min)** : la voix réagit sur un vrai but pendant que le commentaire TV est en retard; changement de langue en un tap; le moment anticipatoire ("elle l'a dit avant l'arbitre"); Time Machine audio sur un match terminé.

**Scope 2,5 semaines** : pipeline temps réel scores + odds vers LLM vers TTS streaming. Risques : latence et coût TTS, qualité du commentaire en continu (mitigé : ne parler que sur événements et chocs, silence sinon), démo audio plus dure à monter proprement.

---

## Recommandation

**Called It** en premier choix : c'est le seul des trois qui coche fort les cinq critères à la fois, qui suit le pattern des gagnants consumer Solana, et dont la mécanique centrale (pricing par le marché + règlement prouvable) est littéralement impossible à répliquer sans TxLINE. **Pulse** si tu veux minimiser le risque d'exécution solo. **Market Mic** si tu veux maximiser l'effet wow IA et les points bonus TTS.

Quelle que soit l'idée : Time Machine obligatoire, wallet invisible, démo tournée pendant de vrais matchs avant le 19 juillet, vidéo de 3 à 4 min montée en narration.

## Questions ouvertes

- Une soumission peut-elle viser plusieurs tracks ? (FAQ du hub derrière un accordéon JS, réponse non extraite; à vérifier dans les T&C.)
- Stats "tirs" et clés exactes de la map `stats` : goals, cartons, corners confirmés par période; tirs et possession fine à valider en pratique une fois l'accès API activé.
- Latence réelle du tier gratuit SL12 (annoncé temps réel, mainnet uniquement) à mesurer dès l'activation.
