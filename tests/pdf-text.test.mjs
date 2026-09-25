import assert from 'node:assert/strict';
import { isPdfBytes } from '../lib/pdf-text.ts';
assert.equal(isPdfBytes(new Uint8Array(Buffer.from('%PDF-1.7\nbody'))),true);
assert.equal(isPdfBytes(new Uint8Array(Buffer.from('not a pdf'))),false);
assert.equal(isPdfBytes(new Uint8Array()),false);
console.log('PDF signature checks passed.');
