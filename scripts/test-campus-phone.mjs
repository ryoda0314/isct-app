import assert from "node:assert/strict";
import test from "node:test";
import { getSpot } from "../campus-sns/hooks/useLocationSharing.js";
import { computeRoute, navGraph } from "../campus-sns/hooks/useNavigation.js";
import { destinationRoom, destinationScore, getRecentDestinations, normalizeDestination, rememberDestination } from "../campus-sns/navDestinations.js";

test("phone search accepts kana, half-width text, English place names and classroom numbers", () => {
  for (const [query, id] of [["としょかん", "lib"], ["ﾄｼｮｶﾝ", "lib"], ["図書館", "lib"], ["しょうてんがい", "ookayama_kitaguchi"], ["Ｔｏｋｙｕ　Ｓｔｏｒｅ", "tokyu_store"]]) {
    assert.equal(destinationScore(getSpot(id), normalizeDestination(query)), 100);
  }
  assert.equal(destinationRoom("Ｗ９－３１１")?.id, "w9");
  assert.ok(destinationScore(getSpot("eki"), normalizeDestination("大岡山駅")) > destinationScore(getSpot("rest_gusto"), normalizeDestination("大岡山駅")));
  assert.equal(destinationScore(getSpot("lib"), normalizeDestination("該当なし")), -1);
});

test("the phone and campus nav can reuse recent destinations stored by earlier versions", t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map([["navRecentSpots", JSON.stringify(["lib", "eki"])]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  rememberDestination("eki");
  rememberDestination("tokyu_store");
  assert.deepEqual(getRecentDestinations(), ["tokyu_store", "eki", "lib"]);
  values.set("navRecentSpots", "{");
  assert.deepEqual(getRecentDestinations(), []);
});

test("walking from Ookayama Station to Tokyu Store ends at the street-side door", () => {
  const store = getSpot("tokyu_store");
  const route = computeRoute(navGraph(), { origin: "eki", destination: store.id });
  assert.ok(route?.distance > 0);
  assert.deepEqual(route.coords.at(-1), { lat: store.lat, lng: store.lng });
  assert.ok(route.coords.at(-2).lng > store.lng, "approach the east-facing entrance from the street");
});
