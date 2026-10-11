import assert from 'node:assert/strict';
import {parseIntakeDraft,intakeSchema} from '../lib/ai-center/intake.ts';
const draft={name:'Walk-in project',description:'A replacement drawer handle.',quantity:2,stage:'preparing'};
assert.deepEqual(parseIntakeDraft('```json\n'+JSON.stringify(draft)+'\n```'),draft);
assert.throws(()=>parseIntakeDraft(JSON.stringify({...draft,stage:'deposit-paid'})));
assert.throws(()=>parseIntakeDraft(JSON.stringify({...draft,email:'someone@example.com'})));
assert.equal(intakeSchema.safeParse({...draft,quantity:501}).success,false);
assert.throws(()=>parseIntakeDraft('Here is a suggestion, not structured data.'));
console.log('Owner intake rejects payment stages, contacts and invalid model output.');

