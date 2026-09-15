"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { formatBusinessDate, isFutureBusinessDate, isRushRequestDate, normalizeBusinessDate } from "@/lib/business-date";

type Status = "idle" | "sending" | "success" | "error";
type FieldErrors = Record<string, string>;
type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type UploadedAttachment = { id: string; token: string; name: string; kind: "image" | "model"; size: number; scanStatus: "clean" | "development-unscanned" };

const friendlyMessages: Record<string, string> = {
  name: "Please enter your name.",
  email: "Enter a valid email address, such as name@example.com.",
  phone: "Use a valid phone number format with numbers only plus normal phone symbols.",
  projectType: "Select a project type.",
  modelStatus: "Tell me whether you already have a 3D model.",
  fulfillmentMethod: "Select pickup, shipping, or not sure yet.",
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
      className="request-form"
      onSubmit={submitRequest}
      onInvalid={invalidField}
      onInput={(event) => refreshField(event.target)}
      onChange={(event) => refreshField(event.target)}
    >
      <div className="form-grid two-col">
        <label className={fieldClass("name")}>
          <span>Name *</span>
          <input name="name" autoComplete="name" minLength={2} maxLength={80} required defaultValue={initialCustomer?.displayName || ""} aria-invalid={Boolean(fieldErrors.name)} />
          {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
        </label>
        <label className={fieldClass("email")}>
          <span>Email *</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={160}
            pattern={"[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}"}
            title="Enter a complete email address such as name@example.com."
            required
            defaultValue={initialCustomer?.email || ""}
            readOnly={Boolean(initialCustomer)}
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
        </label>
        <label className={fieldClass("phone")}>
          <span>Phone <small className="optional-label">Optional</small></span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            pattern={"[0-9 \\(\\)\\+\\.\\-]{7,30}"}
            title="Use numbers and normal phone formatting only, such as (704) 555-0123."
            placeholder="(704) 555-0123"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
        </label>
        <label className={fieldClass("projectType")}>
          <span>Project type *</span>
          <select name="projectType" defaultValue="" required aria-invalid={Boolean(fieldErrors.projectType)}>
            <option value="" disabled>Select one</option>
            <option value="display">Display / collectible</option>
            <option value="functional">Functional part</option>
            <option value="replacement">Replacement part</option>
            <option value="prototype">Prototype</option>
            <option value="other">Other</option>
          </select>
          {fieldErrors.projectType && <small className="field-error">{fieldErrors.projectType}</small>}
        </label>
        <label className={fieldClass("modelStatus")}>
          <span>Do you already have a 3D model? *</span>
          <select name="modelStatus" defaultValue="" required aria-invalid={Boolean(fieldErrors.modelStatus)}>
            <option value="" disabled>Select one</option>
            <option value="ready">Yes — print-ready model</option>
            <option value="needs-adjustment">Yes — may need changes</option>
            <option value="reference-only">No — I have photos / references</option>
            <option value="idea-only">No — I only have the idea</option>
          </select>
          {fieldErrors.modelStatus && <small className="field-error">{fieldErrors.modelStatus}</small>}
        </label>
        <label className={fieldClass("fulfillmentMethod")}>
          <span>Pickup or shipping? *</span>
          <select name="fulfillmentMethod" defaultValue="" required aria-invalid={Boolean(fieldErrors.fulfillmentMethod)}>
            <option value="" disabled>Select one</option>
            <option value="pickup">Local pickup</option>
            <option value="shipping">Shipping</option>
            <option value="unsure">Not sure yet</option>
          </select>
          {fieldErrors.fulfillmentMethod && <small className="field-error">{fieldErrors.fulfillmentMethod}</small>}
        </label>
        <label className={fieldClass("quantity")}>
          <span>Quantity *</span>
          <input name="quantity" type="number" min={1} max={500} defaultValue={1} required aria-invalid={Boolean(fieldErrors.quantity)} />
          {fieldErrors.quantity && <small className="field-error">{fieldErrors.quantity}</small>}
        </label>
        <label className={fieldClass("dimensions")}>
          <span>Approx. dimensions</span>
          <input name="dimensions" maxLength={120} placeholder='Example: 8" × 5" × 3"' />
        </label>
        <label className={fieldClass("materialPreference")}>
          <span>Material</span>
          <select name="materialPreference" defaultValue="no-preference">
            <option value="no-preference">No preference</option>
            <option value="pla">PLA</option>
            <option value="petg">PETG</option>
            <option value="asa">ASA</option>
            <option value="tpu">TPU / flexible</option>
            <option value="resin">Resin</option>
            <option value="other">Other / unsure</option>
          </select>
        </label>
        <label className={fieldClass("colorPreference")}>
          <span>Color preference</span>
          <input name="colorPreference" maxLength={120} placeholder="Black, multicolor, match a reference…" />
        </label>
        <div className={fieldClass("neededBy", "needed-by-field")}>
          <label className="field-label" htmlFor="neededBy">Needed by</label>
          <div className="date-entry-shell">
            <input
              id="neededBy"
              name="neededBy"
              type="text"
              inputMode="numeric"
              maxLength={24}
              placeholder="M/D/YYYY"
              value={neededByValue}
              onChange={(event) => setNeededByValue(event.target.value)}
              aria-invalid={Boolean(fieldErrors.neededBy)}
            />
            <span className="calendar-picker-button" aria-label="Choose a needed-by date" title="Choose from calendar">
              <svg className="calendar-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M7 3v4M17 3v4M3 10h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 18h.01M12 18h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
              <input
                className="calendar-native-input"
                type="date"
                min={minNeededBy}
                value={normalizedNeededBy || ""}
                onChange={(event) => {
                  setNeededByValue(event.target.value ? formatBusinessDate(event.target.value) : "");
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.neededBy;
                    return next;
                  });
                }}
                tabIndex={-1}
                aria-label="Calendar date picker"
              />
            </span>
          </div>
          <small>Dates must be after today.</small>
          {rushRequested && <small className="rush-date-note"><strong>Rush timing:</strong> this date is less than 3 days away. A rush fee may apply and will be quoted based on the print.</small>}
          {fieldErrors.neededBy && <small className="field-error">{fieldErrors.neededBy}</small>}
        </div>
        <label className={fieldClass("budget", "budget-field")}>
          <span>Budget</span>
          <input name="budget" maxLength={80} inputMode="decimal" placeholder="Optional" />
          <small>Optional target budget. Final pricing is confirmed after review.</small>
        </label>
      </div>

      <label className={fieldClass("referenceUrl")}>
        <span>Reference link <small className="optional-label">Optional</small></span>
        <input name="referenceUrl" type="url" maxLength={500} placeholder="Google Drive, Dropbox, model listing, photo link, etc." aria-invalid={Boolean(fieldErrors.referenceUrl)} />
        <small>Use a link when the reference already lives online.</small>
        {fieldErrors.referenceUrl && <small className="field-error">{fieldErrors.referenceUrl}</small>}
      </label>

      <div className="request-upload-panel">
        <div><span className="field-label">Images / model files <small className="optional-label">Optional</small></span><small>Up to 3 files, 10 MB each. PNG/JPG/WebP images are re-encoded before upload to remove embedded metadata. STL/3MF files are quarantined and production uploads fail unless malware scanning passes.</small></div>
        <label className={`request-upload-button ${uploading ? "is-busy" : ""}`}>
          {uploading ? "Scanning / uploading…" : "Choose files"}
          <input type="file" multiple disabled={uploading || attachments.length >= 3} accept="image/png,image/jpeg,image/webp,.stl,.3mf" onChange={(event) => void uploadAttachments(event)} />
        </label>
        {attachments.length > 0 && <div className="request-attachment-list">{attachments.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.kind === "image" ? "Image" : "3D model"} • {(item.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" className="text-button" onClick={() => setAttachments((current) => current.filter((candidate) => candidate.id !== item.id))}>Remove</button></div>)}</div>}
        {uploadMessage && <small className={`upload-message ${uploadMessage.startsWith("Local development") ? "warning" : ""}`}>{uploadMessage}</small>}
      </div>

      <label className={fieldClass("description")}>
        <span>Tell me about the print *</span>
        <textarea
          name="description"
          minLength={20}
          maxLength={2500}
          rows={8}
          required
          aria-invalid={Boolean(fieldErrors.description)}
          placeholder="What do you want made? Include how it will be used, important dimensions, finish expectations, and anything else I should know."
        />
        {fieldErrors.description && <small className="field-error">{fieldErrors.description}</small>}
      </label>

      <label className="honeypot" aria-hidden="true">
        Company site
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <label className={`consent-row ${fieldErrors.consent ? "field-invalid" : ""}`}>
        <input name="consent" type="checkbox" required aria-invalid={Boolean(fieldErrors.consent)} />
        <span>I agree to be contacted about this custom print request. *</span>
        {fieldErrors.consent && <small className="field-error">{fieldErrors.consent}</small>}
      </label>

      <div className="payment-terms-note">
        <strong>Custom-order payment terms</strong>
        <p>After the quote, design details, and final price are confirmed, a 50% deposit is required before production begins. The remaining 50% is due before shipment or at the pickup/delivery handoff. If a confirmed project is canceled after materials have been purchased or printing has begun, the deposit may be applied to materials, machine time, and work already completed, subject to the final agreed order terms.</p>
      </div>

      <Turnstile />

      <div className="submit-row">
        <button className="button" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send Custom Request"}
        </button>
        <p className="form-note">A request is not an order or payment. Pricing and feasibility are confirmed first.</p>
      </div>

      {message && <div className={`form-status ${status}`} role="status">{message}</div>}

      {successOpen && (
        <div className="request-success-popup" role="dialog" aria-modal="false" aria-labelledby="request-success-title">
          <button className="request-success-close" type="button" onClick={() => setSuccessOpen(false)} aria-label="Close success message">×</button>
          <span className="request-success-icon" aria-hidden="true">✓</span>
          <div>
            <strong id="request-success-title">Custom request received.</strong>
            <p>You will receive a response in the next 24–48 hours.</p>
            {successCode && <small>Request {successCode}</small>}
          </div>
        </div>
      )}
    </form>
  );
}
