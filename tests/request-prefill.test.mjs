import assert from "node:assert/strict";
import { findRepeatRequestForCustomer, prefillFromGallery, prefillFromRequest } from "../lib/request-prefill.ts";

const request = {
  id:"req-repeat",requestCode:"REQ-REPEAT",status:"completed",name:"Customer",email:"customer@example.com",phone:"7045550101",
  projectType:"functional",modelStatus:"ready",fulfillmentMethod:"pickup",assemblyPreference:"assembled",quantity:3,
  dimensions:"8 x 5 x 3 in",materialPreference:"petg",colorPreference:"Black",budget:"$50",neededBy:"",neededBySubmitted:"",
  referenceUrl:"https://example.com/reference",description:"Please make another copy of this functional organizer with the same overall specifications.",
  imageUrl:"",attachments:[],internalNote:"",createdAt:"2026-09-01T00:00:00.000Z",updatedAt:"2026-09-20T00:00:00.000Z",
  queuedAt:"",queueJobId:"",customerAccountId:"customer-a",riskLevel:"none",riskFlags:[],source:"customer",emailNotifications:true,
};

assert.equal(findRepeatRequestForCustomer([request], "req-repeat", "customer-a")?.id, "req-repeat");
assert.equal(findRepeatRequestForCustomer([request], "req-repeat", "customer-b"), null, "repeat requests must not cross customer accounts");
assert.equal(findRepeatRequestForCustomer([request], "missing", "customer-a"), null);

const repeat = prefillFromRequest(request);
assert.equal(repeat.sourceType, "repeat");
assert.equal(repeat.projectType, "functional");
assert.equal(repeat.quantity, 3);
assert.equal(repeat.materialPreference, "petg");
assert.equal(repeat.referenceUrl, "https://example.com/reference");
assert.ok(repeat.sourceLabel.includes("REQ-REPEAT"));

const gallery = prefillFromGallery({
  id:"desk-organizer",title:"Custom Desk Organizer",category:"Functional",
  description:"Purpose-built organization with dimensions tailored to the workspace.",image:"/sample-organizer.svg",
});
assert.equal(gallery.sourceType, "gallery");
assert.equal(gallery.projectType, "functional");
assert.equal(gallery.modelStatus, "reference-only");
assert.equal(gallery.quantity, 1);
assert.ok(gallery.description.includes("Custom Desk Organizer"));

const prototype = prefillFromGallery({
  id:"prototype",title:"Prototype Part",category:"Custom",description:"Practical prototype to validate fit.",image:"/sample.svg",
});
assert.equal(prototype.projectType, "prototype");

console.log("Request prefill tests passed.");
