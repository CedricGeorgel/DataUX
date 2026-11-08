# DataUX · Réseau des fiches

Graphe des relations entre les 8 bases Notion de « Ressources partagées » (KPI, lois, biais, méthodes,
frameworks, acteurs, glossaire, bibliographie).

- `index.html` : vue complète (recherche, filtres, panneau, fenêtre de lecture des fiches)
- `embed.html` : nuage seul, à intégrer dans Notion avec `/embed`

## Fonctionnement

Le site est 100 % statique, publié sur GitHub Pages. Toutes les heures (et à chaque push, ou avec
le bouton *Run workflow* de l'onglet Actions), GitHub lit Notion, génère `data/graph.json`, une fiche
par page et copie les images, puis publie le site.

Le token Notion est le secret `NOTION_TOKEN` du dépôt. Il n'est jamais écrit dans le code ni dans le site.
La connexion Notion doit être en lecture seule.

## Réglages

Couleurs, bases et noms des groupes : `scripts/config.js`.

## Lancer en local

```sh
NOTION_TOKEN=ntn_xxx node scripts/build.mjs site/data
cd site && python3 -m http.server
```
