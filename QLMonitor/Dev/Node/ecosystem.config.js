module.exports = {
  apps : [
    {
      // -- Backend App (DENNA ÄR KORREKT, RÖR EJ) --
      name   : "monitoring-app-backend",
      script : "./src/server.js",
      cwd    : "D:\\NODEJS\\monitoring-app\\",
      watch  : false,
    },
    {
      // -- Frontend Server (NY, ROBUST METOD) --
      name   : "monitoring-app-frontend",
      script : "cmd", // Vi startar Windows kommandotolk
      // Vi säger till cmd att köra (/c) vårt kommando och sedan avsluta
      args   : "/c npx serve -s dist -l 5173",
      cwd    : "D:\\NODEJS\\monitoring-app\\frontend\\",
      interpreter: "none",
      watch  : false,
    }
  ]
}