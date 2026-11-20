// Configuration du site Volley Live Score.
// Seul SHEET_ID est à modifier pour un nouveau tournoi.
window.APP_CONFIG = {
  // ID du Google Sheet : la partie entre /d/ et /edit dans son URL.
  // Le Sheet doit être partagé en "Toute personne disposant du lien : Lecteur".
  // Laisser vide ("") pour lancer le site en mode démo.
  SHEET_ID: "19rQzBnI4cb7P55-eFxR_kjT9eAVSh9ihC9TgGQq-Xb4",

  // Fréquence de rafraîchissement automatique (secondes).
  REFRESH_SECONDS: 30,

  // Noms des onglets du Sheet (ne changer que si vous les renommez).
  SHEETS: {
    config: "Config",
    b1: "Matchs_B1",
    b2: "Matchs_B2",
    finale: "Matchs_Finale",
    c1: "Classement_B1",
    c2: "Classement_B2",
  },

  // Libellés des phases affichés sur le site.
  PHASES: {
    b1: "Brassage 1",
    b2: "Brassage 2",
    finale: "Phase finale",
  },
};
