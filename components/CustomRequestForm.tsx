"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { formatBusinessDate, isFutureBusinessDate, isRushRequestDate, normalizeBusinessDate } from "@/lib/business-date";

type Status = "idle" | "sending" | "success" | "error";
type FieldErrors = Record<string, string>;
type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type UploadedAttachment = { id: string; token: string; name: string; kind: "image" | "model"; size: number; scanStatus: "clean" | "development-unscanned" };
type RequestSummary = {
  name: string;
  email: string;
  projectType: string;
  modelStatus: string;
  fulfillmentMethod: string;
  quantity: string;
  dimensions: string;
  materialPreference: string;
  colorPreference: string;
  neededBy: string;
  budget: string;
  referenceUrl: string;
};

const projectSummaryLabels: Record<string, string> = { display: "Display / collectible", functional: "Functional part", replacement: "Replacement part", prototype: "Prototype", other: "Other" };
const modelSummaryLabels: Record<string, string> = { ready: "Print-ready model", "needs-adjustment": "Model may need changes", "reference-only": "Photos / references", "idea-only": "Idea only" };
const fulfillmentSummaryLabels: Record<string, string> = { pickup: "Local pickup", shipping: "Carrier shipping", "local-delivery": "Local delivery", unsure: "Not sure yet" };
const materialSummaryLabels: Record<string, string> = { "no-preference": "No preference", pla: "PLA", petg: "PETG", asa: "ASA", tpu: "TPU / flexible", resin: "Resin", other: "Other / unsure" };

const friendlyMessages: Record<string, string> = {
  name: "Please enter your name.",
  email: "Enter a valid email address, such as name@example.com.",
  phone: "Use a valid phone number format with numbers only plus normal phone symbols.",
  projectType: "Select a project type.",
  modelStatus: "Tell me whether you already have a 3D model.",
  fulfillmentMethod: "Select pickup, shipping, local delivery, or not sure yet.",
  quantity: "Enter a quantity from 1 to 500.",
  neededBy: "Enter a valid future date, such as 9/2/2026, or choose one from the calendar.",
  referenceUrl: "Enter a complete web link beginning with http:// or https://.",
  description: "Please provide at least 20 characters about the print.",
  consent: "Please agree to be contacted about this request.",
};

