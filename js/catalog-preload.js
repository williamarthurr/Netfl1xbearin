// Dimuat sinkron dari <head> supaya request Firestore dimulai sejak halaman dibuka,
// lebih awal daripada modul ES. projectId & apiKey harus sama dengan js/firebase-config.js.
// Baris hasil query disimpan mentah; parsing-nya ada di js/catalog.js supaya tidak dobel.
(function () {
  var config = window.CLIENT_CONFIG || {};
  var PROJECT = config.projectId || "";
  var KEY = config.apiKey || "";
  if (!PROJECT || !KEY) {
    window.__catalogPrefetch = Promise.resolve(null);
    return;
  }

  function query(collection) {
    var url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(PROJECT)
      + "/databases/(default)/documents:runQuery?key=" + encodeURIComponent(KEY);
    var body = JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: "active" },
            op: "EQUAL",
            value: { booleanValue: true },
          },
        },
      },
    });
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
      .then(function (response) {
        if (!response.ok) throw new Error("Firestore REST " + collection + ": " + response.status);
        return response.json();
      });
  }

  window.__catalogPrefetch = Promise.all([query("catalogs"), query("packages")])
    .then(function (rows) {
      return { projectId: PROJECT, catalogs: rows[0], packages: rows[1] };
    })
    .catch(function () { return null; });
})();
