import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requestNearbyPosition } from "../src/features/book-one/services/browser-location.ts";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
function browser(geolocation, secure = true) {
  Object.defineProperty(globalThis, "window", {
    value: { isSecureContext: secure },
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { geolocation },
    configurable: true,
  });
}
afterEach(() => {
  for (const [key, descriptor] of [
    ["window", originalWindow],
    ["navigator", originalNavigator],
  ]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
test("a single requested fix is coarsened before leaving the browser; continuous tracking is never used", async () => {
  let count = 0;
  browser({
    getCurrentPosition: (success, _failure, options) => {
      count++;
      assert.equal(options.timeout, 15000);
      assert.equal(options.maximumAge, 60000);
      success({
        coords: { latitude: 6.863749, longitude: 7.40873, accuracy: 20 },
      });
    },
    watchPosition: () => assert.fail("Do not track movement"),
  });
  assert.equal(count, 0);
  assert.deepEqual(await requestNearbyPosition(), {
    latitude: 6.86,
    longitude: 7.41,
    accuracy: 20,
  });
  assert.equal(count, 1);
});
test("denied permission and broad estimates return actionable errors instead of fake coordinates", async () => {
  browser({ getCurrentPosition: (_success, failure) => failure({ code: 1 }) });
  await assert.rejects(requestNearbyPosition(), /permission was denied/);
  browser({
    getCurrentPosition: (success) =>
      success({ coords: { latitude: 6.86, longitude: 7.41, accuracy: 1501 } }),
  });
  await assert.rejects(requestNearbyPosition(), /too broad/);
});
test("unsupported or insecure contexts preserve manual area browsing", async () => {
  browser(undefined);
  await assert.rejects(requestNearbyPosition(), /browse by area/);
  browser(
    {
      getCurrentPosition: () => assert.fail("Do not request insecure location"),
    },
    false,
  );
  await assert.rejects(requestNearbyPosition(), /HTTPS or localhost/);
});
