"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  loginSchema,
  registerSchema,
  type ClientApiError,
  type LoginInput,
  type RegisterInput,
} from "@/features/auth/auth-contract";

type AuthFormProps =
  | { mode: "login"; registered?: boolean }
  | { mode: "register"; registered?: never };

async function submitJson(path: string, value: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  const body = (await response
    .json()
    .catch(() => null)) as ClientApiError | null;
  if (!response.ok) {
    throw new Error(body?.message || "Something went wrong. Please try again.");
  }
}

export function AuthForm(props: AuthFormProps) {
  return props.mode === "login" ? (
    <LoginForm registered={props.registered} />
  ) : (
    <RegisterForm />
  );
}

function FormHeading({ mode }: { mode: "login" | "register" }) {
  return (
    <header className="mb-8">
      <p className="text-primary mb-2 text-sm font-semibold">
        {mode === "login" ? "Welcome back" : "Start a new thread"}
      </p>
      <h1 className="text-foreground text-3xl font-semibold tracking-[-0.035em]">
        {mode === "login" ? "Sign in to HyperThread" : "Create your account"}
      </h1>
      <p className="text-muted-foreground mt-3 leading-7">
        {mode === "login"
          ? "Continue to your secure conversation workspace."
          : "Set up your identity for direct and group conversations."}
      </p>
    </header>
  );
}

function PasswordField({
  id,
  invalid,
  error,
  description,
  registration,
}: {
  id: string;
  invalid: boolean;
  error?: string;
  description?: string;
  registration: UseFormRegisterReturn<"password">;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Password</FieldLabel>
      <InputGroup className="h-11 rounded-xl">
        <InputGroupInput
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={
            id === "login-password" ? "current-password" : "new-password"
          }
          aria-invalid={invalid}
          {...registration}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((current) => !current)}
            size="icon-xs"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function LoginForm({ registered = false }: { registered?: boolean }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(value: LoginInput) {
    setServerError(null);
    try {
      await submitJson("/api/auth/login", value);
      router.replace("/chat");
      router.refresh();
    } catch (reason) {
      setServerError(
        reason instanceof Error ? reason.message : "Sign in failed.",
      );
    }
  }

  return (
    <>
      <FormHeading mode="login" />
      {registered && (
        <Alert className="border-success/25 bg-success/8 mb-6" role="status">
          <CheckCircle2Icon className="text-success" />
          <AlertTitle>Account created</AlertTitle>
          <AlertDescription>
            Sign in with your new credentials.
          </AlertDescription>
        </Alert>
      )}
      {serverError && <ErrorAlert message={serverError} />}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.identifier)}>
            <FieldLabel htmlFor="identifier">Email or username</FieldLabel>
            <Input
              id="identifier"
              className="h-11 rounded-xl"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.identifier)}
              placeholder="you@example.com"
              {...form.register("identifier")}
            />
            <FieldError>{form.formState.errors.identifier?.message}</FieldError>
          </Field>
          <PasswordField
            id="login-password"
            invalid={Boolean(form.formState.errors.password)}
            error={form.formState.errors.password?.message}
            registration={form.register("password")}
          />
          <Button
            className="h-11 rounded-xl"
            size="lg"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-muted-foreground mt-7 text-center text-sm">
        New to HyperThread?{" "}
        <Link
          className="text-primary font-semibold hover:underline"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}

function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "" },
  });

  async function onSubmit(value: RegisterInput) {
    setServerError(null);
    try {
      await submitJson("/api/auth/register", value);
      router.push("/login?registered=1");
    } catch (reason) {
      setServerError(
        reason instanceof Error ? reason.message : "Registration failed.",
      );
    }
  }

  return (
    <>
      <FormHeading mode="register" />
      {serverError && <ErrorAlert message={serverError} />}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.username)}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input
              id="username"
              className="h-11 rounded-xl"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.username)}
              placeholder="mithun_team"
              {...form.register("username")}
            />
            <FieldError>{form.formState.errors.username?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              className="h-11 rounded-xl"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              placeholder="you@example.com"
              {...form.register("email")}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </Field>
          <PasswordField
            id="register-password"
            invalid={Boolean(form.formState.errors.password)}
            error={form.formState.errors.password?.message}
            description="8–128 characters with uppercase, lowercase, and a number."
            registration={form.register("password")}
          />
          <Button
            className="h-11 rounded-xl"
            size="lg"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting
              ? "Creating account…"
              : "Create account"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-muted-foreground mt-7 text-center text-sm">
        Already have an account?{" "}
        <Link
          className="text-primary font-semibold hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertCircleIcon />
      <AlertTitle>We couldn&apos;t continue</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
