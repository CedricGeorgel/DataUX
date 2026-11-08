// Réglages du réseau des fiches. Le token Notion n'est PAS ici : il est dans la variable
// d'environnement NOTION_TOKEN, réglée dans Vercel (Settings › Environment Variables).

export const NOTION_API = process.env.NOTION_API || "https://api.notion.com/v1";
export const NOTION_VERSION = "2025-09-03";

// 'source' = identifiant de la source de données, 'database' = identifiant de la base.
// 'cat' = propriété affichée comme catégorie.
export const BASES = [
  { key: "kpi",       label: "Fiches KPI",           color: "#d9730d", cat: "Catégorie", database: "58924e6a416483d193df01a5df0ee9a0", source: "21224e6a-4164-8260-80bc-87fbdeb2ef4c" },
  { key: "loi",       label: "Lois du design",       color: "#337ea9", cat: "Catégorie", database: "32924e6a4164821e99ce0158f2db65aa", source: "cee24e6a-4164-8327-85b4-073321542d1e" },
  { key: "biais",     label: "Biais cognitifs",      color: "#9065b0", cat: "Catégorie", database: "22b24e6a416482a89d3b8129fbf5879b", source: "30624e6a-4164-82a4-b6d0-87ec2837139a" },
  { key: "methode",   label: "Méthodes UX",          color: "#448361", cat: "Catégorie", database: "6d724e6a416482ab9f8801d9510671c6", source: "94024e6a-4164-834a-924e-073972aa2a29" },
  { key: "framework", label: "Frameworks produit",   color: "#cb912f", cat: "Catégorie", database: "57924e6a416482d1abac01040f02b1bf", source: "e8d24e6a-4164-825c-bd0e-07fb678491b3" },
  { key: "acteur",    label: "Acteurs du design",    color: "#c14c8a", cat: "Domaine",   database: "73b24e6a41648284bf6c81e0d26f0c23", source: "f2024e6a-4164-827f-abd5-07651fd7c236" },
  { key: "glossaire", label: "Glossaire design",     color: "#d44c47", cat: "Famille",   database: "6c524e6a41648347a935010750ce7cd8", source: "f9824e6a-4164-83c0-a6f5-07a65828948d" },
  { key: "biblio",    label: "Bibliographie design", color: "#91918e", cat: "Thème",     database: "6f224e6a416483aba69001fcbe8e1a3f", source: "c6224e6a-4164-82d4-90cb-8722db5f9687" },
];

// Relation qui relie deux notions qu'on confond : dessinée à part, ne forme pas les groupes.
export const CONFUSION = "À ne pas confondre avec";
// Relations ignorées
export const IGNORE = ["Contributeur", "Contributeurs"];

// Noms des groupes. Si une fiche centrale d'un groupe porte l'un de ces noms, le groupe prend ce titre.
// Sinon il prend le nom de sa fiche la plus reliée.
export const NOMS_GROUPES = {
  "Test utilisateur": "Évaluer l'utilisabilité",
  "Test A/B": "Expérimenter et croître",
  "Entretien utilisateur": "Explorer et concevoir",
  "Daniel Kahneman": "Jugement et décision",
  "Charge cognitive": "Perception et charge cognitive",
  "Questionnaire": "Mesurer la satisfaction",
  "Persona": "Personas et projection",
  "Crazy 8": "Groupe et influence sociale",
  "Thaler et Sunstein": "Nudge et choix par défaut",
  "North Star Metric": "Choisir ses métriques",
  "RICE": "Prioriser",
  "Seuil de Doherty": "Temps de réponse",
  "RACI": "Responsabilités d'équipe",
};
