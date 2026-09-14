"use client";

import { FormEvent, useState } from "react";
import { Turnstile } from "@/components/Turnstile";

type Status = "idle" | "sending" | "success" | "error";

export function CustomRequestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone") || "",
      projectType: data.get("projectType"),
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
      turnstileToken: data.get("cf-turnstile-response") || "development-token",
    };

    try {
      const response = await fetch("/api/custom-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Your request could not be sent.");

      setStatus("success");
      setMessage("Request sent. I’ll review the details and follow up using the contact information you provided.");
      form.reset();
      if (typeof window !== "undefined" && "turnstile" in window) {
        (window as typeof window & { turnstile?: { reset: () => void } }).turnstile?.reset();
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form className="request-form" onSubmit={submitRequest}>
      <div className="form-grid two-col">
        <label>
          <span>Name *</span>
          <input name="name" autoComplete="name" minLength={2} maxLength={80} required />
        </label>
        <label>
          <span>Email *</span>
          <input name="email" type="email" autoComplete="email" maxLength={160} required />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" type="tel" autoComplete="tel" maxLength={30} />
        </label>
        <label>
          <span>Project type *</span>
          <select name="projectType" defaultValue="" required>
            <option value="" disabled>Select one</option>
            <option value="display">Display / collectible</option>
            <option value="functional">Functional part</option>
            <option value="replacement">Replacement part</option>
            <option value="prototype">Prototype</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Quantity *</span>
          <input name="quantity" type="number" min={1} max={500} defaultValue={1} required />
        </label>
        <label>
          <span>Approx. dimensions</span>
          <input name="dimensions" maxLength={120} placeholder='Example: 8" × 5" × 3"' />
        </label>
        <label>
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
        <label>
          <span>Color preference</span>
          <input name="colorPreference" maxLength={120} placeholder="Black, multicolor, match a reference…" />
        </label>
        <label>
          <span>Budget</span>
          <input name="budget" maxLength={80} placeholder="Optional" />
        </label>
        <label>
          <span>Needed by</span>
          <input name="neededBy" type="date" />
        </label>
      </div>

      <label>
        <span>Reference link</span>
        <input name="referenceUrl" type="url" maxLength={500} placeholder="Google Drive, Dropbox, model listing, photo link, etc." />
        <small>No direct uploads in V1. This is intentional for security.</small>
      </label>

      <label>
        <span>Tell me about the print *</span>
        <textarea
          name="description"
          minLength={20}
          maxLength={2500}
          rows={8}
          required
          placeholder="What do you want made? Include how it will be used, important dimensions, finish expectations, and anything else I should know."
        />
      </label>

      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="consent-row">
        <input name="consent" type="checkbox" required />
        <span>I agree to be contacted about this custom print request. *</span>
      </label>

      <Turnstile />

      <div className="submit-row">
        <button className="button" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send Custom Request"}
        </button>
        <p className="form-note">A request is not an order or payment. Pricing and feasibility are confirmed first.</p>
      </div>

      {message && <div className={`form-status ${status}`} role="status">{message}</div>}
    </form>
  );
}
