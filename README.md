# Volley Live Score

Page web de programme et de résultats pour le tournoi du club. La table de marque saisit le score final de chaque match dans un **Google Sheet**, qui calcule les classements de poules et l'arbre final. Le site lit ce Sheet toutes les 30 secondes et l'affiche sur les téléphones des participants. Il n'y a pas de score en direct : seuls les résultats finaux sont publiés.

- Aucun serveur, aucune base de données, aucun coût.
- Le site est 4 fichiers statiques (`index.html`, `style.css`, `app.js`, `config.js`).
- Si le site tombe, le Sheet reste la référence et la table continue de travailler normalement.

## Format de tournoi géré

12 équipes, 3 terrains, 3 poules de 4 (une poule par terrain) :

1. **Brassage 1** : poules A, B, C (terrains 1, 2, 3). Chaque équipe joue les 3 autres, soit 6 matchs par poule, joués dans l'ordre des lignes du Sheet. La colonne « Heure » est facultative : si vous la remplissez, le site l'affiche.
2. **Brassage 2** : nouvelles poules D, E, F composées automatiquement en serpentin à partir des classements du brassage 1 :
   - D = 1er A, 2e C, 3e B, 4e A
   - E = 1er B, 2e A, 3e C, 4e B
   - F = 1er C, 2e B, 3e A, 4e C

   Chaque poule contient un 1er, un 2e, un 3e et un 4e. Avec 4 équipes réparties dans 3 poules, une rencontre du brassage 1 se rejoue forcément dans chaque poule : c'est celle entre le 1er et le 4e d'une même poule.
3. **Phase finale** : 8 qualifiés, soit les 2 premiers de chaque poule et les 2 meilleurs 3es. Ils sont classés en têtes de série :
   - 1 à 3 : les premiers de poule, classés entre eux ;
   - 4 à 6 : les 2es ;
   - 7 et 8 : les deux meilleurs 3es.

   Le rang dans la poule vient du brassage 2 seul. En revanche, pour classer entre eux les 1ers, les 2es et les 3es (et donc choisir les 2 meilleurs 3es), on cumule les résultats des deux brassages : points, puis goal average, puis points marqués (colonne `Clé cumulée B1+B2` de `Classement_B2`).

   Quarts : 1 contre 8, 4 contre 5, 2 contre 7, 3 contre 6. Viennent ensuite les demi-finales, la petite finale et la finale.

Chaque match se joue **en un seul set**. Le score cible n'est fixé nulle part (25, 21, 15, au temps…) : un match compte comme joué dès que ses deux scores sont saisis. Le vainqueur est l'équipe qui a le plus de points.

**Arbitres.** Pendant un match de poule, les deux autres équipes de la poule sont libres. L'une d'elles arbitre, et chaque équipe arbitre 1 ou 2 fois par brassage. En phase finale :
- les quarts sont arbitrés par les 4 équipes éliminées (les trois 4es et le 3e non qualifié) ;
- les demies et les finales sont arbitrées par les perdants des quarts.

L'arbitre est désigné par un code dans la colonne « Réf. arbitre » (par exemple `A3`, `4D`, `P-QF1`), comme les équipes.

Classement d'une poule (et, sur le cumul des deux brassages, comparaison des 3es entre poules) : points de classement (3 par victoire, 0 par défaite, réglable dans `Config`), puis goal average (points marqués moins points encaissés), puis nombre de points marqués.

**Forfaits.** Un match perdu par forfait compte comme une victoire pour l'adversaire et une défaite pour l'équipe forfait. Pour ne favoriser personne au goal average, on ne compte pas le score de ce match. À la place, chaque équipe reçoit sa propre moyenne (points marqués et encaissés) calculée sur ses autres matchs de la phase. Ces valeurs peuvent donc avoir une décimale.

## Le Google Sheet

| Onglet | Rôle | Qui le modifie |
|---|---|---|
| `Config` | Nom du tournoi, message d'info affiché sur le site, points par victoire ou défaite | Organisateur |
| `Equipes` | Les 12 équipes et leur poule de brassage 1 | Organisateur, avant le tournoi |
| `Matchs_B1`, `Matchs_B2`, `Matchs_Finale` | Planning et scores | **Table de marque** (cellules jaunes) |
| `Classement_B1`, `Classement_B2` | Classements calculés, avec une vue triée à droite | Personne (calculé) |
| `Codes` | Correspondance entre les codes (`A1`, `1E`, `V-QF1`…) et les équipes | Personne (technique) |

