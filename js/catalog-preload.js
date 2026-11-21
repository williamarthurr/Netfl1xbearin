// Dimuat sinkron dari <head> supaya request Firestore dimulai sejak halaman dibuka,
// lebih awal daripada modul ES. projectId & apiKey harus sama dengan js/firebase-config.js.
(function () {
  var PROJECT = "netfl1xmicicow";
  var KEY = "AIzaSyBdAPAs5qGXsCCs2YsPhouqDhrmW-nOBmQ";

  function parseValue(value) {
    if (!value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("booleanValue" in value) return value.booleanValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(parseValue);
    if ("mapValue" in value) {
      var out = {};
      Object.keys(value.mapValue.fields || {}).forEach(function (k) {
        out[k] = parseValue(value.mapValue.fields[k]);
      });
      return out;
    }
    return null;
  }

  function parseDoc(document) {
    var out = { id: document.name.split("/").pop() };
    Object.keys(document.fields || {}).forEach(function (key) {
      out[key] = parseValue(document.fields[key]);
    });
    return out;
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
      })
      .then(function (rows) {
        return rows.filter(function (row) { return row.document; })
          .map(function (row) { return parseDoc(row.document); });
      });
  }

  window.__catalogPrefetch = Promise.all([query("catalogs"), query("packages")])
    .then(function (results) { return { catalogs: results[0], packages: results[1] }; })
    .catch(function () { return null; });
})();
