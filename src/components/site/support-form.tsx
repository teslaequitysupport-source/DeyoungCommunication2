"use client";

/**
 * SupportForm — the contact form with real validation.
 *
 * Client-side checks mirror the server's zod schema exactly, with
 * live feedback: errors clear as soon as the input becomes valid,
 * never before the first blur. Submit shows an in-button loading
 * state (never a spinner that replaces the label), and the success
 * panel carries the ticket reference the server issued.
 */

import { useId, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOPICS = [
  { value: "ACCOUNT", label: "Account and sign-in" },
  { value: "BILLING_CREDITS", label: "Billing and credits" },
  { value: "STUDIO_RENDERS", label: "Studio and renders" },
  { value: "CONSENT_PRIVACY", label: "Consent and privacy" },
  { value: "REPORT_PROBLEM", label: "Report a problem" },
  { value: "OTHER", label: "Something else" },
] as const;

type Fields = { name: string; email: string; topic: string; message: string };

const EMPTY: Fields = { name: "", email: "", topic: "", message: "" };

function validate(fields: Fields): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {};
  if (fields.name.trim().length < 2 || fields.name.trim().length > 80) {
    errors.name = "Enter the name we should reply to (2 to 80 characters).";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim())) {
    errors.email = "Enter a valid email address so we can reply.";
  }
  if (!fields.topic) {
    errors.topic = "Pick the topic that fits best.";
  }
  if (fields.message.trim().length < 20 || fields.message.trim().length > 4000) {
    errors.message = "Describe what happened in at least 20 characters.";
  }
  return errors;
}

export function SupportForm() {
  const id = useId();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const errors = validate(fields);
  const showError = (k: keyof Fields) => Boolean(touched[k] && errors[k]);
  const valid = Object.keys(errors).length === 0;

  function set<K extends keyof Fields>(k: K, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setTouched({ name: true, email: true, topic: true, message: true });
    if (!valid || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          topic: fields.topic,
          message: fields.message.trim(),
          website: "",
        }),
      });
      const data = (await res.json()) as { reference?: string; message?: string };
      if (!res.ok) {
        setServerError(
          res.status === 429
            ? "Too many messages from this network. Try again in a little while."
            : (data.message ?? "Something went wrong on our side. Try again.")
        );
        return;
      }
      setReference(data.reference ?? null);
    } catch {
      setServerError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-card p-8 text-center"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-primary/40 bg-primary/15 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">
          Message received.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/68">
          Your ticket reference is{" "}
          <span className="font-mono font-semibold text-white">{reference}</span>.
          Keep it handy and quote it in any follow-up. We reply to the email
          you provided.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setFields(EMPTY);
            setTouched({});
            setReference(null);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl border border-border bg-card p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            autoComplete="name"
            placeholder="Ada Obi"
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            aria-invalid={showError("name")}
            aria-describedby={showError("name") ? `${id}-name-err` : undefined}
            required
          />
          {showError("name") && (
            <p id={`${id}-name-err`} role="alert" className="text-xs text-primary">
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-email`}>Email</Label>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={showError("email")}
            aria-describedby={showError("email") ? `${id}-email-err` : undefined}
            required
          />
          {showError("email") && (
            <p id={`${id}-email-err`} role="alert" className="text-xs text-primary">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor={`${id}-topic`}>Topic</Label>
        <Select value={fields.topic} onValueChange={(v) => set("topic", v)}>
          <SelectTrigger
            id={`${id}-topic`}
            aria-invalid={showError("topic")}
            className="w-full"
          >
            <SelectValue placeholder="Choose a topic" />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showError("topic") && (
          <p role="alert" className="text-xs text-primary">
            {errors.topic}
          </p>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor={`${id}-message`}>Message</Label>
        <Textarea
          id={`${id}-message`}
          rows={5}
          placeholder="What happened, and what did you expect instead?"
          value={fields.message}
          onChange={(e) => set("message", e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, message: true }))}
          aria-invalid={showError("message")}
          aria-describedby={showError("message") ? `${id}-message-err` : undefined}
          required
        />
        {showError("message") ? (
          <p id={`${id}-message-err`} role="alert" className="text-xs text-primary">
            {errors.message}
          </p>
        ) : (
          <p className="text-xs text-white/45">
            {fields.message.trim().length}/4000 characters
          </p>
        )}
      </div>

      {/* Honeypot — hidden from humans, irresistible to bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        onChange={() => undefined}
      />

      {serverError && (
        <p role="alert" className="mt-5 rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-white/85">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="mt-6 h-12 w-full text-[0.95rem] font-semibold"
      >
        {submitting ? (
          "Sending…"
        ) : (
          <>
            Send message
            <Send className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