export function CustomRequestForm({ minNeededBy, initialCustomer }: { minNeededBy: string; initialCustomer?: { displayName: string; email: string } | null }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [neededByValue, setNeededByValue] = useState("");
  const [successCode, setSuccessCode] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<RequestSummary>({
    name: initialCustomer?.displayName || "",
    email: initialCustomer?.email || "",
    projectType: "",
    modelStatus: "",
    fulfillmentMethod: "",
    quantity: "1",
    dimensions: "",
    materialPreference: "no-preference",
    colorPreference: "",
    neededBy: "",
    budget: "",
    referenceUrl: "",
  });

  const normalizedNeededBy = normalizeBusinessDate(neededByValue);
  const rushRequested = Boolean(normalizedNeededBy && isFutureBusinessDate(normalizedNeededBy) && isRushRequestDate(normalizedNeededBy));

  function fieldClass(name: string, extra = "") {
    return `form-field ${fieldErrors[name] ? "field-invalid" : ""} ${extra}`.trim();
  }

  function invalidField(event: FormEvent<HTMLFormElement>) {
    const target = event.target as FormControl;
    if (!target.name) return;
    setStatus("error");
    setMessage("Please correct the highlighted fields and try again.");
    setFieldErrors((current) => ({
      ...current,
      [target.name]: friendlyMessages[target.name] || target.validationMessage || "Please check this field.",
    }));
  }

  function refreshField(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (!target.name || !fieldErrors[target.name]) return;

    if (target.name === "neededBy") {
      const value = target.value.trim();
      const normalized = normalizeBusinessDate(value);
      if (value && (!normalized || !isFutureBusinessDate(normalized))) return;
    }

    if (target.validity.valid) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[target.name];
        return next;
      });
    }
  }


  function syncSummary(form: HTMLFormElement) {
    const data = new FormData(form);
    setSummary({
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      projectType: String(data.get("projectType") || ""),
      modelStatus: String(data.get("modelStatus") || ""),
      fulfillmentMethod: String(data.get("fulfillmentMethod") || ""),
      quantity: String(data.get("quantity") || "1"),
      dimensions: String(data.get("dimensions") || ""),
      materialPreference: String(data.get("materialPreference") || "no-preference"),
      colorPreference: String(data.get("colorPreference") || ""),
      neededBy: String(data.get("neededBy") || ""),
      budget: String(data.get("budget") || ""),
      referenceUrl: String(data.get("referenceUrl") || ""),
    });
  }

  async function sanitizeImage(file: File) {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file);
    const maxSide = 4096;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) { bitmap.close(); throw new Error("Could not prepare image for upload."); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const mime = ["image/png", "image/jpeg", "image/webp"].includes(file.type) ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, mime === "image/jpeg" ? 0.92 : undefined));
    if (!blob) throw new Error("Could not sanitize image metadata.");
    return new File([blob], file.name, { type: mime, lastModified: Date.now() });
  }

  async function uploadAttachments(event: ChangeEvent<HTMLInputElement>) {
    const selected: File[] = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = "";
    if (!selected.length) return;
    if (attachments.length + selected.length > 3) { setUploadMessage("You can attach up to 3 files per request."); return; }
    setUploading(true); setUploadMessage("");
    try {
      const uploaded: UploadedAttachment[] = [];
      for (const selectedFile of selected) {
        if (selectedFile.size > 10 * 1024 * 1024) throw new Error(`${selectedFile.name} is larger than 10 MB.`);
        const file = await sanitizeImage(selectedFile);
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/custom-request/upload", { method: "POST", body: form });
        const result = await response.json() as { attachment?: { id: string; name: string; kind: "image" | "model"; size: number; scanStatus: "clean" | "development-unscanned" }; claimToken?: string; message?: string };
        if (!response.ok || !result.attachment || !result.claimToken) throw new Error(result.message || `Could not upload ${selectedFile.name}.`);
        uploaded.push({ ...result.attachment, token: result.claimToken });
      }
      setAttachments((current) => [...current, ...uploaded]);
      setUploadMessage(uploaded.some((item) => item.scanStatus === "development-unscanned") ? "Local development: file-type validation passed, but malware scanning is not active until ClamAV is configured." : "Attachment scanning passed.");
    } catch (error) { setUploadMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    setSuccessOpen(false);
    setSuccessCode("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const neededByRaw = String(data.get("neededBy") || "").trim();
    if (neededByRaw && (!normalizeBusinessDate(neededByRaw) || !isFutureBusinessDate(neededByRaw))) {
      setStatus("error");
      setMessage("Please correct the highlighted fields and try again.");
      setFieldErrors((current) => ({ ...current, neededBy: friendlyMessages.neededBy }));
      return;
    }

    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone") || "",
      projectType: data.get("projectType"),
      modelStatus: data.get("modelStatus"),
      fulfillmentMethod: data.get("fulfillmentMethod"),
      quantity: Number(data.get("quantity") || 1),
      dimensions: data.get("dimensions") || "",
      materialPreference: data.get("materialPreference"),
      colorPreference: data.get("colorPreference") || "",
      budget: data.get("budget") || "",
      neededBy: data.get("neededBy") || "",
      referenceUrl: data.get("referenceUrl") || "",
      description: data.get("description"),
      consent: data.get("consent") === "on",
      website: data.get("website") || "",
      turnstileToken: data.get("cf-turnstile-response") || "",
      attachments: attachments.map((item) => ({ id: item.id, token: item.token })),
    };

    try {
      const response = await fetch("/api/custom-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        message?: string;
        requestCode?: string;
        fieldErrors?: Record<string, string[]>;
      };

      if (!response.ok) {
        if (result.fieldErrors) {
          const nextErrors: FieldErrors = {};
          for (const [field, errors] of Object.entries(result.fieldErrors)) {
            if (errors?.[0]) nextErrors[field] = errors[0];
          }
          setFieldErrors(nextErrors);
        }
        throw new Error(result.message || "Your request could not be sent.");
      }

      setStatus("success");
      setFieldErrors({});
      setMessage("");
      setSuccessCode(result.requestCode || "");
      setSuccessOpen(true);
      form.reset();
      setNeededByValue("");
      setAttachments([]);
      setUploadMessage("");
      setSummary({
        name: initialCustomer?.displayName || "",
        email: initialCustomer?.email || "",
        projectType: "",
        modelStatus: "",
        fulfillmentMethod: "",
        quantity: "1",
        dimensions: "",
        materialPreference: "no-preference",
        colorPreference: "",
        neededBy: "",
        budget: "",
        referenceUrl: "",
      });
      if (typeof window !== "undefined" && "turnstile" in window) {
        (window as typeof window & { turnstile?: { reset: () => void } }).turnstile?.reset();
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form
      className="request-form request-form-redesign"
      onSubmit={submitRequest}
      onInvalid={invalidField}
      onInput={(event) => {
        refreshField(event.target);
        syncSummary(event.currentTarget);
      }}
      onChange={(event) => {
        refreshField(event.target);
        syncSummary(event.currentTarget);
      }}
    >
      <div className="request-workspace">
        <div className="request-main-column">
          <section className="request-form-section">
            <div className="request-section-heading">
              <span className="request-section-icon">01</span>
              <div><h2>Contact & project basics</h2><p>Start with who you are and what you want made.</p></div>
            </div>
            <div className="form-grid two-col">
              <label className={fieldClass("name")}>
                <span>Name *</span>
                <input name="name" autoComplete="name" minLength={2} maxLength={80} required defaultValue={initialCustomer?.displayName || ""} aria-invalid={Boolean(fieldErrors.name)} />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </label>
              <label className={fieldClass("email")}>
                <span>Email *</span>
                <input name="email" type="email" autoComplete="email" maxLength={160} pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}"} title="Enter a complete email address such as name@example.com." required defaultValue={initialCustomer?.email || ""} readOnly={Boolean(initialCustomer)} aria-invalid={Boolean(fieldErrors.email)} />
                {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
              </label>
              <label className={fieldClass("phone")}>
                <span>Phone <small className="optional-label">Optional</small></span>
                <input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} pattern={"[0-9 \\(\\)\\+\\.\\-]{7,30}"} title="Use numbers and normal phone formatting only, such as (704) 555-0123." placeholder="(704) 555-0123" aria-invalid={Boolean(fieldErrors.phone)} />
                {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
              </label>
              <label className={fieldClass("projectType")}>
                <span>What is the print for? *</span>
                <select name="projectType" defaultValue="" required aria-invalid={Boolean(fieldErrors.projectType)}>
                  <option value="" disabled>Select one</option><option value="display">Display / collectible</option><option value="functional">Functional part</option><option value="replacement">Replacement part</option><option value="prototype">Prototype</option><option value="other">Other</option>
                </select>
                {fieldErrors.projectType && <small className="field-error">{fieldErrors.projectType}</small>}
              </label>
              <label className={fieldClass("modelStatus")}>
                <span>Do you already have a 3D model? *</span>
                <select name="modelStatus" defaultValue="" required aria-invalid={Boolean(fieldErrors.modelStatus)}>
                  <option value="" disabled>Select one</option><option value="ready">Yes — print-ready model</option><option value="needs-adjustment">Yes — may need changes</option><option value="reference-only">No — I have photos / references</option><option value="idea-only">No — I only have the idea</option>
                </select>
                {fieldErrors.modelStatus && <small className="field-error">{fieldErrors.modelStatus}</small>}
              </label>
              <label className={fieldClass("fulfillmentMethod")}>
                <span>How would you like to receive it? *</span>
                <select name="fulfillmentMethod" defaultValue="" required aria-invalid={Boolean(fieldErrors.fulfillmentMethod)}>
                  <option value="" disabled>Select one</option><option value="pickup">Local pickup</option><option value="shipping">Carrier shipping</option><option value="local-delivery">Local delivery</option><option value="unsure">Not sure yet</option>
                </select>
                {fieldErrors.fulfillmentMethod && <small className="field-error">{fieldErrors.fulfillmentMethod}</small>}
              </label>
            </div>
          </section>

          <section className="request-form-section">
            <div className="request-section-heading">
              <span className="request-section-icon">02</span>
              <div><h2>Print specifications</h2><p>These details help estimate material, machine time, and scheduling.</p></div>
            </div>
            <div className="form-grid request-spec-grid">
              <label className={fieldClass("quantity")}><span>Quantity *</span><input name="quantity" type="number" min={1} max={500} defaultValue={1} required aria-invalid={Boolean(fieldErrors.quantity)} />{fieldErrors.quantity && <small className="field-error">{fieldErrors.quantity}</small>}</label>
              <label className={fieldClass("dimensions")}><span>Approx. dimensions</span><input name="dimensions" maxLength={120} placeholder={'Example: 8" × 5" × 3"'} /></label>
              <label className={fieldClass("materialPreference")}><span>Material</span><select name="materialPreference" defaultValue="no-preference"><option value="no-preference">No preference</option><option value="pla">PLA</option><option value="petg">PETG</option><option value="asa">ASA</option><option value="tpu">TPU / flexible</option><option value="resin">Resin</option><option value="other">Other / unsure</option></select></label>
              <label className={fieldClass("colorPreference")}><span>Color preference</span><input name="colorPreference" maxLength={120} placeholder="Black, multicolor, match a reference…" /></label>
              <div className={fieldClass("neededBy", "needed-by-field")}>
                <label className="field-label" htmlFor="neededBy">Needed by</label>
                <div className="date-entry-shell">
                  <input id="neededBy" name="neededBy" type="text" inputMode="numeric" maxLength={24} placeholder="M/D/YYYY" value={neededByValue} onChange={(event) => setNeededByValue(event.target.value)} aria-invalid={Boolean(fieldErrors.neededBy)} />
                  <span className="calendar-picker-button" aria-label="Choose a needed-by date" title="Choose from calendar">
                    <svg className="calendar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M7 3v4M17 3v4M3 10h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 18h.01M12 18h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
                    <input className="calendar-native-input" type="date" min={minNeededBy} value={normalizedNeededBy || ""} onChange={(event) => { const next = event.target.value ? formatBusinessDate(event.target.value) : ""; setNeededByValue(next); setSummary((current) => ({ ...current, neededBy: next })); setFieldErrors((current) => { const copy = { ...current }; delete copy.neededBy; return copy; }); }} tabIndex={-1} aria-label="Calendar date picker" />
                  </span>
                </div>
                <small>Dates must be after today.</small>
                {rushRequested && <small className="rush-date-note"><strong>Rush timing:</strong> this date is less than 3 days away. A rush fee may apply and will be quoted based on the print.</small>}
                {fieldErrors.neededBy && <small className="field-error">{fieldErrors.neededBy}</small>}
              </div>
              <label className={fieldClass("budget", "budget-field")}><span>Budget</span><input name="budget" maxLength={80} inputMode="decimal" placeholder="Optional" /><small>Final pricing is confirmed after review.</small></label>
            </div>
          </section>

          <section className="request-form-section">
            <div className="request-section-heading">
              <span className="request-section-icon">03</span>
              <div><h2>References & files</h2><p>Share anything that helps explain shape, style, fit, or the model itself.</p></div>
            </div>
            <label className={fieldClass("referenceUrl")}><span>Reference link <small className="optional-label">Optional</small></span><input name="referenceUrl" type="url" maxLength={500} placeholder="Google Drive, Dropbox, model listing, photo link, etc." aria-invalid={Boolean(fieldErrors.referenceUrl)} /><small>Use a complete http:// or https:// link.</small>{fieldErrors.referenceUrl && <small className="field-error">{fieldErrors.referenceUrl}</small>}</label>
            <div className="request-upload-panel request-upload-redesign">
              <div><span className="field-label">Secure attachments <small className="optional-label">Optional</small></span><small>Up to 3 files, 10 MB each. Images are re-encoded to strip ordinary metadata. STL/3MF files stay private and production uploads require malware scanning.</small></div>
              <label className={`request-upload-button ${uploading ? "is-busy" : ""}`}>{uploading ? "Scanning / uploading…" : "Choose files"}<input type="file" multiple disabled={uploading || attachments.length >= 3} accept="image/png,image/jpeg,image/webp,.stl,.3mf" onChange={(event) => void uploadAttachments(event)} /></label>
              {attachments.length > 0 && <div className="request-attachment-list">{attachments.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.kind === "image" ? "Image" : "3D model"} • {(item.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" className="text-button request-remove-button" onClick={() => setAttachments((current) => current.filter((candidate) => candidate.id !== item.id))}>Remove</button></div>)}</div>}
              {uploadMessage && <small className={`upload-message ${uploadMessage.startsWith("Local development") ? "warning" : ""}`}>{uploadMessage}</small>}
            </div>
          </section>

          <section className="request-form-section request-description-section">
            <div className="request-section-heading"><span className="request-section-icon">04</span><div><h2>Describe the request</h2><p>Tell me what matters most so I can quote it correctly the first time.</p></div></div>
            <label className={fieldClass("description")}><span>Tell me about the print *</span><textarea name="description" minLength={20} maxLength={2500} rows={8} required aria-invalid={Boolean(fieldErrors.description)} placeholder="What do you want made? Include how it will be used, important dimensions, finish expectations, tolerances, special features, or anything else I should know." />{fieldErrors.description && <small className="field-error">{fieldErrors.description}</small>}</label>
          </section>

          <label className="honeypot" aria-hidden="true">Company site<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <label className={`consent-row request-consent-card ${fieldErrors.consent ? "field-invalid" : ""}`}><input name="consent" type="checkbox" required aria-invalid={Boolean(fieldErrors.consent)} /><span>I agree to be contacted about this custom print request. *</span>{fieldErrors.consent && <small className="field-error">{fieldErrors.consent}</small>}</label>
          <div className="payment-terms-note payment-terms-prominent"><strong>50% deposit before production</strong><p>After the quote, design details, and final price are confirmed, a 50% deposit is required before production begins. The remaining 50% is due before shipment or at the pickup/delivery handoff. If a confirmed project is canceled after materials have been purchased or printing has begun, the deposit may be applied to materials, machine time, and work already completed, subject to the final agreed order terms.</p></div>
        </div>

        <aside className="request-summary-panel">
          <div className="request-summary-heading"><div><span className="request-summary-icon">✓</span><div><strong>Request summary</strong><small>Review the important details before submitting.</small></div></div></div>
          <div className="request-summary-list">
            <span><b>Customer</b><em>{summary.name || "Not specified"}</em></span>
            <span><b>Email</b><em>{summary.email || "Not specified"}</em></span>
            <span><b>Purpose</b><em>{projectSummaryLabels[summary.projectType] || "Not specified"}</em></span>
            <span><b>3D model</b><em>{modelSummaryLabels[summary.modelStatus] || "Not specified"}</em></span>
            <span><b>Material</b><em>{materialSummaryLabels[summary.materialPreference] || "No preference"}</em></span>
            <span><b>Color</b><em>{summary.colorPreference || "Not specified"}</em></span>
            <span><b>Dimensions</b><em>{summary.dimensions || "Not specified"}</em></span>
            <span><b>Quantity</b><em>{summary.quantity || "1"}</em></span>
            <span><b>Needed by</b><em>{summary.neededBy || "Not specified"}</em></span>
            <span><b>Budget</b><em>{summary.budget || "Not specified"}</em></span>
            <span><b>Fulfillment</b><em>{fulfillmentSummaryLabels[summary.fulfillmentMethod] || "Not specified"}</em></span>
            <span><b>Reference</b><em>{summary.referenceUrl ? "Provided" : "None"}</em></span>
            <span><b>Attachments</b><em>{attachments.length ? `${attachments.length} attached` : "None"}</em></span>
          </div>
          <div className="request-next-steps">
            <strong>What happens next?</strong>
            <ol><li><span>1</span><p>I review the request within 24–48 hours.</p></li><li><span>2</span><p>You receive a detailed quote and exact terms.</p></li><li><span>3</span><p>You approve the quote and pay the 50% deposit.</p></li><li><span>4</span><p>Production starts and status updates appear in your profile.</p></li></ol>
          </div>
          <Turnstile />
          <div className="request-submit-panel">
            <button className="button request-submit-button" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : <><span>Submit Custom Request</span><svg className="request-submit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></>}</button>
            <p className="form-note">A request is not an order or payment. Pricing and feasibility are confirmed first.</p>
          </div>
          {message && <div className={`form-status ${status}`} role="status">{message}</div>}
        </aside>
      </div>

      {successOpen && (
        <div className="request-success-popup" role="dialog" aria-modal="false" aria-labelledby="request-success-title">
          <button className="request-success-close" type="button" onClick={() => setSuccessOpen(false)} aria-label="Close success message">×</button>
          <span className="request-success-icon" aria-hidden="true">✓</span>
          <div><strong id="request-success-title">Custom request received.</strong><p>You will receive a response in the next 24–48 hours.</p>{successCode && <small>Request {successCode}</small>}</div>
        </div>
      )}
    </form>
  );
}
