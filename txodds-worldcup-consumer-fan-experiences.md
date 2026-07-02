# Consumer and Fan Experiences - TxODDS World Cup Hackathon (Superteam Earn)

Hackathon World Cup hébergé par TxODDS exclusivement sur Superteam Earn, en partenariat avec Solana. TxLINE est la couche de données de TxODDS : scores live, cotes de consensus en temps réel et événements de match pour les 104 matchs du Mondial, avec un schéma JSON unique et normalisé. Ce track vise des expériences consommateur/fan. Prix en vrai USDT, pas en points testnet.

- **Hub du hackathon (tous les tracks) :** https://superteam.fun/earn/hackathon/world-cup/
- **Ouverture des soumissions :** 24 juin 2026, 15:00 UTC
- **Deadline :** 19 juillet 2026, 23:59 UTC
- **Annonce des gagnants :** 29 juillet 2026, 15:00 UTC
- **Prize pool de ce track :** 16 000 USDT
- **Soumissions au 1er juillet :** 4
- **Accès data gratuit :** TxODDS supprime tous les frais commerciaux et l'exigence de paiement en token pendant l'événement. Feeds premium live des 104 matchs accessibles à coût zéro jusqu'au 19 juillet 23:59 UTC.

## Récompenses

| Place | Récompense |
|-------|------------|
| 1re   | 10 000 USDT |
| 2e    | 4 000 USDT  |
| 3e    | 2 000 USDT  |

## Le track

La plupart des fans regardent le Mondial le téléphone à la main. TxLINE donne accès à des données jusque-là réservées aux gros opérateurs. L'objectif : construire des expériences fan qui n'existent pas encore.

Idées de départ proposées par les organisateurs :

- **Group Sweepstake :** des amis se voient assigner des équipes du Mondial, le leaderboard se met à jour en live depuis les données TxLINE au lieu d'un spreadsheet manuel
- **AI Pundit Bot :** un bot Telegram qui envoie un message à chaque événement significatif (but, carton rouge, gros mouvement de cotes) en expliquant ce qui s'est passé et ce que le marché en pense. Points bonus pour du TTS.
- **Hi-Lo Stats Game :** deviner si la prochaine stat de match (tirs, corners, possession) sera plus haute ou plus basse que la précédente. Streaks, score partageable, rejouable sur 104 matchs.

## Critères de jugement

- **Fan Accessibility & UX :** engageant, intuitif et assez poli pour qu'un fan mainstream non technique l'ouvre régulièrement
- **Real-Time Responsiveness :** l'app réagit et se met à jour de façon fluide selon ce qui se passe sur le terrain
- **Originality & Value Creation :** une expérience consommateur réellement nouvelle, pas un feed sportif repackagé
- **Commercial & Monetization Path :** une utilité produit claire et un modèle de monétisation viable
- **Completeness & Execution :** un produit fonctionnel de bout en bout, même si le scope technique est volontairement petit

Point critique : le jugement repose lourdement sur la vidéo démo. Les matchs seront terminés au moment de la review, donc aucune activité live pendant l'évaluation. La démo doit montrer clairement l'expérience produit, le user flow et les fonctionnalités core.

## Éligibilité et soumission idéale

- Produit live (mainnet ou devnet) qui fonctionne pendant un match
- Clarté du cas d'usage et qualité d'exécution priment sur le scope
- Ouvert aux individus, équipes (max 3 membres) et agents AI, mais la soumission doit appartenir à une vraie personne/équipe/entité éligible à recevoir les prix via Superteam Earn
- Vidéo démo + repo public obligatoires
- Doit utiliser les données TxLINE comme input live et l'inscription passe par Solana
- Produits fonctionnels seulement : pitch decks, wireframes, mockups et concepts non fonctionnels sont automatiquement disqualifiés

## Exigences de soumission

1. **Vidéo démo (max 5 min, Loom/YouTube) :** le problème, un walkthrough live de l'app, et comment TxLINE alimente le backend. Exigence absolue pour passer le screening initial.
2. **Accès à l'application :** lien fonctionnel vers le site déployé OU un endpoint API testable par les juges
3. **Doc technique brève :** idée core, highlights business/techniques, liste des endpoints TxLINE utilisés
4. **Feedback :** retour d'expérience sur l'API TxLINE (ce qui a plu, où étaient les frictions)

## Processus de sélection

- Clôture le 19 juillet 23:59 UTC, puis review et shortlist par les juges
- Gagnants finaux (1re, 2e, 3e place par track) évalués contre les critères et annoncés peu après des rounds d'interview live
- Distribution des prix en stablecoins et support engineering/écosystème après la conclusion des interviews des gagnants

À noter : il y a des interviews live avant le paiement. Prévoir d'être disponible fin juillet.

## Les 3 tracks du hackathon (même deadline, 50 000 USDT au total)

| Track | Pool | Soumissions (1er juillet) | Lien |
|-------|------|---------------------------|------|
| Prediction Markets and Settlement (flagship) | 18 000 USDT | 11 | https://superteam.fun/earn/listing/prediction-markets-and-settlement/ |
| Consumer and Fan Experiences (ce fichier) | 16 000 USDT | 4 | via le hub |
| Trading Tools and Agents | 16 000 USDT | 6 | https://superteam.fun/earn/listing/trading-tools-and-agents/ |

Le track flagship couvre les marchés, la résolution et le settlement sur données World Cup vérifiables : outcome markets, oracle tooling, intégrations de preuves on-chain. Contexte technique : TxLINE tracke et timestampe chaque paquet de données sur Solana, créant un audit trail tamper-evident pour le backtesting, la compliance et la vérification automatisée de smart contracts.

## Ressources

- Quickstart TxLINE : https://txline.txodds.com/documentation/quickstart
- Documentation World Cup : https://txline.txodds.com/documentation/worldcup
- Support développeur : Discord et Telegram (liens sur la page du listing)

## Note légale

Les participants sont responsables de la conformité de leur soumission aux lois applicables dans leur juridiction (gambling, gaming, financier, protection du consommateur, securities). TxLINE et Superteam Earn n'endossent pas le betting illégal. Les T&C du hackathon TxODDS et les règles de Superteam Earn s'appliquent : lire le document complet avant de participer.

## Notes

- 4 soumissions sur ce track au 1er juillet avec 10 000 USDT pour la 1re place : ratio effort/récompense rare, et c'est du cash réel via Superteam Earn.
- La vidéo démo porte presque tout le jugement. La tourner pendant des matchs live (le tournoi court jusqu'au 19 juillet) puisque la review se fera après la fin du Mondial.
- Vu le travail Polymarket (modèles de divergence de données) et les projets agents/x402, les deux autres tracks collent probablement mieux au profil : Prediction Markets and Settlement (18k, flagship, oracle tooling et settlement) et Trading Tools and Agents (16k, seulement 6 soumissions). Vérifier dans les T&C si une soumission peut viser plusieurs tracks.