### Pendant le tournoi (table de marque)

À la fin de chaque match, saisir le score final des deux équipes dans les colonnes jaunes « Score Éq.1 » et « Score Éq.2 ». C'est tout : le classement, la composition des poules suivantes et l'arbre se mettent à jour tout seuls.

- Ne remplir les scores qu'une fois le match fini : un match dont les deux scores sont remplis est considéré comme joué.
- En cas de forfait, choisir « Éq.1 forfait » ou « Éq.2 forfait » dans la colonne jaune « Forfait » (colonne O), sans saisir de score.
- Le site affiche comme « Prochains matchs » le premier match sans score de chaque terrain. Si un match n'est pas saisi, il reste affiché comme prochain.
- Un match à égalité n'a pas de vainqueur : il compte comme joué, sans victoire ni défaite.

Les noms des équipes et des arbitres du brassage 2 et de la phase finale s'affichent comme « 1er A », « Vainqueur QF1 »… tant que tous les scores de la phase précédente ne sont pas saisis.

À ne pas faire :

- Écrire du texte dans une colonne de score : utiliser la colonne « Forfait » pour un forfait.
- Déplacer ou trier les lignes de `Matchs_Finale` : l'arbre repose sur leur ordre (QF1 à QF4, SF1, SF2, P3, F).
- Insérer ou supprimer des colonnes dans les onglets `Matchs_*` ou `Classement_*` : le site lit les colonnes par position.
- Modifier les colonnes grises (calculées). Google Sheets affiche un avertissement si on essaie.

Pour corriger un appariement ou un arbitre à la main (par exemple un désistement), on peut taper directement un nom d'équipe dans « Équipe 1 », « Équipe 2 » ou « Arbitre » : cela remplace la formule pour ce match uniquement.

### Préparer un nouveau tournoi

1. Faire une copie du Sheet (Fichier > Créer une copie).
2. Dans `Equipes`, saisir les vrais noms des équipes et leur poule.
3. Dans les 3 onglets `Matchs_*`, effacer les scores (colonnes G et H) et les forfaits (colonne O).
4. Partager la copie (voir ci-dessous) et mettre son ID dans `config.js`.

## Mise en ligne du site

### 1. Rendre le Sheet lisible par le site

Dans le Sheet : **Partager > Accès général > « Tous les utilisateurs disposant du lien » > Lecteur**.

Le site ne peut que lire. Seules les personnes que vous ajoutez comme « Éditeur » peuvent modifier les scores.

### 2. Renseigner l'ID du Sheet

Dans `config.js`, `SHEET_ID` est la partie de l'URL du Sheet entre `/d/` et `/edit` :

```
https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
```

### 3. Héberger les fichiers (gratuit)

Au choix :

- **Netlify Drop** (le plus simple) : aller sur https://app.netlify.com/drop et glisser le dossier du projet. Vous obtenez une adresse du type `https://nom-au-hasard.netlify.app`, que vous pouvez renommer.
- **GitHub Pages** : pousser le dossier dans un dépôt GitHub, puis Settings > Pages > Deploy from branch > `main` / racine.

### 4. Partager l'adresse

Générez un QR code de l'adresse et affichez-le au gymnase (table de marque, buvette, vestiaires).

Astuce : `https://votre-site/?equipe=Les%20Smashers` ouvre directement la page « Mon équipe » d'une équipe. Pratique pour l'envoyer à chaque capitaine.

## Tester sans Google

Ouvrez `index.html?demo` dans un navigateur, ou laissez `SHEET_ID` vide. Le site affiche alors l'instantané de `demo/data.js`.

## Notes techniques

- Le site lit le Sheet via l'endpoint public `gviz` de Google (JSONP, sans clé d'API ni problème de CORS), un appel par onglet.
- Il se rafraîchit toutes les 30 s, se met en pause quand l'onglet du navigateur est caché et garde les dernières données affichées si le réseau du gymnase coupe.
- Le Sheet est en locale française : dans les formules, les arguments sont séparés par `;`.
- `gviz` détermine le type de chaque colonne à partir de la majorité de ses cellules. Une cellule de texte dans une colonne de nombres est donc ignorée, d'où la consigne de ne saisir que des nombres dans les scores.
