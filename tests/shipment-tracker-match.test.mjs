import assert from 'node:assert/strict';
import {matchesShipmentTracker} from '../lib/shipment-tracker-match.ts';
assert.equal(matchesShipmentTracker({trackerId:'trk_real',trackingCode:'SHARED_TEST_CODE'},'trk_other','SHARED_TEST_CODE'),false);
assert.equal(matchesShipmentTracker({trackerId:'trk_real',trackingCode:'SHARED_TEST_CODE'},'trk_real','SHARED_TEST_CODE'),true);
assert.equal(matchesShipmentTracker({trackerId:'',trackingCode:'LEGACY'},'trk_verified','LEGACY'),true);
assert.equal(matchesShipmentTracker({trackerId:'trk_real',trackingCode:'REAL'},'','REAL'),true);
console.log('Unknown tracker IDs cannot override known custom-request trackers by shared test code; legacy fallback remains.');
