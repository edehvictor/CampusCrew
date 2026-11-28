import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair } from "@stellar/stellar-sdk";
import { nearbySchema } from "../src/features/book-one/types/nearby.ts";
const db = new PGlite();
const requester = Keypair.random().publicKey(),
  near = Keypair.random().publicKey(),
  far = Keypair.random().publicKey();
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;",
  );
  for (const name of [
    "20261119000100_stellar_onboarding.sql",
    "20261121000100_stellar_escrow.sql",
    "20261123000100_marketplace_experience.sql",
    "20261123000200_reputation_queries.sql",
    "20261127000300_nearby_providers.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
});
after(() => db.close());
beforeEach(async () => {
  await db.exec("truncate campuscrew_stellar_profiles cascade");
  for (const [wallet, name] of [
    [requester, "Requester"],
    [near, "Near provider"],
    [far, "Far provider"],
  ])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,$2,'On campus',array['Errands'],array['On campus'])",
      [wallet, name],
    );
});
const publish = (wallet, lat = 6.863749, lng = 7.40873) =>
  db.query("select campuscrew_nearby_publish($1,$2,$3,20) result", [
    wallet,
    lat,
    lng,
  ]);
async function search(radius = 5, category = null) {
  return (
    await db.query(
      "select campuscrew_nearby_search($1,6.86,7.41,$2,$3) result",
      [requester, radius, category],
    )
  ).rows[0].result;
}
test("sharing is opt-in, stores only a coarse point and issues a thirty-minute visibility window", async () => {
  assert.deepEqual(await search(), []);
  const r = (await publish(near)).rows[0].result;
  const p = (
    await db.query(
      "select * from campuscrew_provider_locations where wallet=$1",
      [near],
    )
  ).rows[0];
  assert.equal(Number(p.latitude_grid), 6.86);
  assert.equal(Number(p.longitude_grid), 7.41);
  assert.equal(p.latitude, undefined);
  assert.equal(p.longitude, undefined);
  assert.equal(Date.parse(r.expiresAt) - Date.parse(r.updatedAt), 30 * 60000);
  assert.equal(r.sharing, true);
});
test("nearby results use distance bands, exclude the searcher and never expose coordinates or wallet addresses", async () => {
  await publish(requester);
  await publish(near);
  await publish(far, 6.96, 7.41);
  const list = await search(20);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "Near provider");
  assert.equal(list[0].distanceKm, 1);
  assert.ok(list[1].distanceKm > 5);
  for (const p of list) {
    assert.equal(p.latitude_grid, undefined);
    assert.equal(p.longitude_grid, undefined);
    assert.equal(p.wallet, undefined);
    assert.ok(p.locationExpiresAt);
  }
});
test("radius and service filters are applied before returning matches", async () => {
  await publish(near);
  await publish(far, 6.96, 7.41);
  assert.deepEqual(
    (await search(3)).map((p) => p.name),
    ["Near provider"],
  );
  await db.exec("truncate campuscrew_nearby_search_limits");
  assert.deepEqual(await search(20, "Tutoring"), []);
});
test("expired, stopped, and no-longer-local providers disappear from discovery", async () => {
  await publish(near);
  await publish(far);
  await db.query(
    "update campuscrew_provider_locations set expires_at=now()-interval '1 second' where wallet=$1",
    [near],
  );
  await db.query(
    "update campuscrew_stellar_profiles set coverage=array['Online'] where wallet=$1",
    [far],
  );
  assert.deepEqual(await search(), []);
  await db.query("delete from campuscrew_provider_locations where wallet=$1", [
    near,
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_provider_locations where wallet=$1",
        [near],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(publish(far), /local service/);
});
test("invalid location and repeated searches are rejected", async () => {
  await assert.rejects(publish(near, 91, 7), /location estimate/);
  await assert.rejects(
    db.query("select campuscrew_nearby_publish($1,6.86,7.41,5000)", [near]),
    /too broad/,
  );
  await assert.rejects(search(2), /valid location/);
  await search();
  await assert.rejects(search(), /wait a moment/);
});
test("browser database roles cannot read location data or call service-only functions", async () => {
  await publish(near);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(
        db.query("select * from public.campuscrew_provider_locations"),
        /permission denied/,
      );
      await assert.rejects(publish(near), /permission denied/);
      await assert.rejects(search(), /permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
test("API schemas reject inaccurate fixes and invalid radii and do not accept a client wallet identity", () => {
  const input = {
    action: "publish",
    latitude: 6.86,
    longitude: 7.41,
    accuracy: 30,
    wallet: far,
  };
  assert.equal(nearbySchema.parse(input).wallet, undefined);
  for (const extra of [
    { latitude: NaN },
    { longitude: 181 },
    { accuracy: 1501 },
  ])
    assert.equal(nearbySchema.safeParse({ ...input, ...extra }).success, false);
  assert.equal(
    nearbySchema.safeParse({ ...input, action: "search", radius: 2 }).success,
    false,
  );
});
