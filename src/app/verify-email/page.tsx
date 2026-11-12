"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, CheckCircle2, ShieldCheck, ArrowRight, RefreshCw, AlertTriangle, RotateCw } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const error = searchParams.get("error") || "";

  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (error) {
      const errorMessages: Record<string, string> = {
        missing_token: "Verification link is missing a confirmation token.",
        invalid_token: "The verification link is invalid or has already been used.",
        no_email: "No email address was associated with the verification link.",
        session_failed: "Unable to establish your session. Please try again.",
        server_error: "A server error occurred during verification.",
      };
      console.error(`Verification error: ${error} — ${errorMessages[error] || "Unknown error"}`);
    }
  }, [error]);

  const handleSimulateVerification = async () => {
    if (!email) return;
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setVerified(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 1200);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Resend failed:", data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto w-full my-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl text-center">
      <div className="w-14 h-14 rounded-full bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20 flex items-center justify-center mx-auto mb-6">
        <Mail className="w-7 h-7" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
        {verified ? "Email Verified!" : "Verify Your Work Email"}
      </h1>

      <p className="text-xs sm:text-sm text-neutral-300 mb-6 leading-relaxed">
        {verified ? (
          <span className="text-emerald-400 font-semibold">Your email has been confirmed. Redirecting to workspace...</span>
        ) : (
          <>
            We sent a confirmation link to{" "}
            <span className="text-white font-bold font-mono">{email || "your work email"}</span>.
            Please open your email and click the confirmation link to verify your address.
          </>
        )}
      </p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-[#FF2D2D]/50 text-red-200 text-xs flex items-center justify-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-[#FF2D2D] shrink-0" />
          <span>
            {error === "invalid_token"
              ? "This verification link is invalid or has already been used. Please request a new confirmation email."
              : error === "missing_token"
              ? "No verification token was provided."
              : error === "session_failed"
              ? "Unable to establish your session. Please try signing in again."
              : error === "server_error"
              ? "A server error occurred. Please try again."
              : "Verification failed. Please request a new confirmation email."}
          </span>
        </div>
      )}

      {!verified && (
        <div className="space-y-4 pt-4 border-t border-neutral-800">
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="w-full py-3.5 rounded-xl font-semibold text-sm text-[#FF2D2D] border border-[#FF2D2D]/30 hover:bg-[#FF2D2D]/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {resendLoading ? (
              <RotateCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Resend Confirmation Email</span>
              </>
            )}
          </button>

          <div className="text-xs text-neutral-500 font-mono">
            Didn't receive the email? Check your spam folder or contact your IT administrator.
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="AIOSpark Logo"
            className="h-9 w-auto bg-white rounded-lg p-1 shadow-sm object-contain"
          />
        </Link>
      </div>

      <Suspense fallback={<div className="text-center text-xs text-neutral-400">Loading verification details...</div>}>
        <VerifyEmailContent />
      </Suspense>

      <div className="text-center py-4 text-xs text-neutral-500 font-mono">
        Email Confirmation via Supabase Auth
      </div>
    </div>
  );
}
