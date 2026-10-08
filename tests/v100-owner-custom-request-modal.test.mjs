import assert from "node:assert/strict";
import fs from "node:fs";

const owner = fs.readFileSync("components/OwnerQueueManager.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(owner, />Owner Custom Request<\/button>/, "Production action must be named Owner Custom Request");
assert.doesNotMatch(owner, /\+ New Custom Request/, "Old New Custom Request label must be removed");
assert.match(owner, /owner-custom-request-backdrop/, "Owner request form must open in a separate overlay UI");
assert.match(owner, /role="dialog"/, "Owner request workspace must be an accessible dialog");
assert.match(owner, /aria-modal="true"/, "Owner request workspace must declare modal behavior");
assert.match(owner, /OwnerCustomRequestForm/, "Owner custom request form should have owner-specific naming");
assert.match(owner, /Submit Owner Custom Request/, "Dedicated form must have an explicit submit action");
assert.match(owner, /event\.key==="Escape"/, "Escape must close the Owner Custom Request workspace");
assert.match(owner, /document\.body\.style\.overflow="hidden"/, "Opening the modal must lock background scrolling");
assert.match(owner, /event\.target===event\.currentTarget/, "Backdrop click must close only from the backdrop");
assert.doesNotMatch(owner, /showOwnerCustomRequest&&<OwnerCustomRequestForm/, "Form must not render inline in the Production board");

assert.match(css, /\.owner-custom-request-backdrop\s*\{/, "Owner custom request backdrop styling is required");
assert.match(css, /\.owner-custom-request-modal\s*\{/, "Owner custom request modal styling is required");
assert.match(css, /max-height:min\(920px,calc\(100vh - 48px\)\)/, "Desktop modal must stay inside the viewport");
assert.match(css, /@media\(max-width:720px\)[\s\S]*\.owner-custom-request-modal[\s\S]*min-height:100dvh/, "Mobile Owner Custom Request must become a full-height workspace");
assert.match(css, /\.owner-custom-request-actions/, "Modal needs dedicated sticky actions");
assert.equal(pkg.version, "1.2.0");

console.log("v1.00 Owner Custom Request modal checks passed.");
