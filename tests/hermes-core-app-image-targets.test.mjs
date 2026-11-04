import {describe,it,expect} from "vitest";
import {CORE_APP_IMAGE_KINDS,coreAppImagePath,normalizeCoreAppImageKey,resolveCoreAppImageTarget} from "../features/hermes-core/app-image-targets.js";
import {CORE_TARGET_KINDS,normalizeCoreQueueTarget} from "../features/hermes-core/queue-target.js";
describe("HERMES CORE ALEA image target coverage",()=>{
 it("accepts every existing spell, skill and symbol image kind",()=>{
  expect(CORE_APP_IMAGE_KINDS).toEqual(["spell","spell-cutout","spell-illustration","spell-illustration-wide","symbol","skill","skill-illustration","skill-illustration-wide"]);
  for(const kind of CORE_APP_IMAGE_KINDS){
   expect(resolveCoreAppImageTarget(kind)).toBeTruthy();
   expect(CORE_TARGET_KINDS).toContain(kind);
   expect(normalizeCoreQueueTarget({schema:2,target:{kind,id:"target-key"}}).kind).toBe(kind);
  }
 });
 it("maps app tables, pointer columns, buckets and immutable paths explicitly",()=>{
  expect(resolveCoreAppImageTarget("spell-cutout")).toMatchObject({table:"rule_spells",imageColumn:"cutout_path",bucket:"alea-spell-art"});
  expect(resolveCoreAppImageTarget("skill-illustration-wide")).toMatchObject({table:"rule_skills",imageColumn:"illustration_wide_path",bucket:"alea-skill-art"});
  expect(normalizeCoreAppImageKey("skill","first-aid")).toBe("first_aid");
  expect(coreAppImagePath("spell","eld","b".repeat(64))).toBe(`hermes/core/spell/eld/${"b".repeat(64)}.webp`);
 });
 it("rejects unknown target kinds and unsafe target keys",()=>{
  expect(resolveCoreAppImageTarget("arbitrary-table")).toBeNull();
  expect(()=>normalizeCoreQueueTarget({schema:2,target:{kind:"unknown",id:"x"}})).toThrow("CORE_TARGET_KIND_UNSUPPORTED");
  expect(()=>normalizeCoreQueueTarget({schema:2,target:{kind:"spell",id:"../unsafe"}})).toThrow("INVALID_CORE_TARGET_ID");
 });
});
